/**
 * BlueTalk - Main Application Controller (with Mobile Web Share & Theme Integration)
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Setup Bluetooth Discovery Button
    const btScanBtn = document.getElementById('bt-scan-btn');
    const btDisconnectBtn = document.getElementById('bt-disconnect-btn');

    if (btScanBtn) {
        btScanBtn.addEventListener('click', async () => {
            try {
                window.sfx.init();
                const device = await window.btManager.scanAndConnect();
                window.ui.showToast(`Connected to: ${device.name}`, 'success');
                window.ui.appendSystemNotice(`Bluetooth paired with [${device.name}]`);
                if (btDisconnectBtn) btDisconnectBtn.style.display = 'inline-flex';
            } catch (err) {
                if (err.name !== 'NotFoundError') {
                    window.ui.showToast(err.message || 'Bluetooth connection failed', 'error');
                }
            }
        });
    }

    if (btDisconnectBtn) {
        btDisconnectBtn.addEventListener('click', () => {
            window.btManager.disconnect();
            btDisconnectBtn.style.display = 'none';
            window.ui.showToast('Bluetooth disconnected', 'info');
        });
    }

    // 2. Wire Bluetooth State Listener
    window.btManager.onStateChange = (state, deviceName) => {
        window.ui.updateBluetoothStatus(state, deviceName);
    };

    // 3. Wire Peer Network Events
    window.peerNet.onTextMessage = (msg) => {
        window.ui.appendChatMessage(msg);
    };

    window.peerNet.onRadioCallout = (callout) => {
        window.ui.appendCalloutMessage(callout);
    };

    window.peerNet.onVoiceNote = (vn) => {
        window.ui.appendVoiceNoteMessage(vn);
    };

    window.peerNet.onPeerListUpdate = (peers) => {
        window.ui.updatePeerList(peers);
    };

    window.peerNet.onPeerTalking = (sender, isTalking) => {
        window.ui.setReceivingState(isTalking, sender);
    };

    window.peerNet.onVoiceStream = async (audioBlob, isFinal, sender) => {
        window.ui.setReceivingState(true, sender);
        await window.audioEngine.playReceivedVoice(audioBlob, true);
        if (isFinal) {
            setTimeout(() => {
                window.ui.setReceivingState(false);
            }, 600);
        }
    };

    // 4. Setup Quick Callout Buttons
    const calloutButtons = document.querySelectorAll('.callout-btn');
    calloutButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const phrase = btn.dataset.phrase;
            const meaning = btn.dataset.meaning;
            const msg = window.peerNet.sendCallout(phrase, meaning);
            if (msg) {
                window.ui.appendCalloutMessage(msg);
            }
        });
    });

    // 5. Voice Note Audio Recorder Button (with Live Timer)
    const voiceNoteBtn = document.getElementById('record-voicenote-btn');

    if (voiceNoteBtn) {
        voiceNoteBtn.addEventListener('click', async () => {
            window.sfx.init();

            if (!window.audioEngine.isRecordingVoiceNote) {
                try {
                    await window.audioEngine.startVoiceNote((elapsedSec) => {
                        const sec = elapsedSec < 10 ? '0' + elapsedSec : elapsedSec;
                        voiceNoteBtn.innerHTML = `🔴 0:${sec} ⏹ Stop`;
                    });
                    voiceNoteBtn.classList.add('recording');
                    window.ui.showToast('Recording Voice Note... Speak now, click Stop when done', 'info');
                } catch (e) {
                    window.ui.showToast(e.message, 'error');
                }
            } else {
                const result = await window.audioEngine.stopVoiceNote();
                voiceNoteBtn.classList.remove('recording');
                voiceNoteBtn.innerHTML = '🎤 <span class="vn-text">Voice Note</span>';

                if (result && result.blob && result.blob.size > 0) {
                    const msg = await window.peerNet.sendVoiceNoteMessage(result.blob, result.duration);
                    window.ui.appendVoiceNoteMessage({
                        ...msg,
                        audioBlob: result.blob,
                        isIncoming: false
                    });
                }
            }
        });
    }

    // 6. Audio / Settings Modals & Controls
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');

    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', () => {
            settingsModal.classList.add('open');
        });
    }
    if (closeSettingsBtn && settingsModal) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.classList.remove('open');
        });
    }

    // Share / Phone Connect Modal & Native Mobile Share
    const sharePhoneBtn = document.getElementById('share-phone-btn');
    const shareModal = document.getElementById('share-modal');
    const closeShareBtn = document.getElementById('close-share-btn');
    const shareUrlBox = document.getElementById('share-url-box');
    const copyUrlBtn = document.getElementById('copy-url-btn');
    const nativeShareBtn = document.getElementById('native-share-btn');

    if (sharePhoneBtn && shareModal) {
        sharePhoneBtn.addEventListener('click', () => {
            if (shareUrlBox) {
                shareUrlBox.textContent = window.location.href;
            }
            shareModal.classList.add('open');
        });
    }
    if (closeShareBtn && shareModal) {
        closeShareBtn.addEventListener('click', () => {
            shareModal.classList.remove('open');
        });
    }
    if (copyUrlBtn) {
        copyUrlBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(window.location.href);
                window.ui.showToast('Link copied to clipboard! Open on your phone.', 'success');
            } catch (e) {
                window.ui.showToast('Select and copy URL above', 'info');
            }
        });
    }
    if (nativeShareBtn) {
        nativeShareBtn.addEventListener('click', async () => {
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'BlueTalk Walkie-Talkie',
                        text: `Join my BlueTalk Radio Channel ${window.peerNet.currentChannel} (${window.roomManager.getCurrentRoom().name}):`,
                        url: window.location.href
                    });
                } catch (e) {
                    console.log('Share canceled or error:', e);
                }
            } else {
                window.ui.showToast('Native share supported on mobile browsers! Use Copy Link above.', 'info');
            }
        });
    }

    // Mic Gain Slider
    const micGainSlider = document.getElementById('mic-gain-slider');
    const micGainVal = document.getElementById('mic-gain-val');
    if (micGainSlider) {
        micGainSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            window.audioEngine.setMicGain(val);
            if (micGainVal) micGainVal.textContent = `${Math.round(val * 100)}%`;
        });
    }

    // Roger Beep Toggle
    const rogerBeepToggle = document.getElementById('toggle-roger-beep');
    if (rogerBeepToggle) {
        rogerBeepToggle.addEventListener('change', (e) => {
            window.sfx.rogerBeepEnabled = e.target.checked;
        });
    }

    // Radio Filter Toggle
    const radioFilterToggle = document.getElementById('toggle-radio-filter');
    if (radioFilterToggle) {
        radioFilterToggle.addEventListener('change', (e) => {
            window.audioEngine.radioFilterEnabled = e.target.checked;
        });
    }

    // Sound FX Master Toggle
    const sfxToggle = document.getElementById('toggle-sfx');
    if (sfxToggle) {
        sfxToggle.addEventListener('change', (e) => {
            window.sfx.enabled = e.target.checked;
        });
    }

    // 7. Initial Welcome Message
    window.ui.appendSystemNotice(`BlueTalk Radio System Online. Frequency Channel 1 (462.5625 MHz).`);
    window.ui.appendSystemNotice(`Hold SPACEBAR on laptop or tap & hold TRANSMIT on phone to talk live.`);
});
