/**
 * BlueTalk Pro - Peer-to-Peer & Cross-Device Live Network Coordinator
 * Seamlessly bridges Local BroadcastChannel, Web Bluetooth GATT, and
 * the Python Real-Time SSE/REST Relay Server for genuine cross-device communication.
 */

class PeerNetwork {
    constructor() {
        this.currentChannel = 1;
        this.currentRoom = 'general-hq';
        this.callsign = this.generateCallsign();
        this.peerId = 'peer_' + Math.random().toString(36).substring(2, 9);

        this.broadcastChannel = null;
        this.eventSource = null;
        this.activePeers = new Map(); // peerId -> { callsign, lastSeen, isTalking, room, channel, avatar }

        // Live connection telemetry
        this.isRelayConnected = false;
        this.latencyMs = 0;
        this.lastLatencyCheck = 0;

        // Event callbacks
        this.onTextMessage = null;   // (msg) => void
        this.onVoiceStream = null;   // (audioBlob, isFinal, sender) => void
        this.onVoiceNote = null;     // (msg) => void
        this.onRadioCallout = null;  // (callout) => void
        this.onTacticalSound = null; // (soundId, label, sender) => void
        this.onMorsePacket = null;   // (morse, text, sender) => void
        this.onPeerTalking = null;   // (sender, isTalking) => void
        this.onPeerListUpdate = null;// (peersArray) => void
        this.onNetworkStatus = null; // (isRelayOnline, latencyMs, serverInfo) => void

        this.initChannel();
        this.initServerRelay();
        this.startHeartbeat();
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
        this.callsign = newCallsign.toUpperCase().trim() || this.generateCallsign();
        localStorage.setItem('bluetalk_callsign', this.callsign);
        this.broadcastPresence();
    }

    setChannel(channelNumber) {
        this.currentChannel = parseInt(channelNumber, 10) || 1;
        this.initChannel();
        this.reconnectServerRelay();
        this.activePeers.clear();
        this.broadcastPresence();
        if (this.onPeerListUpdate) {
            this.onPeerListUpdate(Array.from(this.activePeers.values()));
        }
    }

    setChatRoom(roomId) {
        this.currentRoom = roomId || 'general-hq';
        this.initChannel();
        this.reconnectServerRelay();
        this.broadcastPresence();
    }

