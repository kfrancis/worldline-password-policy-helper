// Password Policy Helper - Generator Module
// Generates passwords that comply with all 6 policy rules.

import { CHAR_CLASSES, validate } from './validator.js';

/**
 * Get a cryptographically random integer in [0, max).
 * @param {number} max
 * @returns {number}
 */
export function secureRandomInt(max) {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

/**
 * Pick a random character from a string.
 * @param {string} chars
 * @returns {string}
 */
function randomChar(chars) {
  return chars[secureRandomInt(chars.length)];
}

/**
 * Fisher-Yates shuffle (in-place) using crypto random.
 * @param {Array} arr
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Generate a compliant password.
 * @param {number} [length=24]
 * @returns {{ password: string, valid: boolean }}
 */
export function generate(length = 24) {
  length = Math.max(8, Math.min(40, length));

  for (let attempt = 0; attempt < 10; attempt++) {
    const chars = [];
    const counts = new Map();

    function addChar(ch) {
      chars.push(ch);
      counts.set(ch, (counts.get(ch) || 0) + 1);
    }

    // Seed one character from each required class
    addChar(randomChar(CHAR_CLASSES.uppercase));
    addChar(randomChar(CHAR_CLASSES.lowercase));
    addChar(randomChar(CHAR_CLASSES.digit));
    addChar(randomChar(CHAR_CLASSES.special));

    // Build full pool
    const pool = CHAR_CLASSES.uppercase + CHAR_CLASSES.lowercase +
                 CHAR_CLASSES.digit + CHAR_CLASSES.special;

    // Fill remaining slots
    for (let i = chars.length; i < length; i++) {
      let added = false;
      for (let tries = 0; tries < 100; tries++) {
        const ch = randomChar(pool);
        if ((counts.get(ch) || 0) < 2) {
          addChar(ch);
          added = true;
          break;
        }
      }
      if (!added) {
        // Fallback: find any char in pool with count < 2
        for (const ch of pool) {
          if ((counts.get(ch) || 0) < 2) {
            addChar(ch);
            break;
          }
        }
      }
    }

    shuffle(chars);
    const password = chars.join('');
    const result = validate(password);

    if (result.overall) {
      return { password, valid: true };
    }
  }

  // Should never reach here, but safety fallback
  return { password: '', valid: false };
}
