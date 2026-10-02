/**
 * BlueTalk - Audio & Walkie-Talkie Voice Engine (Overhauled & Bug-Fixed)
 * Handles robust microphone capture, cross-browser voice memo recording,
 * live timer tracking, audio format compatibility, and seamless live PTT stream playback.
 */

class AudioEngine {
    constructor() {
        this.audioCtx = null;
        this.micStream = null;
        this.sourceNode = null;
        this.analyserNode = null;
        this.gainNode = null;

        this.isTransmitting = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.onVoiceChunk = null; // Callback: (blob, isFinal) => void

        this.voiceNoteRecorder = null;
        this.voiceNoteChunks = [];
        this.isRecordingVoiceNote = false;
        this.voiceNoteStartTime = 0;
        this.voiceNoteTimerInterval = null;

        this.micGain = 1.0;
        this.noiseSuppression = true;
        this.radioFilterEnabled = true;

        // Visualizer data
        this.fftSize = 256;
        this.frequencyData = new Uint8Array(128);
        this.timeDomainData = new Uint8Array(128);

        // Live Voice Stream Playback Queue (avoids overlapping audio drops)
        this.playbackQueue = [];
        this.isPlayingQueue = false;
    }

    getBestMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4;codecs=mp4a.40.2',
            'audio/mp4',
            'audio/aac'
        ];

        for (const t of types) {
            if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
                return t;
            }
        }
        return '';
    }

    async ensureAudioContext() {
        if (!this.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
        }
        if (this.audioCtx.state === 'suspended') {
            try {
                await this.audioCtx.resume();
            } catch (e) {
                console.warn('AudioContext resume error:', e);
            }
        }
        return this.audioCtx;
    }

    async initMic() {
        if (this.micStream && this.micStream.active) return true;

        try {
            await this.ensureAudioContext();

            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: this.noiseSuppression,
                    autoGainControl: true
                },
                video: false
            });

            this.sourceNode = this.audioCtx.createMediaStreamSource(this.micStream);
            this.gainNode = this.audioCtx.createGain();
            this.gainNode.gain.value = this.micGain;

            this.analyserNode = this.audioCtx.createAnalyser();
            this.analyserNode.fftSize = this.fftSize;
            this.analyserNode.smoothingTimeConstant = 0.8;

            this.frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);
            this.timeDomainData = new Uint8Array(this.analyserNode.fftSize);

            // Connect graph: Mic -> Gain -> Analyser (do not connect to destination to avoid local feedback)
            this.sourceNode.connect(this.gainNode);
            this.gainNode.connect(this.analyserNode);

            return true;
        } catch (err) {
            console.error('Failed to access microphone:', err);
            return false;
        }
    }

    setMicGain(gainValue) {
        this.micGain = Math.max(0, Math.min(3, gainValue));
        if (this.gainNode) {
            this.gainNode.gain.value = this.micGain;
        }
    }

    /**
     * Start Push-to-Talk (PTT) live transmission
     */
    async startPTT(onChunkCallback) {
        if (this.isTransmitting) return;

        const micReady = await this.initMic();
        if (!micReady) {
            throw new Error('Microphone permission required for Push-to-Talk.');
        }

        await this.ensureAudioContext();
        window.sfx.playMicClickIn();

        this.onVoiceChunk = onChunkCallback;
        this.isTransmitting = true;
        this.recordedChunks = [];

        try {
            const mimeType = this.getBestMimeType();
            const options = mimeType ? { mimeType: mimeType, audioBitsPerSecond: 24000 } : {};

            this.mediaRecorder = new MediaRecorder(this.micStream, options);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                    if (this.onVoiceChunk && this.isTransmitting) {
                        this.onVoiceChunk(event.data, false);
                    }
                }
            };

            // Stream chunk every 300ms for stable low-latency transmission
            this.mediaRecorder.start(300);
        } catch (e) {
            console.error('Error starting MediaRecorder for PTT:', e);
            this.isTransmitting = false;
        }
    }

    /**
     * Stop Push-to-Talk (PTT) transmission and send Roger beep
     */
    stopPTT() {
        if (!this.isTransmitting) return;
        this.isTransmitting = false;

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.onstop = () => {
                const mime = this.mediaRecorder.mimeType || 'audio/webm';
                const fullBlob = new Blob(this.recordedChunks, { type: mime });
                if (this.onVoiceChunk) {
                    this.onVoiceChunk(fullBlob, true); // Final chunk indicator
                }
            };
            try {
                this.mediaRecorder.stop();
            } catch (e) {
                console.warn('Error stopping MediaRecorder:', e);
            }
        }

        window.sfx.playRogerBeep();
    }

    /**
     * Start recording an Audio Note (Voice Message) with live timer callback
     */
    async startVoiceNote(onTickTimer) {
        const micReady = await this.initMic();
        if (!micReady) throw new Error('Microphone permission required.');

        await this.ensureAudioContext();
        window.sfx.playMicClickIn();

        this.voiceNoteChunks = [];
        this.isRecordingVoiceNote = true;
        this.voiceNoteStartTime = Date.now();

        const mimeType = this.getBestMimeType();
        const options = mimeType ? { mimeType } : {};

        this.voiceNoteRecorder = new MediaRecorder(this.micStream, options);
        this.voiceNoteRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                this.voiceNoteChunks.push(e.data);
            }
        };

        this.voiceNoteRecorder.start(100);

        if (onTickTimer) {
            this.voiceNoteTimerInterval = setInterval(() => {
                const elapsedSec = Math.floor((Date.now() - this.voiceNoteStartTime) / 1000);
                onTickTimer(elapsedSec);
            }, 500);
        }
    }

    /**
     * Stop Voice Note recording and return Blob + Duration
     */
    async stopVoiceNote() {
        if (this.voiceNoteTimerInterval) {
            clearInterval(this.voiceNoteTimerInterval);
            this.voiceNoteTimerInterval = null;
        }

        return new Promise((resolve) => {
            if (!this.voiceNoteRecorder || !this.isRecordingVoiceNote) {
                this.isRecordingVoiceNote = false;
                resolve(null);
                return;
            }

            const durationSec = Math.max(1, Math.round((Date.now() - this.voiceNoteStartTime) / 1000));
            this.isRecordingVoiceNote = false;

            this.voiceNoteRecorder.onstop = () => {
                const mime = this.voiceNoteRecorder.mimeType || 'audio/webm';
                const blob = new Blob(this.voiceNoteChunks, { type: mime });
                window.sfx.playRogerBeep();
                resolve({ blob: blob, duration: durationSec });
            };

            try {
                this.voiceNoteRecorder.stop();
            } catch (e) {
                resolve(null);
            }
        });
    }

    /**
     * Play incoming live walkie-talkie voice chunk safely using playback queue
     */
    async playReceivedVoice(audioBlob, isWalkieTalkie = true) {
        this.playbackQueue.push({ blob: audioBlob, isWalkieTalkie });
        if (!this.isPlayingQueue) {
            this.processPlaybackQueue();
        }
    }

    async processPlaybackQueue() {
        if (this.playbackQueue.length === 0) {
            this.isPlayingQueue = false;
            return;
        }

        this.isPlayingQueue = true;
        const item = this.playbackQueue.shift();

        try {
            await this.ensureAudioContext();
            const arrayBuffer = await item.blob.arrayBuffer();

            // Decode audio safely
            this.audioCtx.decodeAudioData(arrayBuffer, (decodedBuffer) => {
                const source = this.audioCtx.createBufferSource();
                source.buffer = decodedBuffer;

                if (this.radioFilterEnabled && item.isWalkieTalkie) {
                    const lowCut = this.audioCtx.createBiquadFilter();
                    lowCut.type = 'highpass';
                    lowCut.frequency.value = 350;

                    const highCut = this.audioCtx.createBiquadFilter();
                    highCut.type = 'lowpass';
                    highCut.frequency.value = 3400;

                    const radioPeak = this.audioCtx.createBiquadFilter();
                    radioPeak.type = 'peaking';
                    radioPeak.frequency.value = 1800;
                    radioPeak.gain.value = 3.5;

                    source.connect(lowCut);
                    lowCut.connect(highCut);
                    highCut.connect(radioPeak);
                    radioPeak.connect(this.audioCtx.destination);
                } else {
                    source.connect(this.audioCtx.destination);
                }

                source.start(0);
                source.onended = () => {
                    if (item.isWalkieTalkie) {
                        window.sfx.playSquelchTail();
                    }
                    this.processPlaybackQueue();
                };
            }, (decodeErr) => {
                // Fallback to HTML5 Audio element
                this.fallbackPlayBlob(item.blob, () => this.processPlaybackQueue());
            });
        } catch (err) {
            this.fallbackPlayBlob(item.blob, () => this.processPlaybackQueue());
        }
    }

    fallbackPlayBlob(blob, onEnd) {
        try {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => {
                URL.revokeObjectURL(url);
                if (onEnd) onEnd();
            };
            audio.onerror = () => {
                URL.revokeObjectURL(url);
                if (onEnd) onEnd();
            };
            audio.play().catch(e => {
                if (onEnd) onEnd();
            });
        } catch (e) {
            if (onEnd) onEnd();
        }
    }

    /**
     * Read current visualizer audio level and waveform
     */
    getVisualizerData() {
        if (!this.analyserNode) {
            return { frequencyData: null, timeDomainData: null, volumeLevel: 0 };
        }

        this.analyserNode.getByteFrequencyData(this.frequencyData);
        this.analyserNode.getByteTimeDomainData(this.timeDomainData);

        let sum = 0;
        for (let i = 0; i < this.frequencyData.length; i++) {
            sum += this.frequencyData[i];
        }
        const volumeLevel = sum / (this.frequencyData.length * 255);

        return {
            frequencyData: this.frequencyData,
            timeDomainData: this.timeDomainData,
            volumeLevel: volumeLevel
        };
    }
}

window.audioEngine = new AudioEngine();
