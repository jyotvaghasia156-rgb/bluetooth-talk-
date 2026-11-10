#!/usr/bin/env python3
"""
====================================================================
  BLUETALK PRO - TACTICAL COMMUNICATOR (INTERNET & BLUETOOTH)
  Standalone Desktop GUI Application (100% Python / Tkinter)
====================================================================
Features:
- Contact by Room Code & Share Link over Internet (Server / Tunnel) or Bluetooth RFCOMM
- Zero-Server Local Wi-Fi LAN mode by Room Code
- Multi-Mode Canvas Visualizer (CRT Oscilloscope, Neon Equalizer, Sonar Radar)
- Spacebar & Mouse Push-to-Talk (PTT) with Quindar Roger Beeps
- Tactical Soundboard (Red Alert, 10-4, Sonar, Squelch, Air Horn)
- Interactive Morse Code Telegraph Keyer & Real-Time Decoder
- Interoperates live with BlueTalk Web/Mobile clients via server.py!
====================================================================
"""

import os
import sys
import math
import time
import random
import subprocess
import threading
import tkinter as tk
from tkinter import ttk, messagebox

from audio_sfx import sfx
from morse_engine import MorseEngine
from network_node import NetworkNode, normalize_room

# Theme Colors
BG_DARK = "#070b12"
PANEL_BG = "#0d1422"
CARD_BG = "#121b2d"
SCREEN_BG = "#040810"
CYAN = "#00f3ff"
NEON_GREEN = "#00ff88"
ALERT_RED = "#ff3366"
AMBER = "#ffb703"
BT_BLUE = "#38bdf8"
TEXT_MAIN = "#f0f6fc"
TEXT_MUTED = "#8b949e"
BORDER = "#1c2b44"

PRESET_ROOMS = [
    "HQ-MAIN",
    "SQUAD-ALPHA",
    "RECON-INTEL",
    "PRIVATE-1ON1",
    "SOS-PRIORITY",
]


