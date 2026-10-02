package com.bluetalk;

import java.util.HashMap;
import java.util.Map;

/**
 * Military CW Morse Code Engine in Java
 */
public class MorseTelegraph {

    private static final Map<Character, String> CHAR_TO_MORSE = new HashMap<>();
    private static final Map<String, Character> MORSE_TO_CHAR = new HashMap<>();

    static {
        String[][] mappings = {
            {"A", ".-"}, {"B", "-..."}, {"C", "-.-."}, {"D", "-.."}, {"E", "."},
            {"F", "..-."}, {"G", "--."}, {"H", "...."}, {"I", ".."}, {"J", ".---"},
            {"K", "-.-"}, {"L", ".-.."}, {"M", "--"}, {"N", "-."}, {"O", "---"},
            {"P", ".--."}, {"Q", "--.-"}, {"R", ".-."}, {"S", "..."}, {"T", "-"},
            {"U", "..-"}, {"V", "...-"}, {"W", ".--"}, {"X", "-..-"}, {"Y", "-.--"},
            {"Z", "--.."}, {"1", ".----"}, {"2", "..---"}, {"3", "...--"},
            {"4", "....-"}, {"5", "....."}, {"6", "-...."}, {"7", "--..."},
            {"8", "---.."}, {"9", "----."}, {"0", "-----"}, {" ", "/"}
        };

        for (String[] pair : mappings) {
            char c = pair[0].charAt(0);
            String code = pair[1];
            CHAR_TO_MORSE.put(c, code);
            if (c != ' ') {
                MORSE_TO_CHAR.put(code, c);
            }
        }
    }

    public static String encode(String text) {
        if (text == null) return "";
        StringBuilder sb = new StringBuilder();
        for (char c : text.toUpperCase().toCharArray()) {
            String code = CHAR_TO_MORSE.get(c);
            if (code != null) {
                sb.append(code).append(" ");
            }
        }
        return sb.toString().trim();
    }

    public static String decode(String morse) {
        if (morse == null || morse.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        String[] words = morse.trim().split("/");
        for (String word : words) {
            String[] tokens = word.trim().split("\\s+");
            for (String token : tokens) {
                Character c = MORSE_TO_CHAR.get(token);
                if (c != null) {
                    sb.append(c);
                }
            }
            sb.append(" ");
        }
        return sb.toString().trim();
    }
}
