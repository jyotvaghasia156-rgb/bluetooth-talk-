/**
 * BlueTalk - Chat Rooms Manager
 * Handles multi-room communication, room switching, custom room creation,
 * and room-specific message routing.
 */

class ChatRoomManager {
    constructor() {
        this.rooms = [
            { id: 'general-hq', name: '🌐 General HQ', desc: 'Main Base Public Operations', isDefault: true },
            { id: 'tactical-alpha', name: '⚡ Squad Alpha', desc: 'Rapid Deployment & Fireteam Comms' },
            { id: 'recon-intel', name: '🕵️ Recon & Intel', desc: 'Surveillance & Strategic Scouting' },
            { id: 'emergency-sos', name: '🚨 Emergency SOS', desc: 'High-Priority Distress Channel' },
            { id: 'stealth-direct', name: '🔒 Stealth Ops', desc: 'Encrypted Direct Radio Room' }
        ];

        this.currentRoom = 'general-hq';
        this.roomMessages = new Map(); // roomId -> Array of messages
        this.rooms.forEach(r => this.roomMessages.set(r.id, []));

        this.onRoomChange = null; // (newRoom) => void
    }

    init() {
        const savedRoom = localStorage.getItem('bluetalk_active_room');
        if (savedRoom && this.getRoom(savedRoom)) {
            this.currentRoom = savedRoom;
        }
    }

    getRooms() {
        return this.rooms;
    }

    getRoom(roomId) {
        return this.rooms.find(r => r.id === roomId) || this.rooms[0];
    }

    getCurrentRoom() {
        return this.getRoom(this.currentRoom);
    }

    setRoom(roomId) {
        if (!this.getRoom(roomId)) {
            // If custom room, add it dynamically
            this.addCustomRoom(roomId, `📻 #${roomId}`, 'Custom Radio Room');
        }

        this.currentRoom = roomId;
        localStorage.setItem('bluetalk_active_room', roomId);

        // Update peer network channel name
        if (window.peerNet) {
            window.peerNet.setChatRoom(roomId);
        }

        if (this.onRoomChange) {
            this.onRoomChange(this.getCurrentRoom());
        }
    }

    addCustomRoom(id, name, desc = 'Custom Channel') {
        const cleanId = id.toLowerCase().replace(/[^a-z0-9-_]/g, '');
        if (!cleanId) return null;

        let existing = this.rooms.find(r => r.id === cleanId);
        if (!existing) {
            const newRoom = { id: cleanId, name: name || `#${cleanId}`, desc: desc };
            this.rooms.push(newRoom);
            this.roomMessages.set(cleanId, []);
            return newRoom;
        }
        return existing;
    }

    storeMessage(roomId, msg) {
        if (!this.roomMessages.has(roomId)) {
            this.roomMessages.set(roomId, []);
        }
        this.roomMessages.get(roomId).push(msg);
    }

    getMessages(roomId) {
        return this.roomMessages.get(roomId) || [];
    }
}

window.roomManager = new ChatRoomManager();
window.roomManager.init();
