/**
 * BlueTalk Pro - Unified Internet & Bluetooth Network Coordinator
 * Connects via:
 *   1. Internet / Tunnel Relay Mode (local server.py, Wi-Fi IP, ngrok, or Cloudflare Tunnel)
 *   2. Bluetooth Direct Mode (Web Bluetooth GATT / Web Serial SPP)
 *   3. Local BroadcastChannel (same-browser multi-tab sync)
 * Routed entirely by Room Code & Invite Link (no MHz frequency tuning).
 */

class PeerNetwork {
    constructor() {
        this.currentRoom = window.roomManager ? window.roomManager.currentRoom : 'HQ-MAIN';
        this.connectionMode = localStorage.getItem('bluetalk_conn_mode') || 'internet';
        this.callsign = this.generateCallsign();
        this.peerId = 'peer_' + Math.random().toString(36).substring(2, 9);
        this.serverUrl = this.resolveInitialServerUrl();

        this.broadcastChannel = null;
        this.eventSource = null;
        this.pollTimer = null;
        this.activePeers = new Map(); // peerId -> peer info
        this.seenPacketIds = new Set();

        // Live connection telemetry
        this.isRelayConnected = false;
        this.isSseActive = false;
        this.latencyMs = 0;
        this.lastLatencyCheck = 0;
        this.lastSeq = -1;
        this.detectedTunnelUrl = '';
        this.localLanUrl = '';

        // Event callbacks
        this.onTextMessage = null;   // (msg) => void
        this.onVoiceStream = null;   // (audioBlob, isFinal, sender) => void
        this.onVoiceNote = null;     // (msg) => void
        this.onRadioCallout = null;  // (callout) => void
        this.onTacticalSound = null; // (soundId, label, sender) => void
        this.onMorsePacket = null;   // (morse, text, sender) => void
        this.onPeerTalking = null;   // (sender, isTalking) => void
        this.onPeerListUpdate = null;// (peersArray) => void
        this.onNetworkStatus = null; // (isOnline, latencyMs, serverInfo, mode) => void
        this.onModeChange = null;    // (mode) => void

        this.initChannel();
        this.initBluetoothListener();
        if (this.connectionMode === 'internet') {
            this.connectInternetRelay();
        }
        this.startHeartbeat();
    }

