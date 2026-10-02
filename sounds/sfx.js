/**
 * BlueTalk - Procedural Web Audio Sound Effects Synthesizer
 * Generates realistic walkie-talkie, tactical radio, soundboard cues, and Morse audio in real-time.
 * 100% Pure Web Audio API (Zero external audio file dependencies).
 */

class SoundEffects {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.rogerBeepEnabled = true;
        this.staticNoiseEnabled = true;
        this.volume = 0.6;

        // Morse key state
        this.morseOsc = null;
        this.morseGain = null;
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
     * Filtered white noise burst (VHF radio squelch)
     */
    playStaticBurst(duration = 0.09, burstVolume = 0.2) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const bufferSize = Math.max(128, Math.floor(this.ctx.sampleRate * duration));
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1700, now);
        filter.Q.setValueAtTime(1.8, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(burstVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start(now);
    }

    /* ==============================================================
       TACTICAL SOUNDBOARD PROCEDURAL EFFECTS
    ============================================================== */

    /**
     * 1. Red Alert Tactical Siren (dual-tone repeating emergency alarm)
     */
    playRedAlertSiren() {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;

        for (let cycle = 0; cycle < 2; cycle++) {
            const start = now + cycle * 0.45;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(520, start);
            osc.frequency.linearRampToValueAtTime(940, start + 0.22);
            osc.frequency.linearRampToValueAtTime(520, start + 0.42);

            gain.gain.setValueAtTime(0.32 * this.volume, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.44);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(start);
            osc.stop(start + 0.45);
        }
    }

    /**
     * 2. Military Dispatch 10-4 Acknowledged Chime
     */
    playTenFourChime() {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;
        const freqs = [659.25, 880.0, 1174.66]; // E5, A5, D6

        freqs.forEach((freq, idx) => {
            const t = now + idx * 0.08;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t);

            gain.gain.setValueAtTime(0.35 * this.volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.17);
        });
    }

    /**
     * 3. Submarine Sonar Acoustic Ping
     */
    playSonarPing() {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(1380, now + 0.9);

        gain.gain.setValueAtTime(0.45 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

        // Ping harmonic overtone
        const harm = this.ctx.createOscillator();
        const harmGain = this.ctx.createGain();
        harm.type = 'sine';
        harm.frequency.setValueAtTime(2800, now);
        harmGain.gain.setValueAtTime(0.12 * this.volume, now);
        harmGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        harm.connect(harmGain);
        harmGain.connect(this.ctx.destination);

        osc.start(now);
        harm.start(now);
        osc.stop(now + 1.25);
        harm.stop(now + 0.45);
    }

    /**
     * 4. Heavy Static Squelch Blast
     */
    playStaticSquelchBlast() {
        if (!this.enabled) return;
        this.init();
        this.playStaticBurst(0.28, 0.4 * this.volume);
    }

    /**
     * 5. Tactical Air Horn / Klaxon
     */
    playAirHorn() {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;
        const tones = [233, 294, 349, 466]; // Bb chord airhorn

        tones.forEach(f => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(f, now);

            gain.gain.setValueAtTime(0.12 * this.volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.52);
        });
    }

    /* ==============================================================
       MORSE CODE TELEGRAPH KEY & SOUND SYNTHESIZER
    ============================================================== */

    /**
     * Start continuous manual Morse key tone (press key down)
     */
    startMorseKey(freq = 720) {
        if (!this.enabled) return;
        this.init();
        if (this.morseOsc) return;

        const now = this.ctx.currentTime;
        this.morseOsc = this.ctx.createOscillator();
        this.morseGain = this.ctx.createGain();

        this.morseOsc.type = 'sine';
        this.morseOsc.frequency.setValueAtTime(freq, now);

        // Gentle 6ms envelope attack to prevent audio pop clicks
        this.morseGain.gain.setValueAtTime(0.0001, now);
        this.morseGain.gain.linearRampToValueAtTime(0.35 * this.volume, now + 0.006);

        this.morseOsc.connect(this.morseGain);
        this.morseGain.connect(this.ctx.destination);
        this.morseOsc.start(now);
    }

    /**
     * Stop continuous manual Morse key tone (release key)
     */
    stopMorseKey() {
        if (!this.morseOsc || !this.morseGain) return;
        const now = this.ctx.currentTime;
        this.morseGain.gain.setValueAtTime(this.morseGain.gain.value, now);
        this.morseGain.gain.linearRampToValueAtTime(0.0001, now + 0.008);

        setTimeout(() => {
            if (this.morseOsc) {
                try {
                    this.morseOsc.stop();
                    this.morseOsc.disconnect();
                } catch (e) {}
                this.morseOsc = null;
                this.morseGain = null;
            }
        }, 15);
    }

    /**
     * Play single Morse beep (dot = ~70ms, dash = ~210ms)
     */
    playMorseBeep(durationMs = 80, freq = 720) {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;
        const durSec = durationMs / 1000;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.35 * this.volume, now + 0.005);
        gain.gain.setValueAtTime(0.35 * this.volume, now + durSec - 0.006);
        gain.gain.linearRampToValueAtTime(0.0001, now + durSec);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + durSec + 0.01);
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
}

window.sfx = new SoundEffects();
