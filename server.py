#!/usr/bin/env python3
"""
BlueTalk Pro - High-Performance Real-Time Web & Relay Server
Provides static web serving and an instant real-time message/voice relay hub
between Laptops, Mobile Phones, and Tablets on the local network.
Uses ONLY Python standard libraries (no pip install required).
"""

import os
import sys
import json
import time
import socket
import queue
import functools
import threading
import webbrowser
from urllib.parse import urlparse, parse_qs
from http.server import SimpleHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn

PORT = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

subscribers = {}
subscribers_lock = threading.Lock()

recent_messages = []
recent_messages_lock = threading.Lock()
MAX_HISTORY = 150

def get_local_ip():
    """Detect local LAN IP address reliably."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

class BlueTalkHandler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    directory = BASE_DIR

    def log_message(self, format, *args):
        # Keep terminal output clean
        pass

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Peer-Id')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # 1. API: Server Status & IP Discovery
        if path == '/api/status':
            with subscribers_lock:
                active_count = len(subscribers)
            status_data = {
                'status': 'online',
                'server_time': int(time.time() * 1000),
                'local_ip': get_local_ip(),
                'port': PORT,
                'active_connections': active_count,
                'relay_enabled': True
            }
            body = json.dumps(status_data).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # 2. API: Real-Time SSE Stream for Cross-Device Synchronization
        if path == '/api/events':
            query = parse_qs(parsed.query)
            peer_id = query.get('peerId', ['unknown'])[0]
            channel = int(query.get('channel', ['1'])[0])
            room = query.get('room', ['general-hq'])[0]

            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()

            client_queue = queue.Queue(maxsize=100)
            sub_id = f"{peer_id}_{time.time()}_{id(client_queue)}"

            with subscribers_lock:
                subscribers[sub_id] = {
                    'queue': client_queue,
                    'channel': channel,
                    'room': room,
                    'peer_id': peer_id
                }

            try:
                init_msg = json.dumps({
                    'type': 'SERVER_CONNECTED',
                    'subId': sub_id,
                    'localIp': get_local_ip(),
                    'serverTime': int(time.time() * 1000)
                })
                self.wfile.write(f"data: {init_msg}\n\n".encode('utf-8'))
                self.wfile.flush()

                while True:
                    try:
                        msg = client_queue.get(timeout=10.0)
                        payload = f"data: {json.dumps(msg)}\n\n".encode('utf-8')
                        self.wfile.write(payload)
                        self.wfile.flush()
                    except queue.Empty:
                        # Keepalive heartbeat ping
                        self.wfile.write(b": keepalive\n\n")
                        self.wfile.flush()
            except (ConnectionResetError, BrokenPipeError, Exception):
                pass
            finally:
                with subscribers_lock:
                    if sub_id in subscribers:
                        del subscribers[sub_id]
            return

        # 3. API: Backup Polling (for devices where SSE might disconnect)
        if path == '/api/poll':
            query = parse_qs(parsed.query)
            since = int(query.get('since', ['0'])[0])
            channel = int(query.get('channel', ['1'])[0])
            room = query.get('room', ['general-hq'])[0]
            peer_id = query.get('peerId', [''])[0]

            with recent_messages_lock:
                filtered = [
                    m for m in recent_messages
                    if m.get('timestamp', 0) > since
                    and m.get('peerId') != peer_id
                    and m.get('channel') == channel
                    and m.get('room') == room
                ]

            body = json.dumps({
                'messages': filtered,
                'serverTime': int(time.time() * 1000)
            }).encode('utf-8')

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # Default static file serving
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/api/send':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)

            try:
                packet = json.loads(body.decode('utf-8'))
            except Exception as e:
                err_body = json.dumps({'error': 'Invalid JSON', 'details': str(e)}).encode('utf-8')
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(err_body)))
                self.end_headers()
                self.wfile.write(err_body)
                return

            if packet.get('type') in ('TEXT_MESSAGE', 'RADIO_CALLOUT', 'VOICE_NOTE', 'MORSE_CODE', 'SOS_ALERT'):
                with recent_messages_lock:
                    recent_messages.append(packet)
                    if len(recent_messages) > MAX_HISTORY:
                        recent_messages.pop(0)

            sender_id = packet.get('peerId')
            ch = packet.get('channel')
            rm = packet.get('room')

            with subscribers_lock:
                for sub_id, sub_info in list(subscribers.items()):
                    if sub_info['peer_id'] == sender_id:
                        continue
                    if ch is not None and sub_info['channel'] != ch:
                        continue
                    if rm is not None and sub_info['room'] != rm:
                        continue

                    try:
                        sub_info['queue'].put_nowait(packet)
                    except Exception:
                        pass

            resp_body = json.dumps({'status': 'relayed', 'timestamp': int(time.time() * 1000)}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(resp_body)))
            self.end_headers()
            self.wfile.write(resp_body)
            return

        self.send_response(404)
        self.send_header('Content-Length', '0')
        self.end_headers()

def main():
    local_ip = get_local_ip()
    server = ThreadedHTTPServer(('0.0.0.0', PORT), BlueTalkHandler)

    print("=" * 60)
    print("   BLUETALK PRO - HIGH-PERFORMANCE LIVE WEB & RELAY SERVER")
    print("=" * 60)
    print()
    print(f"  [PC / Laptop]   http://localhost:{PORT}")
    print(f"  [Mobile Phone]  http://{local_ip}:{PORT}")
    print()
    print("  * Devices on the same Wi-Fi can talk and chat live!")
    print("  * Press Ctrl+C in this terminal to stop the server.")
    print("=" * 60)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down BlueTalk server gracefully...")
        server.shutdown()
        server.server_close()

if __name__ == '__main__':
    main()
