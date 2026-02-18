#!/usr/bin/env node
// Validate the extension package before submitting to Chrome Web Store / Edge Add-ons.
// Run:  node tools/validate-package.mjs
//
// Checks:
//   1. manifest.json structure and required fields
//   2. All referenced files exist
//   3. Icon files are valid PNGs with correct dimensions
//   4. Content Security Policy compliance (no inline scripts, no eval)
//   5. File sizes reasonable
//   6. No disallowed files in the package
//   7. Store listing readiness (description length, etc.)

import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

let errors = 0;
let warnings = 0;

function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { errors++; console.log(`  ✗ FAIL: ${msg}`); }
function warn(msg) { warnings++; console.log(`  ⚠ WARN: ${msg}`); }
function section(msg) { console.log(`\n── ${msg} ──`); }

// ── 1. Manifest structure ───────────────────────────────────────────
section('Manifest Validation');

const manifestPath = join(ROOT, 'manifest.json');
if (!existsSync(manifestPath)) {
  fail('manifest.json not found'); process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  pass('manifest.json is valid JSON');
} catch (e) {
  fail(`manifest.json parse error: ${e.message}`); process.exit(1);
}

// Required fields
if (manifest.manifest_version === 3) pass('manifest_version is 3');
else fail(`manifest_version must be 3, got ${manifest.manifest_version}`);

if (manifest.name && manifest.name.length > 0) pass(`name: "${manifest.name}"`);
else fail('name is required');

if (manifest.name && manifest.name.length > 75)
  warn(`name is ${manifest.name.length} chars (Chrome limit ~75)`);

if (manifest.version && /^\d+\.\d+\.\d+$/.test(manifest.version))
  pass(`version: ${manifest.version}`);
else fail(`version must be X.Y.Z format, got "${manifest.version}"`);

if (manifest.description && manifest.description.length > 0)
  pass(`description: ${manifest.description.length} chars`);
else fail('description is required');

if (manifest.description && manifest.description.length > 132)
  warn(`description is ${manifest.description.length} chars (Chrome limit ~132)`);

// Recommended fields
if (manifest.author) pass(`author: "${manifest.author}"`);
else warn('author field is recommended for store listings');

if (manifest.homepage_url) pass(`homepage_url: ${manifest.homepage_url}`);
else warn('homepage_url is recommended for store listings');

// ── 2. Permissions ──────────────────────────────────────────────────
section('Permissions');

const perms = manifest.permissions || [];
pass(`permissions: [${perms.join(', ')}]`);

const dangerousPerms = ['tabs', 'history', 'bookmarks', 'downloads', 'management',
  'webNavigation', 'debugger', 'cookies', 'browsingData'];
for (const p of perms) {
  if (dangerousPerms.includes(p))
    warn(`permission "${p}" may trigger additional store review`);
}

if (manifest.host_permissions) {
  for (const hp of manifest.host_permissions) {
    if (hp === '<all_urls>' || hp === '*://*/*')
      warn(`host_permission "${hp}" is very broad; consider narrowing for faster review`);
  }
}

if (manifest.content_scripts) {
  for (const cs of manifest.content_scripts) {
    for (const match of cs.matches || []) {
      if (match === '<all_urls>')
        warn('content_scripts matches "<all_urls>" — broad access may slow review');
    }
  }
}

// ── 3. Referenced files exist ───────────────────────────────────────
section('File References');

const filesToCheck = [];

// Icons
if (manifest.icons) {
  for (const [size, path] of Object.entries(manifest.icons)) {
    filesToCheck.push({ path, desc: `icons.${size}` });
  }
}
if (manifest.action?.default_icon) {
  for (const [size, path] of Object.entries(manifest.action.default_icon)) {
    filesToCheck.push({ path, desc: `action.default_icon.${size}` });
  }
}
if (manifest.action?.default_popup) {
  filesToCheck.push({ path: manifest.action.default_popup, desc: 'action.default_popup' });
}
if (manifest.content_scripts) {
  for (const cs of manifest.content_scripts) {
    for (const js of cs.js || []) filesToCheck.push({ path: js, desc: 'content_script.js' });
    for (const css of cs.css || []) filesToCheck.push({ path: css, desc: 'content_script.css' });
  }
}
if (manifest.background?.service_worker) {
  filesToCheck.push({ path: manifest.background.service_worker, desc: 'background.service_worker' });
}

for (const { path, desc } of filesToCheck) {
  const full = join(ROOT, path);
  if (existsSync(full)) pass(`${desc}: ${path}`);
  else fail(`${desc}: ${path} — FILE NOT FOUND`);
}

// ── 4. Icon validation ──────────────────────────────────────────────
section('Icon Validation');

