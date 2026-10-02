"""
BlueTalk Pro - Morse Code Engine (Pure Python)
Military CW Keyer, Encoder, Decoder, and PARIS Timing Discriminator.
"""

import time
import threading

class MorseEngine:
    MORSE_MAP = {
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
    }

    REVERSE_MAP = {code: char for char, code in MORSE_MAP.items() if char != ' '}

    def __init__(self):
        self.is_key_down = False
        self.key_down_time = 0
        self.current_morse_sequence = ""
        self.decoded_text = ""

        self.letter_timer = None
        self.word_timer = None

        # Callbacks
        self.on_symbol_callback = None  # func(symbol, full_sequence)
        self.on_char_decoded = None     # func(char, full_text)
        self.on_signal_state = None     # func(is_active)

    def text_to_morse(self, text: str) -> str:
        if not text:
            return ""
        return " ".join(self.MORSE_MAP.get(c.upper(), '') for c in text.strip() if c.upper() in self.MORSE_MAP)

    def morse_to_text(self, morse: str) -> str:
        if not morse:
            return ""
        words = morse.strip().split('/')
        result = []
        for word in words:
            chars = [self.REVERSE_MAP.get(token.strip(), '?') for token in word.strip().split() if token.strip()]
            result.append("".join(chars))
        return " ".join(result)

    def press_key(self):
        if self.is_key_down:
            return
        self.is_key_down = True
        self.key_down_time = time.time()

        if self.letter_timer:
            self.letter_timer.cancel()
        if self.word_timer:
            self.word_timer.cancel()

        if self.on_signal_state:
            self.on_signal_state(True)

    def release_key(self):
        if not self.is_key_down:
            return
        self.is_key_down = False
        duration_ms = (time.time() - self.key_down_time) * 1000

        if self.on_signal_state:
            self.on_signal_state(False)

        # Dot vs Dash discrimination (~180ms threshold)
        symbol = '.' if duration_ms < 190 else '-'
        self.current_morse_sequence += symbol

        if self.on_symbol_callback:
            self.on_symbol_callback(symbol, self.current_morse_sequence)

        # Letter finalize timer (350ms pause)
        self.letter_timer = threading.Timer(0.38, self._finalize_letter)
        self.letter_timer.daemon = True
        self.letter_timer.start()

        # Word space timer (900ms pause)
        self.word_timer = threading.Timer(0.95, self._finalize_word_space)
        self.word_timer.daemon = True
        self.word_timer.start()

    def _finalize_letter(self):
        if not self.current_morse_sequence:
            return
        char = self.REVERSE_MAP.get(self.current_morse_sequence, '?')
        self.decoded_text += char
        seq = self.current_morse_sequence
        self.current_morse_sequence = ""

        if self.on_char_decoded:
            self.on_char_decoded(char, self.decoded_text, seq)

    def _finalize_word_space(self):
        if self.decoded_text and not self.decoded_text.endswith(" "):
            self.decoded_text += " "
            if self.on_char_decoded:
                self.on_char_decoded(" ", self.decoded_text, "/")

    def clear(self):
        self.current_morse_sequence = ""
        self.decoded_text = ""
        if self.on_char_decoded:
            self.on_char_decoded("", "", "")