class BlueTalkApp:
    def __init__(self, root):
        self.root = root
        self.root.title("BlueTalk Pro - Internet & Bluetooth Communicator")
        self.root.geometry("1120x820")
        self.root.minsize(920, 700)
        self.root.configure(bg=BG_DARK)

        # Core Engines
        self.morse = MorseEngine()
        callsign_prefix = random.choice(['VIPER', 'TITAN', 'EAGLE', 'GHOST', 'SHADOW'])
        self.callsign = f"{callsign_prefix}-{random.randint(10, 99)}"
        self.current_room = "HQ-MAIN"
        self.current_mode = "internet"
        self.server_url = "http://127.0.0.1:8080"

        self.net = NetworkNode(
            callsign=self.callsign,
            room=self.current_room,
            mode=self.current_mode,
            server_url=self.server_url,
        )

        # State Variables
        self.is_transmitting = False
        self.spacebar_down = False
        self.visualizer_mode = "crt"  # 'crt', 'neon', 'sonar'
        self.radar_angle = 0.0
        self.peak_bars = [0.0] * 24
        self.voice_fx = "vhf"
        self.sos_active = False
        self.bt_devices = []
        self.server_proc = None

        self._build_ui()
        self._bind_events()
        self._wire_network()
        self._start_visualizer_loop()
        self._update_mode_panel()

    def _build_ui(self):
        # 1. Top Header Bar
        header = tk.Frame(self.root, bg=PANEL_BG, height=54, highlightbackground=BORDER, highlightthickness=1)
        header.pack(fill=tk.X, side=tk.TOP)

        brand_lbl = tk.Label(header, text="📻 BLUETALK PRO", font=("Impact", 18), fg=CYAN, bg=PANEL_BG)
        brand_lbl.pack(side=tk.LEFT, padx=(16, 6), pady=8)

        sub_lbl = tk.Label(
            header,
            text="INTERNET RELAY & BLUETOOTH DIRECT COMMUNICATOR",
            font=("Segoe UI", 9, "bold"),
            fg=TEXT_MUTED,
            bg=PANEL_BG,
        )
        sub_lbl.pack(side=tk.LEFT, pady=8)

        self.net_badge = tk.Label(
            header,
            text="● CONNECTING...",
            font=("Consolas", 9, "bold"),
            fg=AMBER,
            bg="#1a1406",
            padx=10,
            pady=4,
            relief="ridge",
        )
        self.net_badge.pack(side=tk.RIGHT, padx=(6, 14))

        self.peer_badge = tk.Label(
            header,
            text="👥 1 ONLINE",
            font=("Consolas", 9, "bold"),
            fg=NEON_GREEN,
            bg="#071810",
            padx=8,
            pady=4,
            relief="ridge",
        )
        self.peer_badge.pack(side=tk.RIGHT, padx=4)

        self.callsign_badge = tk.Label(
            header,
            text=f"OPERATOR: {self.callsign}",
            font=("Consolas", 9, "bold"),
            fg=CYAN,
            bg=CARD_BG,
            padx=10,
            pady=4,
        )
        self.callsign_badge.pack(side=tk.RIGHT, padx=4)

        # 2. Main Workspace Layout
        main_frame = tk.Frame(self.root, bg=BG_DARK)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=12, pady=10)

        left_col = tk.Frame(main_frame, bg=PANEL_BG, width=450, highlightbackground=BORDER, highlightthickness=1)
        left_col.pack(side=tk.LEFT, fill=tk.BOTH, expand=False, padx=(0, 8))

        right_col = tk.Frame(main_frame, bg=PANEL_BG, highlightbackground=BORDER, highlightthickness=1)
        right_col.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)

        self._build_radio_column(left_col)
        self._build_tactical_column(right_col)

    def _build_radio_column(self, parent):
        # Active Contact & Connection Card (replaces Frequency card)
        conn_card = tk.Frame(parent, bg=SCREEN_BG, highlightbackground=CYAN, highlightthickness=1, padx=12, pady=8)
        conn_card.pack(fill=tk.X, padx=12, pady=(10, 6))

        f_meta = tk.Frame(conn_card, bg=SCREEN_BG)
        f_meta.pack(fill=tk.X)
        self.mode_meta_lbl = tk.Label(
            f_meta,
            text="🌐 INTERNET / RELAY MODE",
            font=("Consolas", 9, "bold"),
            fg=TEXT_MUTED,
            bg=SCREEN_BG,
        )
        self.mode_meta_lbl.pack(side=tk.LEFT)
        self.conn_status_lbl = tk.Label(
            f_meta,
            text="STATION READY",
            font=("Consolas", 9, "bold"),
            fg=NEON_GREEN,
            bg=SCREEN_BG,
        )
        self.conn_status_lbl.pack(side=tk.RIGHT)

        self.contact_display_lbl = tk.Label(
            conn_card,
            text=f"ROOM: {self.current_room}",
            font=("Consolas", 18, "bold"),
            fg=CYAN,
            bg=SCREEN_BG,
        )
        self.contact_display_lbl.pack(pady=3)

        # Transport Switcher: Internet | Bluetooth | Wi-Fi LAN
        mode_bar = tk.Frame(parent, bg=CARD_BG, highlightbackground=BORDER, highlightthickness=1, padx=6, pady=6)
        mode_bar.pack(fill=tk.X, padx=12, pady=4)
        tk.Label(mode_bar, text="CONNECT VIA:", font=("Consolas", 8, "bold"), fg=TEXT_MUTED, bg=CARD_BG).pack(anchor="w", pady=(0, 4))

        mode_btn_row = tk.Frame(mode_bar, bg=CARD_BG)
        mode_btn_row.pack(fill=tk.X)
        self.mode_buttons = {}
        for m_id, m_label in [
            ("internet", "🌐 Internet / Tunnel"),
            ("bluetooth", "📶 Bluetooth Direct"),
            ("lan", "📡 Wi-Fi LAN"),
        ]:
            b = tk.Button(
                mode_btn_row,
                text=m_label,
                font=("Segoe UI", 8, "bold"),
                bg="#09101c",
                fg=TEXT_MUTED,
                activebackground=CYAN,
                bd=1,
                relief="solid",
                cursor="hand2",
                command=lambda mode=m_id: self._switch_mode(mode),
            )
            b.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=2)
            self.mode_buttons[m_id] = b

        # Room Code & Callsign Row
        room_row = tk.Frame(parent, bg=PANEL_BG)
        room_row.pack(fill=tk.X, padx=12, pady=4)

        tk.Label(room_row, text="Room:", font=("Segoe UI", 9, "bold"), fg=TEXT_MAIN, bg=PANEL_BG).pack(side=tk.LEFT)
        self.room_var = tk.StringVar(value=self.current_room)
        self.room_combo = ttk.Combobox(room_row, textvariable=self.room_var, values=PRESET_ROOMS, width=13)
        self.room_combo.pack(side=tk.LEFT, padx=(4, 4))
        self.room_combo.bind("<<ComboboxSelected>>", lambda e: self._join_room())
        self.room_combo.bind("<Return>", lambda e: self._join_room())

        tk.Button(
            room_row,
            text="Join",
            font=("Segoe UI", 8, "bold"),
            bg=CYAN,
            fg="#000",
            bd=0,
            padx=8,
            pady=3,
            cursor="hand2",
            command=self._join_room,
        ).pack(side=tk.LEFT, padx=2)

        tk.Button(
            room_row,
            text="🎲",
            font=("Segoe UI", 9, "bold"),
            bg=CARD_BG,
            fg=CYAN,
            bd=1,
            padx=5,
            cursor="hand2",
            command=self._generate_room_code,
        ).pack(side=tk.LEFT, padx=2)

        tk.Label(room_row, text="ID:", font=("Segoe UI", 9, "bold"), fg=TEXT_MAIN, bg=PANEL_BG).pack(side=tk.LEFT, padx=(6, 2))
        self.cs_entry = tk.Entry(room_row, font=("Consolas", 9, "bold"), bg=CARD_BG, fg=CYAN, insertbackground=CYAN, width=10)
        self.cs_entry.insert(0, self.callsign)
        self.cs_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.cs_entry.bind("<FocusOut>", self._on_callsign_change)
        self.cs_entry.bind("<Return>", self._on_callsign_change)

        # Dynamic Transport Control Card (Internet URL vs Bluetooth Device Picker)
        self.transport_card = tk.Frame(parent, bg=CARD_BG, highlightbackground=BORDER, highlightthickness=1, padx=8, pady=6)
        self.transport_card.pack(fill=tk.X, padx=12, pady=4)

        # -- Internet sub-panel
        self.internet_panel = tk.Frame(self.transport_card, bg=CARD_BG)
        tk.Label(
            self.internet_panel,
            text="SERVER / TUNNEL URL (localhost, Wi-Fi IP, ngrok or cloudflared):",
            font=("Consolas", 8, "bold"),
            fg=TEXT_MUTED,
            bg=CARD_BG,
        ).pack(anchor="w")

        srv_row = tk.Frame(self.internet_panel, bg=CARD_BG)
        srv_row.pack(fill=tk.X, pady=(3, 4))
        self.server_url_entry = tk.Entry(srv_row, font=("Consolas", 9), bg=SCREEN_BG, fg=CYAN, insertbackground=CYAN)
        self.server_url_entry.insert(0, self.server_url)
        self.server_url_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 4))
        self.server_url_entry.bind("<Return>", lambda e: self._apply_server_url())

        tk.Button(
            srv_row,
            text="Connect",
            font=("Segoe UI", 8, "bold"),
            bg=CYAN,
            fg="#000",
            bd=0,
            padx=8,
            pady=3,
            cursor="hand2",
            command=self._apply_server_url,
        ).pack(side=tk.RIGHT)

        srv_actions = tk.Frame(self.internet_panel, bg=CARD_BG)
        srv_actions.pack(fill=tk.X)
        tk.Button(
            srv_actions,
            text="📋 Copy Invite Link",
            font=("Segoe UI", 8, "bold"),
            bg="#092230",
            fg=CYAN,
            bd=1,
            padx=6,
            pady=2,
            cursor="hand2",
            command=self._copy_invite_link,
        ).pack(side=tk.LEFT, padx=(0, 4))
        tk.Button(
            srv_actions,
            text="🚀 Start Local Relay Server",
            font=("Segoe UI", 8, "bold"),
            bg="#082418",
            fg=NEON_GREEN,
            bd=1,
            padx=6,
            pady=2,
            cursor="hand2",
            command=self._launch_local_server,
        ).pack(side=tk.LEFT)

        # -- Bluetooth sub-panel
        self.bluetooth_panel = tk.Frame(self.transport_card, bg=CARD_BG)
        bt_info = (
            f"LOCAL BT MAC: {self.net.local_bt_mac or 'N/A'} | RFCOMM CH: {self.net.local_bt_port}"
            if self.net.bt_supported
            else "Bluetooth RFCOMM not available on this OS build"
        )
        tk.Label(self.bluetooth_panel, text=bt_info, font=("Consolas", 8, "bold"), fg=BT_BLUE, bg=CARD_BG).pack(anchor="w")

        bt_row = tk.Frame(self.bluetooth_panel, bg=CARD_BG)
        bt_row.pack(fill=tk.X, pady=(4, 2))
        self.bt_device_var = tk.StringVar(value="Click Scan to list paired devices...")
        self.bt_combo = ttk.Combobox(bt_row, textvariable=self.bt_device_var, values=[], width=24)
        self.bt_combo.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 4))

        tk.Button(
            bt_row,
            text="🔍 Scan",
            font=("Segoe UI", 8, "bold"),
            bg="#09101c",
            fg=BT_BLUE,
            bd=1,
            padx=6,
            pady=2,
            cursor="hand2",
            command=self._scan_bluetooth_devices,
        ).pack(side=tk.LEFT, padx=2)

        bt_act_row = tk.Frame(self.bluetooth_panel, bg=CARD_BG)
        bt_act_row.pack(fill=tk.X, pady=(2, 0))
        tk.Label(bt_act_row, text="CH:", font=("Consolas", 8, "bold"), fg=TEXT_MUTED, bg=CARD_BG).pack(side=tk.LEFT)
        self.bt_port_entry = tk.Entry(bt_act_row, font=("Consolas", 8), bg=SCREEN_BG, fg=CYAN, width=3)
        self.bt_port_entry.insert(0, "4")
        self.bt_port_entry.pack(side=tk.LEFT, padx=(2, 6))

        tk.Button(
            bt_act_row,
            text="🔗 Connect BT",
            font=("Segoe UI", 8, "bold"),
            bg=BT_BLUE,
            fg="#000",
            bd=0,
            padx=8,
            pady=2,
            cursor="hand2",
            command=self._connect_bluetooth,
        ).pack(side=tk.LEFT, padx=2)
        tk.Button(
            bt_act_row,
            text="Disconnect",
            font=("Segoe UI", 8, "bold"),
            bg="#3a0d18",
            fg=ALERT_RED,
            bd=1,
            padx=6,
            pady=2,
            cursor="hand2",
            command=self._disconnect_bluetooth,
        ).pack(side=tk.RIGHT)

        # -- Wi-Fi LAN sub-panel
        self.lan_panel = tk.Frame(self.transport_card, bg=CARD_BG)
        tk.Label(
            self.lan_panel,
            text="📡 Zero-Server Wi-Fi Broadcast active on local network.\nOther BlueTalk Desktop apps on the same Wi-Fi & Room join automatically!",
            font=("Segoe UI", 8),
            fg=TEXT_MUTED,
            bg=CARD_BG,
            justify="left",
        ).pack(anchor="w")

        # Multi-Mode Visualizer Frame
        viz_wrap = tk.Frame(parent, bg=CARD_BG, highlightbackground=BORDER, highlightthickness=1)
        viz_wrap.pack(fill=tk.BOTH, expand=False, padx=12, pady=4)

        viz_top = tk.Frame(viz_wrap, bg=CARD_BG)
        viz_top.pack(fill=tk.X, padx=6, pady=3)
        tk.Label(viz_top, text="SPECTRUM MONITOR", font=("Consolas", 8, "bold"), fg=TEXT_MUTED, bg=CARD_BG).pack(side=tk.LEFT)

        modes_frame = tk.Frame(viz_top, bg=CARD_BG)
        modes_frame.pack(side=tk.RIGHT)
        for m, name in [('crt', 'CRT'), ('neon', 'BARS'), ('sonar', 'RADAR')]:
            btn = tk.Button(
                modes_frame,
                text=name,
                font=("Consolas", 8, "bold"),
                bg="#09101c",
                fg=TEXT_MUTED,
                activebackground=CYAN,
                activeforeground="#000",
                bd=0,
                padx=6,
                pady=1,
                command=lambda mode=m: self._set_viz_mode(mode),
            )
            btn.pack(side=tk.LEFT, padx=1)

        self.viz_canvas = tk.Canvas(viz_wrap, bg=SCREEN_BG, height=105, highlightthickness=0)
        self.viz_canvas.pack(fill=tk.BOTH, expand=True, padx=6, pady=(0, 6))

        # Tactical Voice Modulator FX Selector
        fx_frame = tk.Frame(parent, bg=CARD_BG, highlightbackground=BORDER, highlightthickness=1, padx=8, pady=5)
        fx_frame.pack(fill=tk.X, padx=12, pady=4)

        tk.Label(fx_frame, text="🎙️ VOICE DSP FILTER:", font=("Consolas", 8, "bold"), fg=TEXT_MUTED, bg=CARD_BG).pack(anchor="w", pady=(0, 3))
        fx_btn_row = tk.Frame(fx_frame, bg=CARD_BG)
        fx_btn_row.pack(fill=tk.X)

        self.fx_buttons = {}
        for code, label in [('none', 'Clear'), ('vhf', 'VHF Radio'), ('space', 'Space'), ('cyborg', 'Cyborg'), ('stealth', 'Stealth')]:
            b = tk.Button(
                fx_btn_row,
                text=label,
                font=("Segoe UI", 8, "bold"),
                bg="#09101c",
                fg=TEXT_MUTED,
                activebackground=CYAN,
                bd=1,
                relief="solid",
                highlightthickness=0,
                command=lambda c=code: self._select_fx(c),
            )
            b.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=1)
            self.fx_buttons[code] = b
        self._highlight_fx_button('vhf')

        # Status LEDs
        led_row = tk.Frame(parent, bg=PANEL_BG)
        led_row.pack(pady=4)
        self.tx_led = tk.Label(led_row, text="● TX ON AIR", font=("Consolas", 9, "bold"), fg="#3a1018", bg=PANEL_BG)
        self.tx_led.pack(side=tk.LEFT, padx=14)
        self.rx_led = tk.Label(led_row, text="● RX STANDBY", font=("Consolas", 9, "bold"), fg="#103a24", bg=PANEL_BG)
        self.rx_led.pack(side=tk.LEFT, padx=14)

        # Big Tactical PTT Transmit Button
        ptt_container = tk.Frame(parent, bg=PANEL_BG)
        ptt_container.pack(fill=tk.BOTH, expand=True, pady=(2, 10))

        self.ptt_btn = tk.Button(
            ptt_container,
            text="🎙️\nTRANSMIT",
            font=("Segoe UI", 15, "bold"),
            bg="#152238",
            fg=CYAN,
            activebackground=ALERT_RED,
            activeforeground="#fff",
            bd=4,
            relief="ridge",
            width=15,
            height=3,
            cursor="hand2",
        )
        self.ptt_btn.pack(pady=2)

        self.ptt_hint = tk.Label(
            ptt_container,
            text="HOLD TO TALK (OR PRESS SPACEBAR)",
            font=("Consolas", 8, "bold"),
            fg=TEXT_MUTED,
            bg=PANEL_BG,
        )
        self.ptt_hint.pack()

    def _build_tactical_column(self, parent):
        notebook = ttk.Notebook(parent)
        notebook.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)

        # Tab 1: Live Comms & Chat
        tab_log = tk.Frame(notebook, bg=PANEL_BG)
        notebook.add(tab_log, text=" 💬 LIVE COMMS & CHAT ")
        self._build_log_tab(tab_log)

        # Tab 2: Tactical Soundboard
        tab_sbd = tk.Frame(notebook, bg=PANEL_BG)
        notebook.add(tab_sbd, text=" ⚡ SOUNDBOARD ")
        self._build_soundboard_tab(tab_sbd)

        # Tab 3: Morse Code Telegraph
        tab_morse = tk.Frame(notebook, bg=PANEL_BG)
        notebook.add(tab_morse, text=" 📡 MORSE TELEGRAPH ")
        self._build_morse_tab(tab_morse)

        # Tab 4: Online Operators / Peers
        tab_peers = tk.Frame(notebook, bg=PANEL_BG)
        notebook.add(tab_peers, text=" 👥 OPERATORS ")
        self._build_peers_tab(tab_peers)

    def _build_soundboard_tab(self, parent):
        tk.Label(parent, text="TACTICAL PROCEDURAL AUDIO CUES", font=("Consolas", 10, "bold"), fg=CYAN, bg=PANEL_BG).pack(anchor="w", padx=14, pady=(12, 6))

        grid = tk.Frame(parent, bg=PANEL_BG)
        grid.pack(fill=tk.BOTH, expand=True, padx=14, pady=6)
        grid.columnconfigure(0, weight=1)
        grid.columnconfigure(1, weight=1)

        cues = [
            ("🚨 RED ALERT", "Emergency Alarm Siren", ALERT_RED, sfx.play_red_alert, "red-alert"),
            ("📡 10-4 COPY", "Dispatch Acknowledge", CYAN, sfx.play_ten_four, "10-4"),
            ("🔊 ROGER BEEP", "Authentic Quindar Beep", NEON_GREEN, sfx.play_roger_beep, "roger"),
            ("⚡ SONAR PING", "Acoustic Echo Pulse", BT_BLUE, sfx.play_sonar_ping, "sonar"),
            ("💥 SQUELCH BURST", "Radio Static Burst", AMBER, sfx.play_static_burst, "squelch"),
            ("📣 AIR HORN", "Command Klaxon Warning", "#c084fc", sfx.play_air_horn, "airhorn"),
        ]

        for idx, (title, desc, color, handler, s_id) in enumerate(cues):
            r = idx // 2
            c = idx % 2
            btn_box = tk.Frame(grid, bg=CARD_BG, highlightbackground=color, highlightthickness=1, padx=10, pady=12)
            btn_box.grid(row=r, column=c, padx=6, pady=6, sticky="nsew")

            b = tk.Button(
                btn_box,
                text=title,
                font=("Segoe UI", 12, "bold"),
                fg=color,
                bg=CARD_BG,
                activebackground=color,
                activeforeground="#000",
                bd=0,
                cursor="hand2",
                command=lambda h=handler, sid=s_id, t=title: self._trigger_sound_cue(h, sid, t),
            )
            b.pack(fill=tk.X)
            tk.Label(btn_box, text=desc, font=("Consolas", 8), fg=TEXT_MUTED, bg=CARD_BG).pack()

        tip = tk.Label(
            parent,
            text="💡 Cues play locally and broadcast live to all contacts in your Room / Bluetooth link!",
            font=("Segoe UI", 9, "italic"),
            fg=TEXT_MUTED,
            bg=PANEL_BG,
        )
        tip.pack(pady=10)

    def _build_morse_tab(self, parent):
        tk.Label(parent, text="CW MORSE TELEGRAPH & DECODER", font=("Consolas", 10, "bold"), fg=CYAN, bg=PANEL_BG).pack(anchor="w", padx=14, pady=(12, 4))

        station = tk.Frame(parent, bg=CARD_BG, highlightbackground=BORDER, highlightthickness=1, padx=12, pady=10)
        station.pack(fill=tk.X, padx=14, pady=6)

        s_bar = tk.Frame(station, bg=CARD_BG)
        s_bar.pack(fill=tk.X, pady=(0, 6))
        self.morse_led = tk.Label(s_bar, text="●", font=("Segoe UI", 16, "bold"), fg="#1c3022", bg=CARD_BG)
        self.morse_led.pack(side=tk.LEFT)
        tk.Label(s_bar, text=" CW SIGNAL MONITOR", font=("Consolas", 9, "bold"), fg=TEXT_MUTED, bg=CARD_BG).pack(side=tk.LEFT)
        self.morse_symbol_lbl = tk.Label(s_bar, text="", font=("Consolas", 11, "bold"), fg=CYAN, bg=CARD_BG)
        self.morse_symbol_lbl.pack(side=tk.RIGHT)

        tk.Label(station, text="REAL-TIME DECODED TEXT:", font=("Consolas", 8, "bold"), fg=TEXT_MUTED, bg=CARD_BG).pack(anchor="w")
        self.morse_decode_box = tk.Label(
            station,
            text="DECODING IDLE... PRESS BRASS KEY BELOW",
            font=("Consolas", 13, "bold"),
            fg=NEON_GREEN,
            bg=SCREEN_BG,
            height=2,
            anchor="w",
            padx=8,
            relief="sunken",
        )
        self.morse_decode_box.pack(fill=tk.X, pady=4)

        key_area = tk.Frame(station, bg=CARD_BG)
        key_area.pack(pady=8)
        self.brass_key = tk.Button(
            key_area,
            text="⚡ BRASS TELEGRAPH KEY ⚡\n(TAP FOR DOT • | HOLD FOR DASH ▬)",
            font=("Segoe UI", 10, "bold"),
            bg="#8b5a2b",
            fg="#ffd166",
            activebackground="#ffd166",
            activeforeground="#2b1704",
            bd=4,
            relief="raised",
            padx=20,
            pady=10,
            cursor="hand2",
        )
        self.brass_key.pack()

        act_row = tk.Frame(station, bg=CARD_BG)
        act_row.pack(fill=tk.X, pady=(6, 0))

        tk.Button(act_row, text="Clear", font=("Segoe UI", 9, "bold"), bg=PANEL_BG, fg=TEXT_MAIN, bd=1, command=self._clear_morse).pack(side=tk.LEFT, padx=2)
        self.sos_btn = tk.Button(act_row, text="🆘 Emergency SOS", font=("Segoe UI", 9, "bold"), bg="#3a0d18", fg=ALERT_RED, bd=1, command=self._toggle_sos)
        self.sos_btn.pack(side=tk.LEFT, padx=6)
        tk.Button(act_row, text="📡 Send Morse to Room", font=("Segoe UI", 9, "bold"), bg="#092230", fg=CYAN, bd=1, command=self._broadcast_morse).pack(side=tk.RIGHT, padx=2)

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
        tk.Label(parent, text="LIVE ROOM CHAT & CONNECTION FEED", font=("Consolas", 10, "bold"), fg=CYAN, bg=PANEL_BG).pack(anchor="w", padx=14, pady=(12, 4))

        self.log_text = tk.Text(parent, bg=SCREEN_BG, fg=TEXT_MAIN, font=("Consolas", 10), insertbackground=CYAN, bd=1, relief="sunken", state="disabled")
        self.log_text.pack(fill=tk.BOTH, expand=True, padx=14, pady=6)

        inp_row = tk.Frame(parent, bg=PANEL_BG)
        inp_row.pack(fill=tk.X, padx=14, pady=(0, 10))

        self.chat_input = tk.Entry(inp_row, font=("Segoe UI", 11), bg=CARD_BG, fg=TEXT_MAIN, insertbackground=CYAN)
        self.chat_input.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 6))
        self.chat_input.bind("<Return>", lambda e: self._send_text_message())

        tk.Button(inp_row, text="Send", font=("Segoe UI", 9, "bold"), bg=CYAN, fg="#000", bd=0, padx=16, pady=4, command=self._send_text_message).pack(side=tk.RIGHT)

        self._log_system(f"BlueTalk Station Online in Room [{self.current_room}] via Internet Relay.")
        self._log_system("Switch anytime between Internet (Server/Tunnel), Bluetooth Direct, or Wi-Fi LAN.")

    def _build_peers_tab(self, parent):
        tk.Label(parent, text="ONLINE CONTACTS IN CURRENT ROOM / LINK", font=("Consolas", 10, "bold"), fg=CYAN, bg=PANEL_BG).pack(anchor="w", padx=14, pady=(12, 6))

        self.peers_listbox = tk.Listbox(parent, bg=SCREEN_BG, fg=NEON_GREEN, font=("Consolas", 11, "bold"), bd=1, relief="sunken")
        self.peers_listbox.pack(fill=tk.BOTH, expand=True, padx=14, pady=6)
        self._refresh_peers_list([])

        guide = (
            "HOW TO CONTACT OTHERS (NO FREQUENCY NEEDED):\n"
            "• Internet Mode: Run server.py (plus ngrok/cloudflared tunnel for outside Wi-Fi),\n"
            "  share the Room Code or Invite Link, and talk with Mobile/Web/Desktop users live!\n"
            "• Bluetooth Mode: Pair both devices in OS Bluetooth settings, click Scan, and Connect BT."
        )
        tk.Label(parent, text=guide, font=("Segoe UI", 9), fg=TEXT_MUTED, bg=PANEL_BG, justify="left").pack(anchor="w", padx=14, pady=(4, 12))

    # ------------------------------------------------------------------
    # Transport, Room & Bluetooth Handlers
    # ------------------------------------------------------------------
    def _switch_mode(self, mode):
        self.current_mode = mode
        self.net.set_mode(mode)
        self._update_mode_panel()
        if mode == 'internet':
            self._log_system(f"Switched to Internet / Tunnel Relay ({self.net.server_url}) in Room [{self.current_room}].")
        elif mode == 'bluetooth':
            self._log_system("Switched to Bluetooth Direct RFCOMM mode.")
            if not self.bt_devices:
                self._scan_bluetooth_devices()
        else:
            self._log_system(f"Switched to Zero-Server Wi-Fi LAN mode in Room [{self.current_room}].")
        sfx.play_mic_click_in()

    def _update_mode_panel(self):
        for m_id, btn in self.mode_buttons.items():
            if m_id == self.current_mode:
                color = BT_BLUE if m_id == 'bluetooth' else (NEON_GREEN if m_id == 'lan' else CYAN)
                btn.configure(bg=color, fg="#000")
            else:
                btn.configure(bg="#09101c", fg=TEXT_MUTED)

        for panel in (self.internet_panel, self.bluetooth_panel, self.lan_panel):
            panel.pack_forget()

        if self.current_mode == 'internet':
            self.internet_panel.pack(fill=tk.X)
            self.mode_meta_lbl.configure(text="🌐 INTERNET / RELAY MODE", fg=CYAN)
            self.contact_display_lbl.configure(text=f"ROOM: {self.current_room}")
        elif self.current_mode == 'bluetooth':
            self.bluetooth_panel.pack(fill=tk.X)
            self.mode_meta_lbl.configure(text="📶 BLUETOOTH DIRECT (RFCOMM)", fg=BT_BLUE)
            bt_peer = self.net.bt_connected_peer
            self.contact_display_lbl.configure(
                text=f"BT: {bt_peer['name']}" if bt_peer else f"ROOM: {self.current_room} (BT)"
            )
        else:
            self.lan_panel.pack(fill=tk.X)
            self.mode_meta_lbl.configure(text="📡 WI-FI LAN BROADCAST", fg=NEON_GREEN)
            self.contact_display_lbl.configure(text=f"ROOM: {self.current_room}")

    def _join_room(self):
        raw = self.room_var.get()
        clean = normalize_room(raw)
        self.current_room = clean
        self.room_var.set(clean)
        self.net.set_room(clean)
        self._update_mode_panel()
        self._log_system(f"Joined Room Code [{clean}].")
        sfx.play_mic_click_in()

    def _generate_room_code(self):
        code = f"BT-{random.randint(1000, 9999)}"
        self.room_var.set(code)
        self._join_room()

    def _apply_server_url(self):
        url = self.server_url_entry.get().strip()
        if not url:
            return
        self.net.set_server_url(url)
        self.server_url = self.net.server_url
        self.server_url_entry.delete(0, tk.END)
        self.server_url_entry.insert(0, self.server_url)
        self._log_system(f"Connecting Internet Relay to: {self.server_url}")

    def _copy_invite_link(self):
        base = (self.net.server_tunnel_url or self.net.server_url).rstrip('/')
        invite_url = f"{base}/?room={self.current_room}"
        self.root.clipboard_clear()
        self.root.clipboard_append(invite_url)
        self._log_system(f"Copied Invite Link: {invite_url}")
        messagebox.showinfo("Invite Link Copied", f"Share this link to join Room {self.current_room}:\n\n{invite_url}")

    def _launch_local_server(self):
        if self.server_proc and self.server_proc.poll() is None:
            messagebox.showinfo("Relay Server", "Local server.py is already running!")
            return
        server_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "server.py")
        try:
            self.server_proc = subprocess.Popen([sys.executable, server_script])
            self._log_system("Started local Relay Server (server.py) on port 8080.")
            self.root.after(800, self._apply_server_url)
        except Exception as e:
            messagebox.showerror("Server Launch Error", str(e))

    def _scan_bluetooth_devices(self):
        self.bt_device_var.set("Scanning paired devices...")

        def _worker():
            devs = self.net.scan_paired_bluetooth_devices()
            self.root.after(0, self._on_bt_scan_done, devs)

        threading.Thread(target=_worker, daemon=True).start()

    def _on_bt_scan_done(self, devs):
        self.bt_devices = devs
        if devs:
            labels = [f"{d['name']} ({d['mac']})" for d in devs]
            self.bt_combo['values'] = labels
            self.bt_combo.current(0)
            self._log_system(f"Found {len(devs)} paired Bluetooth device(s).")
        else:
            self.bt_combo['values'] = []
            self.bt_device_var.set("No paired devices found (enter MAC)")
            self._log_system("No paired Bluetooth devices detected. Pair in Windows Settings or enter MAC.")

    def _connect_bluetooth(self):
        selection = self.bt_device_var.get().strip()
        if not selection or selection.startswith("Click Scan") or selection.startswith("Scanning"):
            messagebox.showinfo("Bluetooth", "Select a paired Bluetooth device or type a MAC address (AA:BB:CC:DD:EE:FF).")
            return

        mac = selection
        name = selection
        if '(' in selection and selection.endswith(')'):
            name = selection.rsplit('(', 1)[0].strip()
            mac = selection.rsplit('(', 1)[1][:-1].strip()

        try:
            port = int(self.bt_port_entry.get().strip() or "4")
        except ValueError:
            port = 4

        self._log_system(f"Connecting via Bluetooth RFCOMM to {name} ({mac}) CH {port}...")

        def _worker():
            try:
                peer = self.net.connect_bluetooth(mac, name=name, port=port)
                self.root.after(0, lambda: self._on_bt_connected(peer))
            except Exception as exc:
                self.root.after(0, lambda err=str(exc): self._on_bt_error(err))

        threading.Thread(target=_worker, daemon=True).start()

    def _on_bt_connected(self, peer):
        self._update_mode_panel()
        self._log_system(f"Bluetooth RFCOMM linked with {peer['name']} ({peer['mac']})!")
        sfx.play_ten_four()

    def _on_bt_error(self, err):
        self._log_system(f"Bluetooth connect note: {err}")
        messagebox.showwarning("Bluetooth Connection", f"{err}\n\nTip: Ensure the target device is running BlueTalk in Bluetooth mode and is paired.")

    def _disconnect_bluetooth(self):
        self.net.disconnect_bluetooth()
        self._update_mode_panel()
        self._log_system("Bluetooth RFCOMM disconnected.")

    # ------------------------------------------------------------------
    # Events & Bindings
    # ------------------------------------------------------------------
    def _bind_events(self):
        self.root.bind("<KeyPress-space>", self._on_space_press)
        self.root.bind("<KeyRelease-space>", self._on_space_release)

        self.ptt_btn.bind("<ButtonPress-1>", lambda e: self._start_ptt())
        self.ptt_btn.bind("<ButtonRelease-1>", lambda e: self._stop_ptt())

        self.brass_key.bind("<ButtonPress-1>", lambda e: self._on_morse_key_down())
        self.brass_key.bind("<ButtonRelease-1>", lambda e: self._on_morse_key_up())

        self.morse.on_symbol_callback = lambda sym, seq: self.root.after(0, self._update_morse_symbols, sym, seq)
        self.morse.on_char_decoded = lambda char, full, seq: self.root.after(0, self._update_morse_decoded, full, seq)
        self.morse.on_signal_state = lambda active: self.root.after(0, self._update_morse_led, active)

    def _on_space_press(self, event):
        focused = self.root.focus_get()
        if isinstance(focused, (tk.Entry, ttk.Combobox, tk.Text)):
            return
        if not self.spacebar_down:
            self.spacebar_down = True
            self._start_ptt()

    def _on_space_release(self, event):
        if self.spacebar_down:
            self.spacebar_down = False
            self._stop_ptt()

    def _start_ptt(self):
        if self.is_transmitting:
            return
        self.is_transmitting = True
        sfx.play_mic_click_in()
        self.ptt_btn.configure(bg=ALERT_RED, fg="#fff", text="🔴\nON AIR")
        self.tx_led.configure(fg=ALERT_RED)
        self.conn_status_lbl.configure(text="TRANSMITTING", fg=ALERT_RED)
        self.net.send_ptt(True)

    def _stop_ptt(self):
        if not self.is_transmitting:
            return
        self.is_transmitting = False
        sfx.play_roger_beep()
        self.ptt_btn.configure(bg="#152238", fg=CYAN, text="🎙️\nTRANSMIT")
        self.tx_led.configure(fg="#3a1018")
        self.conn_status_lbl.configure(text="STATION READY", fg=NEON_GREEN)
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
        self.sos_btn.configure(
            text="🚨 STOP SOS" if self.sos_active else "🆘 Emergency SOS",
            bg=ALERT_RED if self.sos_active else "#3a0d18",
            fg="#fff" if self.sos_active else ALERT_RED,
        )
        if self.sos_active:
            self._log_system("EMERGENCY SOS BEACON ACTIVATED (... --- ...)")
            self.net.send_sound("red-alert", "Red Alert Siren")

    def _broadcast_morse(self):
        text = self.morse.decoded_text.strip() or self.morse_input.get().strip()
        if not text:
            messagebox.showinfo("Morse", "No Morse message to broadcast.")
            return
        code = self.morse.text_to_morse(text)
        self.net.send_morse(code, text)
        self._log_chat(self.callsign, f"[MORSE]: \"{text}\" ({code})")

    def _play_text_morse(self):
        text = self.morse_input.get().strip()
        if not text:
            return
        code = text if set(text).issubset({'.', '-', ' ', '/'}) else self.morse.text_to_morse(text)
        sfx.play_morse_sequence(code, wpm=18, on_char_cb=lambda act, sym: self.root.after(0, self._update_morse_led, act))

    # Soundboard & Chat
    def _trigger_sound_cue(self, handler, s_id, title):
        handler()
        self.net.send_sound(s_id, title)
        self._log_system(f"Tactical Cue Sent: [{title}]")

    def _send_text_message(self):
        text = self.chat_input.get().strip()
        if not text:
            return
        self.net.send_text(text)
        self._log_chat(self.callsign, text)
        self.chat_input.delete(0, tk.END)

    def _log_chat(self, sender, text, transport=''):
        t_str = time.strftime("%H:%M:%S")
        tag = f" [{transport.upper()}]" if transport else ""
        self.log_text.configure(state="normal")
        self.log_text.insert(tk.END, f"[{t_str}]{tag} <{sender}> {text}\n")
        self.log_text.see(tk.END)
        self.log_text.configure(state="disabled")

    def _log_system(self, text):
        t_str = time.strftime("%H:%M:%S")
        self.log_text.configure(state="normal")
        self.log_text.insert(tk.END, f"[{t_str}] [BLUETALK] {text}\n")
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

    def _on_callsign_change(self, event=None):
        val = self.cs_entry.get().strip().upper()
        if val:
            self.callsign = val[:16]
            self.net.set_callsign(self.callsign)
            self.callsign_badge.configure(text=f"OPERATOR: {self.callsign}")

    # ------------------------------------------------------------------
    # Networking Wiring
    # ------------------------------------------------------------------
    def _wire_network(self):
        self.net.on_message_received = lambda cs, txt, tr='': self.root.after(0, self._log_chat, cs, txt, tr)
        self.net.on_morse_received = lambda m, txt, cs: self.root.after(0, self._on_remote_morse, m, txt, cs)
        self.net.on_sound_received = lambda sid, cs: self.root.after(0, self._on_remote_sound, sid, cs)
        self.net.on_ptt_state = lambda cs, talking: self.root.after(0, self._on_remote_ptt, cs, talking)
        self.net.on_peer_update = lambda peers: self.root.after(0, self._refresh_peers_list, peers)
        self.net.on_status_change = lambda mode, ok, label: self.root.after(0, self._on_network_status, mode, ok, label)

    def _on_network_status(self, mode, connected, label):
        if connected:
            fg = BT_BLUE if mode == 'bluetooth' else NEON_GREEN
            bg = "#081c2b" if mode == 'bluetooth' else "#071810"
        else:
            fg = AMBER
            bg = "#1a1406"
        self.net_badge.configure(text=f"● {label}", fg=fg, bg=bg)

    def _refresh_peers_list(self, peers):
        total = len(peers) + 1
        self.peer_badge.configure(text=f"👥 {total} ONLINE")
        self.peers_listbox.delete(0, tk.END)
        self.peers_listbox.insert(tk.END, f"● {self.callsign} (YOU) — {self.current_mode.upper()} [{self.current_room}]")
        for p in peers:
            status = "TALKING" if p.get('is_talking') else p.get('transport', 'online').upper()
            self.peers_listbox.insert(tk.END, f"● {p.get('callsign', 'UNKNOWN')} — {status}")

    def _on_remote_morse(self, morse_str, text_str, sender):
        self._log_chat(sender, f"[MORSE]: \"{text_str}\" ({morse_str})")
        sfx.play_morse_sequence(morse_str, 18, on_char_cb=lambda act, sym: self.root.after(0, self._update_morse_led, act))

    def _on_remote_sound(self, sid, sender):
        self._log_system(f"Audio Cue from [{sender}]: {str(sid).upper()}")
        if sid == "red-alert":
            sfx.play_red_alert()
        elif sid == "10-4":
            sfx.play_ten_four()
        elif sid == "roger":
            sfx.play_roger_beep()
        elif sid == "sonar":
            sfx.play_sonar_ping()
        elif sid == "squelch":
            sfx.play_static_burst()
        elif sid == "airhorn":
            sfx.play_air_horn()

    def _on_remote_ptt(self, sender, is_talking):
        if is_talking:
            self.rx_led.configure(fg=NEON_GREEN)
            self.conn_status_lbl.configure(text=f"RX: {sender}", fg=NEON_GREEN)
        else:
            self.rx_led.configure(fg="#103a24")
            self.conn_status_lbl.configure(text="STATION READY", fg=NEON_GREEN)

    # ------------------------------------------------------------------
    # Canvas Visualizer Loop
    # ------------------------------------------------------------------
    def _start_visualizer_loop(self):
        def _loop():
            self._render_visualizer()
            self.root.after(35, _loop)

        self.root.after(50, _loop)

    def _render_visualizer(self):
        w = self.viz_canvas.winfo_width()
        h = self.viz_canvas.winfo_height()
        if w < 10 or h < 10:
            return

        self.viz_canvas.delete("all")

        if self.visualizer_mode == "crt":
            for x in range(0, w, 24):
                self.viz_canvas.create_line(x, 0, x, h, fill="#0c1d18")
            for y in range(0, h, 18):
                self.viz_canvas.create_line(0, y, w, y, fill="#0c1d18")

            color = ALERT_RED if self.is_transmitting else NEON_GREEN
            t = time.time() * 12.0
            points = []
            amp = 28.0 if self.is_transmitting else 5.0

            for x in range(0, w, 3):
                y = (h / 2) + math.sin(x * 0.05 + t) * amp + math.sin(x * 0.02 - t * 0.5) * (amp * 0.5)
                points.extend([x, y])

            if len(points) >= 4:
                self.viz_canvas.create_line(points, fill=color, width=2, smooth=True)

        elif self.visualizer_mode == "neon":
            bars = 22
            bw = (w - (bars * 4)) / bars
            for i in range(bars):
                target = random.uniform(20, h - 10) if self.is_transmitting else random.uniform(5, 18)
                self.peak_bars[i] = max(target, self.peak_bars[i] - 1.8)
                bx = i * (bw + 4) + 4
                by = h - target
                color = ALERT_RED if self.is_transmitting else CYAN
                self.viz_canvas.create_rectangle(bx, by, bx + bw, h, fill=color, outline="")
                self.viz_canvas.create_rectangle(bx, h - self.peak_bars[i] - 2, bx + bw, h - self.peak_bars[i], fill="#fff", outline="")

        elif self.visualizer_mode == "sonar":
            cx, cy = w / 2, h / 2
            r = min(cx, cy) - 6
            for ratio in [0.35, 0.7, 0.98]:
                self.viz_canvas.create_oval(cx - r * ratio, cy - r * ratio, cx + r * ratio, cy + r * ratio, outline="#0a2a30")

            self.radar_angle = (self.radar_angle + 0.08) % (math.pi * 2)
            ex = cx + math.cos(self.radar_angle) * r
            ey = cy + math.sin(self.radar_angle) * r
            self.viz_canvas.create_line(cx, cy, ex, ey, fill=CYAN if not self.is_transmitting else ALERT_RED, width=2)


def main():
    root = tk.Tk()
    app = BlueTalkApp(root)

    def _on_close():
        app.net.close()
        if app.server_proc and app.server_proc.poll() is None:
            try:
                app.server_proc.terminate()
            except Exception:
                pass
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", _on_close)
    root.mainloop()


if __name__ == "__main__":
    main()
