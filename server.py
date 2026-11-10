#!/usr/bin/env python3
"""
BlueTalk Pro - Real-Time Internet, Tunnel & Wi-Fi Relay Server
Provides static web serving, Room-based SSE/HTTP relay across Local Wi-Fi or
Internet tunnels (ngrok / Cloudflare Tunnel), and localhost Bluetooth discovery.
Uses ONLY Python standard libraries (no pip install required).
"""

import os
import re
import sys
import json
import time
import socket
import queue
import subprocess
import threading
import urllib.request
from urllib.parse import urlparse, parse_qs
from http.server import SimpleHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn

PORT = int(os.environ.get('PORT', '8080'))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

subscribers = {}
subscribers_lock = threading.Lock()

active_peers = {}  # (room, peer_id) -> dict
active_peers_lock = threading.Lock()
PEER_TTL_SEC = 15.0

recent_messages = []
recent_messages_lock = threading.Lock()
MAX_HISTORY = 250
message_seq = 0

RELAY_MESSAGE_TYPES = (
    'TEXT_MESSAGE',
    'RADIO_CALLOUT',
    'VOICE_NOTE',
    'VOICE_STREAM',
    'MORSE_CODE',
    'TACTICAL_SOUND',
    'SOS_ALERT',
    'PTT_STATE',
)


def normalize_room(room_str):
    """Normalize a Room Code / Contact ID for consistent cross-device routing."""
    if not room_str:
        return 'HQ-MAIN'
    cleaned = re.sub(r'[^A-Za-z0-9_-]+', '-', str(room_str).strip().upper()).strip('-')
    return cleaned[:32] or 'HQ-MAIN'


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
            return '127.0.0.1'


def detect_tunnel_url():
    """Detect public Internet tunnel URL from env var or local ngrok API."""
    env_url = os.environ.get('BLUETALK_PUBLIC_URL', '').strip().rstrip('/')
    if env_url:
        return env_url
    try:
        req = urllib.request.Request('http://127.0.0.1:4040/api/tunnels', method='GET')
        with urllib.request.urlopen(req, timeout=0.25) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            for tunnel in data.get('tunnels', []):
                pub = tunnel.get('public_url', '')
                if pub.startswith('https://'):
                    return pub.rstrip('/')
            tunnels = data.get('tunnels', [])
            if tunnels:
                return tunnels[0].get('public_url', '').rstrip('/')
    except Exception:
        pass
    return ''


def get_local_bt_mac():
    """Best-effort detection of local Bluetooth adapter MAC via RFCOMM bind."""
    if not hasattr(socket, 'AF_BLUETOOTH'):
        return ''
    try:
        s = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
        s.bind(('00:00:00:00:00:00', 0))
        mac = s.getsockname()[0]
        s.close()
        return mac
    except Exception:
        return ''


def list_paired_bluetooth_devices():
    """Enumerate paired Bluetooth devices on Windows using standard tools."""
    devices = []
    seen_macs = set()
    if sys.platform != 'win32':
        return devices

    try:
        ps_cmd = (
            "Get-PnpDevice -Class Bluetooth | "
            "Select-Object Status, FriendlyName, InstanceId | "
            "ConvertTo-Json -Compress"
        )
        raw = subprocess.check_output(
            ['powershell', '-NoProfile', '-Command', ps_cmd],
            text=True,
            timeout=4.0,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
        ).strip()
        if not raw:
            return devices
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            parsed = [parsed]

        for entry in parsed:
            inst = str(entry.get('InstanceId', ''))
            name = str(entry.get('FriendlyName', '') or '').strip()
            match = re.match(r'^BTH(?:ENUM|LE)\\DEV_([0-9A-Fa-f]{12})\\', inst)
            if not match or not name:
                continue
            hex_mac = match.group(1).upper()
            mac = ':'.join(hex_mac[i:i + 2] for i in range(0, 12, 2))
            if mac in seen_macs:
                continue
            seen_macs.add(mac)
            kind = 'BLE' if inst.upper().startswith('BTHLE') else 'Classic/RFCOMM'
            devices.append({
                'name': name,
                'mac': mac,
                'kind': kind,
                'status': entry.get('Status', 'OK'),
            })
    except Exception:
        pass
    return devices


