# BlueTalk Pro 📻
> **Bluetooth Voice Walkie-Talkie & Live Communicator**

BlueTalk is a modern, responsive communication app designed for talking with other people over Bluetooth connections, direct wireless channels, and local networks.

---

## 🌟 Key Features

- **🎙️ Real-Time Push-To-Talk (PTT)**:
  - Hold the big glowing **TRANSMIT** button or press and hold the **Spacebar** to broadcast your voice live.
  - Realistic radio sound effects including mic key-up clicks, static squelch, and authentic NASA/Motorola **Roger beeps**.
- **📶 Bluetooth Device Scanning & Pairing**:
  - Connect directly to nearby Bluetooth devices and peripherals using the Web Bluetooth GATT protocol.
- **💬 Live Text & Voice Note Messaging**:
  - Instant text messaging with delivery timestamps.
  - Record and send high-quality **Voice Notes / Audio Memos** with interactive audio waveform players.
- **📢 Quick Tactical Callout Buttons**:
  - One-click standard radio phrases: *Roger That*, *10-4 Copy*, *Affirmative*, *Negative*, *Stand By*, *Over & Out*, *MAYDAY / SOS*.
- **📊 Real-Time Audio Spectrum Visualizer**:
  - Dynamic canvas oscilloscope displaying live voice frequencies and waveform levels.
- **📻 16 Channel Selector**:
  - Switch between 16 standard communication frequencies (462.5625 MHz – 462.7250 MHz) to talk to different users or teams.

---

## 🚀 How to Launch and Use

### 1. Launching the App
Simply open the [`index.html`](./index.html) file directly in your favorite modern browser:
- **Microsoft Edge** (Windows)
- **Google Chrome** (Windows, Android, Mac, Linux)
- **Opera / Brave**

### 2. Allowing Microphone Access
- When prompted by your browser, click **Allow** for microphone permissions so you can transmit voice.

### 3. Talking Live (Walkie-Talkie)
- **Spacebar**: Press and hold the `Spacebar` key while speaking, then release to send a Roger Beep.
- **TRANSMIT Button**: Click and hold the large circular microphone button with your mouse or finger (on touchscreens).

### 4. Bluetooth Pairing
- Click the **📶 Scan Bluetooth** button in the top navigation bar.
- Select your nearby Bluetooth device from the system pairing window to connect.

### 5. Multi-User / 2-Party Testing
- Open **two browser windows or tabs side-by-side** (or open on two different devices).
- Both instances will automatically link on **Channel 1**.
- Press **TRANSMIT** or send text messages in one window and hear/see it immediately received in real-time in the other window!

---

## 🛠️ Project Structure

```
bluetalk/
├── index.html         # Main application interface
├── css/
│   └── style.css      # Cyberpunk & tactical walkie-talkie stylesheet
├── js/
│   ├── app.js         # Core application coordinator & settings
│   ├── audio.js       # Web Audio API engine, PTT chunk streamer & visualizer
│   ├── bluetooth.js   # Web Bluetooth GATT connection manager
│   ├── peer.js        # Peer routing, message serialization & channel management
│   └── ui.js          # Oscilloscope visualizer canvas & chat feed controller
├── sounds/
│   └── sfx.js         # Procedural Web Audio sound generator (Roger beeps & clicks)
└── README.md          # User manual and documentation
```
