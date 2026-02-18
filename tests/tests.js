// Password Policy Helper - Unit Tests

import { validate, countChars, classifyChar, CHAR_CLASSES, SPECIAL_CHARS } from '../lib/validator.js';
import { generate } from '../lib/generator.js';
import { fix } from '../lib/fixer.js';

// --- Minimal test framework ---
let passed = 0;
let failed = 0;
const resultsEl = document.getElementById('results');

function log(status, message) {
  const el = document.createElement('div');
  el.className = `test ${status.toLowerCase()}`;
  el.textContent = `[${status}] ${message}`;
  resultsEl.appendChild(el);
}

function section(name) {
  const el = document.createElement('h2');
  el.textContent = name;
  resultsEl.appendChild(el);
}

function assert(condition, message) {
  if (condition) { passed++; log('PASS', message); }
  else { failed++; log('FAIL', message); }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Helper: check a specific rule by id
function rulePass(result, ruleId) {
  return result.rules.find(r => r.id === ruleId).pass;
}

// ============================================================
// VALIDATOR TESTS
// ============================================================
section('Validator - classifyChar');
assertEqual(classifyChar('A'), 'uppercase', 'A is uppercase');
assertEqual(classifyChar('z'), 'lowercase', 'z is lowercase');
assertEqual(classifyChar('5'), 'digit', '5 is digit');
assertEqual(classifyChar('#'), 'special', '# is special');
assertEqual(classifyChar('-'), 'special', '- is special');
assertEqual(classifyChar('~'), 'unknown', '~ is unknown');
assertEqual(classifyChar(' '), 'unknown', 'space is unknown');

section('Validator - countChars');
{
  const c = countChars('aAbBaA');
  assertEqual(c.get('a'), 2, 'count a=2');
  assertEqual(c.get('A'), 2, 'count A=2');
  assertEqual(c.get('b'), 1, 'count b=1');
  assertEqual(c.get('B'), 1, 'count B=1');
}

section('Validator - Rule 1: Minimum 8 characters');
assert(!rulePass(validate('Ab1!xyz'), 1), '7 chars fails');
assert(rulePass(validate('Ab1!xyzw'), 1), '8 chars passes');
assert(rulePass(validate('Ab1!xyzwqqqq'), 1), '12 chars passes');
assert(!rulePass(validate(''), 1), 'empty fails');

section('Validator - Rule 2: At least 1 uppercase');
assert(!rulePass(validate('abcdefg1!'), 2), 'no uppercase fails');
assert(rulePass(validate('Abcdefg1!'), 2), 'has uppercase passes');

section('Validator - Rule 3: At least 1 lowercase');
assert(!rulePass(validate('ABCDEFG1!'), 3), 'no lowercase fails');
assert(rulePass(validate('ABCDEFg1!'), 3), 'has lowercase passes');

section('Validator - Rule 4: At least 1 special character');
assert(!rulePass(validate('Abcdefg1'), 4), 'no special fails');
// Test each special character
for (const sp of SPECIAL_CHARS) {
  assert(rulePass(validate('Abcdefg1' + sp), 4), `special char '${sp}' passes`);
}

section('Validator - Rule 5: At least 1 digit');
assert(!rulePass(validate('Abcdefg!'), 5), 'no digit fails');
assert(rulePass(validate('Abcdefg1!'), 5), 'has digit passes');

section('Validator - Rule 6: No character >2 times');
assert(!rulePass(validate('AAxAbcd1!'), 6), 'A appears 3x fails');
assert(rulePass(validate('AAxxbcd1!'), 6), 'A:2,x:2 passes');
assert(!rulePass(validate('aaaxBcd1!'), 6), 'a appears 3x fails');
// Case sensitivity
assert(rulePass(validate('AAaabcd1!'), 6), 'A:2,a:2 passes (case-sensitive)');
assert(!rulePass(validate('AAAabcd1!'), 6), 'A:3 fails');
assert(!rulePass(validate('aaaxyzB1!'), 6), 'a:3 fails');

section('Validator - Combined');
{
  const good = validate('Abcdef1#');
  assert(good.overall, 'Abcdef1# passes all rules');
}
{
  const bad = validate('aaa');
  assert(!bad.overall, '"aaa" fails overall');
  assert(!rulePass(bad, 1), '"aaa" fails rule 1');
  assert(!rulePass(bad, 2), '"aaa" fails rule 2');
  assert(rulePass(bad, 3), '"aaa" passes rule 3');
  assert(!rulePass(bad, 4), '"aaa" fails rule 4');
  assert(!rulePass(bad, 5), '"aaa" fails rule 5');
  assert(!rulePass(bad, 6), '"aaa" fails rule 6');
}

// ============================================================
// GENERATOR TESTS
// ============================================================
section('Generator - Basic');
{
  const r = generate(24);
  assert(r.valid, 'generate(24) produces valid password');
  assertEqual(r.password.length, 24, 'generate(24) length is 24');
}
{
  const r = generate(8);
  assert(r.valid, 'generate(8) produces valid password');
  assertEqual(r.password.length, 8, 'generate(8) length is 8');
}
{
  const r = generate(40);
  assert(r.valid, 'generate(40) produces valid password');
  assertEqual(r.password.length, 40, 'generate(40) length is 40');
}

section('Generator - Clamping');
{
  const r = generate(3);
  assertEqual(r.password.length, 8, 'generate(3) clamps to 8');
  assert(r.valid, 'generate(3) clamped result is valid');
}
{
  const r = generate(100);
  assertEqual(r.password.length, 40, 'generate(100) clamps to 40');
  assert(r.valid, 'generate(100) clamped result is valid');
}

section('Generator - Bulk (1000 passwords)');
{
  let allValid = true;
  let allCorrectChars = true;
  const allowedChars = CHAR_CLASSES.uppercase + CHAR_CLASSES.lowercase +
                       CHAR_CLASSES.digit + CHAR_CLASSES.special;
  for (let i = 0; i < 1000; i++) {
    const r = generate(24);
    if (!r.valid) { allValid = false; break; }
    for (const ch of r.password) {
      if (!allowedChars.includes(ch)) { allCorrectChars = false; break; }
    }
    if (!allCorrectChars) break;
  }
  assert(allValid, '1000 generated passwords all validate');
  assert(allCorrectChars, '1000 generated passwords use only allowed characters');
}

section('Generator - Randomness');
{
  const passwords = new Set();
  for (let i = 0; i < 100; i++) {
    passwords.add(generate(24).password);
  }
  assert(passwords.size > 1, '100 generated passwords are not all identical');
  assert(passwords.size >= 90, '100 generated passwords have high uniqueness (>=90 unique)');
}

// ============================================================
// FIXER TESTS
// ============================================================
section('Fixer - Already valid');
{
  const r = fix('Abcdef1#');
  assert(r.valid, 'already valid password stays valid');
  assertEqual(r.changes.length, 0, 'no changes needed for valid password');
  assertEqual(r.fixed, 'Abcdef1#', 'fixed equals original for valid password');
}

section('Fixer - Basic repetition fix');
{
  // A appears 3 times, needs 1 fix
  const r = fix('AAAdef1#');
  assert(r.valid, 'fixed password is valid');
  assertEqual(r.fixed.length, 8, 'length preserved');
  // Count A's in fixed
  const aCount = [...r.fixed].filter(c => c === 'A').length;
  assert(aCount <= 2, 'A appears at most 2 times after fix');
  assert(r.changes.length >= 1, 'at least 1 change made');
}

section('Fixer - Same-class substitution');
{
  // Uppercase excess: replacement should be uppercase
  const r = fix('AAABcde1#');
  assert(r.valid, 'fixed is valid');
  for (const change of r.changes) {
    if (classifyChar(change.from) === 'uppercase') {
      assertEqual(classifyChar(change.to), 'uppercase',
        `uppercase '${change.from}' replaced with uppercase '${change.to}'`);
    }
  }
}
{
  // Lowercase excess
  const r = fix('aaaBCDE1#');
  assert(r.valid, 'fixed is valid');
  for (const change of r.changes) {
    if (classifyChar(change.from) === 'lowercase') {
      assertEqual(classifyChar(change.to), 'lowercase',
        `lowercase '${change.from}' replaced with lowercase '${change.to}'`);
    }
  }
}
{
  // Digit excess
  const r = fix('111Abcd!x');
  assert(r.valid, 'fixed is valid');
  for (const change of r.changes) {
    if (classifyChar(change.from) === 'digit') {
      assertEqual(classifyChar(change.to), 'digit',
        `digit '${change.from}' replaced with digit '${change.to}'`);
    }
  }
}

section('Fixer - Multiple violators');
{
  // A:3 and a:3
  const r = fix('AAAaaa1#');
  assert(r.valid, 'fixed is valid');
  const fixedCounts = countChars(r.fixed);
  for (const [ch, n] of fixedCounts) {
    assert(n <= 2, `char '${ch}' appears ${n} times (<=2)`);
  }
}

section('Fixer - Missing class after fix');
{
  // All lowercase + digits only, missing uppercase and special
  const r = fix('abcabcab');
  assert(r.valid, 'fixed is valid');
  assert(/[A-Z]/.test(r.fixed), 'fixed has uppercase');
  assert(/[#?!@$%^&*\-]/.test(r.fixed), 'fixed has special');
}

section('Fixer - Short password');
{
  const r = fix('Ab1#');
  assert(r.valid, 'fixed is valid');
  assert(r.fixed.length >= 8, 'fixed is at least 8 chars');
}

section('Fixer - Unknown characters replaced');
{
  const r = fix('Ab1#~xyz');
  assert(r.valid, 'fixed is valid');
  for (const ch of r.fixed) {
    assert(classifyChar(ch) !== 'unknown', `no unknown chars in fixed (found '${ch}')`);
  }
}

section('Fixer - Minimal changes');
{
  // Only 1 excess character (A appears 3x), should need exactly 1 change for rule 6
  const r = fix('AAbAde1#');
  assert(r.valid, 'fixed is valid');
  // Count changes that are for rule 6 (replacing the char that was excess)
  const rule6Changes = r.changes.filter(c => c.from === 'A');
  assertEqual(rule6Changes.length, 1, 'exactly 1 change for the excess A');
}

section('Fixer - Bulk (100 known-bad passwords)');
{
  let allValid = true;
  const badPasswords = [];
  // Generate passwords with deliberate violations
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#?!@$%^&*-';
  for (let i = 0; i < 100; i++) {
    // Create a password with 3+ of the same char
    const ch = alpha[i % alpha.length];
    let pwd = ch.repeat(4) + 'Xy1#abcd';
    badPasswords.push(pwd);
  }
  for (const pwd of badPasswords) {
    const r = fix(pwd);
    if (!r.valid) {
      allValid = false;
      log('FAIL', `fixer failed for input: ${pwd} -> ${r.fixed}`);
      break;
    }
  }
  assert(allValid, '100 known-bad passwords all fixed successfully');
}

// ============================================================
// SUMMARY
// ============================================================
const summaryEl = document.getElementById('summary');
const total = passed + failed;
summaryEl.className = `summary ${failed === 0 ? 'all-pass' : 'has-fail'}`;
summaryEl.textContent = `Results: ${passed}/${total} passed, ${failed} failed`;
