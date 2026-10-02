/**
 * BlueTalk Pro - International Morse Code Keyer, Synthesizer & Real-Time Decoder
 * Enables authentic military telegraph keying, live signal decoding, and emergency SOS broadcasting.
 */

class MorseManager {
    constructor() {
        this.morseMap = {
            'A': '.-',    'B': '-...',  'C': '-.-.',  'D': '-..',
            'E': '.',     'F': '..-.',  'G': '--.',   'H': '....',
            'I': '..',    'J': '.---',  'K': '-.-',   'L': '.-..',
            'M': '--',    'N': '-.',    'O': '---',   'P': '.--.',
            'Q': '--.-',  'R': '.-.',   'S': '...',   'T': '-',
            'U': '..-',   'V': '...-',  'W': '.--',   'X': '-..-',
            'Y': '-.--',  'Z': '--..',
            '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....',
            '6': '-....', '7': '--...', '8': '---..', '9': '----.', '0': '-----',
            ' ': '/',     '.': '.-.-.-',',': '--..--','?': '..--..',
            '/': '-..-.', '!': '-.-.--', '@': '.--.-.'
        };

        this.reverseMap = {};
        for (const [char, code] of Object.entries(this.morseMap)) {
            if (char !== ' ') this.reverseMap[code] = char;
        }

        // Live manual keyer tracking
        this.isKeyDown = false;
        this.keyDownStartTime = 0;
        this.keyUpTime = 0;
        this.currentLetterMorse = '';
        this.decodedText = '';
        this.letterTimeout = null;
        this.wordTimeout = null;

        // Auto play state
        this.isPlaying = false;
        this.abortController = null;
        this.isSosActive = false;

        // Callbacks for UI updates
        this.onSignalChange = null;  // (active, type) => void
        this.onLetterDecoded = null; // (char, morse) => void
        this.onTextChange = null;    // (fullText, rawMorse) => void
    }

    /**
     * Text to Morse Code string representation
     */
    textToMorse(text) {
        if (!text) return '';
        return text.toUpperCase().split('').map(char => {
            return this.morseMap[char] || '';
        }).filter(Boolean).join(' ');
    }

    /**
     * Morse Code to Text decoder
     */
    morseToText(morse) {
        if (!morse) return '';
        const words = morse.trim().split(/\s{2,}|\//);
        return words.map(word => {
            return word.split(' ').map(code => this.reverseMap[code] || '').join('');
        }).join(' ');
    }

    /**
     * Manual Key Press (mousedown / touchstart / keydown)
     */
    pressKey() {
        if (this.isKeyDown) return;
        this.isKeyDown = true;
        this.keyDownStartTime = Date.now();

        // Clear pending decode timeouts
        if (this.letterTimeout) clearTimeout(this.letterTimeout);
        if (this.wordTimeout) clearTimeout(this.wordTimeout);

        // Sound & visual signal
        window.sfx.startMorseKey(750);
        if (this.onSignalChange) this.onSignalChange(true, 'ACTIVE');
    }

    /**
     * Manual Key Release (mouseup / touchend / keyup)
     */
    releaseKey() {
        if (!this.isKeyDown) return;
        this.isKeyDown = false;
        const duration = Date.now() - this.keyDownStartTime;
        this.keyUpTime = Date.now();

        window.sfx.stopMorseKey();
        if (this.onSignalChange) this.onSignalChange(false, 'IDLE');

        // Dot vs Dash discrimination (Standard threshold ~180ms)
        const symbol = duration < 185 ? '.' : '-';
        this.currentLetterMorse += symbol;

        if (this.onSignalChange) {
            this.onSignalChange(false, symbol === '.' ? 'DOT' : 'DASH');
        }

        // Schedule letter completion (3 units gap ~360ms)
        this.letterTimeout = setTimeout(() => {
            this.finalizeCurrentLetter();
        }, 360);

        // Schedule word space gap (7 units ~850ms)
        this.wordTimeout = setTimeout(() => {
            this.finalizeWordSpace();
        }, 850);
    }

    finalizeCurrentLetter() {
        if (!this.currentLetterMorse) return;
        const decodedChar = this.reverseMap[this.currentLetterMorse] || '?';
        this.decodedText += decodedChar;

        if (this.onLetterDecoded) {
            this.onLetterDecoded(decodedChar, this.currentLetterMorse);
        }
        if (this.onTextChange) {
            this.onTextChange(this.decodedText, this.currentLetterMorse);
        }

        this.currentLetterMorse = '';
    }

    finalizeWordSpace() {
        if (!this.decodedText.endsWith(' ') && this.decodedText.length > 0) {
            this.decodedText += ' ';
            if (this.onTextChange) {
                this.onTextChange(this.decodedText, '/');
            }
        }
    }

    clearDecodedText() {
        this.decodedText = '';
        this.currentLetterMorse = '';
        if (this.onTextChange) this.onTextChange('', '');
    }

    /**
     * Automatically play a string of text or Morse code as audio with live flasher
     */
    async playMorseSequence(textOrMorse, wpm = 18) {
        if (this.isPlaying) this.stopAutoPlay();
        this.isPlaying = true;
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        const isRawMorse = /^[\.\-\s\/]+$/.test(textOrMorse);
        const morseStr = isRawMorse ? textOrMorse : this.textToMorse(textOrMorse);

        // Standard PARIS timing: unit = 1200 / WPM ms
        const unit = Math.round(1200 / Math.max(8, Math.min(30, wpm)));
        const dotDuration = unit;
        const dashDuration = unit * 3;
        const intraCharGap = unit;
        const interCharGap = unit * 3;
        const wordGap = unit * 7;

        try {
            for (let i = 0; i < morseStr.length; i++) {
                if (signal.aborted) break;
                const char = morseStr[i];

                if (char === '.') {
                    window.sfx.playMorseBeep(dotDuration, 750);
                    if (this.onSignalChange) this.onSignalChange(true, 'DOT');
                    await this.delay(dotDuration);
                    if (this.onSignalChange) this.onSignalChange(false, 'IDLE');
                    await this.delay(intraCharGap);
                } else if (char === '-') {
                    window.sfx.playMorseBeep(dashDuration, 750);
                    if (this.onSignalChange) this.onSignalChange(true, 'DASH');
                    await this.delay(dashDuration);
                    if (this.onSignalChange) this.onSignalChange(false, 'IDLE');
                    await this.delay(intraCharGap);
                } else if (char === ' ') {
                    await this.delay(interCharGap - intraCharGap);
                } else if (char === '/') {
                    await this.delay(wordGap - intraCharGap);
                }
            }
        } catch (e) {
            // Cancelled
        } finally {
            this.isPlaying = false;
            if (this.onSignalChange) this.onSignalChange(false, 'IDLE');
        }
    }

    /**
     * Toggle continuous emergency SOS Beacon
     */
    toggleSosBeacon(enable) {
        this.isSosActive = enable;
        if (!enable) {
            this.stopAutoPlay();
            return;
        }

        const runLoop = async () => {
            while (this.isSosActive) {
                await this.playMorseSequence('... --- ...', 16);
                if (!this.isSosActive) break;
                await this.delay(1200);
            }
        };
        runLoop();
    }

    stopAutoPlay() {
        this.isSosActive = false;
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.isPlaying = false;
        if (this.onSignalChange) this.onSignalChange(false, 'IDLE');
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

window.morse = new MorseManager();
