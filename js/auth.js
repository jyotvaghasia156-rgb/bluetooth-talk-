/**
 * BlueTalk Pro - Operator Authentication & Session Manager
 * Handles Google OAuth Identity, Tactical Callsign Generation, Connection Mode,
 * Room Code onboarding (?room=...), and session persistence.
 */

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.selectedAvatar = '🦅';
        this.avatars = ['🦅', '🐺', '🦊', '⚡', '🎯', '🛰️', '🛡️', '⚔️', '🚀', '🔥'];

        this.loginOverlay = document.getElementById('login-overlay');
        this.loginForm = document.getElementById('operator-login-form');
        this.googleLoginBtn = document.getElementById('btn-google-login');
        this.callsignInput = document.getElementById('login-callsign-input');
        this.modeSelect = document.getElementById('login-mode-select');
        this.roomInput = document.getElementById('login-room-input');
        this.randomizeRoomBtn = document.getElementById('btn-randomize-room');
        this.avatarContainer = document.getElementById('avatar-picker');
        this.randomizeBtn = document.getElementById('btn-randomize-callsign');
        this.userProfileBtn = document.getElementById('user-profile-btn');
        this.userAvatarBadge = document.getElementById('user-avatar-badge');
        this.userCallsignLabel = document.getElementById('user-header-callsign');

        this.init();
    }

    init() {
        this.renderAvatars();
        this.bindEvents();
        this.checkExistingSession();
    }

    renderAvatars() {
        if (!this.avatarContainer) return;
        this.avatarContainer.innerHTML = '';
        this.avatars.forEach((emoji) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `avatar-choice ${emoji === this.selectedAvatar ? 'selected' : ''}`;
            btn.textContent = emoji;
            btn.addEventListener('click', () => {
                this.selectedAvatar = emoji;
                document.querySelectorAll('.avatar-choice').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
            this.avatarContainer.appendChild(btn);
        });
    }

    generateRandomCallsign() {
        const prefixes = ['EAGLE', 'VIPER', 'TITAN', 'GHOST', 'ALPHA', 'BRAVO', 'FALCON', 'SHADOW', 'ROGUE', 'RAVEN'];
        const num = Math.floor(10 + Math.random() * 90);
        return `${prefixes[Math.floor(Math.random() * prefixes.length)]}-${num}`;
    }

    bindEvents() {
        if (this.randomizeBtn && this.callsignInput) {
            this.randomizeBtn.addEventListener('click', () => {
                this.callsignInput.value = this.generateRandomCallsign();
            });
        }

        if (this.randomizeRoomBtn && this.roomInput && window.roomManager) {
            this.randomizeRoomBtn.addEventListener('click', () => {
                this.roomInput.value = window.roomManager.generateRandomCode();
            });
        }

        if (this.googleLoginBtn) {
            this.googleLoginBtn.addEventListener('click', () => {
                this.handleGoogleLogin();
            });
        }

        if (this.loginForm) {
            this.loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const callsign = (this.callsignInput.value || this.generateRandomCallsign()).toUpperCase().trim();
                const mode = this.modeSelect ? this.modeSelect.value : 'internet';
                const rawRoom = this.roomInput ? this.roomInput.value : 'HQ-MAIN';
                const room = window.roomManager ? window.roomManager.normalizeRoom(rawRoom) : (rawRoom || 'HQ-MAIN');

                this.login({
                    type: 'tactical',
                    callsign: callsign,
                    avatar: this.selectedAvatar,
                    mode: mode,
                    room: room,
                    loginTime: Date.now()
                });
            });
        }

        if (this.userProfileBtn) {
            this.userProfileBtn.addEventListener('click', () => {
                this.showLoginModal();
            });
        }
    }

    async handleGoogleLogin() {
        const promptName = prompt('Enter your Display Name for Google Sign-In:', 'Alex Rivera');
        if (!promptName || !promptName.trim()) return;

        const cleanName = promptName.trim();
        const callsign = cleanName.toUpperCase().replace(/\s+/g, '-').slice(0, 12);
        const email = `${cleanName.toLowerCase().replace(/\s+/g, '.')}@gmail.com`;
        const mode = this.modeSelect ? this.modeSelect.value : 'internet';
        const rawRoom = this.roomInput ? this.roomInput.value : 'HQ-MAIN';
        const room = window.roomManager ? window.roomManager.normalizeRoom(rawRoom) : (rawRoom || 'HQ-MAIN');

        const googleUser = {
            type: 'google',
            name: cleanName,
            email: email,
            callsign: callsign,
            avatar: '👤',
            isGoogleUser: true,
            photoUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(callsign)}`,
            mode: mode,
            room: room,
            loginTime: Date.now()
        };

        this.login(googleUser);
    }

    checkExistingSession() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoom = urlParams.get('room');
        const saved = localStorage.getItem('bluetalk_operator_session');

        if (saved) {
            try {
                const user = JSON.parse(saved);
                // Preserve invite link room if present
                if (urlRoom && window.roomManager) {
                    user.room = window.roomManager.normalizeRoom(urlRoom);
                }
                this.applyUserSession(user, false);
                return;
            } catch (e) {
                console.warn('Invalid session, showing login');
            }
        }

        if (this.callsignInput && !this.callsignInput.value) {
            this.callsignInput.value = this.generateRandomCallsign();
        }
        if (this.roomInput && window.roomManager) {
            this.roomInput.value = window.roomManager.currentRoom || 'HQ-MAIN';
        }
        this.showLoginModal();
    }

    login(userData) {
        localStorage.setItem('bluetalk_operator_session', JSON.stringify(userData));
        this.applyUserSession(userData, true);
    }

    applyUserSession(userData, isNewLogin = false) {
        this.currentUser = userData;
        this.selectedAvatar = userData.avatar || '🦅';

        const activeRoom = userData.room || (window.roomManager ? window.roomManager.currentRoom : 'HQ-MAIN');
        const activeMode = userData.mode || (window.peerNet ? window.peerNet.connectionMode : 'internet');

        if (window.roomManager) {
            window.roomManager.setRoom(activeRoom);
        }
        if (window.peerNet) {
            window.peerNet.setCallsign(userData.callsign);
            window.peerNet.setConnectionMode(activeMode);
        }

        if (this.userAvatarBadge) {
            if (userData.isGoogleUser && userData.photoUrl) {
                this.userAvatarBadge.innerHTML = `<img src="${userData.photoUrl}" style="width: 20px; height: 20px; border-radius: 50%; vertical-align: middle;">`;
            } else {
                this.userAvatarBadge.textContent = this.selectedAvatar;
            }
        }
        if (this.userCallsignLabel) {
            this.userCallsignLabel.textContent = userData.callsign;
        }

        if (this.loginOverlay) {
            this.loginOverlay.classList.add('fade-out');
            setTimeout(() => {
                this.loginOverlay.style.display = 'none';
                this.loginOverlay.classList.remove('fade-out');
            }, 300);
        }

        if (isNewLogin) {
            window.sfx.playConnectedTone();
            if (window.ui) {
                const modeName = activeMode === 'bluetooth' ? 'Bluetooth Direct' : 'Internet Relay';
                const welcomeMsg = userData.isGoogleUser
                    ? `Signed in as ${userData.name} (${userData.callsign}) in Room ${activeRoom}!`
                    : `Welcome ${userData.callsign}! Room ${activeRoom} (${modeName}).`;
                window.ui.showToast(welcomeMsg, 'success');
                window.ui.appendSystemNotice(`Operator [${userData.callsign}] connected to Room [${activeRoom}] via ${modeName}.`);
            }
        }
    }

    showLoginModal() {
        if (this.roomInput && window.roomManager) {
            this.roomInput.value = window.roomManager.currentRoom;
        }
        if (this.modeSelect && window.peerNet) {
            this.modeSelect.value = window.peerNet.connectionMode;
        }
        if (this.loginOverlay) {
            this.loginOverlay.style.display = 'flex';
        }
    }

    logout() {
        localStorage.removeItem('bluetalk_operator_session');
        this.currentUser = null;
        this.showLoginModal();
        if (window.ui) {
            window.ui.showToast('Logged out. Please authenticate.', 'info');
        }
    }
}

window.auth = new AuthManager();
