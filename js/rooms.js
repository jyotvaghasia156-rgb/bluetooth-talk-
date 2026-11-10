/**
 * BlueTalk Pro - Room Code & Contact Manager
 * Manages Room Codes, Join Links (?room=...), custom room creation,
 * and per-room message history (no UHF MHz frequencies required).
 */

class ChatRoomManager {
    constructor() {
        this.rooms = [
            { id: 'HQ-MAIN', name: '🌐 HQ-MAIN', desc: 'Main Public Lobby', isDefault: true },
            { id: 'SQUAD-ALPHA', name: '⚡ SQUAD-ALPHA', desc: 'Team Operations' },
            { id: 'RECON-INTEL', name: '🕵️ RECON-INTEL', desc: 'Recon & Scouting' },
            { id: 'SOS-PRIORITY', name: '🚨 SOS-PRIORITY', desc: 'High-Priority Alert Room' },
            { id: 'PRIVATE-1ON1', name: '🔒 PRIVATE-1ON1', desc: 'Direct Private Room' }
        ];

        this.currentRoom = 'HQ-MAIN';
        this.roomMessages = new Map();
        this.rooms.forEach(r => this.roomMessages.set(r.id, []));

        this.onRoomChange = null; // (newRoom) => void
    }

    normalizeRoom(roomId) {
        if (!roomId) return 'HQ-MAIN';
        const clean = String(roomId).trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
        return clean || 'HQ-MAIN';
    }

    init() {
        const params = new URLSearchParams(window.location.search);
        const urlRoom = params.get('room');
        if (urlRoom) {
            const clean = this.normalizeRoom(urlRoom);
            if (!this.rooms.find(r => r.id === clean)) {
                this.addCustomRoom(clean, `🔗 #${clean}`, 'Joined via Invite Link');
            }
            this.currentRoom = clean;
            localStorage.setItem('bluetalk_active_room', clean);
            return;
        }

        const savedRoom = localStorage.getItem('bluetalk_active_room');
        if (savedRoom) {
            const clean = this.normalizeRoom(savedRoom);
            if (!this.rooms.find(r => r.id === clean)) {
                this.addCustomRoom(clean, `🔗 #${clean}`, 'Saved Room');
            }
            this.currentRoom = clean;
        }
    }

    getRooms() {
        return this.rooms;
    }

    getRoom(roomId) {
        const clean = this.normalizeRoom(roomId);
        return this.rooms.find(r => r.id === clean) || this.rooms[0];
    }

    getCurrentRoom() {
        return this.getRoom(this.currentRoom);
    }

    setRoom(roomId) {
        const clean = this.normalizeRoom(roomId);
        if (!this.rooms.find(r => r.id === clean)) {
            this.addCustomRoom(clean, `🔗 #${clean}`, 'Custom Room Code');
        }

        this.currentRoom = clean;
        localStorage.setItem('bluetalk_active_room', clean);

        if (window.peerNet) {
            window.peerNet.setChatRoom(clean);
        }

        if (this.onRoomChange) {
            this.onRoomChange(this.getCurrentRoom());
        }
        return clean;
    }

    generateRandomCode() {
        const num = Math.floor(1000 + Math.random() * 9000);
        return `BT-${num}`;
    }

    addCustomRoom(id, name, desc = 'Custom Room') {
        const cleanId = this.normalizeRoom(id);
        let existing = this.rooms.find(r => r.id === cleanId);
        if (!existing) {
            const newRoom = { id: cleanId, name: name || `🔗 #${cleanId}`, desc: desc };
            this.rooms.push(newRoom);
            this.roomMessages.set(cleanId, []);
            return newRoom;
        }
        return existing;
    }

    storeMessage(roomId, msg) {
        const clean = this.normalizeRoom(roomId);
        if (!this.roomMessages.has(clean)) {
            this.roomMessages.set(clean, []);
        }
        this.roomMessages.get(clean).push(msg);
    }

    getMessages(roomId) {
        const clean = this.normalizeRoom(roomId);
        return this.roomMessages.get(clean) || [];
    }
}

window.roomManager = new ChatRoomManager();
window.roomManager.init();
