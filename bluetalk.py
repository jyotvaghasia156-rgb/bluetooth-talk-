#!/usr/bin/env python3
"""
====================================================================
  BLUETALK PRO - TACTICAL WALKIE-TALKIE & LIVE COMMUNICATOR (PYTHON)
  Standalone Desktop GUI Application (100% Python / Tkinter)
====================================================================
Features:
- Multi-Mode Canvas Visualizer (CRT Oscilloscope, Neon Equalizer, Sonar Radar)
- Spacebar & Mouse Push-to-Talk (PTT) with Quindar Roger Beeps
- Tactical Soundboard (Red Alert, 10-4, Sonar, Squelch, Air Horn)
- Interactive Morse Code Telegraph Keyer & Real-Time Decoder
- Voice FX Modulator Presets (VHF Radio, Space Comm, Cyborg, Stealth)
- LAN Peer Discovery & Live Packet Synchronization
====================================================================
"""

import math
import time
import random
import tkinter as tk
from tkinter import ttk, messagebox

from audio_sfx import sfx
from morse_engine import MorseEngine
from network_node import NetworkNode

# Theme Colors
BG_DARK = "#070b12"
PANEL_BG = "#0d1422"
CARD_BG = "#121b2d"
SCREEN_BG = "#040810"
CYAN = "#00f3ff"
NEON_GREEN = "#00ff88"
ALERT_RED = "#ff3366"
AMBER = "#ffb703"
TEXT_MAIN = "#f0f6fc"
TEXT_MUTED = "#8b949e"
BORDER = "#1c2b44"

CHANNELS = {
    1: '462.5625 MHz (CH 01 - Primary)',
    2: '462.5875 MHz (CH 02 - Alpha)',
    3: '462.6125 MHz (CH 03 - Bravo)',
    4: '462.6375 MHz (CH 04 - Charlie)',
    5: '462.6625 MHz (CH 05 - Secure)',
    6: '462.6875 MHz (CH 06 - Logistics)',
    7: '462.7125 MHz (CH 07 - Recon)',
    8: '467.5625 MHz (CH 08 - Open)'
}

