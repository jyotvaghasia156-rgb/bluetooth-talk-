"""
BlueTalk Pro - Unified Network & Bluetooth RFCOMM Engine (Pure Python)
Supports three contact transports without MHz frequency tuning:
  1. Internet / Tunnel Relay (connects to server.py locally or via ngrok/Cloudflare URL)
  2. Bluetooth Direct (native RFCOMM sockets + paired device discovery)
  3. Local Wi-Fi LAN (zero-server UDP broadcast by Room Code)
"""

import re
import sys
import json
import time
import socket
import random
import subprocess
import threading
import urllib.request
import urllib.parse
from collections import deque

DISCOVERY_PORT = 48899
DEFAULT_RFCOMM_CHANNEL = 4


def normalize_room(room_str):
    if not room_str:
        return 'HQ-MAIN'
    cleaned = re.sub(r'[^A-Za-z0-9_-]+', '-', str(room_str).strip().upper()).strip('-')
    return cleaned[:32] or 'HQ-MAIN'


def normalize_server_url(url_str):
    raw = (url_str or '').strip().rstrip('/')
    if not raw:
        return 'http://127.0.0.1:8080'
    if not raw.startswith(('http://', 'https://')):
        raw = 'https://' + raw if '.' in raw and not raw.startswith(('127.', '192.168.', '10.', 'localhost')) else 'http://' + raw
    return raw.rstrip('/')


