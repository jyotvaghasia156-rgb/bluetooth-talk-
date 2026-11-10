# BlueTalk Pro 📻

> **Internet Relay & Bluetooth Direct Walkie-Talkie, Morse Telegraph & Live Communicator**  
> *Built with 100% Standard Library Python, Modern Web UI & Java Core*

BlueTalk Pro lets you talk, chat, broadcast Morse code, and trigger tactical audio cues across **PC, Laptop, and Mobile Phone** by **Room Code & Invite Link** over the **Internet** or **Bluetooth** — no radio frequency tuning needed!

---

## 🌐 Contact Modes (No MHz Frequency Needed)

- **🌐 Internet / Tunnel Relay Mode**:
  - Connect across Wi-Fi or anywhere over the Internet by sharing a **Room Code** (e.g. `HQ-MAIN`, `BT-4921`) or **Invite Link / QR Code** (`?room=HQ-MAIN`).
  - Run `python server.py` locally, and optionally expose it worldwide with `ngrok http 8080` or `cloudflared tunnel --url http://localhost:8080`.
  - Both the **Web / Mobile Browser** (`index.html`) and **Python Desktop App** (`bluetalk.py`) connect to the same Room Code and communicate live!
- **📶 Bluetooth Direct Mode**:
  - **Python Desktop App**: Native Windows/Linux **Bluetooth RFCOMM** server & client (`socket.AF_BLUETOOTH`) with paired device scanning and direct MAC connection.
  - **Web / Browser**: **Web Bluetooth (BLE GATT UART)** pairing and **Web Serial (Bluetooth SPP COM port)** support.
- **📡 Zero-Server Wi-Fi LAN Mode (Desktop)**:
  - Instant UDP broadcast between desktop stations on the same Wi-Fi, matched by Room Code.

---

## 🌟 Key Features

- **🎙️ Spacebar & Touch Push-To-Talk (PTT)**:
  - Hold **TRANSMIT** or press and hold **Spacebar** for live voice streaming (Web) & PTT signaling with NASA Quindar Roger beeps.
- **📊 Multi-Mode Spectrum Visualizer**:
  - **CRT Phosphor Oscilloscope**, **Neon Equalizer Bars**, and **Orbital Sonar Radar**.
- **📡 Interactive Morse Code Keyer & Real-Time Decoder**:
  - Brass Telegraph Key (`•` / `▬`), automatic decoder, text-to-Morse synthesizer, and Emergency SOS beacon.
- **⚡ Tactical Soundboard**:
  - 1-tap procedural audio cues (`Red Alert`, `10-4 Copy`, `Roger Beep`, `Sonar Ping`, `Squelch Burst`, `Air Horn`) broadcast live to your Room or Bluetooth link.
- **🎛️ Voice Modulator DSP Presets**:
  - **Clear Hi-Fi**, **VHF Radio**, **NASA Space Comm**, **Cyborg**, and **Deep Stealth**.

---

## 🚀 How to Launch

### 1. Launch Web & Relay Server (Laptop + Mobile Phone + Internet Tunnel)

```bash
python server.py
```

- **Same PC**: `http://localhost:8080`
- **Same Wi-Fi Phone**: `http://<your-local-ip>:8080` (or click **📱 QR** to scan!)
- **Over the Internet (Different Networks / Mobile Data)**:

  ```bash
  ngrok http 8080
  # or
  cloudflared tunnel --url http://localhost:8080
  ```

  `server.py` automatically detects active ngrok tunnels and puts the Internet Invite Link right inside the **📱 QR** modal!

### 2. Launch Python Desktop GUI App

Double-click [`start-app.bat`](./start-app.bat) or run:

```bash
python main.py
```

*(Runs on standard Python 3 with zero pip installs needed!)*

---

## 🛠️ Project Architecture

```text
bluetalk/
├── main.py                   # Python desktop application entrypoint
├── bluetalk.py               # Python Tkinter GUI (Internet / Bluetooth / Wi-Fi LAN)
├── network_node.py           # Unified HTTP/Tunnel relay, Bluetooth RFCOMM & LAN UDP engine
├── server.py                 # Python Web, SSE/Polling Relay & Localhost BT Discovery server
├── audio_sfx.py              # Procedural sound & Morse audio generator
├── morse_engine.py           # CW Morse code keyer, encoder & decoder
├── index.html                # Web & Mobile communicator interface
├── css/style.css             # Responsive Dark & Light tactical stylesheet
├── js/                       # Client-side Room, Internet/Tunnel, Bluetooth & Audio scripts
```
