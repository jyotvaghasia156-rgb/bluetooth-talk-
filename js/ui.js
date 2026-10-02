/**
 * BlueTalk - UI Coordinator & Audio Visualizer (with Dark/Light Mode & Mobile Enhancements)
 */

class UIManager {
    constructor() {
        this.canvas = document.getElementById('visualizer-canvas');
        this.canvasCtx = this.canvas ? this.canvas.getContext('2d') : null;
        this.animationId = null;

        // Elements
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

        // Chat Room Elements
        this.roomSelect = document.getElementById('chat-room-select');
        this.currentRoomBadge = document.getElementById('current-room-badge');

        // Theme State ('dark' | 'light')
        this.currentTheme = localStorage.getItem('bluetalk_theme') || 'dark';

        // Spacebar & Touch PTT Tracking
        this.isSpacebarDown = false;
        this.isPTTActive = false;
        this.activeMobileTab = 'tab-radio';

        // Audio Player State Tracking
        this.activeAudioPlayers = new Map();

        this.initTheme();
        this.initCanvasResize();
        this.startVisualizer();
        this.bindEvents();
        this.initMobileTabs();
        this.initChatRooms();
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

        // Meta theme color update for mobile browser address bars
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
            metaTheme.content = theme === 'dark' ? '#0a0d14' : '#eef2f7';
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
            if (this.currentRoomBadge) {
                this.currentRoomBadge.textContent = room.name;
            }
            if (this.roomSelect) {
                this.roomSelect.value = room.id;
            }
            this.appendSystemNotice(`Switched to Chat Room: ${room.name} (${room.desc})`);
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

    initCanvasResize() {
        if (!this.canvas) return;
        const resize = () => {
            this.canvas.width = this.canvas.parentElement.clientWidth || 300;
            this.canvas.height = this.canvas.parentElement.clientHeight || 85;
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

            const isLight = this.currentTheme === 'light';
            const gridColor = isLight ? 'rgba(0, 136, 170, 0.08)' : 'rgba(0, 255, 204, 0.07)';
            const waveColor = isLight ? '#0088aa' : '#00ffcc';
            const waveGlow = isLight ? 'rgba(0, 136, 170, 0.5)' : 'rgba(0, 255, 204, 0.8)';
            const pttColor = isLight ? '#e63946' : '#ff3366';
            const pttGlow = isLight ? 'rgba(230, 57, 70, 0.5)' : 'rgba(255, 51, 102, 0.8)';

            // Subtle tactical grid
            ctx.strokeStyle = gridColor;
            ctx.lineWidth = 1;
            for (let x = 0; x < width; x += 30) {
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

            const { frequencyData, timeDomainData } = window.audioEngine.getVisualizerData();

            if (this.isPTTActive || this.isReceivingAudio) {
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = this.isPTTActive ? pttColor : waveColor;
                ctx.shadowBlur = 10;
                ctx.shadowColor = this.isPTTActive ? pttGlow : waveGlow;

                ctx.beginPath();
                if (timeDomainData) {
                    const sliceWidth = width / timeDomainData.length;
                    let x = 0;
                    for (let i = 0; i < timeDomainData.length; i++) {
                        const v = timeDomainData[i] / 128.0;
                        const y = (v * height) / 2;
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                        x += sliceWidth;
                    }
                }
                ctx.stroke();
                ctx.shadowBlur = 0;

                if (frequencyData) {
                    const barCount = 32;
                    const barWidth = (width / barCount) - 2;
                    for (let i = 0; i < barCount; i++) {
                        const barHeight = (frequencyData[i * 2] / 255) * (height * 0.45);
                        const bx = i * (barWidth + 2);
                        const by = height - barHeight;

                        ctx.fillStyle = this.isPTTActive
                            ? (isLight ? `rgba(230, 57, 70, ${0.4 + (barHeight / height)})` : `rgba(255, 51, 102, ${0.4 + (barHeight / height)})`)
                            : (isLight ? `rgba(0, 136, 170, ${0.4 + (barHeight / height)})` : `rgba(0, 255, 204, ${0.4 + (barHeight / height)})`);
                        ctx.fillRect(bx, by, barWidth, barHeight);
                    }
                }
            } else {
                const time = Date.now() * 0.003;
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = isLight ? 'rgba(0, 136, 170, 0.35)' : 'rgba(0, 255, 204, 0.35)';
                ctx.beginPath();
                for (let x = 0; x < width; x++) {
                    const y = (height / 2) + Math.sin(x * 0.04 + time) * 5 + Math.sin(x * 0.02 - time * 0.5) * 3;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        };

        render();
    }

    triggerHaptic(pattern = [35]) {
        if ('vibrate' in navigator) {
            try {
                navigator.vibrate(pattern);
            } catch (e) {}
        }
    }

    bindEvents() {
        const startPTT = async (e) => {
            if (e) e.preventDefault();
            if (this.isPTTActive) return;
            this.setPTTState(true);
            this.triggerHaptic([45]);

            try {
                await window.audioEngine.startPTT((blobChunk, isFinal) => {
                    window.peerNet.sendVoiceStreamChunk(blobChunk, isFinal);
                });
            } catch (err) {
                this.setPTTState(false);
                this.showToast(err.message, 'error');
            }
        };

        const stopPTT = (e) => {
            if (e) e.preventDefault();
            if (!this.isPTTActive) return;
            this.setPTTState(false);
            this.triggerHaptic([20, 30, 20]);
            window.audioEngine.stopPTT();
        };

        if (this.pttBtn) {
            this.pttBtn.addEventListener('mousedown', startPTT);
            window.addEventListener('mouseup', stopPTT);
            this.pttBtn.addEventListener('touchstart', startPTT, { passive: false });
            window.addEventListener('touchend', stopPTT);
            window.addEventListener('touchcancel', stopPTT);
        }

        // Spacebar PTT Shortcut
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this.isSpacebarDown && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault();
                this.isSpacebarDown = true;
                startPTT();
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && this.isSpacebarDown) {
                e.preventDefault();
                this.isSpacebarDown = false;
                stopPTT();
            }
        });

        // Chat Text Send
        if (this.sendBtn && this.messageInput) {
            const send = () => {
                const text = this.messageInput.value;
                if (!text || !text.trim()) return;

                const msg = window.peerNet.sendTextMessage(text);
                if (msg) {
                    window.roomManager.storeMessage(window.roomManager.currentRoom, msg);
                    this.appendChatMessage(msg);
                    this.messageInput.value = '';
                }
            };

            this.sendBtn.addEventListener('click', send);
            this.messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    send();
                }
            });
        }

        // Callsign change
        if (this.callsignInput) {
            this.callsignInput.value = window.peerNet.callsign;
            this.callsignInput.addEventListener('change', (e) => {
                window.peerNet.setCallsign(e.target.value);
                this.showToast(`Callsign: ${window.peerNet.callsign}`, 'info');
            });
        }

        // Channel Select & Frequencies
        const frequencies = {
            1: '462.5625 MHz',
            2: '462.5875 MHz',
            3: '462.6125 MHz',
            4: '462.6375 MHz',
            5: '462.6625 MHz',
            6: '462.6875 MHz',
            7: '462.7125 MHz',
            8: '467.5625 MHz',
            9: '467.5875 MHz',
            10: '467.6125 MHz',
            11: '467.6375 MHz',
            12: '467.6625 MHz',
            13: '467.6875 MHz',
            14: '467.7125 MHz',
            15: '462.5500 MHz',
            16: '462.7250 MHz'
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

    setPTTState(isTransmitting) {
        this.isPTTActive = isTransmitting;
        if (this.pttBtn) {
            this.pttBtn.classList.toggle('transmitting', isTransmitting);
        }
        if (this.txLed) {
            this.txLed.classList.toggle('active', isTransmitting);
        }
        if (this.pttStatus) {
            this.pttStatus.textContent = isTransmitting ? 'TRANSMITTING (ON AIR)' : 'HOLD TO TALK';
        }
    }

    setReceivingState(isReceiving, callerName = '') {
        this.isReceivingAudio = isReceiving;
        if (this.rxLed) {
            this.rxLed.classList.toggle('active', isReceiving);
        }
        if (this.pttStatus && !this.isPTTActive) {
            this.pttStatus.textContent = isReceiving ? `RECEIVING FROM [${callerName}]` : 'HOLD TO TALK';
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
        el.className = `chat-bubble callout ${callout.isIncoming ? 'incoming' : 'outgoing'}`;
        const timeStr = new Date(callout.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        el.innerHTML = `
            <div class="bubble-header">
                <span class="callsign-tag">${this.escapeHtml(callout.callsign)}</span>
                <span class="bubble-time">${timeStr}</span>
            </div>
            <div class="callout-badge">
                <span class="callout-phrase">📢 ${this.escapeHtml(callout.phrase)}</span>
                <span class="callout-meaning">(${this.escapeHtml(callout.meaning)})</span>
            </div>
        `;

        this.chatFeed.appendChild(el);
        this.chatFeed.scrollTop = this.chatFeed.scrollHeight;

        if (this.activeMobileTab !== 'tab-chat' && this.chatUnreadDot && callout.isIncoming) {
            this.chatUnreadDot.style.display = 'block';
        }
    }

    appendVoiceNoteMessage(vn, shouldStore = true) {
        if (!this.chatFeed) return;
        if (shouldStore) window.roomManager.storeMessage(window.roomManager.currentRoom, vn);

        const el = document.createElement('div');
        el.className = `chat-bubble audio-msg ${vn.isIncoming ? 'incoming' : 'outgoing'}`;
        const timeStr = new Date(vn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const durationSec = vn.duration || 1;

        const audioUrl = URL.createObjectURL(vn.audioBlob);
        const avatarHtml = vn.photoUrl 
            ? `<img src="${vn.photoUrl}" class="bubble-avatar-img">`
            : `<span class="bubble-avatar-ico">${vn.avatar || '👤'}</span>`;

        el.innerHTML = `
            <div class="bubble-header">
                <div class="bubble-user-info">
                    ${avatarHtml}
                    <span class="callsign-tag">${this.escapeHtml(vn.callsign)}</span>
                </div>
                <span class="bubble-time">${timeStr}</span>
            </div>
            <div class="voice-player-container">
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
                    otherBtn.classList.remove('playing');
                }
            });

            if (audio.paused) {
                audio.play().then(() => {
                    playBtn.textContent = '⏸ Pause';
                    playBtn.classList.add('playing');
                    this.activeAudioPlayers.set(playBtn, audio);
                }).catch(err => {
                    console.error('Audio play error:', err);
                });
            } else {
                audio.pause();
                playBtn.textContent = '▶ Play';
                playBtn.classList.remove('playing');
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
            playBtn.classList.remove('playing');
            progressBar.style.width = '0%';
            durationLabel.textContent = `0:00 / 0:${durationSec < 10 ? '0' + durationSec : durationSec}`;
            this.activeAudioPlayers.delete(playBtn);
        };

        this.chatFeed.appendChild(el);
        this.chatFeed.scrollTop = this.chatFeed.scrollHeight;

        if (this.activeMobileTab !== 'tab-chat' && this.chatUnreadDot && vn.isIncoming) {
            this.chatUnreadDot.style.display = 'block';
        }
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

            const selfItem = document.createElement('div');
            selfItem.className = 'peer-item self';
            const user = window.auth ? window.auth.currentUser : null;
            const selfAvatar = user ? (user.avatar || '🦅') : '🦅';

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
