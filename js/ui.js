/**
 * BlueTalk Pro - UI Coordinator, Multi-Mode Spectrum Visualizer & Tactical Command
 * Coordinates CRT/Neon/Sonar visualizers, Morse telegraph, soundboard, voice modulators, and QR sync.
 */

class UIManager {
    constructor() {
        this.canvas = document.getElementById('visualizer-canvas');
        this.canvasCtx = this.canvas ? this.canvas.getContext('2d') : null;
        this.animationId = null;

        // Visualizer Mode ('crt' | 'neon' | 'sonar')
        this.visualizerMode = localStorage.getItem('bluetalk_viz_mode') || 'crt';
        this.radarAngle = 0;

        // Base Elements
        this.pttBtn = document.getElementById('ptt-button');
        this.pttStatus = document.getElementById('ptt-status-text');
        this.txLed = document.getElementById('tx-led');
        this.rxLed = document.getElementById('rx-led');
        this.chatFeed = document.getElementById('chat-messages');
        this.messageInput = document.getElementById('message-input');
        this.sendBtn = document.getElementById('send-btn');
        this.channelSelect = document.getElementById('channel-select');
        this.frequencyDisplay = document.getElementById('frequency-display');
        this.callsignInput = document.getElementById('callsign-input');
        this.peerCountBadge = document.getElementById('peer-count-badge');
        this.peerListContainer = document.getElementById('peer-list');
        this.statusPill = document.getElementById('connection-status-pill');
        this.deviceNameLabel = document.getElementById('connected-device-name');
        this.chatUnreadDot = document.getElementById('chat-unread-dot');
        this.themeToggleBtn = document.getElementById('theme-toggle-btn');
        this.networkLatencyBadge = document.getElementById('network-latency-badge');

        // Chat Room Elements
        this.roomSelect = document.getElementById('chat-room-select');
        this.currentRoomBadge = document.getElementById('current-room-badge');

        // Theme State ('dark' | 'light')
        this.currentTheme = localStorage.getItem('bluetalk_theme') || 'dark';

        // PTT & Audio State
        this.isSpacebarDown = false;
        this.isPTTActive = false;
        this.isReceivingAudio = false;
        this.activeMobileTab = 'tab-radio';
        this.activeAudioPlayers = new Map();

        // Neon Visualizer Peaks
        this.peakHeights = new Array(32).fill(0);

        this.initTheme();
        this.initCanvasResize();
        this.initVisualizerControls();
        this.startVisualizer();
        this.bindEvents();
        this.initMobileTabs();
        this.initChatRooms();
        this.initTacticalSoundboard();
        this.initMorseControls();
        this.initVoiceModulatorControls();
        this.initQrShareModal();
        this.initNetworkStatusListener();
    }

    initTheme() {
        this.applyTheme(this.currentTheme);
        if (this.themeToggleBtn) {
            this.themeToggleBtn.addEventListener('click', () => {
                const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
                this.setTheme(nextTheme);
            });
        }
    }

