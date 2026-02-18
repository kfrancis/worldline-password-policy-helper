// Password Policy Helper - Fixer Module
// Fixes existing passwords to comply with all 6 policy rules with minimal changes.

import { CHAR_CLASSES, classifyChar, countChars, validate } from './validator.js';
import { secureRandomInt } from './generator.js';

/**
 * Pick a random character from a class pool that has count < 2.
 * @param {string} pool - characters in the class
 * @param {Map<string, number>} counts - current character counts
 * @returns {string|null} - a valid replacement, or null if none available
 */
function pickAvailable(pool, counts) {
  const candidates = [];
  for (const ch of pool) {
    if ((counts.get(ch) || 0) < 2) {
      candidates.push(ch);
    }
  }
  if (candidates.length === 0) return null;
  return candidates[secureRandomInt(candidates.length)];
}

/**
 * Pick a random available character from any allowed class.
 * @param {Map<string, number>} counts
 * @returns {string|null}
 */
function pickAnyAvailable(counts) {
  const allPools = [
    CHAR_CLASSES.uppercase,
    CHAR_CLASSES.lowercase,
    CHAR_CLASSES.digit,
    CHAR_CLASSES.special,
  ];
  // Shuffle pool order for randomness
  const order = [0, 1, 2, 3].sort(() => secureRandomInt(3) - 1);
  for (const i of order) {
    const ch = pickAvailable(allPools[i], counts);
    if (ch) return ch;
  }
  return null;
}

/**
 * Get the character pool for a given class name.
 * @param {string} className
 * @returns {string}
 */
function getPool(className) {
  return CHAR_CLASSES[className] || '';
}

/**
 * Fix a password to comply with all 6 rules with minimal changes.
 * @param {string} password
 * @returns {{ original: string, fixed: string, changes: Array<{ index: number, from: string, to: string }>, valid: boolean }}
 */
export function fix(password) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = tryFix(password);
    if (result.valid) return result;
  }
  // Final fallback: should essentially never happen
  return tryFix(password);
}

/**
 * Single attempt to fix a password.
 * @param {string} password
 * @returns {{ original: string, fixed: string, changes: Array<{ index: number, from: string, to: string }>, valid: boolean }}
 */
function tryFix(password) {
  const original = password;
  const chars = [...password];
  const counts = countChars(password);
  const changes = [];

  // Phase 1: Fix rule 6 violations (characters appearing > 2 times)
  // Collect all violators first, then process
  const violators = [];
  for (const [ch, n] of counts) {
    if (n > 2) {
      violators.push({ ch, excess: n - 2 });
    }
  }

  for (const { ch, excess } of violators) {
    // Find all indices of this character (from right to left)
    const indices = [];
    for (let i = chars.length - 1; i >= 0; i--) {
      if (chars[i] === ch) indices.push(i);
    }

    // Replace the last `excess` occurrences
    let replaced = 0;
    for (const idx of indices) {
      if (replaced >= excess) break;

      const cls = classifyChar(ch);
      const pool = cls !== 'unknown' ? getPool(cls) : '';
      let replacement = pool ? pickAvailable(pool, counts) : null;

      // If no same-class candidate, try any class
      if (!replacement) {
        replacement = pickAnyAvailable(counts);
      }

      if (replacement) {
        changes.push({ index: idx, from: ch, to: replacement });
        chars[idx] = replacement;
        counts.set(ch, (counts.get(ch) || 1) - 1);
        counts.set(replacement, (counts.get(replacement) || 0) + 1);
        replaced++;
      }
    }
  }

  // Phase 2: Ensure rules 1-5

  // Check for missing character classes
  const classChecks = [
    { name: 'uppercase', test: () => chars.some(c => c >= 'A' && c <= 'Z') },
    { name: 'lowercase', test: () => chars.some(c => c >= 'a' && c <= 'z') },
    { name: 'digit', test: () => chars.some(c => c >= '0' && c <= '9') },
    { name: 'special', test: () => chars.some(c => CHAR_CLASSES.special.includes(c)) },
  ];

  for (const check of classChecks) {
    if (check.test()) continue;

    // Need to add a character of this class
    // Find a position to replace: pick a char from a class that has surplus (>1 representative)
    const replacement = pickAvailable(getPool(check.name), counts);
    if (!replacement) continue;

    // Count representatives per class
    const classCounts = { uppercase: 0, lowercase: 0, digit: 0, special: 0 };
    for (const c of chars) {
      const cl = classifyChar(c);
      if (cl !== 'unknown') classCounts[cl]++;
    }

    // Find a position from a class with surplus, preferring classes with most representatives
    let bestIdx = -1;
    let bestSurplus = 0;
    for (let i = chars.length - 1; i >= 0; i--) {
      const cl = classifyChar(chars[i]);
      if (cl === check.name) continue; // don't replace within same class
      if (cl === 'unknown') {
        // Always prefer replacing unknown chars
        bestIdx = i;
        break;
      }
      const surplus = classCounts[cl];
      if (surplus > 1 && surplus > bestSurplus) {
        bestSurplus = surplus;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      // No good replacement position; use last position
      bestIdx = chars.length - 1;
    }

    const oldCh = chars[bestIdx];
    changes.push({ index: bestIdx, from: oldCh, to: replacement });
    chars[bestIdx] = replacement;
    counts.set(oldCh, (counts.get(oldCh) || 1) - 1);
    counts.set(replacement, (counts.get(replacement) || 0) + 1);
  }

  // Handle minimum length (rule 1)
  while (chars.length < 8) {
    const ch = pickAnyAvailable(counts);
    if (!ch) break;
    const idx = chars.length;
    chars.push(ch);
    counts.set(ch, (counts.get(ch) || 0) + 1);
    changes.push({ index: idx, from: '', to: ch });
  }

  // Also replace any 'unknown' class characters that remain
  for (let i = 0; i < chars.length; i++) {
    if (classifyChar(chars[i]) === 'unknown') {
      const replacement = pickAnyAvailable(counts);
      if (replacement) {
        const oldCh = chars[i];
        changes.push({ index: i, from: oldCh, to: replacement });
        counts.set(oldCh, (counts.get(oldCh) || 1) - 1);
        counts.set(replacement, (counts.get(replacement) || 0) + 1);
        chars[i] = replacement;
      }
    }
  }

  const fixed = chars.join('');
  const validation = validate(fixed);

  return {
    original,
    fixed,
    changes,
    valid: validation.overall,
  };
}
