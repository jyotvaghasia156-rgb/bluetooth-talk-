# BlueTalk Pro 📻
> **Tactical Walkie-Talkie, Morse Telegraph & Live Communicator**  
> *Built with 100% Python Desktop Architecture & Java Core*

BlueTalk Pro is a high-performance military and tactical communication application designed for real-time Push-to-Talk (PTT), procedural audio cue broadcasting, Morse telegraphy, and cross-station network synchronization.

---

## 🌟 Key Features

- **🎙️ Spacebar & Mouse Push-To-Talk (PTT)**:
  - Hold the big glowing **TRANSMIT** button or press and hold the **Spacebar** to key the transmitter.
  - Authentic NASA Quindar Roger beeps, analog squelch tail, and mic click-in procedural audio.
- **📊 Multi-Mode Spectrum Visualizer**:
  - **CRT Phosphor Oscilloscope**: Retro green electron beam with persistence glow and graticule grid lines.
  - **Cyberpunk Neon Equalizer**: 24-band frequency spectrum with peak-hold white caps.
  - **Orbital Sonar Radar**: 360-degree rotating radar sweep with range rings and radial frequency pulses.
- **📡 Interactive Morse Code Keyer & Real-Time Decoder**:
  - Brass Telegraph Key button (tap for Dot `•`, hold for Dash `▬`).
  - Automatic real-time letter/word decoder.
  - Text-to-Morse audio synthesizer with live signal flasher.
  - Emergency SOS Beacon mode with continuous `... --- ...` distress broadcasting.
- **⚡ Tactical Soundboard**:
  - 1-tap realistic audio cues: 🚨 Red Alert Siren, 📡 10-4 Acknowledged, 🔊 Roger Beep, ⚡ Submarine Sonar Ping, 💥 Squelch Tail Burst, 📣 Tactical Air Horn.
  - Cues trigger locally and broadcast across the channel to all peers!
- **🎛️ Voice Modulator DSP Presets**:
  - Select between **Clear Hi-Fi**, **VHF Radio**, **NASA Space Comm**, **Cyborg Ring Modulator**, and **Deep Stealth**.
- **🌐 Zero-Dependency Local Network Sync**:
  - UDP discovery and peer relay node allows multiple laptops, PCs, and devices on the LAN to communicate in real time!

---

## 🚀 How to Launch the Application

### 1. Launch Python Desktop GUI App (Recommended)
Double-click [`start-app.bat`](./start-app.bat) or run in your terminal:
```bash
python main.py
```
*(Runs on standard Python 3 with zero pip installs needed!)*

### 2. Launch Local Web & Relay Server
Double-click [`start-server.bat`](./start-server.bat) or run:
```bash
python server.py
```
- PC / Laptop: `http://localhost:8080`
- Mobile Phone / Tablet: `http://<your-local-ip>:8080` (or scan the on-screen QR Code!)

---

## 🛠️ Project Architecture

```
bluetalk/
├── main.py                   # Python application entrypoint
├── bluetalk.py               # Standalone Python Tkinter Desktop GUI
├── audio_sfx.py              # Procedural sound & Morse audio generator
├── morse_engine.py           # CW Morse code keyer, encoder & decoder
├── network_node.py           # LAN peer discovery & packet relay node
├── server.py                 # High-performance Python web & SSE relay server
├── start-app.bat             # 1-Click Python desktop application launcher
├── start-server.bat          # 1-Click web server launcher
├── push-to-github.bat        # 1-Click GitHub sync utility
├── src/com/bluetalk/         # Core Java Swing & Morse Telegraph classes
│   ├── BlueTalkApp.java      # Java Tactical Walkie-Talkie Swing application
│   └── MorseTelegraph.java   # Java Morse code telegraph engine
├── index.html                # Web communicator interface
├── css/style.css             # Cyberpunk & tactical stylesheet
└── js/                       # Client-side coordination scripts
```

---

## 📄 License
MIT License. Created by [jyotvaghasia156-rgb](https://github.com/jyotvaghasia156-rgb).
