/**
 * BlueTalk Pro - Audio Engine & Real-Time DSP Voice Modulator
 * Supports live Push-to-Talk (PTT), Voice Note memos, procedural sound FX integration,
 * and Tactical Voice Modulators (VHF Radio, NASA Space Comm, Cyborg Robot, Deep Stealth).
 */

class AudioEngine {
    constructor() {
        this.audioCtx = null;
        this.micStream = null;
        this.sourceNode = null;
        this.gainNode = null;
        this.analyserNode = null;

        // DSP Graph & Stream Destination
        this.dspDestination = null;
        this.activeDspNodes = [];
        this.voiceFxPreset = 'none'; // 'none' | 'vhf' | 'space' | 'cyborg' | 'stealth'

        // PTT State
        this.isTransmitting = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.onVoiceChunk = null;

        // Voice Note State
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

        // Playback Queue
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
                console.warn('AudioContext resume note:', e);
            }
        }
        return this.audioCtx;
    }

    async initMic() {
        if (this.micStream && this.micStream.active && this.sourceNode) return true;

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

            this.dspDestination = this.audioCtx.createMediaStreamDestination();

            // Connect Base Graph: Mic -> Gain -> Analyser -> Rebuild DSP -> Destination
            this.sourceNode.connect(this.gainNode);
            this.gainNode.connect(this.analyserNode);

            this.applyVoiceFx(this.voiceFxPreset);

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
     * Select & Wire Real-Time Voice Modulator DSP FX
     * @param {'none' | 'vhf' | 'space' | 'cyborg' | 'stealth'} preset
     */
    applyVoiceFx(preset) {
        this.voiceFxPreset = preset || 'none';
        if (!this.audioCtx || !this.gainNode || !this.dspDestination) return;

        // Disconnect old DSP chain
        try {
            this.gainNode.disconnect(this.dspDestination);
        } catch (e) {}

        this.activeDspNodes.forEach(node => {
            try {
                if (node.stop) node.stop();
                node.disconnect();
            } catch (e) {}
        });
        this.activeDspNodes = [];

        const ctx = this.audioCtx;

        if (this.voiceFxPreset === 'none') {
            // Clean direct passthrough
            this.gainNode.connect(this.dspDestination);
            return;
        }

        if (this.voiceFxPreset === 'vhf') {
            // Tactical VHF Walkie-Talkie (300Hz-3.2kHz bandpass + distortion + presence peak)
            const lowCut = ctx.createBiquadFilter();
            lowCut.type = 'highpass';
            lowCut.frequency.value = 380;

            const highCut = ctx.createBiquadFilter();
            highCut.type = 'lowpass';
            highCut.frequency.value = 3200;

            const midPeak = ctx.createBiquadFilter();
            midPeak.type = 'peaking';
            midPeak.frequency.value = 1750;
            midPeak.gain.value = 5.0;

            // Subtle waveshaper saturation for analog radio crunch
            const distortion = ctx.createWaveShaper();
            distortion.curve = this.makeDistortionCurve(20);
            distortion.oversample = '2x';

            this.gainNode.connect(lowCut);
            lowCut.connect(highCut);
            highCut.connect(midPeak);
            midPeak.connect(distortion);
            distortion.connect(this.dspDestination);

            this.activeDspNodes.push(lowCut, highCut, midPeak, distortion);
            return;
        }

        if (this.voiceFxPreset === 'space') {
            // Apollo NASA Space Comm (600Hz highpass, 2.2kHz bandpass, fluttering amplitude)
            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.value = 650;

            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = 2100;
            bp.Q.value = 2.2;

            const amGain = ctx.createGain();
            const amOsc = ctx.createOscillator();
            amOsc.type = 'sine';
            amOsc.frequency.value = 14; // 14Hz flutter
            amOsc.connect(amGain.gain);
            amOsc.start();

            this.gainNode.connect(hp);
            hp.connect(bp);
            bp.connect(amGain);
            amGain.connect(this.dspDestination);

            this.activeDspNodes.push(hp, bp, amGain, amOsc);
            return;
        }

        if (this.voiceFxPreset === 'cyborg') {
            // Robotic Ring Modulator (62Hz carrier multiplication)
            const ringModGain = ctx.createGain();
            ringModGain.gain.value = 0;

            const carrier = ctx.createOscillator();
            carrier.type = 'sawtooth';
            carrier.frequency.value = 62; // Robotic fundamental tone
            carrier.connect(ringModGain.gain);
            carrier.start();

            const dryGain = ctx.createGain();
            dryGain.gain.value = 0.35;

            this.gainNode.connect(ringModGain);
            this.gainNode.connect(dryGain);
            ringModGain.connect(this.dspDestination);
            dryGain.connect(this.dspDestination);

            this.activeDspNodes.push(ringModGain, carrier, dryGain);
            return;
        }

        if (this.voiceFxPreset === 'stealth') {
            // Deep Spec-Ops Stealth (sub-bass boost + low-pass dark muffling)
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 1600;

            const bassBoost = ctx.createBiquadFilter();
            bassBoost.type = 'peaking';
            bassBoost.frequency.value = 110;
            bassBoost.gain.value = 9.0;

            const comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -24;
            comp.knee.value = 20;
            comp.ratio.value = 8;

            this.gainNode.connect(bassBoost);
            bassBoost.connect(lp);
            lp.connect(comp);
            comp.connect(this.dspDestination);

            this.activeDspNodes.push(bassBoost, lp, comp);
            return;
        }

        this.gainNode.connect(this.dspDestination);
    }

    makeDistortionCurve(amount = 20) {
        const k = typeof amount === 'number' ? amount : 20;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;
        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2) / n_samples - 1;
            curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
        }
        return curve;
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
            const options = mimeType ? { mimeType: mimeType, audioBitsPerSecond: 28000 } : {};

            // Record from the DSP-processed destination stream!
            const recordingStream = this.dspDestination ? this.dspDestination.stream : this.micStream;
            this.mediaRecorder = new MediaRecorder(recordingStream, options);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                    if (this.onVoiceChunk && this.isTransmitting) {
                        this.onVoiceChunk(event.data, false);
                    }
                }
            };

            this.mediaRecorder.start(280);
        } catch (e) {
            console.error('Error starting MediaRecorder for PTT:', e);
            this.isTransmitting = false;
        }
    }

    /**
     * Stop Push-to-Talk (PTT) transmission and send Roger beep
     */
    async stopPTT() {
        if (!this.isTransmitting) return null;
        this.isTransmitting = false;

        return new Promise((resolve) => {
            if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
                window.sfx.playRogerBeep();
                resolve(null);
                return;
            }

            this.mediaRecorder.onstop = () => {
                const mime = this.mediaRecorder.mimeType || 'audio/webm';
                const blob = new Blob(this.recordedChunks, { type: mime });

                if (this.onVoiceChunk) {
                    this.onVoiceChunk(blob, true);
                }

                window.sfx.playRogerBeep();
                resolve(blob);
            };

            try {
                this.mediaRecorder.stop();
            } catch (e) {
                window.sfx.playRogerBeep();
                resolve(null);
            }
        });
    }

    /**
     * Start Voice Note Recording
     */
    async startVoiceNote(timerUpdateCallback) {
        if (this.isRecordingVoiceNote) return;

        const micReady = await this.initMic();
        if (!micReady) throw new Error('Microphone permission required for Voice Notes.');

        await this.ensureAudioContext();
        window.sfx.playMicClickIn();

        this.isRecordingVoiceNote = true;
        this.voiceNoteChunks = [];
        this.voiceNoteStartTime = Date.now();

        if (this.voiceNoteTimerInterval) clearInterval(this.voiceNoteTimerInterval);
        this.voiceNoteTimerInterval = setInterval(() => {
            if (timerUpdateCallback && this.isRecordingVoiceNote) {
                const elapsedSec = Math.floor((Date.now() - this.voiceNoteStartTime) / 1000);
                timerUpdateCallback(elapsedSec);
            }
        }, 1000);

        const mime = this.getBestMimeType();
        const options = mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : {};

        const recordingStream = this.dspDestination ? this.dspDestination.stream : this.micStream;
        this.voiceNoteRecorder = new MediaRecorder(recordingStream, options);

        this.voiceNoteRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                this.voiceNoteChunks.push(e.data);
            }
        };

        this.voiceNoteRecorder.start(200);
    }

    /**
     * Stop Voice Note Recording
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

                    source.connect(lowCut);
                    lowCut.connect(highCut);
                    highCut.connect(this.audioCtx.destination);
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
            }, () => {
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
            audio.play().catch(() => {
                if (onEnd) onEnd();
            });
        } catch (e) {
            if (onEnd) onEnd();
        }
    }

    getVisualizerData() {
        if (!this.analyserNode) {
            return { frequencyData: null, timeDomainData: null };
        }
        this.analyserNode.getByteFrequencyData(this.frequencyData);
        this.analyserNode.getByteTimeDomainData(this.timeDomainData);
        return {
            frequencyData: this.frequencyData,
            timeDomainData: this.timeDomainData
        };
    }
}

window.audioEngine = new AudioEngine();
