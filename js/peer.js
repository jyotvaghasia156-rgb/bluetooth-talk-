/**
 * BlueTalk - Peer-to-Peer Communication & Multi-Client Channel Network
 * Bridges Bluetooth GATT, Local Broadcast Channels, and WebRTC
 * for seamless real-time talking across devices, windows, chat rooms, and frequencies.
 */

class PeerNetwork {
    constructor() {
        this.currentChannel = 1;
        this.currentRoom = 'general-hq';
        this.callsign = this.generateCallsign();
        this.peerId = 'peer_' + Math.random().toString(36).substring(2, 9);

        this.broadcastChannel = null;
        this.activePeers = new Map(); // peerId -> { callsign, lastSeen, isTalking, room, channel }

        // Event callbacks
        this.onTextMessage = null;   // (msg) => void
        this.onVoiceStream = null;   // (audioBlob, isFinal, sender) => void
        this.onVoiceNote = null;     // (msg) => void
        this.onRadioCallout = null;  // (callout) => void
        this.onPeerTalking = null;   // (sender, isTalking) => void
        this.onPeerListUpdate = null;// (peersArray) => void

        this.initChannel();
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
        this.activePeers.clear();
        this.broadcastPresence();
        if (this.onPeerListUpdate) {
            this.onPeerListUpdate(Array.from(this.activePeers.values()));
        }
    }

    setChatRoom(roomId) {
        this.currentRoom = roomId || 'general-hq';
        this.initChannel();
        this.broadcastPresence();
    }

    initChannel() {
        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.close();
            } catch (e) {}
        }

        const channelName = `bluetalk_ch_${this.currentChannel}_${this.currentRoom}`;
        this.broadcastChannel = new BroadcastChannel(channelName);

        this.broadcastChannel.onmessage = (event) => {
            this.handleIncomingPacket(event.data);
        };
    }

    startHeartbeat() {
        // Send presence ping every 3 seconds
        setInterval(() => {
            this.broadcastPresence();
            this.cleanupStalePeers();
        }, 3000);

        // Listen also to bluetooth manager data packets
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

    sendRawPacket(packet) {
        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage(packet);
            } catch (e) {
                console.warn('BroadcastChannel error:', e);
            }
        }

        if (window.btManager && window.btManager.isConnected) {
            window.btManager.sendPacket(packet);
        }
    }

    async handleIncomingPacket(packet) {
        if (!packet || packet.peerId === this.peerId) {
            return; // Ignore our own echo
        }

        // Room and Channel filtering
        if (packet.channel && packet.channel !== this.currentChannel) return;
        if (packet.room && packet.room !== this.currentRoom) return;

        // Update peer table
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

        switch (packet.type) {
            case 'PRESENCE':
                if (this.onPeerTalking) {
                    this.onPeerTalking(packet.callsign, packet.isTalking);
                }
                break;

            case 'VOICE_STREAM':
                if (packet.audioData) {
                    const audioBlob = await this.base64ToBlob(packet.audioData, packet.mimeType || 'audio/webm');
                    if (this.onVoiceStream) {
                        this.onVoiceStream(audioBlob, packet.isFinal, packet.callsign);
                    }
                }
                break;

            case 'VOICE_NOTE':
                if (packet.audioData) {
                    const audioBlob = await this.base64ToBlob(packet.audioData, packet.mimeType || 'audio/webm');
                    const messageObj = {
                        ...packet,
                        audioBlob: audioBlob,
                        isIncoming: true
                    };
                    if (this.onVoiceNote) {
                        this.onVoiceNote(messageObj);
                    }
                    window.sfx.playMessageChime();
                }
                break;

            case 'TEXT_MESSAGE':
                if (this.onTextMessage) {
                    this.onTextMessage({
                        ...packet,
                        isIncoming: true
                    });
                    window.sfx.playMessageChime();
                }
                break;

            case 'RADIO_CALLOUT':
                if (this.onRadioCallout) {
                    this.onRadioCallout({
                        ...packet,
                        isIncoming: true
                    });
                    window.sfx.playMessageChime();
                }
                break;
        }
    }

    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async base64ToBlob(base64, mimeType = 'audio/webm') {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }
}

window.peerNet = new PeerNetwork();