def upsert_peer(room, peer_id, callsign=None, avatar='🦅', photo_url='', transport='internet', is_talking=False):
    if not peer_id or peer_id == 'unknown':
        return
    key = (room, peer_id)
    now = time.time()
    with active_peers_lock:
        existing = active_peers.get(key, {})
        active_peers[key] = {
            'peerId': peer_id,
            'callsign': callsign or existing.get('callsign') or peer_id[:10].upper(),
            'room': room,
            'avatar': avatar or existing.get('avatar') or '🦅',
            'photoUrl': photo_url if photo_url is not None else existing.get('photoUrl', ''),
            'transport': transport or existing.get('transport') or 'internet',
            'isTalking': bool(is_talking),
            'lastSeen': int(now * 1000),
            '_seen_ts': now,
        }


def get_room_peers(room, exclude_peer_id=''):
    now = time.time()
    result = []
    with active_peers_lock:
        stale_keys = [
            k for k, info in active_peers.items()
            if now - info.get('_seen_ts', 0) > PEER_TTL_SEC
        ]
        for k in stale_keys:
            del active_peers[k]

        for (r, pid), info in active_peers.items():
            if r == room and pid != exclude_peer_id:
                clean = {k: v for k, v in info.items() if not k.startswith('_')}
                result.append(clean)
    return result


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class BlueTalkHandler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    directory = BASE_DIR

    def log_message(self, format, *args):
        pass

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Peer-Id, ngrok-skip-browser-warning')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # 1. Server Status & Tunnel Discovery
        if path == '/api/status':
            room = normalize_room(query.get('room', ['HQ-MAIN'])[0])
            with subscribers_lock:
                sse_count = len(subscribers)
            with recent_messages_lock:
                current_seq = message_seq
            peers_in_room = get_room_peers(room)
            self._send_json({
                'status': 'online',
                'server_time': int(time.time() * 1000),
                'latestSeq': current_seq,
                'local_ip': get_local_ip(),
                'port': PORT,
                'tunnel_url': detect_tunnel_url(),
                'active_connections': max(sse_count, len(peers_in_room)),
                'bluetooth_supported': hasattr(socket, 'AF_BLUETOOTH'),
                'relay_enabled': True,
            })
            return

        # 2. Active Peers in Room
        if path == '/api/peers':
            room = normalize_room(query.get('room', ['HQ-MAIN'])[0])
            peer_id = query.get('peerId', [''])[0]
            self._send_json({
                'room': room,
                'peers': get_room_peers(room, exclude_peer_id=peer_id),
                'serverTime': int(time.time() * 1000),
            })
            return

        # 3. Localhost-only Paired Bluetooth Device Listing
        if path == '/api/bluetooth/devices':
            client_ip = self.client_address[0]
            if client_ip not in ('127.0.0.1', '::1'):
                self._send_json({'error': 'Localhost access only'}, status=403)
                return
            self._send_json({
                'supported': hasattr(socket, 'AF_BLUETOOTH'),
                'local_mac': get_local_bt_mac(),
                'devices': list_paired_bluetooth_devices(),
            })
            return

        # 4. Real-Time SSE Stream per Room Code
        if path == '/api/events':
            peer_id = query.get('peerId', ['unknown'])[0]
            room = normalize_room(query.get('room', ['HQ-MAIN'])[0])
            callsign = query.get('callsign', [''])[0]
            avatar = query.get('avatar', ['🦅'])[0]
            transport = query.get('transport', ['internet'])[0]

            upsert_peer(room, peer_id, callsign=callsign, avatar=avatar, transport=transport, is_talking=False)

            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()

            client_queue = queue.Queue(maxsize=120)
            sub_id = f"{peer_id}_{time.time()}_{id(client_queue)}"

            with subscribers_lock:
                subscribers[sub_id] = {
                    'queue': client_queue,
                    'room': room,
                    'peer_id': peer_id,
                }

            try:
                with recent_messages_lock:
                    current_seq = message_seq
                init_msg = json.dumps({
                    'type': 'SERVER_CONNECTED',
                    'subId': sub_id,
                    'room': room,
                    'latestSeq': current_seq,
                    'localIp': get_local_ip(),
                    'tunnelUrl': detect_tunnel_url(),
                    'serverTime': int(time.time() * 1000),
                })
                self.wfile.write(f"data: {init_msg}\n\n".encode('utf-8'))
                self.wfile.flush()

                while True:
                    try:
                        msg = client_queue.get(timeout=8.0)
                        payload = f"data: {json.dumps(msg)}\n\n".encode('utf-8')
                        self.wfile.write(payload)
                        self.wfile.flush()
                    except queue.Empty:
                        upsert_peer(room, peer_id, callsign=callsign, avatar=avatar, transport=transport)
                        self.wfile.write(b": keepalive\n\n")
                        self.wfile.flush()
            except (ConnectionResetError, BrokenPipeError, Exception):
                pass
            finally:
                with subscribers_lock:
                    if sub_id in subscribers:
                        del subscribers[sub_id]
            return

        # 5. Polling Endpoint (supports cross-origin tunnels, mobile networks & Python Desktop)
        if path == '/api/poll':
            since_seq = int(query.get('sinceSeq', ['-1'])[0])
            since = int(query.get('since', ['0'])[0])
            room = normalize_room(query.get('room', ['HQ-MAIN'])[0])
            peer_id = query.get('peerId', [''])[0]
            callsign = query.get('callsign', [''])[0]
            avatar = query.get('avatar', ['🦅'])[0]
            transport = query.get('transport', ['internet'])[0]

            if peer_id:
                upsert_peer(room, peer_id, callsign=callsign, avatar=avatar, transport=transport)

            with recent_messages_lock:
                current_seq = message_seq
                if since_seq >= 0:
                    filtered = [
                        m for m in recent_messages
                        if m.get('serverSeq', 0) > since_seq
                        and m.get('peerId') != peer_id
                        and normalize_room(m.get('room')) == room
                    ]
                else:
                    filtered = [
                        m for m in recent_messages
                        if m.get('serverTimestamp', m.get('timestamp', 0)) > since
                        and m.get('peerId') != peer_id
                        and normalize_room(m.get('room')) == room
                    ]

            self._send_json({
                'room': room,
                'messages': filtered,
                'peers': get_room_peers(room, exclude_peer_id=peer_id),
                'latestSeq': current_seq,
                'serverTime': int(time.time() * 1000),
            })
            return

        # Default static file serving
        return super().do_GET()

    def do_POST(self):
        global message_seq
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/api/send':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)

            try:
                packet = json.loads(body.decode('utf-8'))
            except Exception as e:
                self._send_json({'error': 'Invalid JSON', 'details': str(e)}, status=400)
                return

            room = normalize_room(packet.get('room'))
            now_ms = int(time.time() * 1000)
            packet['room'] = room
            if not packet.get('timestamp'):
                packet['timestamp'] = now_ms
            packet['serverTimestamp'] = now_ms

            sender_id = packet.get('peerId', '')
            upsert_peer(
                room=room,
                peer_id=sender_id,
                callsign=packet.get('callsign'),
                avatar=packet.get('avatar', '🦅'),
                photo_url=packet.get('photoUrl', ''),
                transport=packet.get('transport', 'internet'),
                is_talking=bool(packet.get('isTalking', False)),
            )

            if packet.get('type') in RELAY_MESSAGE_TYPES:
                with recent_messages_lock:
                    message_seq += 1
                    packet['serverSeq'] = message_seq
                    recent_messages.append(packet)
                    if len(recent_messages) > MAX_HISTORY:
                        recent_messages.pop(0)

            with subscribers_lock:
                for _, sub_info in list(subscribers.items()):
                    if sub_info['peer_id'] == sender_id:
                        continue
                    if sub_info['room'] != room:
                        continue
                    try:
                        sub_info['queue'].put_nowait(packet)
                    except Exception:
                        pass

            self._send_json({
                'status': 'relayed',
                'room': room,
                'serverSeq': packet.get('serverSeq', message_seq),
                'timestamp': now_ms,
            })
            return

        self.send_response(404)
        self.send_header('Content-Length', '0')
        self.end_headers()


def main():
    local_ip = get_local_ip()
    tunnel_url = detect_tunnel_url()
    server = ThreadedHTTPServer(('0.0.0.0', PORT), BlueTalkHandler)

    print("=" * 64)
    print("   BLUETALK PRO - INTERNET RELAY, TUNNEL & BLUETOOTH SERVER")
    print("=" * 64)
    print()
    print(f"  [PC / Laptop]     http://localhost:{PORT}")
    print(f"  [Local Wi-Fi]     http://{local_ip}:{PORT}")
    if tunnel_url:
        print(f"  [Internet Tunnel] {tunnel_url}")
    else:
        print("  [Internet Tunnel] Run one of these in another terminal to talk")
        print("                    with friends anywhere over the Internet:")
        print(f"                      ngrok http {PORT}")
        print(f"                      cloudflared tunnel --url http://localhost:{PORT}")
    print()
    print("  * Contacts connect via Room Code (e.g. HQ-MAIN) or Share Link!")
    print("  * Press Ctrl+C in this terminal to stop the server.")
    print("=" * 64)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down BlueTalk server gracefully...")
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