class BlueTalkApp:
    def __init__(self, root):
        self.root = root
        self.root.title("BlueTalk Pro - Tactical Walkie-Talkie (Python Edition)")
        self.root.geometry("1060x780")
        self.root.minsize(880, 680)
        self.root.configure(bg=BG_DARK)

        # Core Engines
        self.morse = MorseEngine()
        callsign_prefix = random.choice(['VIPER', 'TITAN', 'EAGLE', 'GHOST', 'SHADOW'])
        self.callsign = f"{callsign_prefix}-{random.randint(10, 99)}"
        self.current_channel = 1
        self.net = NetworkNode(callsign=self.callsign, channel=self.current_channel)

        # State Variables
        self.is_transmitting = False
        self.spacebar_down = False
        self.visualizer_mode = "crt"  # 'crt', 'neon', 'sonar'
        self.radar_angle = 0.0
        self.peak_bars = [0.0] * 24
        self.voice_fx = "vhf"
        self.sos_active = False

        self._build_ui()
        self._bind_events()
        self._wire_network()
        self._start_visualizer_loop()

    def _build_ui(self):
        # 1. Top Header Bar
        header = tk.Frame(self.root, bg=PANEL_BG, height=54, highlightbackground=BORDER, highlightthickness=1)
        header.pack(fill=tk.X, side=tk.TOP)

        brand_lbl = tk.Label(header, text="📻 BLUETALK PRO", font=("Impact", 18), fg=CYAN, bg=PANEL_BG)
        brand_lbl.pack(side=tk.LEFT, padx=(16, 6), pady=8)

        sub_lbl = tk.Label(header, text="MIL-SPEC TACTICAL COMMUNICATOR (PYTHON)", font=("Segoe UI", 9, "bold"), fg=TEXT_MUTED, bg=PANEL_BG)
        sub_lbl.pack(side=tk.LEFT, pady=8)

        # Right Telemetry
        self.net_badge = tk.Label(header, text="● LAN SYNC ACTIVE", font=("Consolas", 10, "bold"), fg=NEON_GREEN, bg="#071810", padx=10, pady=4, relief="ridge")
        self.net_badge.pack(side=tk.RIGHT, padx=16)

        self.callsign_badge = tk.Label(header, text=f"OPERATOR: {self.callsign}", font=("Consolas", 10, "bold"), fg=CYAN, bg=CARD_BG, padx=10, pady=4)
        self.callsign_badge.pack(side=tk.RIGHT, padx=6)

        # 2. Main Workspace Layout
        main_frame = tk.Frame(self.root, bg=BG_DARK)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=12, pady=10)

        left_col = tk.Frame(main_frame, bg=PANEL_BG, width=440, highlightbackground=BORDER, highlightthickness=1)
        left_col.pack(side=tk.LEFT, fill=tk.BOTH, expand=False, padx=(0, 8))

        right_col = tk.Frame(main_frame, bg=PANEL_BG, highlightbackground=BORDER, highlightthickness=1)
        right_col.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)

        self._build_radio_column(left_col)
        self._build_tactical_column(right_col)

    def _build_radio_column(self, parent):
        # Frequency Screen Card
        freq_card = tk.Frame(parent, bg=SCREEN_BG, highlightbackground=CYAN, highlightthickness=1, padx=12, pady=8)
        freq_card.pack(fill=tk.X, padx=12, pady=(12, 8))

        f_meta = tk.Frame(freq_card, bg=SCREEN_BG)
        f_meta.pack(fill=tk.X)
        tk.Label(f_meta, text="UHF BAND / FREQUENCY", font=("Consolas", 9, "bold"), fg=TEXT_MUTED, bg=SCREEN_BG).pack(side=tk.LEFT)
        self.freq_status_lbl = tk.Label(f_meta, text="STATION READY", font=("Consolas", 9, "bold"), fg=NEON_GREEN, bg=SCREEN_BG)
        self.freq_status_lbl.pack(side=tk.RIGHT)

        self.freq_number_lbl = tk.Label(freq_card, text="462.5625 MHz", font=("Consolas", 20, "bold"), fg=CYAN, bg=SCREEN_BG)
        self.freq_number_lbl.pack(pady=4)

        # Channel & Callsign Selection Row
        row = tk.Frame(parent, bg=PANEL_BG)
        row.pack(fill=tk.X, padx=12, pady=4)

        tk.Label(row, text="CH:", font=("Segoe UI", 9, "bold"), fg=TEXT_MAIN, bg=PANEL_BG).pack(side=tk.LEFT)
        self.ch_var = tk.StringVar(value="1")
        ch_combo = ttk.Combobox(row, textvariable=self.ch_var, values=list(CHANNELS.keys()), width=4, state="readonly")
        ch_combo.pack(side=tk.LEFT, padx=(4, 12))
        ch_combo.bind("<<ComboboxSelected>>", self._on_channel_change)

        tk.Label(row, text="Callsign:", font=("Segoe UI", 9, "bold"), fg=TEXT_MAIN, bg=PANEL_BG).pack(side=tk.LEFT)
        self.cs_entry = tk.Entry(row, font=("Consolas", 10, "bold"), bg=CARD_BG, fg=CYAN, insertbackground=CYAN, width=12)
        self.cs_entry.insert(0, self.callsign)
        self.cs_entry.pack(side=tk.LEFT, padx=(4, 6))
        self.cs_entry.bind("<FocusOut>", self._on_callsign_change)

        # Multi-Mode Visualizer Frame
        viz_wrap = tk.Frame(parent, bg=CARD_BG, highlightbackground=BORDER, highlightthickness=1)
        viz_wrap.pack(fill=tk.BOTH, expand=False, padx=12, pady=6)

        viz_top = tk.Frame(viz_wrap, bg=CARD_BG)
        viz_top.pack(fill=tk.X, padx=6, pady=4)
        tk.Label(viz_top, text="SPECTRUM MONITOR", font=("Consolas", 8, "bold"), fg=TEXT_MUTED, bg=CARD_BG).pack(side=tk.LEFT)

        modes_frame = tk.Frame(viz_top, bg=CARD_BG)
        modes_frame.pack(side=tk.RIGHT)
        for m, name in [('crt', 'CRT'), ('neon', 'BARS'), ('sonar', 'RADAR')]:
            btn = tk.Button(modes_frame, text=name, font=("Consolas", 8, "bold"), bg="#09101c", fg=TEXT_MUTED,
                            activebackground=CYAN, activeforeground="#000", bd=0, padx=6, pady=1,
                            command=lambda mode=m: self._set_viz_mode(mode))
            btn.pack(side=tk.LEFT, padx=1)

        self.viz_canvas = tk.Canvas(viz_wrap, bg=SCREEN_BG, height=120, highlightthickness=0)
        self.viz_canvas.pack(fill=tk.BOTH, expand=True, padx=6, pady=(0, 6))

        # Tactical Voice Modulator FX Selector
        fx_frame = tk.Frame(parent, bg=CARD_BG, highlightbackground=BORDER, highlightthickness=1, padx=8, pady=6)
        fx_frame.pack(fill=tk.X, padx=12, pady=4)

        tk.Label(fx_frame, text="🎙️ VOICE DSP FILTER:", font=("Consolas", 8, "bold"), fg=TEXT_MUTED, bg=CARD_BG).pack(anchor="w", pady=(0, 4))
        fx_btn_row = tk.Frame(fx_frame, bg=CARD_BG)
        fx_btn_row.pack(fill=tk.X)

        self.fx_buttons = {}
        for code, label in [('none', 'Clear'), ('vhf', 'VHF Radio'), ('space', 'Space'), ('cyborg', 'Cyborg'), ('stealth', 'Stealth')]:
            b = tk.Button(fx_btn_row, text=label, font=("Segoe UI", 8, "bold"), bg="#09101c", fg=TEXT_MUTED,
                          activebackground=CYAN, bd=1, relief="solid", highlightthickness=0,
                          command=lambda c=code: self._select_fx(c))
            b.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=1)
            self.fx_buttons[code] = b
        self._highlight_fx_button('vhf')

        # Status LEDs
        led_row = tk.Frame(parent, bg=PANEL_BG)
        led_row.pack(pady=6)
        self.tx_led = tk.Label(led_row, text="● TX ON AIR", font=("Consolas", 9, "bold"), fg="#3a1018", bg=PANEL_BG)
        self.tx_led.pack(side=tk.LEFT, padx=14)
        self.rx_led = tk.Label(led_row, text="● RX STANDBY", font=("Consolas", 9, "bold"), fg="#103a24", bg=PANEL_BG)
        self.rx_led.pack(side=tk.LEFT, padx=14)

        # Big Tactical PTT Transmit Button
        ptt_container = tk.Frame(parent, bg=PANEL_BG)
        ptt_container.pack(fill=tk.BOTH, expand=True, pady=(4, 12))

        self.ptt_btn = tk.Button(ptt_container, text="🎙️\nTRANSMIT", font=("Segoe UI", 16, "bold"),
                                 bg="#152238", fg=CYAN, activebackground=ALERT_RED, activeforeground="#fff",
                                 bd=4, relief="ridge", width=16, height=4, cursor="hand2")
        self.ptt_btn.pack(pady=4)

        self.ptt_hint = tk.Label(ptt_container, text="HOLD TO TALK (OR PRESS SPACEBAR)", font=("Consolas", 9, "bold"), fg=TEXT_MUTED, bg=PANEL_BG)
        self.ptt_hint.pack()

    def _build_tactical_column(self, parent):
        notebook = ttk.Notebook(parent)
        notebook.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)

        # Tab 1: Tactical Soundboard
        tab_sbd = tk.Frame(notebook, bg=PANEL_BG)
        notebook.add(tab_sbd, text=" ⚡ SOUNDBOARD ")
        self._build_soundboard_tab(tab_sbd)

        # Tab 2: Morse Code Telegraph
        tab_morse = tk.Frame(notebook, bg=PANEL_BG)
        notebook.add(tab_morse, text=" 📡 MORSE TELEGRAPH ")
        self._build_morse_tab(tab_morse)

        # Tab 3: Tactical Radio Log & Chat
        tab_log = tk.Frame(notebook, bg=PANEL_BG)
        notebook.add(tab_log, text=" 💬 RADIO COMMS LOG ")
        self._build_log_tab(tab_log)

    def _build_soundboard_tab(self, parent):
        tk.Label(parent, text="TACTICAL PROCEDURAL AUDIO CUES", font=("Consolas", 10, "bold"), fg=CYAN, bg=PANEL_BG).pack(anchor="w", padx=14, pady=(12, 6))

        grid = tk.Frame(parent, bg=PANEL_BG)
        grid.pack(fill=tk.BOTH, expand=True, padx=14, pady=6)
        grid.columnconfigure(0, weight=1)
        grid.columnconfigure(1, weight=1)

        cues = [
            ("🚨 RED ALERT", "Emergency Alarm Siren", ALERT_RED, sfx.play_red_alert, "red-alert"),
            ("📡 10-4 COPY", "Military Dispatch Acknowledge", CYAN, sfx.play_ten_four, "10-4"),
            ("🔊 ROGER BEEP", "Authentic NASA Quindar Beep", NEON_GREEN, sfx.play_roger_beep, "roger"),
            ("⚡ SONAR PING", "Submarine Acoustic Echo", "#38bdf8", sfx.play_sonar_ping, "sonar"),
            ("💥 SQUELCH BURST", "Heavy Radio Static Blast", AMBER, sfx.play_static_burst, "squelch"),
            ("📣 AIR HORN", "Command Klaxon Warning", "#c084fc", sfx.play_air_horn, "airhorn")
        ]

        for idx, (title, desc, color, handler, s_id) in enumerate(cues):
            r = idx // 2
            c = idx % 2
            btn_box = tk.Frame(grid, bg=CARD_BG, highlightbackground=color, highlightthickness=1, padx=10, pady=12)
            btn_box.grid(row=r, column=c, padx=6, pady=6, sticky="nsew")

            b = tk.Button(btn_box, text=title, font=("Segoe UI", 12, "bold"), fg=color, bg=CARD_BG,
                          activebackground=color, activeforeground="#000", bd=0, cursor="hand2",
                          command=lambda h=handler, sid=s_id, t=title: self._trigger_sound_cue(h, sid, t))
            b.pack(fill=tk.X)
            tk.Label(btn_box, text=desc, font=("Consolas", 8), fg=TEXT_MUTED, bg=CARD_BG).pack()

        tip = tk.Label(parent, text="💡 Cues play locally and broadcast live to all operators on this frequency!",
                       font=("Segoe UI", 9, "italic"), fg=TEXT_MUTED, bg=PANEL_BG)
        tip.pack(pady=10)

    def _build_morse_tab(self, parent):
        tk.Label(parent, text="MILITARY CW TELEGRAPH & DECODER", font=("Consolas", 10, "bold"), fg=CYAN, bg=PANEL_BG).pack(anchor="w", padx=14, pady=(12, 4))

        station = tk.Frame(parent, bg=CARD_BG, highlightbackground=BORDER, highlightthickness=1, padx=12, pady=10)
        station.pack(fill=tk.X, padx=14, pady=6)

        # Signal flasher bar
        s_bar = tk.Frame(station, bg=CARD_BG)
        s_bar.pack(fill=tk.X, pady=(0, 6))
        self.morse_led = tk.Label(s_bar, text="●", font=("Segoe UI", 16, "bold"), fg="#1c3022", bg=CARD_BG)
        self.morse_led.pack(side=tk.LEFT)
        tk.Label(s_bar, text=" CW SIGNAL MONITOR", font=("Consolas", 9, "bold"), fg=TEXT_MUTED, bg=CARD_BG).pack(side=tk.LEFT)
        self.morse_symbol_lbl = tk.Label(s_bar, text="", font=("Consolas", 11, "bold"), fg=CYAN, bg=CARD_BG)
        self.morse_symbol_lbl.pack(side=tk.RIGHT)

        # Decoder Screen
        tk.Label(station, text="REAL-TIME DECODED TEXT:", font=("Consolas", 8, "bold"), fg=TEXT_MUTED, bg=CARD_BG).pack(anchor="w")
        self.morse_decode_box = tk.Label(station, text="DECODING IDLE... PRESS BRASS KEY BELOW", font=("Consolas", 13, "bold"),
                                         fg=NEON_GREEN, bg=SCREEN_BG, height=2, anchor="w", padx=8, relief="sunken")
        self.morse_decode_box.pack(fill=tk.X, pady=4)

        # Brass Telegraph Key Button
        key_area = tk.Frame(station, bg=CARD_BG)
        key_area.pack(pady=8)
        self.brass_key = tk.Button(key_area, text="⚡ BRASS TELEGRAPH KEY ⚡\n(TAP FOR DOT • | HOLD FOR DASH ▬)",
                                   font=("Segoe UI", 10, "bold"), bg="#8b5a2b", fg="#ffd166",
                                   activebackground="#ffd166", activeforeground="#2b1704", bd=4, relief="raised", padx=20, pady=10, cursor="hand2")
        self.brass_key.pack()

        # Morse Actions
        act_row = tk.Frame(station, bg=CARD_BG)
        act_row.pack(fill=tk.X, pady=(6, 0))

        tk.Button(act_row, text="Clear", font=("Segoe UI", 9, "bold"), bg=PANEL_BG, fg=TEXT_MAIN, bd=1, command=self._clear_morse).pack(side=tk.LEFT, padx=2)
        self.sos_btn = tk.Button(act_row, text="🆘 Emergency SOS", font=("Segoe UI", 9, "bold"), bg="#3a0d18", fg=ALERT_RED, bd=1, command=self._toggle_sos)
        self.sos_btn.pack(side=tk.LEFT, padx=6)
        tk.Button(act_row, text="📡 Broadcast Morse to Channel", font=("Segoe UI", 9, "bold"), bg="#092230", fg=CYAN, bd=1, command=self._broadcast_morse).pack(side=tk.RIGHT, padx=2)

        # Text to Morse Encoder Player
        enc_card = tk.Frame(parent, bg=CARD_BG, highlightbackground=BORDER, highlightthickness=1, padx=12, pady=10)
        enc_card.pack(fill=tk.X, padx=14, pady=8)

        tk.Label(enc_card, text="TEXT TO MORSE AUDIO ENCODER:", font=("Consolas", 8, "bold"), fg=TEXT_MUTED, bg=CARD_BG).pack(anchor="w")
        enc_row = tk.Frame(enc_card, bg=CARD_BG)
        enc_row.pack(fill=tk.X, pady=4)

        self.morse_input = tk.Entry(enc_row, font=("Consolas", 11), bg=SCREEN_BG, fg=CYAN, insertbackground=CYAN)
        self.morse_input.insert(0, "SOS MAYDAY")
        self.morse_input.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 6))

        tk.Button(enc_row, text="▶ Play Morse Audio", font=("Segoe UI", 9, "bold"), bg=CYAN, fg="#000", bd=0, padx=10, pady=4, command=self._play_text_morse).pack(side=tk.RIGHT)

    def _build_log_tab(self, parent):
        tk.Label(parent, text="LIVE ENCRYPTED COMMS & BROADCAST FEED", font=("Consolas", 10, "bold"), fg=CYAN, bg=PANEL_BG).pack(anchor="w", padx=14, pady=(12, 4))

        self.log_text = tk.Text(parent, bg=SCREEN_BG, fg=TEXT_MAIN, font=("Consolas", 10), insertbackground=CYAN, bd=1, relief="sunken", state="disabled")
        self.log_text.pack(fill=tk.BOTH, expand=True, padx=14, pady=6)

        # Input Row
        inp_row = tk.Frame(parent, bg=PANEL_BG)
        inp_row.pack(fill=tk.X, padx=14, pady=(0, 10))

        self.chat_input = tk.Entry(inp_row, font=("Segoe UI", 11), bg=CARD_BG, fg=TEXT_MAIN, insertbackground=CYAN)
        self.chat_input.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 6))
        self.chat_input.bind("<Return>", lambda e: self._send_text_message())

        tk.Button(inp_row, text="Send", font=("Segoe UI", 9, "bold"), bg=CYAN, fg="#000", bd=0, padx=16, pady=4, command=self._send_text_message).pack(side=tk.RIGHT)

        self._log_system(f"BlueTalk Station Online. Logged on Channel {self.current_channel} ({CHANNELS[self.current_channel]}).")
        self._log_system("Hold SPACEBAR to speak or tap Brass Key to transmit Morse signals.")

    # 3. Events & Bindings
    def _bind_events(self):
        # Spacebar PTT
        self.root.bind("<KeyPress-space>", self._on_space_press)
        self.root.bind("<KeyRelease-space>", self._on_space_release)

        # Mouse PTT
        self.ptt_btn.bind("<ButtonPress-1>", lambda e: self._start_ptt())
        self.ptt_btn.bind("<ButtonRelease-1>", lambda e: self._stop_ptt())

        # Brass Morse Key
        self.brass_key.bind("<ButtonPress-1>", lambda e: self._on_morse_key_down())
        self.brass_key.bind("<ButtonRelease-1>", lambda e: self._on_morse_key_up())

        # Morse engine callbacks
        self.morse.on_symbol_callback = lambda sym, seq: self.root.after(0, self._update_morse_symbols, sym, seq)
        self.morse.on_char_decoded = lambda char, full, seq: self.root.after(0, self._update_morse_decoded, full, seq)
        self.morse.on_signal_state = lambda active: self.root.after(0, self._update_morse_led, active)

    def _on_space_press(self, event):
        if self.root.focus_get() in (self.cs_entry, self.morse_input, self.chat_input):
            return
        if not self.spacebar_down:
            self.spacebar_down = True
            self._start_ptt()

    def _on_space_release(self, event):
        if self.spacebar_down:
            self.spacebar_down = False
            self._stop_ptt()

    def _start_ptt(self):
        if self.is_transmitting: return
        self.is_transmitting = True
        sfx.play_mic_click_in()
        self.ptt_btn.configure(bg=ALERT_RED, fg="#fff", text="🔴\nON AIR")
        self.tx_led.configure(fg=ALERT_RED)
        self.freq_status_lbl.configure(text="TRANSMITTING", fg=ALERT_RED)
        self.net.send_ptt(True)

    def _stop_ptt(self):
        if not self.is_transmitting: return
        self.is_transmitting = False
        sfx.play_roger_beep()
        self.ptt_btn.configure(bg="#152238", fg=CYAN, text="🎙️\nTRANSMIT")
        self.tx_led.configure(fg="#3a1018")
        self.freq_status_lbl.configure(text="STATION READY", fg=NEON_GREEN)
        self.net.send_ptt(False)

    # Morse Key Handlers
    def _on_morse_key_down(self):
        sfx.play_morse_tone(150, 750)
        self.morse.press_key()
        self.brass_key.configure(relief="sunken", bg="#ffd166", fg="#2b1704")

    def _on_morse_key_up(self):
        self.morse.release_key()
        self.brass_key.configure(relief="raised", bg="#8b5a2b", fg="#ffd166")

    def _update_morse_symbols(self, symbol, seq):
        self.morse_symbol_lbl.configure(text=f"SEQ: {seq}")

    def _update_morse_decoded(self, full_text, seq):
        self.morse_decode_box.configure(text=full_text if full_text.strip() else "DECODING IDLE...")

    def _update_morse_led(self, active):
        self.morse_led.configure(fg=NEON_GREEN if active else "#1c3022")

    def _clear_morse(self):
        self.morse.clear()
        self.morse_decode_box.configure(text="DECODING IDLE...")
        self.morse_symbol_lbl.configure(text="")

    def _toggle_sos(self):
        self.sos_active = not self.sos_active
        sfx.toggle_sos_beacon(self.sos_active, on_char_cb=lambda act, sym: self.root.after(0, self._update_morse_led, act))
        self.sos_btn.configure(text="🚨 STOP SOS" if self.sos_active else "🆘 Emergency SOS",
                               bg=ALERT_RED if self.sos_active else "#3a0d18", fg="#fff" if self.sos_active else ALERT_RED)
        if self.sos_active:
            self._log_system("EMERGENCY SOS BEACON ACTIVATED (... --- ...)")
            self.net.send_sound("red-alert")

    def _broadcast_morse(self):
        text = self.morse.decoded_text.strip() or self.morse_input.get().strip()
        if not text:
            messagebox.showinfo("Morse", "No Morse message to broadcast.")
            return
        code = self.morse.text_to_morse(text)
        self.net.send_morse(code, text)
        self._log_chat(self.callsign, f"[MORSE TRANSMISSION]: \"{text}\" ({code})")

    def _play_text_morse(self):
        text = self.morse_input.get().strip()
        if not text: return
        code = text if set(text).issubset({'.', '-', ' ', '/'}) else self.morse.text_to_morse(text)
        sfx.play_morse_sequence(code, wpm=18, on_char_cb=lambda act, sym: self.root.after(0, self._update_morse_led, act))

    # Soundboard & Chat
    def _trigger_sound_cue(self, handler, s_id, title):
        handler()
        self.net.send_sound(s_id)
        self._log_system(f"Tactical Cue Broadcast: [{title}]")

    def _send_text_message(self):
        text = self.chat_input.get().strip()
        if not text: return
        self.net.send_text(text)
        self._log_chat(self.callsign, text)
        self.chat_input.delete(0, tk.END)

    def _log_chat(self, sender, text):
        t_str = time.strftime("%H:%M:%S")
        self.log_text.configure(state="normal")
        self.log_text.insert(tk.END, f"[{t_str}] <{sender}> {text}\n")
        self.log_text.see(tk.END)
        self.log_text.configure(state="disabled")

    def _log_system(self, text):
        t_str = time.strftime("%H:%M:%S")
        self.log_text.configure(state="normal")
        self.log_text.insert(tk.END, f"[{t_str}] [RADIO] {text}\n")
        self.log_text.see(tk.END)
        self.log_text.configure(state="disabled")

    # Modulator & Mode Switchers
    def _select_fx(self, fx):
        self.voice_fx = fx
        self._highlight_fx_button(fx)
        sfx.play_mic_click_in()

    def _highlight_fx_button(self, active_code):
        for code, b in self.fx_buttons.items():
            if code == active_code:
                b.configure(bg=CYAN, fg="#000")
            else:
                b.configure(bg="#09101c", fg=TEXT_MUTED)

    def _set_viz_mode(self, mode):
        self.visualizer_mode = mode

    def _on_channel_change(self, event):
        ch = int(self.ch_var.get())
        self.current_channel = ch
        self.net.set_channel(ch)
        self.freq_number_lbl.configure(text=CHANNELS[ch].split()[0] + " MHz")
        self._log_system(f"Switched to Channel {ch} ({CHANNELS[ch]})")
        sfx.play_mic_click_in()

    def _on_callsign_change(self, event):
        val = self.cs_entry.get().strip().upper()
        if val:
            self.callsign = val
            self.net.callsign = val
            self.callsign_badge.configure(text=f"OPERATOR: {self.callsign}")

    # 4. Networking Wiring
    def _wire_network(self):
        self.net.on_message_received = lambda cs, txt: self.root.after(0, self._log_chat, cs, txt)
        self.net.on_morse_received = lambda m, txt, cs: self.root.after(0, self._on_remote_morse, m, txt, cs)
        self.net.on_sound_received = lambda sid, cs: self.root.after(0, self._on_remote_sound, sid, cs)
        self.net.on_ptt_state = lambda cs, talking: self.root.after(0, self._on_remote_ptt, cs, talking)

    def _on_remote_morse(self, morse_str, text_str, sender):
        self._log_chat(sender, f"[MORSE RECEIVED]: \"{text_str}\" ({morse_str})")
        sfx.play_morse_sequence(morse_str, 18, on_char_cb=lambda act, sym: self.root.after(0, self._update_morse_led, act))

    def _on_remote_sound(self, sid, sender):
        self._log_system(f"Remote Cue received from [{sender}]: {sid.upper()}")
        if sid == "red-alert": sfx.play_red_alert()
        elif sid == "10-4": sfx.play_ten_four()
        elif sid == "roger": sfx.play_roger_beep()
        elif sid == "sonar": sfx.play_sonar_ping()
        elif sid == "squelch": sfx.play_static_burst()
        elif sid == "airhorn": sfx.play_air_horn()

    def _on_remote_ptt(self, sender, is_talking):
        if is_talking:
            self.rx_led.configure(fg=NEON_GREEN)
            self.freq_status_lbl.configure(text=f"RX: {sender}", fg=NEON_GREEN)
        else:
            self.rx_led.configure(fg="#103a24")
            self.freq_status_lbl.configure(text="STATION READY", fg=NEON_GREEN)

    # 5. Canvas Visualizer Loop
    def _start_visualizer_loop(self):
        def _loop():
            self._render_visualizer()
            self.root.after(35, _loop)
        self.root.after(50, _loop)

    def _render_visualizer(self):
        w = self.viz_canvas.winfo_width()
        h = self.viz_canvas.winfo_height()
        if w < 10 or h < 10: return

        self.viz_canvas.delete("all")

        if self.visualizer_mode == "crt":
            # Graticule Grid
            for x in range(0, w, 24):
                self.viz_canvas.create_line(x, 0, x, h, fill="#0c1d18")
            for y in range(0, h, 18):
                self.viz_canvas.create_line(0, y, w, y, fill="#0c1d18")

            # CRT Wave
            color = ALERT_RED if self.is_transmitting else NEON_GREEN
            t = time.time() * 12.0
            points = []
            amp = 30.0 if self.is_transmitting else 6.0

            for x in range(0, w, 3):
                y = (h / 2) + math.sin(x * 0.05 + t) * amp + math.sin(x * 0.02 - t * 0.5) * (amp * 0.5)
                points.extend([x, y])

            if len(points) >= 4:
                self.viz_canvas.create_line(points, fill=color, width=2, smooth=True)

        elif self.visualizer_mode == "neon":
            bars = 22
            bw = (w - (bars * 4)) / bars
            for i in range(bars):
                target = random.uniform(20, h - 10) if self.is_transmitting else random.uniform(5, 20)
                self.peak_bars[i] = max(target, self.peak_bars[i] - 1.8)
                bx = i * (bw + 4) + 4
                by = h - target
                color = ALERT_RED if self.is_transmitting else CYAN
                self.viz_canvas.create_rectangle(bx, by, bx + bw, h, fill=color, outline="")
                # Peak cap
                self.viz_canvas.create_rectangle(bx, h - self.peak_bars[i] - 2, bx + bw, h - self.peak_bars[i], fill="#fff", outline="")

        elif self.visualizer_mode == "sonar":
            cx, cy = w / 2, h / 2
            r = min(cx, cy) - 6
            # Range rings
            for ratio in [0.35, 0.7, 0.98]:
                self.viz_canvas.create_oval(cx - r*ratio, cy - r*ratio, cx + r*ratio, cy + r*ratio, outline="#0a2a30")

            # Sweep arm
            self.radar_angle = (self.radar_angle + 0.08) % (math.pi * 2)
            ex = cx + math.cos(self.radar_angle) * r
            ey = cy + math.sin(self.radar_angle) * r
            self.viz_canvas.create_line(cx, cy, ex, ey, fill=CYAN if not self.is_transmitting else ALERT_RED, width=2)


def main():
    root = tk.Tk()
    app = BlueTalkApp(root)
    root.protocol("WM_DELETE_WINDOW", lambda: (app.net.close(), root.destroy()))
    root.mainloop()

if __name__ == "__main__":
    main()
