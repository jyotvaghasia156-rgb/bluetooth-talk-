"""
BlueTalk Pro - Procedural Audio & Tactical Soundboard Synthesizer (Python / Windows)
Uses hardware-timed audio generation via winsound with threaded background execution.
"""

import time
import threading
import winsound

class AudioSFX:
    def __init__(self):
        self.enabled = True
        self.roger_beep_enabled = True
        self.is_playing_sos = False
        self.sos_thread = None

    def _play_tone(self, freq: int, duration_ms: int):
        if not self.enabled:
            return
        try:
            winsound.Beep(max(37, min(32767, int(freq))), max(10, int(duration_ms)))
        except Exception:
            pass

    def _async_run(self, target, *args):
        t = threading.Thread(target=target, args=args, daemon=True)
        t.start()
        return t

    # 1. PTT Mic Click-In
    def play_mic_click_in(self):
        def _click():
            self._play_tone(320, 25)
            self._play_tone(180, 20)
        self._async_run(_click)

    # 2. Authentic NASA Roger Beep (Quindar Tones)
    def play_roger_beep(self):
        if not self.roger_beep_enabled:
            return
        def _roger():
            self._play_tone(1750, 80)
            time.sleep(0.02)
            self._play_tone(2475, 80)
        self._async_run(_roger)

    # 3. Radio Squelch Tail
    def play_squelch_tail(self):
        def _squelch():
            self._play_tone(120, 40)
            self._play_tone(80, 30)
        self._async_run(_squelch)

    # 4. Red Alert Siren
    def play_red_alert(self):
        def _siren():
            for _ in range(2):
                for f in range(500, 950, 45):
                    self._play_tone(f, 20)
                for f in range(950, 500, -45):
                    self._play_tone(f, 20)
        self._async_run(_siren)

    # 5. Military Dispatch 10-4 Acknowledged Chime
    def play_ten_four(self):
        def _ack():
            self._play_tone(659, 70)  # E5
            self._play_tone(880, 70)  # A5
            self._play_tone(1174, 90) # D6
        self._async_run(_ack)

    # 6. Submarine Sonar Acoustic Ping
    def play_sonar_ping(self):
        def _ping():
            self._play_tone(1480, 280)
            time.sleep(0.05)
            self._play_tone(740, 150)
        self._async_run(_ping)

    # 7. Heavy Static Squelch Burst
    def play_static_burst(self):
        def _burst():
            for f in [350, 700, 250, 800, 400]:
                self._play_tone(f, 25)
        self._async_run(_burst)

    # 8. Tactical Air Horn
    def play_air_horn(self):
        def _horn():
            for _ in range(2):
                self._play_tone(349, 120)
                self._play_tone(466, 180)
                time.sleep(0.04)
        self._async_run(_horn)

    # Morse Tone Keying
    def play_morse_tone(self, duration_ms: int, freq: int = 750):
        self._async_run(self._play_tone, freq, duration_ms)

    def play_morse_sequence(self, morse_str: str, wpm: int = 18, on_char_cb = None):
        def _play():
            unit = max(20, int(1200 / max(5, min(35, wpm))))
            dot_ms = unit
            dash_ms = unit * 3

            for char in morse_str:
                if char == '.':
                    if on_char_cb: on_char_cb(True, '.')
                    self._play_tone(750, dot_ms)
                    if on_char_cb: on_char_cb(False, '')
                    time.sleep(unit / 1000.0)
                elif char == '-':
                    if on_char_cb: on_char_cb(True, '-')
                    self._play_tone(750, dash_ms)
                    if on_char_cb: on_char_cb(False, '')
                    time.sleep(unit / 1000.0)
                elif char == ' ':
                    time.sleep((unit * 2) / 1000.0)
                elif char == '/':
                    time.sleep((unit * 5) / 1000.0)
        self._async_run(_play)

    def toggle_sos_beacon(self, enable: bool, on_char_cb = None):
        self.is_playing_sos = enable
        if not enable:
            return

        def _sos_loop():
            while self.is_playing_sos:
                unit = 70
                # S: . . .
                for _ in range(3):
                    if not self.is_playing_sos: return
                    if on_char_cb: on_char_cb(True, '.')
                    self._play_tone(800, unit)
                    if on_char_cb: on_char_cb(False, '')
                    time.sleep(0.07)
                time.sleep(0.18)
                # O: - - -
                for _ in range(3):
                    if not self.is_playing_sos: return
                    if on_char_cb: on_char_cb(True, '-')
                    self._play_tone(800, unit * 3)
                    if on_char_cb: on_char_cb(False, '')
                    time.sleep(0.07)
                time.sleep(0.18)
                # S: . . .
                for _ in range(3):
                    if not self.is_playing_sos: return
                    if on_char_cb: on_char_cb(True, '.')
                    self._play_tone(800, unit)
                    if on_char_cb: on_char_cb(False, '')
                    time.sleep(0.07)
                time.sleep(1.2)

        self.sos_thread = self._async_run(_sos_loop)

sfx = AudioSFX()
