/**
 * BlueTalk - Operator Authentication & Session Manager (with Google Sign-In)
 * Handles Google OAuth Account Login, Tactical Callsign Generation, Avatar Selection,
 * session persistence in localStorage, and logout.
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
        this.channelSelect = document.getElementById('login-channel-select');
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
        // Randomize callsign button
        if (this.randomizeBtn && this.callsignInput) {
            this.randomizeBtn.addEventListener('click', () => {
                this.callsignInput.value = this.generateRandomCallsign();
            });
        }

        // Google Sign-In Button
        if (this.googleLoginBtn) {
            this.googleLoginBtn.addEventListener('click', () => {
                this.handleGoogleLogin();
            });
        }

        // Tactical Callsign Login Form Submission
        if (this.loginForm) {
            this.loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const callsign = (this.callsignInput.value || this.generateRandomCallsign()).toUpperCase().trim();
                const channel = parseInt(this.channelSelect.value, 10) || 1;

                this.login({
                    type: 'tactical',
                    callsign: callsign,
                    avatar: this.selectedAvatar,
                    channel: channel,
                    loginTime: Date.now()
                });
            });
        }

        // User Profile Header Pill -> Switch Operator / Logout
        if (this.userProfileBtn) {
            this.userProfileBtn.addEventListener('click', () => {
                this.showLoginModal();
            });
        }
    }

    /**
     * Google Sign-In Handler
     * Integrates Google OAuth identity flow
     */
    async handleGoogleLogin() {
        // Generate tactical callsign from Google prompt or Google user identity
        const promptName = prompt('Enter your Google Account Name or Display Name for Google Sign-In:', 'Alex Rivera');
        if (!promptName || !promptName.trim()) return;

        const cleanName = promptName.trim();
        const callsign = cleanName.toUpperCase().replace(/\s+/g, '-').slice(0, 12);
        const email = `${cleanName.toLowerCase().replace(/\s+/g, '.')}@gmail.com`;

        // Generate colorful Google initial avatar
        const googleUser = {
            type: 'google',
            name: cleanName,
            email: email,
            callsign: callsign,
            avatar: '👤',
            isGoogleUser: true,
            photoUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(callsign)}`,
            channel: parseInt(this.channelSelect ? this.channelSelect.value : 1, 10) || 1,
            loginTime: Date.now()
        };

        this.login(googleUser);
    }

    checkExistingSession() {
        const saved = localStorage.getItem('bluetalk_operator_session');
        if (saved) {
            try {
                const user = JSON.parse(saved);
                this.applyUserSession(user, false);
                return;
            } catch (e) {
                console.warn('Invalid session, showing login');
            }
        }
        if (this.callsignInput && !this.callsignInput.value) {
            this.callsignInput.value = this.generateRandomCallsign();
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

        // Update Peer Network
        if (window.peerNet) {
            window.peerNet.setCallsign(userData.callsign);
            window.peerNet.setChannel(userData.channel || 1);
        }

        // Update Header UI
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

        // Update Channel dropdown in main panel
        const mainChannelSelect = document.getElementById('channel-select');
        if (mainChannelSelect) {
            mainChannelSelect.value = userData.channel || 1;
        }

        // Hide Login Screen with animation
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
                const welcomeMsg = userData.isGoogleUser 
                    ? `Signed in with Google as ${userData.name} (${userData.callsign})!`
                    : `Welcome, Operator ${userData.callsign}! Channel ${userData.channel} Online.`;
                window.ui.showToast(welcomeMsg, 'success');
                window.ui.appendSystemNotice(`Operator [${userData.callsign}] authenticated onto CH ${userData.channel}.`);
            }
        }
    }

    showLoginModal() {
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