class NetworkNode:
    def __init__(self, callsign="ALPHA-01", room="HQ-MAIN", mode="internet", server_url="http://127.0.0.1:8080"):
        self.callsign = callsign
        self.room = normalize_room(room)
        self.mode = mode if mode in ('internet', 'bluetooth', 'lan') else 'internet'
        self.server_url = normalize_server_url(server_url)
        self.peer_id = f"py_{int(time.time()) % 100000}_{random.randint(100, 999)}"
        self.running = True

        self.peers = {}  # peer_id -> dict
        self.peers_lock = threading.Lock()
        self.seen_ids = deque(maxlen=400)

        # Internet relay state
        self.relay_connected = False
        self.last_seq = 0
        self.relay_latency_ms = 0
        self.server_tunnel_url = ''
        self._relay_seq_initialized = False

        # Bluetooth RFCOMM state
        self.bt_supported = hasattr(socket, 'AF_BLUETOOTH')
        self.local_bt_mac = ''
        self.local_bt_port = DEFAULT_RFCOMM_CHANNEL
        self.bt_server_sock = None
        self.bt_client_sock = None
        self.bt_connected_peer = None  # {'name': ..., 'mac': ...}
        self.bt_incoming_socks = []
        self.bt_lock = threading.Lock()

        # LAN UDP socket
        self.udp_sock = None

        # Callbacks
        self.on_message_received = None
        self.on_sound_received = None
        self.on_morse_received = None
        self.on_peer_update = None
        self.on_ptt_state = None
        self.on_status_change = None

        self._init_udp_socket()
        self._init_bt_server()
        self._start_udp_listener()
        self._start_internet_poller()
        self._start_heartbeat()

    # ------------------------------------------------------------------
    # Public Configuration & Mode Controls
    # ------------------------------------------------------------------
    def set_mode(self, mode):
        if mode not in ('internet', 'bluetooth', 'lan'):
            return
        self.mode = mode
        with self.peers_lock:
            self.peers.clear()
        self._emit_peers()
        if mode == 'internet':
            self._relay_seq_initialized = False
            self._emit_status('internet', self.relay_connected, f"INTERNET ({self.server_url})")
        elif mode == 'bluetooth':
            if self.bt_connected_peer:
                self._emit_status('bluetooth', True, f"BT: {self.bt_connected_peer['name']}")
            elif self.bt_supported:
                self._emit_status('bluetooth', False, f"BT LISTENING CH {self.local_bt_port}")
            else:
                self._emit_status('bluetooth', False, "BT RFCOMM UNAVAILABLE")
        else:
            self._emit_status('lan', True, f"WI-FI LAN ({self.room})")
        self.send_presence(False)

    def set_room(self, room_code):
        self.room = normalize_room(room_code)
        self._relay_seq_initialized = False
        with self.peers_lock:
            self.peers.clear()
        self._emit_peers()
        self.send_presence(False)

    def set_server_url(self, url_str):
        self.server_url = normalize_server_url(url_str)
        self._relay_seq_initialized = False
        self.relay_connected = False
        if self.mode == 'internet':
            self._emit_status('internet', False, f"CONNECTING {self.server_url}...")
            threading.Thread(target=self._sync_initial_seq, daemon=True).start()

    def set_callsign(self, callsign):
        clean = (callsign or '').strip().upper()
        if clean:
            self.callsign = clean[:16]
            self.send_presence(False)

    def _emit_status(self, mode, connected, label):
        if self.on_status_change:
            self.on_status_change(mode, connected, label)

    def _emit_peers(self):
        if self.on_peer_update:
            with self.peers_lock:
                snapshot = list(self.peers.values())
            self.on_peer_update(snapshot)

    # ------------------------------------------------------------------
    # Bluetooth Discovery & RFCOMM Socket Transport
    # ------------------------------------------------------------------
    def _init_bt_server(self):
        if not self.bt_supported:
            return
        for port in (DEFAULT_RFCOMM_CHANNEL, 5, 0):
            try:
                srv = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
                srv.bind(('00:00:00:00:00:00', port))
                srv.listen(4)
                srv.settimeout(1.0)
                addr = srv.getsockname()
                self.local_bt_mac = addr[0]
                self.local_bt_port = addr[1]
                self.bt_server_sock = srv
                threading.Thread(target=self._bt_accept_loop, daemon=True).start()
                return
            except Exception:
                try:
                    srv.close()
                except Exception:
                    pass

    def _bt_accept_loop(self):
        while self.running and self.bt_server_sock:
            try:
                client, addr = self.bt_server_sock.accept()
                with self.bt_lock:
                    self.bt_incoming_socks.append(client)
                peer_label = addr[0] if isinstance(addr, tuple) else str(addr)
                if self.mode == 'bluetooth':
                    self._emit_status('bluetooth', True, f"BT LINKED ({peer_label})")
                threading.Thread(target=self._bt_read_loop, args=(client, peer_label), daemon=True).start()
            except socket.timeout:
                continue
            except Exception:
                break

    def _bt_read_loop(self, sock, peer_label):
        buffer = ''
        try:
            sock.settimeout(None)
            while self.running:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                buffer += chunk.decode('utf-8', errors='ignore')
                while '\n' in buffer:
                    line, buffer = buffer.split('\n', 1)
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        packet = json.loads(line)
                        self._handle_incoming_packet(packet, source_ip=peer_label)
                    except Exception:
                        pass
        except Exception:
            pass
        finally:
            with self.bt_lock:
                if sock in self.bt_incoming_socks:
                    self.bt_incoming_socks.remove(sock)
                if sock is self.bt_client_sock:
                    self.bt_client_sock = None
                    self.bt_connected_peer = None
                    if self.mode == 'bluetooth':
                        self._emit_status('bluetooth', False, f"BT LISTENING CH {self.local_bt_port}")
            try:
                sock.close()
            except Exception:
                pass

    def scan_paired_bluetooth_devices(self):
        """Return list of paired Bluetooth devices [{'name', 'mac', 'kind'}]."""
        devices = []
        seen = set()
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
                timeout=5.0,
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
                m = re.match(r'^BTH(?:ENUM|LE)\\DEV_([0-9A-Fa-f]{12})\\', inst)
                if not m or not name:
                    continue
                hex_mac = m.group(1).upper()
                mac = ':'.join(hex_mac[i:i + 2] for i in range(0, 12, 2))
                if mac in seen:
                    continue
                seen.add(mac)
                kind = 'BLE' if inst.upper().startswith('BTHLE') else 'RFCOMM'
                devices.append({'name': name, 'mac': mac, 'kind': kind})
        except Exception:
            pass
        return devices

    def connect_bluetooth(self, mac_address, name='', port=DEFAULT_RFCOMM_CHANNEL):
        if not self.bt_supported:
            raise RuntimeError("Bluetooth RFCOMM sockets are not supported on this Python build.")
        clean_mac = mac_address.strip().upper().replace('-', ':')
        if not re.match(r'^([0-9A-F]{2}:){5}[0-9A-F]{2}$', clean_mac):
            raise ValueError("Invalid Bluetooth MAC address (expected AA:BB:CC:DD:EE:FF).")

        self.disconnect_bluetooth()
        sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
        sock.settimeout(8.0)
        try:
            sock.connect((clean_mac, int(port)))
        except Exception as e:
            try:
                sock.close()
            except Exception:
                pass
            raise RuntimeError(f"Bluetooth RFCOMM connect failed on CH {port}: {e}")

        with self.bt_lock:
            self.bt_client_sock = sock
            self.bt_connected_peer = {'mac': clean_mac, 'name': name or clean_mac, 'port': int(port)}

        self.mode = 'bluetooth'
        self._emit_status('bluetooth', True, f"BT: {self.bt_connected_peer['name']}")
        threading.Thread(target=self._bt_read_loop, args=(sock, clean_mac), daemon=True).start()
        self.send_presence(False)
        return self.bt_connected_peer

    def disconnect_bluetooth(self):
        with self.bt_lock:
            if self.bt_client_sock:
                try:
                    self.bt_client_sock.close()
                except Exception:
                    pass
                self.bt_client_sock = None
            self.bt_connected_peer = None
        if self.mode == 'bluetooth':
            self._emit_status('bluetooth', False, f"BT LISTENING CH {self.local_bt_port}")

    # ------------------------------------------------------------------
    # Internet / Tunnel HTTP Relay Transport
    # ------------------------------------------------------------------
    def _http_headers(self, extra=None):
        headers = {
            'ngrok-skip-browser-warning': 'true',
            'User-Agent': 'BlueTalkPro-Desktop/2.0',
        }
        if extra:
            headers.update(extra)
        return headers

    def _sync_initial_seq(self):
        try:
            t0 = time.time()
            url = f"{self.server_url}/api/status?room={urllib.parse.quote(self.room)}"
            req = urllib.request.Request(url, headers=self._http_headers(), method='GET')
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                data = json.loads(resp.read().decode('utf-8'))
            self.relay_latency_ms = int((time.time() - t0) * 1000)
            self.last_seq = int(data.get('latestSeq', 0))
            self.server_tunnel_url = data.get('tunnel_url', '') or ''
            self._relay_seq_initialized = True
            self.relay_connected = True
            if self.mode == 'internet':
                self._emit_status('internet', True, f"ONLINE ({self.relay_latency_ms}ms)")
        except Exception:
            self.relay_connected = False
            if self.mode == 'internet':
                self._emit_status('internet', False, "RELAY OFFLINE")

    def _start_internet_poller(self):
        def _poll_loop():
            while self.running:
                if self.mode == 'internet':
                    if not self._relay_seq_initialized:
                        self._sync_initial_seq()
                    try:
                        t0 = time.time()
                        qs = urllib.parse.urlencode({
                            'sinceSeq': self.last_seq,
                            'room': self.room,
                            'peerId': self.peer_id,
                            'callsign': self.callsign,
                            'transport': 'internet',
                        })
                        url = f"{self.server_url}/api/poll?{qs}"
                        req = urllib.request.Request(url, headers=self._http_headers(), method='GET')
                        with urllib.request.urlopen(req, timeout=3.5) as resp:
                            data = json.loads(resp.read().decode('utf-8'))

                        self.relay_latency_ms = int((time.time() - t0) * 1000)
                        was_connected = self.relay_connected
                        self.relay_connected = True
                        if not was_connected:
                            self._emit_status('internet', True, f"ONLINE ({self.relay_latency_ms}ms)")

                        latest_seq = int(data.get('latestSeq', self.last_seq))
                        if latest_seq > self.last_seq:
                            self.last_seq = latest_seq

                        # Update peers list from server
                        now = time.time()
                        server_peers = data.get('peers', [])
                        with self.peers_lock:
                            # Refresh internet-discovered peers
                            for k in [pid for pid, info in self.peers.items() if info.get('transport') == 'internet']:
                                del self.peers[k]
                            for p in server_peers:
                                pid = p.get('peerId')
                                if pid and pid != self.peer_id:
                                    self.peers[pid] = {
                                        'peerId': pid,
                                        'callsign': p.get('callsign', 'UNKNOWN'),
                                        'room': p.get('room', self.room),
                                        'transport': p.get('transport', 'internet'),
                                        'last_seen': now,
                                        'is_talking': bool(p.get('isTalking', False)),
                                    }
                        self._emit_peers()

                        for msg in data.get('messages', []):
                            seq = msg.get('serverSeq', 0)
                            if seq > self.last_seq:
                                self.last_seq = seq
                            self._handle_incoming_packet(msg, source_ip='relay')
                    except Exception:
                        self.relay_connected = False
                        self._emit_status('internet', False, "RELAY OFFLINE")
                time.sleep(0.65)

        threading.Thread(target=_poll_loop, daemon=True).start()

    def _post_internet_packet(self, packet):
        try:
            body = json.dumps(packet).encode('utf-8')
            req = urllib.request.Request(
                f"{self.server_url}/api/send",
                data=body,
                headers=self._http_headers({'Content-Type': 'application/json'}),
                method='POST',
            )
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                resp.read()
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Local Wi-Fi UDP LAN Transport
    # ------------------------------------------------------------------
    def _init_udp_socket(self):
        try:
            self.udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.udp_sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            self.udp_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.udp_sock.bind(('', DISCOVERY_PORT))
        except Exception as e:
            print(f"[Network] UDP Socket init note: {e}")

    def _start_udp_listener(self):
        def _listen():
            while self.running and self.udp_sock:
                try:
                    data, addr = self.udp_sock.recvfrom(8192)
                    packet = json.loads(data.decode('utf-8'))
                    if self.mode == 'lan':
                        self._handle_incoming_packet(packet, source_ip=addr[0])
                except Exception:
                    pass

        threading.Thread(target=_listen, daemon=True).start()

    # ------------------------------------------------------------------
    # Heartbeat & Packet Routing
    # ------------------------------------------------------------------
    def _start_heartbeat(self):
        def _hb():
            while self.running:
                if self.mode in ('lan', 'bluetooth'):
                    self.send_presence(False)
                now = time.time()
                stale_found = False
                with self.peers_lock:
                    stale = [pid for pid, info in self.peers.items() if now - info.get('last_seen', 0) > 12.0]
                    for pid in stale:
                        del self.peers[pid]
                        stale_found = True
                if stale_found:
                    self._emit_peers()
                time.sleep(3.0)

        threading.Thread(target=_hb, daemon=True).start()

    def _handle_incoming_packet(self, packet, source_ip=''):
        if not isinstance(packet, dict):
            return
        sender_id = packet.get('peerId') or packet.get('peer_id')
        if not sender_id or sender_id == self.peer_id:
            return

        pkt_room = normalize_room(packet.get('room'))
        if pkt_room != self.room:
            return

        pkt_id = packet.get('id')
        if pkt_id:
            if pkt_id in self.seen_ids:
                return
            self.seen_ids.append(pkt_id)

        callsign = packet.get('callsign', 'UNKNOWN')
        is_talking = bool(packet.get('isTalking', packet.get('is_talking', False)))
        transport = packet.get('transport', self.mode)

        with self.peers_lock:
            self.peers[sender_id] = {
                'peerId': sender_id,
                'callsign': callsign,
                'ip': source_ip,
                'room': pkt_room,
                'transport': transport,
                'last_seen': time.time(),
                'is_talking': is_talking,
            }
        self._emit_peers()

        p_type = packet.get('type')
        if p_type in ('TEXT_MESSAGE', 'TEXT') and self.on_message_received:
            self.on_message_received(callsign, packet.get('text', ''), transport)
        elif p_type == 'RADIO_CALLOUT' and self.on_message_received:
            phrase = packet.get('phrase', '')
            meaning = packet.get('meaning', '')
            self.on_message_received(callsign, f"[{phrase}] {meaning}".strip(), transport)
        elif p_type in ('TACTICAL_SOUND', 'SOUND') and self.on_sound_received:
            sid = packet.get('soundId') or packet.get('sound_id')
            self.on_sound_received(sid, callsign)
        elif p_type in ('MORSE_CODE', 'MORSE') and self.on_morse_received:
            self.on_morse_received(packet.get('morse', ''), packet.get('text', ''), callsign)
        elif p_type in ('PTT_STATE', 'PTT') and self.on_ptt_state:
            self.on_ptt_state(callsign, is_talking)
        elif p_type == 'PRESENCE' and self.on_ptt_state:
            self.on_ptt_state(callsign, is_talking)

    def send_packet(self, packet):
        now_ms = int(time.time() * 1000)
        packet.setdefault('id', f"pkt_{now_ms}_{random.randint(1000, 9999)}")
        packet['peerId'] = self.peer_id
        packet['callsign'] = self.callsign
        packet['room'] = self.room
        packet['transport'] = self.mode
        packet['timestamp'] = now_ms

        if self.mode == 'internet':
            threading.Thread(target=self._post_internet_packet, args=(packet,), daemon=True).start()
        elif self.mode == 'bluetooth':
            raw_line = (json.dumps(packet) + '\n').encode('utf-8')
            with self.bt_lock:
                targets = []
                if self.bt_client_sock:
                    targets.append(self.bt_client_sock)
                targets.extend(self.bt_incoming_socks)
            for sock in targets:
                try:
                    sock.sendall(raw_line)
                except Exception:
                    pass
        elif self.mode == 'lan' and self.udp_sock:
            try:
                raw = json.dumps(packet).encode('utf-8')
                self.udp_sock.sendto(raw, ('<broadcast>', DISCOVERY_PORT))
            except Exception:
                pass

    def send_presence(self, is_talking=False):
        self.send_packet({'type': 'PRESENCE', 'isTalking': is_talking})

    def send_text(self, text):
        self.send_packet({'type': 'TEXT_MESSAGE', 'text': text})

    def send_sound(self, sound_id, label=''):
        self.send_packet({'type': 'TACTICAL_SOUND', 'soundId': sound_id, 'label': label or sound_id})

    def send_morse(self, morse_str, text_str):
        self.send_packet({'type': 'MORSE_CODE', 'morse': morse_str, 'text': text_str})

    def send_ptt(self, is_talking):
        self.send_packet({'type': 'PTT_STATE', 'isTalking': is_talking})

    def close(self):
        self.running = False
        self.disconnect_bluetooth()
        with self.bt_lock:
            for s in list(self.bt_incoming_socks):
                try:
                    s.close()
                except Exception:
                    pass
            self.bt_incoming_socks.clear()
        if self.bt_server_sock:
            try:
                self.bt_server_sock.close()
            except Exception:
                pass
        if self.udp_sock:
            try:
                self.udp_sock.close()
            except Exception:
                pass