    resolveInitialServerUrl() {
        const params = new URLSearchParams(window.location.search);
        const paramServer = params.get('server');
        if (paramServer) {
            const clean = this.normalizeServerUrl(paramServer);
            localStorage.setItem('bluetalk_server_url', clean);
            return clean;
        }
        const saved = localStorage.getItem('bluetalk_server_url');
        if (saved && saved.trim()) {
            return this.normalizeServerUrl(saved);
        }
        if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
            return window.location.origin;
        }
        return 'http://localhost:8080';
    }

    normalizeServerUrl(urlStr) {
        let raw = (urlStr || '').trim().replace(/\/+$/, '');
        if (!raw) {
            return window.location.protocol.startsWith('http') ? window.location.origin : 'http://localhost:8080';
        }
        if (!/^https?:\/\//i.test(raw)) {
            const isLocal = /^(localhost|127\.|192\.168\.|10\.|172\.)/i.test(raw);
            raw = (isLocal ? 'http://' : 'https://') + raw;
        }
        return raw.replace(/\/+$/, '');
    }

    getApiUrl(path) {
        return `${this.serverUrl}${path}`;
    }

    getFetchHeaders(extra = {}) {
        return {
            'ngrok-skip-browser-warning': 'true',
            ...extra
        };
    }

    generateCallsign() {
        const saved = localStorage.getItem('bluetalk_callsign');
        if (saved) return saved;
        const prefixes = ['EAGLE', 'ALPHA', 'BRAVO', 'TITAN', 'FALCON', 'ROGUE', 'VIPER', 'GHOST', 'SHADOW'];
        const num = Math.floor(10 + Math.random() * 90);
        const name = `${prefixes[Math.floor(Math.random() * prefixes.length)]}-${num}`;
        localStorage.setItem('bluetalk_callsign', name);
        return name;
    }

    setCallsign(newCallsign) {
        this.callsign = (newCallsign || '').toUpperCase().trim() || this.generateCallsign();
        localStorage.setItem('bluetalk_callsign', this.callsign);
        this.broadcastPresence();
    }

    setConnectionMode(mode) {
        if (mode !== 'internet' && mode !== 'bluetooth') return;
        this.connectionMode = mode;
        localStorage.setItem('bluetalk_conn_mode', mode);
        this.activePeers.clear();
        if (this.onPeerListUpdate) {
            this.onPeerListUpdate([]);
        }

        if (mode === 'internet') {
            this.connectInternetRelay();
        } else {
            this.disconnectInternetRelay();
            if (this.onNetworkStatus) {
                this.onNetworkStatus(
                    !!(window.btManager && window.btManager.isConnected),
                    0,
                    null,
                    'bluetooth'
                );
            }
        }

        this.broadcastPresence();
        if (this.onModeChange) {
            this.onModeChange(mode);
        }
    }

    setServerUrl(urlStr) {
        this.serverUrl = this.normalizeServerUrl(urlStr);
        localStorage.setItem('bluetalk_server_url', this.serverUrl);
        this.lastSeq = -1;
        this.isRelayConnected = false;
        if (this.connectionMode === 'internet') {
            this.connectInternetRelay();
        }
    }

    setChatRoom(roomId) {
        this.currentRoom = window.roomManager ? window.roomManager.normalizeRoom(roomId) : (roomId || 'HQ-MAIN');
        this.lastSeq = -1;
        this.activePeers.clear();
        if (this.onPeerListUpdate) {
            this.onPeerListUpdate([]);
        }
        this.initChannel();
        if (this.connectionMode === 'internet') {
            this.connectInternetRelay();
        }
        this.broadcastPresence();
    }

    getShareUrl(baseOverride = '') {
        const base = (baseOverride || this.detectedTunnelUrl || this.localLanUrl || this.serverUrl || window.location.origin).replace(/\/+$/, '');
        const url = new URL(base + '/');
        url.searchParams.set('room', this.currentRoom);
        // If current page is hosted elsewhere (e.g. GitHub Pages) but using a custom tunnel serverUrl:
        if (!baseOverride && window.location.protocol.startsWith('http') && this.serverUrl !== window.location.origin) {
            const pageUrl = new URL(window.location.href);
            pageUrl.searchParams.set('room', this.currentRoom);
            pageUrl.searchParams.set('server', this.serverUrl);
            return pageUrl.toString();
        }
        return url.toString();
    }

    initChannel() {
        if (this.broadcastChannel) {
            try { this.broadcastChannel.close(); } catch (e) {}
        }

        const channelName = `bluetalk_room_${this.currentRoom}`;
        try {
            this.broadcastChannel = new BroadcastChannel(channelName);
            this.broadcastChannel.onmessage = (event) => {
                this.handleIncomingPacket(event.data);
            };
        } catch (e) {
            console.warn('BroadcastChannel not supported:', e);
        }
    }

    initBluetoothListener() {
        if (window.btManager) {
            window.btManager.onDataReceived = (packet) => {
                if (packet) {
                    this.handleIncomingPacket(packet);
                }
            };
        }
    }

    /**
     * Connect to Internet / Tunnel / Wi-Fi Relay Server (SSE + Automatic Poll Fallback)
     */
    connectInternetRelay() {
        this.disconnectInternetRelay();
        if (!this.serverUrl || !/^https?:\/\//i.test(this.serverUrl)) return;

        const user = window.auth ? window.auth.currentUser : null;
        const avatar = user ? (user.avatar || '🦅') : '🦅';

        const isSameOrigin = typeof window !== 'undefined' && this.serverUrl === window.location.origin;
        const isNgrok = /ngrok/i.test(this.serverUrl);

        // SSE works cleanest when same-origin & not gated by ngrok browser warning header
        if (isSameOrigin && !isNgrok && typeof EventSource !== 'undefined') {
            const sseUrl = this.getApiUrl(
                `/api/events?peerId=${encodeURIComponent(this.peerId)}&room=${encodeURIComponent(this.currentRoom)}&callsign=${encodeURIComponent(this.callsign)}&avatar=${encodeURIComponent(avatar)}&transport=internet`
            );
            try {
                this.eventSource = new EventSource(sseUrl);
                this.eventSource.onopen = () => {
                    this.isSseActive = true;
                    this.isRelayConnected = true;
                    this.measureLatency();
                };
                this.eventSource.onmessage = (e) => {
                    try {
                        const packet = JSON.parse(e.data);
                        if (packet && packet.type === 'SERVER_CONNECTED') {
                            if (typeof packet.latestSeq === 'number' && this.lastSeq < 0) {
                                this.lastSeq = packet.latestSeq;
                            }
                            if (packet.tunnelUrl) this.detectedTunnelUrl = packet.tunnelUrl;
                            if (packet.localIp) this.localLanUrl = `http://${packet.localIp}:8080`;
                            return;
                        }
                        if (packet) {
                            this.handleIncomingPacket(packet);
                        }
                    } catch (err) {}
                };
                this.eventSource.onerror = () => {
                    this.isSseActive = false;
                };
            } catch (err) {
                this.isSseActive = false;
            }
        }

        // Start fast reliable HTTP poll loop (critical for ngrok/cloudflare tunnels & Python interop)
        this.measureLatency();
        this.pollTimer = setInterval(() => {
            if (this.connectionMode === 'internet') {
                this.pollRelay();
            }
        }, 850);
    }

    disconnectInternetRelay() {
        this.isSseActive = false;
        this.isRelayConnected = false;
        if (this.eventSource) {
            try { this.eventSource.close(); } catch (e) {}
            this.eventSource = null;
        }
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    async measureLatency() {
        if (this.connectionMode !== 'internet' || !this.serverUrl) return;
        const start = performance.now();
        try {
            const res = await fetch(
                this.getApiUrl(`/api/status?room=${encodeURIComponent(this.currentRoom)}`),
                { cache: 'no-store', headers: this.getFetchHeaders() }
            );
            if (res.ok) {
                const data = await res.json();
                this.latencyMs = Math.round(performance.now() - start);
                this.isRelayConnected = true;
                if (typeof data.latestSeq === 'number' && this.lastSeq < 0) {
                    this.lastSeq = data.latestSeq;
                }
                if (data.tunnel_url) this.detectedTunnelUrl = data.tunnel_url;
                if (data.local_ip && data.port) this.localLanUrl = `http://${data.local_ip}:${data.port}`;
                if (this.onNetworkStatus) {
                    this.onNetworkStatus(true, this.latencyMs, data, 'internet');
                }
            }
        } catch (e) {
            this.isRelayConnected = false;
            if (this.onNetworkStatus) {
                this.onNetworkStatus(false, 0, null, 'internet');
            }
        }
    }

    async pollRelay() {
        if (this.connectionMode !== 'internet' || !this.serverUrl) return;
        const user = window.auth ? window.auth.currentUser : null;
        const avatar = user ? (user.avatar || '🦅') : '🦅';
        const qs = new URLSearchParams({
            sinceSeq: String(this.lastSeq < 0 ? 0 : this.lastSeq),
            room: this.currentRoom,
            peerId: this.peerId,
            callsign: this.callsign,
            avatar: avatar,
            transport: 'internet'
        });

        try {
            const t0 = performance.now();
            const res = await fetch(this.getApiUrl(`/api/poll?${qs.toString()}`), {
                cache: 'no-store',
                headers: this.getFetchHeaders()
            });
            if (!res.ok) return;
            const data = await res.json();
            this.latencyMs = Math.round(performance.now() - t0);
            this.isRelayConnected = true;

            if (typeof data.latestSeq === 'number' && data.latestSeq > this.lastSeq) {
                this.lastSeq = data.latestSeq;
            }

            // Sync active peer list from server
            if (Array.isArray(data.peers)) {
                const now = Date.now();
                data.peers.forEach(p => {
                    if (p && p.peerId && p.peerId !== this.peerId) {
                        this.activePeers.set(p.peerId, {
                            peerId: p.peerId,
                            callsign: p.callsign || 'UNKNOWN',
                            room: p.room || this.currentRoom,
                            avatar: p.avatar || '👤',
                            photoUrl: p.photoUrl || '',
                            transport: p.transport || 'internet',
                            lastSeen: now,
                            isTalking: !!p.isTalking
                        });
                    }
                });
                if (this.onPeerListUpdate) {
                    this.onPeerListUpdate(Array.from(this.activePeers.values()));
                }
            }

            if (Array.isArray(data.messages)) {
                for (const msg of data.messages) {
                    if (typeof msg.serverSeq === 'number' && msg.serverSeq > this.lastSeq) {
                        this.lastSeq = msg.serverSeq;
                    }
                    await this.handleIncomingPacket(msg);
                }
            }

            if (this.onNetworkStatus) {
                this.onNetworkStatus(true, this.latencyMs, null, 'internet');
            }
        } catch (e) {
            this.isRelayConnected = false;
            if (this.onNetworkStatus) {
                this.onNetworkStatus(false, 0, null, 'internet');
            }
        }
    }

    startHeartbeat() {
        setInterval(() => {
            this.broadcastPresence();
            this.cleanupStalePeers();
            if (this.connectionMode === 'internet' && Date.now() - this.lastLatencyCheck > 8000) {
                this.lastLatencyCheck = Date.now();
                this.measureLatency();
            }
        }, 3000);
    }

    broadcastPresence(isTalking = false) {
        const user = window.auth ? window.auth.currentUser : null;
        const packet = {
            type: 'PRESENCE',
            id: `pres_${this.peerId}_${Date.now()}`,
            peerId: this.peerId,
            callsign: this.callsign,
            room: this.currentRoom,
            transport: this.connectionMode,
            avatar: user ? (user.avatar || '🦅') : '🦅',
            photoUrl: user ? (user.photoUrl || '') : '',
            isTalking: isTalking,
            timestamp: Date.now()
        };
        this.sendRawPacket(packet);
    }

    cleanupStalePeers() {
        const now = Date.now();
        let changed = false;
        for (const [id, peer] of this.activePeers.entries()) {
            if (now - peer.lastSeen > 12000) {
                this.activePeers.delete(id);
                changed = true;
            }
        }
        if (changed && this.onPeerListUpdate) {
            this.onPeerListUpdate(Array.from(this.activePeers.values()));
        }
    }

    /**
     * Send real-time PTT voice chunk to room
     */
    async sendVoiceStreamChunk(blobChunk, isFinal = false) {
        const base64Audio = await this.blobToBase64(blobChunk);
        const user = window.auth ? window.auth.currentUser : null;
        const packet = {
            type: 'VOICE_STREAM',
            id: `vs_${this.peerId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            peerId: this.peerId,
            callsign: this.callsign,
            room: this.currentRoom,
            transport: this.connectionMode,
            avatar: user ? (user.avatar || '🦅') : '🦅',
            audioData: base64Audio,
            mimeType: blobChunk.type,
            isFinal: isFinal,
            timestamp: Date.now()
        };

        this.sendRawPacket(packet);
        this.broadcastPresence(!isFinal);
    }

    /**
     * Send Voice Note Audio Message
     */
    async sendVoiceNoteMessage(blob, durationSec) {
        const base64Audio = await this.blobToBase64(blob);
        const user = window.auth ? window.auth.currentUser : null;
        const packet = {
            type: 'VOICE_NOTE',
            id: `vn_${this.peerId}_${Date.now()}`,
            peerId: this.peerId,
            callsign: this.callsign,
            room: this.currentRoom,
            transport: this.connectionMode,
            avatar: user ? (user.avatar || '🦅') : '🦅',
            photoUrl: user ? (user.photoUrl || '') : '',
            audioData: base64Audio,
            mimeType: blob.type,
            duration: durationSec,
            timestamp: Date.now()
        };

        this.sendRawPacket(packet);
        return packet;
    }

    /**
     * Send Text Message
     */
    sendTextMessage(text) {
        if (!text || !text.trim()) return null;
        const user = window.auth ? window.auth.currentUser : null;

        const packet = {
            type: 'TEXT_MESSAGE',
            id: `msg_${this.peerId}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            peerId: this.peerId,
            callsign: this.callsign,
            room: this.currentRoom,
            transport: this.connectionMode,
            avatar: user ? (user.avatar || '🦅') : '🦅',
            photoUrl: user ? (user.photoUrl || '') : '',
            text: text.trim(),
            timestamp: Date.now()
        };

        this.sendRawPacket(packet);
        return packet;
    }

    /**
     * Send Quick Callout ("ROGER", "10-4", "MAYDAY", etc.)
     */
    sendCallout(phrase, meaning) {
        const user = window.auth ? window.auth.currentUser : null;
        const packet = {
            type: 'RADIO_CALLOUT',
            id: `callout_${this.peerId}_${Date.now()}`,
            peerId: this.peerId,
            callsign: this.callsign,
            room: this.currentRoom,
            transport: this.connectionMode,
            avatar: user ? (user.avatar || '🦅') : '🦅',
            photoUrl: user ? (user.photoUrl || '') : '',
            phrase: phrase,
            meaning: meaning,
            timestamp: Date.now()
        };

        this.sendRawPacket(packet);
        return packet;
    }

    /**
     * Send Tactical Sound Effect cue across room/link
     */
    sendTacticalSound(soundId, label) {
        const user = window.auth ? window.auth.currentUser : null;
        const packet = {
            type: 'TACTICAL_SOUND',
            id: `sfx_${this.peerId}_${Date.now()}`,
            peerId: this.peerId,
            callsign: this.callsign,
            room: this.currentRoom,
            transport: this.connectionMode,
            avatar: user ? (user.avatar || '🦅') : '🦅',
            soundId: soundId,
            label: label,
            timestamp: Date.now()
        };

        this.sendRawPacket(packet);
        return packet;
    }

    /**
     * Send Morse Code Transmission across room/link
     */
    sendMorseTransmission(morseCode, decodedText) {
        const user = window.auth ? window.auth.currentUser : null;
        const packet = {
            type: 'MORSE_CODE',
            id: `morse_${this.peerId}_${Date.now()}`,
            peerId: this.peerId,
            callsign: this.callsign,
            room: this.currentRoom,
            transport: this.connectionMode,
            avatar: user ? (user.avatar || '🦅') : '🦅',
            morse: morseCode,
            text: decodedText,
            timestamp: Date.now()
        };

        this.sendRawPacket(packet);
        return packet;
    }

    sendRawPacket(packet) {
        // 1. In-browser local broadcast channel (same browser multi-tab)
        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage(packet);
            } catch (e) {}
        }

        // 2. Bluetooth Direct (BLE GATT or Serial SPP)
        if (window.btManager && window.btManager.isConnected && window.btManager.hasDataLink) {
            window.btManager.sendPacket(packet);
        }

        // 3. Internet / Tunnel / Wi-Fi Relay Server
        if (this.connectionMode === 'internet' && this.serverUrl && /^https?:\/\//i.test(this.serverUrl)) {
            fetch(this.getApiUrl('/api/send'), {
                method: 'POST',
                headers: this.getFetchHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(packet)
            }).catch(() => {});
        }
    }

    rememberPacketId(id) {
        if (!id) return false;
        if (this.seenPacketIds.has(id)) return true;
        this.seenPacketIds.add(id);
        if (this.seenPacketIds.size > 400) {
            const first = this.seenPacketIds.values().next().value;
            this.seenPacketIds.delete(first);
        }
        return false;
    }

    async handleIncomingPacket(packet) {
        if (!packet || packet.peerId === this.peerId) {
            return;
        }

        const pktRoom = window.roomManager && packet.room
            ? window.roomManager.normalizeRoom(packet.room)
            : packet.room;
        if (pktRoom && pktRoom !== this.currentRoom) return;

        if (packet.type !== 'PRESENCE' && packet.type !== 'PTT_STATE') {
            if (this.rememberPacketId(packet.id)) return;
        }

        this.activePeers.set(packet.peerId, {
            peerId: packet.peerId,
            callsign: packet.callsign || 'UNKNOWN',
            room: pktRoom || this.currentRoom,
            transport: packet.transport || this.connectionMode,
            avatar: packet.avatar || '👤',
            photoUrl: packet.photoUrl || '',
            lastSeen: Date.now(),
            isTalking: !!(packet.isTalking)
        });

        if (this.onPeerListUpdate) {
            this.onPeerListUpdate(Array.from(this.activePeers.values()));
        }

        switch (packet.type) {
            case 'PRESENCE':
            case 'PTT_STATE':
                if (this.onPeerTalking) {
                    this.onPeerTalking(packet.callsign, !!packet.isTalking);
                }
                break;

            case 'TEXT_MESSAGE':
                window.sfx.playMessageChime();
                if (this.onTextMessage) {
                    this.onTextMessage({ ...packet, isIncoming: true });
                }
                break;

            case 'RADIO_CALLOUT':
                window.sfx.playRogerBeep();
                if (this.onRadioCallout) {
                    this.onRadioCallout({ ...packet, isIncoming: true });
                }
                break;

            case 'VOICE_STREAM':
                if (packet.audioData && this.onVoiceStream) {
                    const audioBlob = await this.base64ToBlob(packet.audioData, packet.mimeType || 'audio/webm');
                    this.onVoiceStream(audioBlob, packet.isFinal, packet.callsign);
                }
                break;

            case 'VOICE_NOTE':
                window.sfx.playMessageChime();
                if (packet.audioData && this.onVoiceNote) {
                    const audioBlob = await this.base64ToBlob(packet.audioData, packet.mimeType || 'audio/webm');
                    this.onVoiceNote({
                        ...packet,
                        audioBlob: audioBlob,
                        isIncoming: true
                    });
                }
                break;

            case 'TACTICAL_SOUND':
                if (this.onTacticalSound) {
                    this.onTacticalSound(packet.soundId, packet.label, packet.callsign);
                }
                break;

            case 'MORSE_CODE':
                if (this.onMorsePacket) {
                    this.onMorsePacket(packet.morse, packet.text, packet.callsign);
                }
                break;
        }
    }

    blobToBase64(blob) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result.split(',')[1];
                resolve(base64data);
            };
            reader.readAsDataURL(blob);
        });
    }

    async base64ToBlob(base64Data, mimeType) {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }
}

window.peerNet = new PeerNetwork();
