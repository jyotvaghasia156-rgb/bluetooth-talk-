/**
 * BlueTalk - Procedural Web Audio Sound Effects Synthesizer
 * Generates realistic walkie-talkie and tactical radio sounds in real-time
 */

class SoundEffects {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.rogerBeepEnabled = true;
        this.staticNoiseEnabled = true;
        this.volume = 0.5;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Radio PTT Mic Click-in (when keying the mic)
     */
    playMicClickIn() {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;

        // Quick low frequency pop followed by short static burst
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.04);

        gain.gain.setValueAtTime(0.3 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);

        this.playStaticBurst(0.06, 0.15 * this.volume);
    }

    /**
     * Classic Roger Beep (Quindar tone style)
     */
    playRogerBeep() {
        if (!this.enabled || !this.rogerBeepEnabled) return;
        this.init();
        const now = this.ctx.currentTime;

        // First high beep (NASA/Motorola style)
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(1750, now);
        gain1.gain.setValueAtTime(0.35 * this.volume, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc1.connect(gain1);
        gain1.connect(this.ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.095);

        // Second tone
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(2475, now + 0.1);
        gain2.gain.setValueAtTime(0.35 * this.volume, now + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

        osc2.connect(gain2);
        gain2.connect(this.ctx.destination);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.195);
    }

    /**
     * Squelch tail / static release click
     */
    playSquelchTail() {
        if (!this.enabled) return;
        this.init();
        this.playStaticBurst(0.08, 0.25 * this.volume);
    }

    /**
     * Static noise burst (filtered white noise)
     */
    playStaticBurst(duration = 0.08, burstVolume = 0.2) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        // Bandpass filter for radio sound
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1600, now);
        filter.Q.setValueAtTime(1.5, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(burstVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start(now);
    }

    /**
     * Message Received Chime
     */
    playMessageChime() {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);

        gain.gain.setValueAtTime(0.2 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
    }

    /**
     * Connection Established Tone
     */
    playConnectedTone() {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;

        [440, 660, 880].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);

            gain.gain.setValueAtTime(0.25 * this.volume, now + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.1);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.12);
        });
    }

    /**
     * Connection Lost / Disconnected Tone
     */
    playDisconnectedTone() {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;

        [660, 440, 220].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);

            gain.gain.setValueAtTime(0.2 * this.volume, now + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.12);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.14);
        });
    }
}

window.sfx = new SoundEffects();