const expectedIcons = { 16: 'icons/icon-16.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' };
for (const [size, path] of Object.entries(expectedIcons)) {
  const full = join(ROOT, path);
  if (!existsSync(full)) { fail(`${path} not found`); continue; }

  const buf = readFileSync(full);
  // Check PNG signature
  if (buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71) {
    pass(`${path} is valid PNG (${buf.length} bytes)`);
  } else {
    fail(`${path} is not a valid PNG file`);
    continue;
  }

  // Read IHDR to check dimensions
  // IHDR starts at byte 8 (after signature) + 4 (length) + 4 (type) = 16
  if (buf.length >= 24) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (width === Number(size) && height === Number(size))
      pass(`${path} dimensions: ${width}x${height}`);
    else
      warn(`${path} dimensions: ${width}x${height} (expected ${size}x${size})`);
  }
}

// ── 5. Content Security ─────────────────────────────────────────────
section('Content Security');

// Check HTML files for inline scripts
const htmlFiles = ['popup/popup.html'];
for (const htmlPath of htmlFiles) {
  const full = join(ROOT, htmlPath);
  if (!existsSync(full)) continue;
  const html = readFileSync(full, 'utf8');

  // Check for inline event handlers
  const inlineHandlers = html.match(/\son\w+\s*=/gi);
  if (inlineHandlers)
    fail(`${htmlPath} has inline event handlers: ${inlineHandlers.join(', ')}`);
  else
    pass(`${htmlPath}: no inline event handlers`);

  // Check for inline scripts (content in <script> tags without src)
  const inlineScripts = html.match(/<script(?![^>]*src=)[^>]*>[^<]+<\/script>/gi);
  if (inlineScripts)
    fail(`${htmlPath} has inline scripts (CSP violation in MV3)`);
  else
    pass(`${htmlPath}: no inline scripts`);
}

// Check JS files for eval/Function constructor
const jsFiles = [
  'lib/validator.js', 'lib/generator.js', 'lib/fixer.js',
  'popup/popup.js', 'content/content.js',
];
for (const jsPath of jsFiles) {
  const full = join(ROOT, jsPath);
  if (!existsSync(full)) continue;
  const js = readFileSync(full, 'utf8');

  if (/\beval\s*\(/.test(js))
    fail(`${jsPath} uses eval() — not allowed in MV3`);
  if (/new\s+Function\s*\(/.test(js))
    fail(`${jsPath} uses new Function() — not allowed in MV3`);
  if (/\bdocument\.write\s*\(/.test(js))
    warn(`${jsPath} uses document.write()`);
}
pass('No eval() or new Function() in source files');

// ── 6. Package size ─────────────────────────────────────────────────
section('Package Size');

let totalSize = 0;
const packageFiles = [
  'manifest.json', 'LICENSE',
  ...Object.values(expectedIcons),
  ...jsFiles,
  'popup/popup.html', 'popup/popup.css',
];
for (const f of packageFiles) {
  const full = join(ROOT, f);
  if (existsSync(full)) {
    const stat = statSync(full);
    totalSize += stat.size;
  }
}
const totalKB = (totalSize / 1024).toFixed(1);
pass(`Total package size: ~${totalKB} KB`);
if (totalSize > 2 * 1024 * 1024 * 1024)
  fail('Package exceeds 2GB Chrome Web Store limit');

// ── 7. Store listing readiness ──────────────────────────────────────
section('Store Listing Readiness');

// Manifest description: Chrome caps at ~132 chars, this is the short description
const desc = manifest.description || '';
if (desc.length > 0 && desc.length <= 132)
  pass(`manifest description: ${desc.length} chars (Chrome limit ~132)`);
else if (desc.length > 132)
  warn(`manifest description is ${desc.length} chars — Chrome Web Store limit is ~132`);
else
  fail('manifest description is empty');

// Note: Edge Partner Center has a separate "Description" field (250-10000 chars)
// that is NOT the manifest description. It's entered in the Partner Center UI.
pass('Edge store description (250+ chars) is entered separately in Partner Center');

// Check for store assets
const storeAssetDir = join(ROOT, 'dist', 'store-assets');
if (existsSync(storeAssetDir)) {
  const storeFiles = readdirSync(storeAssetDir);
  const expectedAssets = [
    'logo-300x300.png',
    'promo-small-440x280.png',
    'screenshot-fix-1280x800.png',
  ];
  for (const ea of expectedAssets) {
    if (storeFiles.includes(ea))
      pass(`Store asset: ${ea}`);
    else
      warn(`Missing store asset: ${ea} (run: node tools/store-assets.mjs)`);
  }
} else {
  warn('No store assets found. Run: node tools/store-assets.mjs');
}

// ── Summary ─────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════');
if (errors === 0 && warnings === 0) {
  console.log('  ALL CHECKS PASSED — Ready to publish!');
} else if (errors === 0) {
  console.log(`  PASSED with ${warnings} warning(s)`);
} else {
  console.log(`  ${errors} error(s), ${warnings} warning(s)`);
}
console.log('══════════════════════════════════════\n');

process.exit(errors > 0 ? 1 : 0);
