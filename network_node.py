"""
BlueTalk Pro - Local Network Peer Discovery & Packet Relay (Pure Python)
Uses standard UDP broadcast and TCP socket connections to link multiple BlueTalk stations on the LAN.
"""

import socket
import json
import time
import threading

DISCOVERY_PORT = 48899

class NetworkNode:
    def __init__(self, callsign="ALPHA-01", channel=1):
        self.callsign = callsign
        self.channel = channel
        self.peer_id = f"py_peer_{int(time.time()) % 10000}"
        self.running = True

        self.peers = {} # peer_id -> {callsign, last_seen, ip, channel}
        self.peers_lock = threading.Lock()

        # Callbacks
        self.on_message_received = None
        self.on_sound_received = None
        self.on_morse_received = None
        self.on_peer_update = None
        self.on_ptt_state = None

        self.sock = None
        self._init_socket()
        self._start_listener()
        self._start_heartbeat()

    def _init_socket(self):
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.sock.bind(('', DISCOVERY_PORT))
        except Exception as e:
            print(f"[Network] Socket init note: {e}")

    def _start_listener(self):
        def _listen():
            while self.running and self.sock:
                try:
                    data, addr = self.sock.recvfrom(4096)
                    packet = json.loads(data.decode('utf-8'))
                    if packet.get('peer_id') == self.peer_id:
                        continue
                    if packet.get('channel') != self.channel:
                        continue

                    p_id = packet.get('peer_id')
                    with self.peers_lock:
                        self.peers[p_id] = {
                            'callsign': packet.get('callsign', 'UNKNOWN'),
                            'ip': addr[0],
                            'channel': packet.get('channel', 1),
                            'last_seen': time.time(),
                            'is_talking': packet.get('is_talking', False)
                        }

                    if self.on_peer_update:
                        self.on_peer_update(list(self.peers.values()))

                    p_type = packet.get('type')
                    if p_type == 'TEXT' and self.on_message_received:
                        self.on_message_received(packet.get('callsign'), packet.get('text'))
                    elif p_type == 'SOUND' and self.on_sound_received:
                        self.on_sound_received(packet.get('sound_id'), packet.get('callsign'))
                    elif p_type == 'MORSE' and self.on_morse_received:
                        self.on_morse_received(packet.get('morse'), packet.get('text'), packet.get('callsign'))
                    elif p_type == 'PTT' and self.on_ptt_state:
                        self.on_ptt_state(packet.get('callsign'), packet.get('is_talking'))
                except Exception:
                    pass

        t = threading.Thread(target=_listen, daemon=True)
        t.start()

    def _start_heartbeat(self):
        def _hb():
            while self.running:
                self.send_presence(False)
                now = time.time()
                with self.peers_lock:
                    stale = [pid for pid, info in self.peers.items() if now - info['last_seen'] > 8.0]
                    for pid in stale:
                        del self.peers[pid]
                    if stale and self.on_peer_update:
                        self.on_peer_update(list(self.peers.values()))
                time.sleep(3.0)

        t = threading.Thread(target=_hb, daemon=True)
        t.start()

    def send_packet(self, packet):
        if not self.sock:
            return
        packet['peer_id'] = self.peer_id
        packet['callsign'] = self.callsign
        packet['channel'] = self.channel
        packet['timestamp'] = int(time.time() * 1000)
        try:
            raw = json.dumps(packet).encode('utf-8')
            self.sock.sendto(raw, ('<broadcast>', DISCOVERY_PORT))
        except Exception:
            pass

    def send_presence(self, is_talking=False):
        self.send_packet({'type': 'PRESENCE', 'is_talking': is_talking})

    def send_text(self, text):
        self.send_packet({'type': 'TEXT', 'text': text})

    def send_sound(self, sound_id):
        self.send_packet({'type': 'SOUND', 'sound_id': sound_id})

    def send_morse(self, morse_str, text_str):
        self.send_packet({'type': 'MORSE', 'morse': morse_str, 'text': text_str})

    def send_ptt(self, is_talking):
        self.send_packet({'type': 'PTT', 'is_talking': is_talking})

    def set_channel(self, channel_num):
        self.channel = int(channel_num)
        with self.peers_lock:
            self.peers.clear()
        self.send_presence(False)

    def close(self):
        self.running = False
        if self.sock:
            try: self.sock.close()
            except Exception: pass