    setTheme(theme) {
        this.currentTheme = theme;
        localStorage.setItem('bluetalk_theme', theme);
        this.applyTheme(theme);
        this.showToast(`Switched to ${theme === 'dark' ? 'Dark Tactical' : 'Light High-Visibility'} Mode`, 'info');
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        if (this.themeToggleBtn) {
            this.themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
            this.themeToggleBtn.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
        }
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
            metaTheme.content = theme === 'dark' ? '#0a0d14' : '#eef2f7';
        }
    }

    /* ==============================================================
       MULTI-MODE SPECTRUM VISUALIZER (CRT / NEON / SONAR)
    ============================================================== */

    initVisualizerControls() {
        const modeButtons = document.querySelectorAll('.viz-mode-btn');
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.setVisualizerMode(mode);
            });
        });
        this.updateVizButtons();
    }

    setVisualizerMode(mode) {
        this.visualizerMode = mode || 'crt';
        localStorage.setItem('bluetalk_viz_mode', this.visualizerMode);
        this.updateVizButtons();
        const names = { crt: 'CRT Phosphor Oscilloscope', neon: 'Cyberpunk Neon Equalizer', sonar: 'Orbital Sonar Radar' };
        this.showToast(`Visualizer: ${names[this.visualizerMode] || mode}`, 'info');
    }

    updateVizButtons() {
        document.querySelectorAll('.viz-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === this.visualizerMode);
        });
    }

    initCanvasResize() {
        if (!this.canvas) return;
        const resize = () => {
            const parent = this.canvas.parentElement;
            if (parent) {
                this.canvas.width = parent.clientWidth || 320;
                this.canvas.height = parent.clientHeight || 110;
            }
        };
        window.addEventListener('resize', resize);
        resize();
    }

    startVisualizer() {
        const render = () => {
            this.animationId = requestAnimationFrame(render);
            if (!this.canvasCtx || !this.canvas) return;

            const width = this.canvas.width;
            const height = this.canvas.height;
            const ctx = this.canvasCtx;

            ctx.clearRect(0, 0, width, height);

            const { frequencyData, timeDomainData } = window.audioEngine.getVisualizerData();
            const isLight = this.currentTheme === 'light';

            if (this.visualizerMode === 'crt') {
                this.renderCrtOscilloscope(ctx, width, height, timeDomainData, isLight);
            } else if (this.visualizerMode === 'neon') {
                this.renderNeonEqualizer(ctx, width, height, frequencyData, isLight);
            } else if (this.visualizerMode === 'sonar') {
                this.renderSonarRadar(ctx, width, height, frequencyData, isLight);
            }
        };
        render();
    }

    /**
     * 1. CRT Phosphor Oscilloscope Mode (authentic green CRT electron beam)
     */
    renderCrtOscilloscope(ctx, width, height, timeDomainData, isLight) {
        const gridColor = isLight ? 'rgba(0, 150, 120, 0.12)' : 'rgba(0, 255, 136, 0.08)';
        const beamColor = this.isPTTActive ? (isLight ? '#e63946' : '#ff3366') : (isLight ? '#00aa77' : '#00ff88');
        const glowColor = this.isPTTActive ? 'rgba(255, 51, 102, 0.8)' : 'rgba(0, 255, 136, 0.85)';

        // Tactical Graticule Grid
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        for (let x = 0; x < width; x += 25) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y < height; y += 20) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Center crosshair axis
        ctx.strokeStyle = isLight ? 'rgba(0, 150, 120, 0.25)' : 'rgba(0, 255, 136, 0.2)';
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.moveTo(width / 2, 0);
        ctx.lineTo(width / 2, height);
        ctx.stroke();

        ctx.lineWidth = 2.5;
        ctx.strokeStyle = beamColor;
        ctx.shadowBlur = 12;
        ctx.shadowColor = glowColor;

        ctx.beginPath();
        if ((this.isPTTActive || this.isReceivingAudio) && timeDomainData) {
            const sliceWidth = width / timeDomainData.length;
            let x = 0;
            for (let i = 0; i < timeDomainData.length; i++) {
                const v = timeDomainData[i] / 128.0;
                const y = (v * height) / 2;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                x += sliceWidth;
            }
        } else {
            // Idle CRT scanning sine beam
            const time = Date.now() * 0.003;
            for (let x = 0; x < width; x += 2) {
                const y = (height / 2) + Math.sin(x * 0.04 + time) * 4 + Math.sin(x * 0.015 - time * 0.7) * 2;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    /**
     * 2. Cyberpunk Neon Equalizer Mode (32 vibrant frequency bars with peak hold)
     */
    renderNeonEqualizer(ctx, width, height, frequencyData, isLight) {
        const barCount = 28;
        const totalGap = (barCount - 1) * 3;
        const barWidth = Math.max(3, (width - totalGap) / barCount);

        for (let i = 0; i < barCount; i++) {
            let val = 0;
            if ((this.isPTTActive || this.isReceivingAudio) && frequencyData) {
                val = frequencyData[Math.floor(i * (frequencyData.length / barCount))] / 255;
            } else {
                val = (Math.sin(Date.now() * 0.003 + i * 0.4) * 0.5 + 0.5) * 0.12;
            }

            const barHeight = Math.max(3, val * (height * 0.85));
            const bx = i * (barWidth + 3);
            const by = height - barHeight;

            // Peak hold calculation
            if (barHeight > this.peakHeights[i]) {
                this.peakHeights[i] = barHeight;
            } else {
                this.peakHeights[i] = Math.max(0, this.peakHeights[i] - 0.7);
            }

            // Neon Gradient
            const grad = ctx.createLinearGradient(0, height, 0, by);
            if (this.isPTTActive) {
                grad.addColorStop(0, '#ff0055');
                grad.addColorStop(1, '#ffaa00');
            } else {
                grad.addColorStop(0, '#00f3ff');
                grad.addColorStop(0.7, '#9d00ff');
                grad.addColorStop(1, '#ff00aa');
            }

            ctx.fillStyle = grad;
            ctx.shadowBlur = 8;
            ctx.shadowColor = this.isPTTActive ? 'rgba(255, 0, 85, 0.6)' : 'rgba(0, 243, 255, 0.6)';
            ctx.fillRect(bx, by, barWidth, barHeight);

            // Peak hold cap marker
            const peakY = height - this.peakHeights[i] - 2;
            ctx.fillStyle = this.isPTTActive ? '#ffffff' : '#00ffff';
            ctx.fillRect(bx, Math.max(2, peakY), barWidth, 2);
        }
        ctx.shadowBlur = 0;
    }

    /**
     * 3. Orbital Sonar Radar Mode (Circular sweep with frequency radial spikes)
     */
    renderSonarRadar(ctx, width, height, frequencyData, isLight) {
        const cx = width / 2;
        const cy = height / 2;
        const radius = Math.min(cx, cy) - 6;

        this.radarAngle = (this.radarAngle + 0.04) % (Math.PI * 2);

        // Concentric radar range rings
        ctx.strokeStyle = isLight ? 'rgba(0, 180, 216, 0.18)' : 'rgba(0, 243, 255, 0.14)';
        ctx.lineWidth = 1;
        [0.3, 0.6, 0.95].forEach(rRatio => {
            ctx.beginPath();
            ctx.arc(cx, cy, radius * rRatio, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Axis lines
        ctx.beginPath();
        ctx.moveTo(cx - radius, cy);
        ctx.lineTo(cx + radius, cy);
        ctx.moveTo(cx, cy - radius);
        ctx.lineTo(cx, cy + radius);
        ctx.stroke();

        // Rotating radar beam cone
        const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        sweepGrad.addColorStop(0, 'rgba(0, 243, 255, 0.02)');
        sweepGrad.addColorStop(1, 'rgba(0, 243, 255, 0.25)');

        ctx.fillStyle = sweepGrad;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, this.radarAngle - 0.4, this.radarAngle);
        ctx.closePath();
        ctx.fill();

        // Radar sweep line
        ctx.strokeStyle = this.isPTTActive ? '#ff0055' : '#00f3ff';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.isPTTActive ? 'rgba(255, 0, 85, 0.8)' : 'rgba(0, 243, 255, 0.9)';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(this.radarAngle) * radius, cy + Math.sin(this.radarAngle) * radius);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Radial frequency ring when active
        if ((this.isPTTActive || this.isReceivingAudio) && frequencyData) {
            ctx.strokeStyle = this.isPTTActive ? '#ff3366' : '#00ffcc';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            const segments = 40;
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const freqVal = frequencyData[Math.floor((i / segments) * 64)] / 255;
                const r = radius * 0.75 + freqVal * (radius * 0.3);
                const x = cx + Math.cos(angle) * r;
                const y = cy + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
        }
    }

    /* ==============================================================
       TACTICAL SOUNDBOARD CONTROLS
    ============================================================== */

    initTacticalSoundboard() {
        const soundBtns = document.querySelectorAll('.soundboard-btn');
        soundBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const soundId = btn.dataset.sound;
                const label = btn.dataset.label || soundId;
                this.triggerTacticalSound(soundId, label, true);
            });
        });

        // Listen for incoming soundboard triggers from peers
        if (window.peerNet) {
            window.peerNet.onTacticalSound = (soundId, label, sender) => {
                this.triggerTacticalSound(soundId, label, false, sender);
            };
        }
    }

    triggerTacticalSound(soundId, label, isLocal = true, sender = 'You') {
        window.sfx.init();

        switch (soundId) {
            case 'red-alert':
                window.sfx.playRedAlertSiren();
                break;
            case '10-4':
                window.sfx.playTenFourChime();
                break;
            case 'roger':
                window.sfx.playRogerBeep();
                break;
            case 'sonar':
                window.sfx.playSonarPing();
                break;
            case 'squelch':
                window.sfx.playStaticSquelchBlast();
                break;
            case 'airhorn':
                window.sfx.playAirHorn();
                break;
            default:
                window.sfx.playMessageChime();
        }

        this.triggerHaptic([40, 50, 40]);
        this.showToast(`🚨 [${sender}] Cued Sound: ${label.toUpperCase()}`, 'info');
        this.appendSystemNotice(`Tactical Audio Cue: [${label.toUpperCase()}] broadcast by ${sender}`);

        if (isLocal && window.peerNet) {
            window.peerNet.sendTacticalSound(soundId, label);
        }
    }

    /* ==============================================================
       MORSE CODE TELEGRAPH KEYER & DECODER CONTROLS
    ============================================================== */

    initMorseControls() {
        const morseKeyBtn = document.getElementById('morse-key-btn');
        const morseSignalLed = document.getElementById('morse-signal-led');
        const morseDecodedText = document.getElementById('morse-decoded-text');
        const morseRawCode = document.getElementById('morse-raw-code');
        const morsePlayBtn = document.getElementById('morse-play-btn');
        const morseInput = document.getElementById('morse-text-input');
        const morseSosBtn = document.getElementById('morse-sos-btn');
        const morseClearBtn = document.getElementById('morse-clear-btn');
        const morseSendBtn = document.getElementById('morse-broadcast-btn');

        if (!morseKeyBtn) return;

        // Morse key interaction
        const startKey = (e) => {
            if (e) e.preventDefault();
            window.morse.pressKey();
            morseKeyBtn.classList.add('active');
        };
        const endKey = (e) => {
            if (e) e.preventDefault();
            window.morse.releaseKey();
            morseKeyBtn.classList.remove('active');
        };

        morseKeyBtn.addEventListener('mousedown', startKey);
        window.addEventListener('mouseup', endKey);

        morseKeyBtn.addEventListener('touchstart', startKey, { passive: false });
        morseKeyBtn.addEventListener('touchend', endKey, { passive: false });

        // Morse Signal Flasher Callback
        window.morse.onSignalChange = (active, symbol) => {
            if (morseSignalLed) {
                morseSignalLed.classList.toggle('active', active);
            }
        };

        // Text decoded updates
        window.morse.onTextChange = (fullText, rawSymbol) => {
            if (morseDecodedText) morseDecodedText.textContent = fullText || 'DECODING IDLE...';
            if (morseRawCode) morseRawCode.textContent = rawSymbol ? `SYMBOL: ${rawSymbol}` : '';
        };

        // Auto Text-to-Morse player
        if (morsePlayBtn && morseInput) {
            morsePlayBtn.addEventListener('click', async () => {
                const text = morseInput.value.trim();
                if (!text) {
                    this.showToast('Enter text or Morse code to play', 'info');
                    return;
                }
                morsePlayBtn.textContent = '⏹ Playing...';
                await window.morse.playMorseSequence(text, 18);
                morsePlayBtn.textContent = '▶ Encode & Play';
            });
        }

        // SOS Beacon toggle
        if (morseSosBtn) {
            let sosRunning = false;
            morseSosBtn.addEventListener('click', () => {
                sosRunning = !sosRunning;
                window.morse.toggleSosBeacon(sosRunning);
                morseSosBtn.classList.toggle('active', sosRunning);
                morseSosBtn.textContent = sosRunning ? '🚨 SOS BEACON ON' : '🆘 Emergency SOS';
                this.showToast(sosRunning ? 'Emergency SOS Beacon Active (... --- ...)' : 'SOS Beacon Stopped', sosRunning ? 'error' : 'info');
            });
        }

        // Clear decoded text
        if (morseClearBtn) {
            morseClearBtn.addEventListener('click', () => {
                window.morse.clearDecodedText();
            });
        }

        // Broadcast Morse to channel peers
        if (morseSendBtn) {
            morseSendBtn.addEventListener('click', () => {
                const text = window.morse.decodedText || (morseInput ? morseInput.value : '');
                if (!text.trim()) {
                    this.showToast('No Morse message to broadcast', 'info');
                    return;
                }
                const morseCode = window.morse.textToMorse(text);
                window.peerNet.sendMorseTransmission(morseCode, text);
                this.showToast(`Morse broadcasted: "${text.trim()}"`, 'success');
                this.appendChatMessage({
                    callsign: window.peerNet.callsign,
                    text: `[📡 MORSE TRANSMISSION]: "${text.trim()}" (${morseCode})`,
                    timestamp: Date.now(),
                    isIncoming: false
                });
            });
        }

        // Incoming Morse packet from peer
        if (window.peerNet) {
            window.peerNet.onMorsePacket = (morseCode, text, sender) => {
                this.showToast(`📡 [${sender}] Morse Received: "${text}"`, 'info');
                this.appendChatMessage({
                    callsign: sender,
                    text: `[📡 MORSE RECEIVED]: "${text}" (${morseCode})`,
                    timestamp: Date.now(),
                    isIncoming: true
                });
                window.morse.playMorseSequence(morseCode, 18);
            };
        }
    }

    /* ==============================================================
       TACTICAL VOICE FX MODULATOR CONTROLS
    ============================================================== */

    initVoiceModulatorControls() {
        const fxCards = document.querySelectorAll('.voice-fx-card');
        fxCards.forEach(card => {
            card.addEventListener('click', () => {
                const preset = card.dataset.fx;
                window.audioEngine.applyVoiceFx(preset);

                fxCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');

                const titles = {
                    none: 'Studio Clear / Hi-Fi',
                    vhf: 'Tactical VHF Radio (Analog Bandpass & Squelch)',
                    space: 'NASA Apollo Space Comm (Quindar Resonance)',
                    cyborg: 'Robotic Cyborg (Ring Modulation)',
                    stealth: 'Deep Spec-Ops Stealth (Sub-Bass Muffle)'
                };

                this.showToast(`Voice Modulator: ${titles[preset] || preset}`, 'success');
                window.sfx.playMicClickIn();
            });
        });
    }

    /* ==============================================================
       INSTANT ON-SCREEN QR CODE & PHONE CONNECT MODAL
    ============================================================== */

    initQrShareModal() {
        const sharePhoneBtn = document.getElementById('share-phone-btn');
        const shareModal = document.getElementById('share-modal');
        const closeShareBtn = document.getElementById('close-share-btn');
        const qrCanvas = document.getElementById('qr-code-canvas');
        const shareUrlBox = document.getElementById('share-url-box');
        const copyUrlBtn = document.getElementById('copy-url-btn');

        if (!sharePhoneBtn || !shareModal) return;

        sharePhoneBtn.addEventListener('click', async () => {
            let targetUrl = window.location.href;

            // Fetch local IP from server if available
            try {
                const res = await fetch('/api/status');
                if (res.ok) {
                    const data = await res.json();
                    if (data.local_ip && data.port) {
                        targetUrl = `http://${data.local_ip}:${data.port}/`;
                    }
                }
            } catch (e) {}

            if (shareUrlBox) shareUrlBox.textContent = targetUrl;

            // Render crisp QR code onto canvas
            if (qrCanvas && window.QRCode) {
                window.QRCode.render(qrCanvas, targetUrl, {
                    size: 210,
                    colorDark: '#00f3ff',
                    colorLight: '#0d131f'
                });
            }

            shareModal.classList.add('open');
        });

        if (closeShareBtn) {
            closeShareBtn.addEventListener('click', () => shareModal.classList.remove('open'));
        }

        if (copyUrlBtn) {
            copyUrlBtn.addEventListener('click', async () => {
                const text = shareUrlBox ? shareUrlBox.textContent : window.location.href;
                try {
                    await navigator.clipboard.writeText(text);
                    this.showToast('Link copied to clipboard! Open on your phone.', 'success');
                } catch (e) {
                    this.showToast('Select URL to copy', 'info');
                }
            });
        }
    }

    /* ==============================================================
       NETWORK TELEMETRY & STATUS LISTENER
    ============================================================== */

    initNetworkStatusListener() {
        if (!window.peerNet) return;

        window.peerNet.onNetworkStatus = (isRelayOnline, latencyMs, serverInfo) => {
            if (this.networkLatencyBadge) {
                if (isRelayOnline) {
                    this.networkLatencyBadge.className = 'network-badge online';
                    this.networkLatencyBadge.innerHTML = `<span class="badge-dot"></span> LAN SYNC ${latencyMs}ms`;
                } else {
                    this.networkLatencyBadge.className = 'network-badge offline';
                    this.networkLatencyBadge.innerHTML = `<span class="badge-dot"></span> LOCAL ONLY`;
                }
            }
        };
    }

    /* ==============================================================
       STANDARD BASE APP EVENTS & CHAT WIRING
    ============================================================== */

    bindEvents() {
        // Spacebar PTT Hotkey
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this.isSpacebarDown && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault();
                this.isSpacebarDown = true;
                this.triggerPTTStart();
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && this.isSpacebarDown) {
                e.preventDefault();
                this.isSpacebarDown = false;
                this.triggerPTTStop();
            }
        });

        // Touch & Mouse PTT button
        if (this.pttBtn) {
            const startHandler = (e) => {
                if (e) e.preventDefault();
                this.triggerPTTStart();
            };
            const endHandler = (e) => {
                if (e) e.preventDefault();
                this.triggerPTTStop();
            };

            this.pttBtn.addEventListener('mousedown', startHandler);
            this.pttBtn.addEventListener('mouseup', endHandler);
            this.pttBtn.addEventListener('mouseleave', endHandler);

            this.pttBtn.addEventListener('touchstart', startHandler, { passive: false });
            this.pttBtn.addEventListener('touchend', endHandler, { passive: false });
            this.pttBtn.addEventListener('touchcancel', endHandler, { passive: false });
        }

        // Send Text Message
        if (this.sendBtn && this.messageInput) {
            const send = () => {
                const text = this.messageInput.value;
                const msg = window.peerNet.sendTextMessage(text);
                if (msg) {
                    window.roomManager.storeMessage(window.roomManager.currentRoom, msg);
                    this.appendChatMessage(msg);
                    this.messageInput.value = '';
                }
            };
            this.sendBtn.addEventListener('click', send);
            this.messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') send();
            });
        }

        // Callsign change
        if (this.callsignInput) {
            this.callsignInput.value = window.peerNet.callsign;
            this.callsignInput.addEventListener('change', (e) => {
                window.peerNet.setCallsign(e.target.value);
                this.showToast(`Callsign updated: ${window.peerNet.callsign}`, 'info');
            });
        }

        // Channel Select & Frequencies
        const frequencies = {
            1: '462.5625 MHz', 2: '462.5875 MHz', 3: '462.6125 MHz', 4: '462.6375 MHz',
            5: '462.6625 MHz', 6: '462.6875 MHz', 7: '462.7125 MHz', 8: '467.5625 MHz',
            9: '467.5875 MHz', 10: '467.6125 MHz', 11: '467.6375 MHz', 12: '467.6625 MHz',
            13: '467.6875 MHz', 14: '467.7125 MHz', 15: '462.5500 MHz', 16: '462.7250 MHz'
        };

        if (this.channelSelect) {
            this.channelSelect.addEventListener('change', (e) => {
                const ch = e.target.value;
                window.peerNet.setChannel(ch);
                if (this.frequencyDisplay) {
                    this.frequencyDisplay.textContent = frequencies[ch] || '462.5625 MHz';
                }
                this.appendSystemNotice(`Switched to Channel ${ch} (${frequencies[ch] || '462.5625 MHz'})`);
                window.sfx.playMicClickIn();
            });
        }
    }

    async triggerPTTStart() {
        if (this.isPTTActive) return;
        this.setPTTState(true);
        this.triggerHaptic([50]);

        try {
            await window.audioEngine.startPTT((audioBlobChunk, isFinal) => {
                window.peerNet.sendVoiceStreamChunk(audioBlobChunk, isFinal);
            });
        } catch (err) {
            this.setPTTState(false);
            this.showToast(err.message, 'error');
        }
    }

    async triggerPTTStop() {
        if (!this.isPTTActive) return;
        this.setPTTState(false);
        this.triggerHaptic([30, 40]);
        await window.audioEngine.stopPTT();
    }

    setPTTState(isTransmitting) {
        this.isPTTActive = isTransmitting;
        if (this.pttBtn) this.pttBtn.classList.toggle('transmitting', isTransmitting);
        if (this.txLed) this.txLed.classList.toggle('active', isTransmitting);
        if (this.pttStatus) {
            this.pttStatus.textContent = isTransmitting ? 'TRANSMITTING (ON AIR)' : 'HOLD TO TALK';
        }
    }

    setReceivingState(isReceiving, callerName = '') {
        this.isReceivingAudio = isReceiving;
        if (this.rxLed) this.rxLed.classList.toggle('active', isReceiving);
        if (this.pttStatus && !this.isPTTActive) {
            this.pttStatus.textContent = isReceiving ? `RECEIVING FROM [${callerName}]` : 'HOLD TO TALK';
        }
    }

    initChatRooms() {
        if (!this.roomSelect) return;
        this.populateRoomsDropdown();

        this.roomSelect.addEventListener('change', (e) => {
            if (e.target.value === '__custom__') {
                const customName = prompt('Enter New Chat Room Name (e.g. stealth-ops, squad-bravo):');
                if (customName && customName.trim()) {
                    const clean = customName.trim().toLowerCase().replace(/\s+/g, '-');
                    window.roomManager.addCustomRoom(clean, `📻 #${clean}`);
                    this.populateRoomsDropdown();
                    window.roomManager.setRoom(clean);
                    this.roomSelect.value = clean;
                } else {
                    this.roomSelect.value = window.roomManager.currentRoom;
                }
                return;
            }
            window.roomManager.setRoom(e.target.value);
        });

        window.roomManager.onRoomChange = (room) => {
            if (this.currentRoomBadge) this.currentRoomBadge.textContent = room.name;
            if (this.roomSelect) this.roomSelect.value = room.id;
            this.appendSystemNotice(`Switched to Chat Room: ${room.name}`);
            this.reloadRoomChat(room.id);
        };
    }

    populateRoomsDropdown() {
        if (!this.roomSelect) return;
        this.roomSelect.innerHTML = '';
        const rooms = window.roomManager.getRooms();
        rooms.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = r.name;
            if (r.id === window.roomManager.currentRoom) opt.selected = true;
            this.roomSelect.appendChild(opt);
        });
        const customOpt = document.createElement('option');
        customOpt.value = '__custom__';
        customOpt.textContent = '➕ + Create / Join Room...';
        this.roomSelect.appendChild(customOpt);
    }

    reloadRoomChat(roomId) {
        if (!this.chatFeed) return;
        this.chatFeed.innerHTML = '';
        const msgs = window.roomManager.getMessages(roomId);
        msgs.forEach(m => {
            if (m.type === 'VOICE_NOTE') this.appendVoiceNoteMessage(m, false);
            else if (m.type === 'RADIO_CALLOUT') this.appendCalloutMessage(m, false);
            else this.appendChatMessage(m, false);
        });
    }

    initMobileTabs() {
        const navButtons = document.querySelectorAll('.mobile-nav-item');
        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTabId = btn.dataset.tab;
                this.switchMobileTab(targetTabId);
            });
        });
    }

    switchMobileTab(tabId) {
        this.activeMobileTab = tabId;
        document.querySelectorAll('.mobile-nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.toggle('active', tab.id === tabId);
        });
        if (tabId === 'tab-chat' && this.chatUnreadDot) {
            this.chatUnreadDot.style.display = 'none';
        }
        if (tabId === 'tab-radio') {
            setTimeout(() => this.initCanvasResize(), 50);
        }
    }

    appendChatMessage(msg, shouldStore = true) {
        if (!this.chatFeed) return;
        if (shouldStore) window.roomManager.storeMessage(window.roomManager.currentRoom, msg);

        const el = document.createElement('div');
        el.className = `chat-bubble ${msg.isIncoming ? 'incoming' : 'outgoing'}`;
        const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const avatarHtml = msg.photoUrl
            ? `<img src="${msg.photoUrl}" class="bubble-avatar-img">`
            : `<span class="bubble-avatar-ico">${msg.avatar || '👤'}</span>`;

        el.innerHTML = `
            <div class="bubble-header">
                <div class="bubble-user-info">
                    ${avatarHtml}
                    <span class="callsign-tag">${this.escapeHtml(msg.callsign)}</span>
                </div>
                <span class="bubble-time">${timeStr}</span>
            </div>
            <div class="bubble-text">${this.escapeHtml(msg.text)}</div>
        `;

        this.chatFeed.appendChild(el);
        this.chatFeed.scrollTop = this.chatFeed.scrollHeight;

        if (this.activeMobileTab !== 'tab-chat' && this.chatUnreadDot && msg.isIncoming) {
            this.chatUnreadDot.style.display = 'block';
        }
    }

    appendCalloutMessage(callout, shouldStore = true) {
        if (!this.chatFeed) return;
        if (shouldStore) window.roomManager.storeMessage(window.roomManager.currentRoom, callout);

        const el = document.createElement('div');
        el.className = `chat-bubble callout-bubble ${callout.isIncoming ? 'incoming' : 'outgoing'}`;
        const timeStr = new Date(callout.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        el.innerHTML = `
            <div class="bubble-header">
                <span class="callsign-tag">${this.escapeHtml(callout.callsign)}</span>
                <span class="bubble-time">${timeStr}</span>
            </div>
            <div class="callout-badge-text">📢 ${this.escapeHtml(callout.phrase)}</div>
            <div class="callout-meaning-text">${this.escapeHtml(callout.meaning)}</div>
        `;

        this.chatFeed.appendChild(el);
        this.chatFeed.scrollTop = this.chatFeed.scrollHeight;
    }

    appendVoiceNoteMessage(vn, shouldStore = true) {
        if (!this.chatFeed) return;
        if (shouldStore) window.roomManager.storeMessage(window.roomManager.currentRoom, vn);

        const el = document.createElement('div');
        el.className = `chat-bubble voice-bubble ${vn.isIncoming ? 'incoming' : 'outgoing'}`;
        const timeStr = new Date(vn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const durationSec = vn.duration || 2;
        const audioUrl = vn.audioBlob ? URL.createObjectURL(vn.audioBlob) : '';

        el.innerHTML = `
            <div class="bubble-header">
                <span class="callsign-tag">${this.escapeHtml(vn.callsign)}</span>
                <span class="bubble-time">${timeStr}</span>
            </div>
            <div class="voice-player-widget">
                <button class="voice-play-btn" title="Play Voice Memo">▶ Play</button>
                <div class="voice-progress-container">
                    <div class="voice-progress-bar"></div>
                </div>
                <span class="voice-duration">0:00 / 0:${durationSec < 10 ? '0' + durationSec : durationSec}</span>
            </div>
        `;

        const playBtn = el.querySelector('.voice-play-btn');
        const progressBar = el.querySelector('.voice-progress-bar');
        const durationLabel = el.querySelector('.voice-duration');
        const audio = new Audio(audioUrl);

        playBtn.addEventListener('click', () => {
            this.activeAudioPlayers.forEach((otherAudio, otherBtn) => {
                if (otherAudio !== audio) {
                    otherAudio.pause();
                    otherAudio.currentTime = 0;
                    otherBtn.textContent = '▶ Play';
                }
            });

            if (audio.paused) {
                audio.play().then(() => {
                    playBtn.textContent = '⏸ Pause';
                    this.activeAudioPlayers.set(playBtn, audio);
                }).catch(() => {});
            } else {
                audio.pause();
                playBtn.textContent = '▶ Play';
            }
        });

        audio.ontimeupdate = () => {
            if (audio.duration && !isNaN(audio.duration)) {
                const progress = (audio.currentTime / audio.duration) * 100;
                progressBar.style.width = `${progress}%`;
                const cur = Math.floor(audio.currentTime);
                const tot = Math.floor(audio.duration);
                durationLabel.textContent = `0:${cur < 10 ? '0' + cur : cur} / 0:${tot < 10 ? '0' + tot : tot}`;
            }
        };

        audio.onended = () => {
            playBtn.textContent = '▶ Play';
            progressBar.style.width = '0%';
            this.activeAudioPlayers.delete(playBtn);
        };

        this.chatFeed.appendChild(el);
        this.chatFeed.scrollTop = this.chatFeed.scrollHeight;
    }

    appendSystemNotice(text) {
        if (!this.chatFeed) return;
        const el = document.createElement('div');
        el.className = 'system-notice';
        el.textContent = `[RADIO] ${text}`;
        this.chatFeed.appendChild(el);
        this.chatFeed.scrollTop = this.chatFeed.scrollHeight;
    }

    updatePeerList(peers) {
        if (this.peerCountBadge) {
            this.peerCountBadge.textContent = `${peers.length + 1} Online`;
        }
        if (this.peerListContainer) {
            this.peerListContainer.innerHTML = '';
            const user = window.auth ? window.auth.currentUser : null;
            const selfAvatar = user ? (user.avatar || '🦅') : '🦅';

            const selfItem = document.createElement('div');
            selfItem.className = 'peer-item self';
            selfItem.innerHTML = `
                <span class="peer-dot active"></span>
                <span class="peer-avatar-tag">${selfAvatar}</span>
                <span class="peer-name">${this.escapeHtml(window.peerNet.callsign)} (You)</span>
                <span class="peer-tag">LOCAL</span>
            `;
            this.peerListContainer.appendChild(selfItem);

            peers.forEach(peer => {
                const item = document.createElement('div');
                item.className = `peer-item ${peer.isTalking ? 'talking' : ''}`;
                item.innerHTML = `
                    <span class="peer-dot ${peer.isTalking ? 'transmitting' : 'active'}"></span>
                    <span class="peer-avatar-tag">${peer.avatar || '👤'}</span>
                    <span class="peer-name">${this.escapeHtml(peer.callsign)}</span>
                    <span class="peer-tag">${peer.isTalking ? 'TALKING' : '#' + (peer.room || 'hq')}</span>
                `;
                this.peerListContainer.appendChild(item);
            });
        }
    }

    updateBluetoothStatus(state, deviceName) {
        if (this.statusPill) {
            this.statusPill.className = `status-pill ${state}`;
            this.statusPill.textContent = state.toUpperCase();
        }
        if (this.deviceNameLabel) {
            this.deviceNameLabel.textContent = deviceName || 'No BT Device';
        }
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `bluetalk-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('visible'), 20);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    }

    triggerHaptic(pattern = [35]) {
        if ('vibrate' in navigator) {
            try { navigator.vibrate(pattern); } catch (e) {}
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

window.ui = new UIManager();