    initChannel() {
        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.close();
            } catch (e) {}
        }

        const channelName = `bluetalk_ch_${this.currentChannel}_${this.currentRoom}`;
        try {
            this.broadcastChannel = new BroadcastChannel(channelName);
            this.broadcastChannel.onmessage = (event) => {
                this.handleIncomingPacket(event.data);
            };
        } catch (e) {
            console.warn('BroadcastChannel not supported in this browser context:', e);
        }
    }

    /**
     * Connect to live Python HTTP / SSE relay server for genuine cross-device communication
     */
    initServerRelay() {
        if (typeof window === 'undefined' || !window.location.protocol.startsWith('http')) return;

        if (this.eventSource) {
            try { this.eventSource.close(); } catch (e) {}
            this.eventSource = null;
        }

        const sseUrl = `/api/events?peerId=${encodeURIComponent(this.peerId)}&channel=${this.currentChannel}&room=${encodeURIComponent(this.currentRoom)}`;

        try {
            this.eventSource = new EventSource(sseUrl);

            this.eventSource.onopen = () => {
                this.isRelayConnected = true;
                this.measureLatency();
            };

            this.eventSource.onmessage = (e) => {
                try {
                    const packet = JSON.parse(e.data);
                    if (packet && packet.type !== 'CONNECTED' && packet.type !== 'SERVER_CONNECTED') {
                        this.handleIncomingPacket(packet);
                    }
                } catch (err) {}
            };

            this.eventSource.onerror = () => {
                this.isRelayConnected = false;
                if (this.onNetworkStatus) this.onNetworkStatus(false, 0, null);
            };
        } catch (err) {
            this.isRelayConnected = false;
        }
    }

    reconnectServerRelay() {
        this.initServerRelay();
    }

    async measureLatency() {
        if (!window.location.protocol.startsWith('http')) return;
        const start = performance.now();
        try {
            const res = await fetch('/api/status', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                this.latencyMs = Math.round(performance.now() - start);
                this.isRelayConnected = true;
                if (this.onNetworkStatus) {
                    this.onNetworkStatus(true, this.latencyMs, data);
                }
            }
        } catch (e) {
            this.isRelayConnected = false;
            if (this.onNetworkStatus) this.onNetworkStatus(false, 0, null);
        }
    }

    startHeartbeat() {
        setInterval(() => {
            this.broadcastPresence();
            this.cleanupStalePeers();
            if (Date.now() - this.lastLatencyCheck > 8000) {
                this.lastLatencyCheck = Date.now();
                this.measureLatency();
            }
        }, 3000);

        if (window.btManager) {
            window.btManager.onDataReceived = (packet) => {
                if (packet && packet.channel === this.currentChannel && (!packet.room || packet.room === this.currentRoom)) {
                    this.handleIncomingPacket(packet);
                }
            };
        }
    }

    broadcastPresence(isTalking = false) {
        const user = window.auth ? window.auth.currentUser : null;
        const packet = {
            type: 'PRESENCE',
            peerId: this.peerId,
            callsign: this.callsign,
            channel: this.currentChannel,
            room: this.currentRoom,
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
            if (now - peer.lastSeen > 8000) {
                this.activePeers.delete(id);
                changed = true;
            }
        }
        if (changed && this.onPeerListUpdate) {
            this.onPeerListUpdate(Array.from(this.activePeers.values()));
        }
    }

    /**
     * Send real-time PTT voice chunk to channel & room
     */
    async sendVoiceStreamChunk(blobChunk, isFinal = false) {
        const base64Audio = await this.blobToBase64(blobChunk);
        const user = window.auth ? window.auth.currentUser : null;
        const packet = {
            type: 'VOICE_STREAM',
            peerId: this.peerId,
            callsign: this.callsign,
            channel: this.currentChannel,
            room: this.currentRoom,
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
            id: 'vn_' + Date.now(),
            peerId: this.peerId,
            callsign: this.callsign,
            channel: this.currentChannel,
            room: this.currentRoom,
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
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            peerId: this.peerId,
            callsign: this.callsign,
            channel: this.currentChannel,
            room: this.currentRoom,
            avatar: user ? (user.avatar || '🦅') : '🦅',
            photoUrl: user ? (user.photoUrl || '') : '',
            text: text.trim(),
            timestamp: Date.now()
        };

        this.sendRawPacket(packet);
        return packet;
    }

    /**
     * Send Quick Radio Callout ("ROGER", "10-4", "MAYDAY", etc.)
     */
    sendCallout(phrase, meaning) {
        const user = window.auth ? window.auth.currentUser : null;
        const packet = {
            type: 'RADIO_CALLOUT',
            id: 'callout_' + Date.now(),
            peerId: this.peerId,
            callsign: this.callsign,
            channel: this.currentChannel,
            room: this.currentRoom,
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
     * Send Tactical Sound Effect cue across network
     */
    sendTacticalSound(soundId, label) {
        const user = window.auth ? window.auth.currentUser : null;
        const packet = {
            type: 'TACTICAL_SOUND',
            id: 'sfx_' + Date.now(),
            peerId: this.peerId,
            callsign: this.callsign,
            channel: this.currentChannel,
            room: this.currentRoom,
            avatar: user ? (user.avatar || '🦅') : '🦅',
            soundId: soundId,
            label: label,
            timestamp: Date.now()
        };

        this.sendRawPacket(packet);
        return packet;
    }

    /**
     * Send Morse Code Transmission across network
     */
    sendMorseTransmission(morseCode, decodedText) {
        const user = window.auth ? window.auth.currentUser : null;
        const packet = {
            type: 'MORSE_CODE',
            id: 'morse_' + Date.now(),
            peerId: this.peerId,
            callsign: this.callsign,
            channel: this.currentChannel,
            room: this.currentRoom,
            avatar: user ? (user.avatar || '🦅') : '🦅',
            morse: morseCode,
            text: decodedText,
            timestamp: Date.now()
        };

        this.sendRawPacket(packet);
        return packet;
    }

    sendRawPacket(packet) {
        // 1. Post to in-browser local broadcast channel
        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage(packet);
            } catch (e) {}
        }

        // 2. Post to Bluetooth GATT if connected
        if (window.btManager && window.btManager.isConnected) {
            window.btManager.sendPacket(packet);
        }

        // 3. Post to Python Real-Time Relay Server (Cross-Device Broadcast)
        if (window.location.protocol.startsWith('http')) {
            fetch('/api/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(packet)
            }).catch(() => {});
        }
    }

    async handleIncomingPacket(packet) {
        if (!packet || packet.peerId === this.peerId) {
            return;
        }

        if (packet.channel && packet.channel !== this.currentChannel) return;
        if (packet.room && packet.room !== this.currentRoom) return;

        // Update peer presence table
        this.activePeers.set(packet.peerId, {
            peerId: packet.peerId,
            callsign: packet.callsign || 'UNKNOWN',
            channel: packet.channel,
            room: packet.room,
            avatar: packet.avatar || '👤',
            photoUrl: packet.photoUrl || '',
            lastSeen: Date.now(),
            isTalking: !!packet.isTalking
        });

        if (this.onPeerListUpdate) {
            this.onPeerListUpdate(Array.from(this.activePeers.values()));
        }

        // Route by packet type
        switch (packet.type) {
            case 'PRESENCE':
                if (this.onPeerTalking) {
                    this.onPeerTalking(packet.callsign, packet.isTalking);
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
