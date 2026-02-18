// Password Policy Helper - Validator Module
// Validates passwords against the 6-rule policy.

export const SPECIAL_CHARS = '#?!@$%^&*-';

export const CHAR_CLASSES = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  digit: '0123456789',
  special: SPECIAL_CHARS,
};

/**
 * Classify a single character into its character class.
 * @param {string} ch
 * @returns {'uppercase'|'lowercase'|'digit'|'special'|'unknown'}
 */
export function classifyChar(ch) {
  if (ch >= 'A' && ch <= 'Z') return 'uppercase';
  if (ch >= 'a' && ch <= 'z') return 'lowercase';
  if (ch >= '0' && ch <= '9') return 'digit';
  if (SPECIAL_CHARS.includes(ch)) return 'special';
  return 'unknown';
}

/**
 * Count occurrences of each character (case-sensitive).
 * @param {string} password
 * @returns {Map<string, number>}
 */
export function countChars(password) {
  const counts = new Map();
  for (const ch of password) {
    counts.set(ch, (counts.get(ch) || 0) + 1);
  }
  return counts;
}

/**
 * Validate a password against all 6 rules.
 * @param {string} password
 * @returns {{ overall: boolean, rules: Array<{ id: number, name: string, description: string, pass: boolean, detail?: string }> }}
 */
export function validate(password) {
  const counts = countChars(password);

  // Rule 6: find violators
  const violators = [];
  for (const [ch, n] of counts) {
    if (n > 2) violators.push(`'${ch}' appears ${n}x`);
  }

  const rules = [
    {
      id: 1,
      name: 'minLength',
      description: 'At least 8 characters',
      pass: password.length >= 8,
    },
    {
      id: 2,
      name: 'uppercase',
      description: 'At least 1 uppercase letter',
      pass: /[A-Z]/.test(password),
    },
    {
      id: 3,
      name: 'lowercase',
      description: 'At least 1 lowercase letter',
      pass: /[a-z]/.test(password),
    },
    {
      id: 4,
      name: 'special',
      description: 'At least 1 special character (#?!@$%^&*-)',
      pass: /[#?!@$%^&*\-]/.test(password),
    },
    {
      id: 5,
      name: 'digit',
      description: 'At least 1 digit',
      pass: /[0-9]/.test(password),
    },
    {
      id: 6,
      name: 'maxRepeat',
      description: 'No character appears more than 2 times',
      pass: violators.length === 0,
      detail: violators.length > 0 ? violators.join(', ') : undefined,
    },
  ];

  return {
    overall: rules.every(r => r.pass),
    rules,
  };
}
