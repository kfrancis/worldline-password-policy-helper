#!/usr/bin/env node
// Package the extension into a .zip file ready for Chrome Web Store / Edge Add-ons.
// Run:  node tools/package.mjs
//
// Outputs:  dist/password-policy-helper-<version>.zip
//
// Excludes: tests/, tools/, .git/, .gitignore, *.md (except LICENSE which is kept),
//           password-policy-helper-spec.md, node_modules/, dist/, .claude/

import { readFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'fs';
import { join, relative, sep } from 'path';
import { createWriteStream } from 'fs';
import { execSync } from 'child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

// ── Files to include ────────────────────────────────────────────────
const INCLUDE = [
  'manifest.json',
  'LICENSE',
  'lib/validator.js',
  'lib/generator.js',
  'lib/fixer.js',
  'popup/popup.html',
  'popup/popup.css',
  'popup/popup.js',
  'content/content.js',
  'icons/icon-16.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
];

// ── Read manifest for version ───────────────────────────────────────
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const version = manifest.version;
const zipName = `password-policy-helper-${version}.zip`;

// ── Ensure dist/ exists ─────────────────────────────────────────────
const distDir = join(ROOT, 'dist');
if (!existsSync(distDir)) mkdirSync(distDir);

// ── Validate all files exist ────────────────────────────────────────
console.log('Validating files...');
const missing = INCLUDE.filter(f => !existsSync(join(ROOT, f)));
if (missing.length > 0) {
  console.error('ERROR: Missing files:');
  missing.forEach(f => console.error(`  - ${f}`));
  process.exit(1);
}

// ── Build the zip using PowerShell (Windows) or zip (Unix) ──────────
// We use a temp directory to stage the exact files, then compress.
import { cpSync, rmSync } from 'fs';

const stageDir = join(distDir, '_stage');
if (existsSync(stageDir)) rmSync(stageDir, { recursive: true });
mkdirSync(stageDir, { recursive: true });

console.log(`Staging ${INCLUDE.length} files...`);
for (const file of INCLUDE) {
  const src = join(ROOT, file);
  const dest = join(stageDir, file);
  const destDir = join(dest, '..');
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  cpSync(src, dest);
}

// Build zip
const zipPath = join(distDir, zipName);
console.log(`Creating ${zipName}...`);

// Remove old zip if it exists
if (existsSync(zipPath)) {
  rmSync(zipPath);
}

try {
  // Use PowerShell on Windows
  const psCommand = `Compress-Archive -Path '${stageDir}${sep}*' -DestinationPath '${zipPath}' -Force`;
  execSync(`powershell -NoProfile -Command "${psCommand}"`, { stdio: 'pipe' });
} catch {
  try {
    // Fallback to zip command (macOS/Linux)
    execSync(`cd "${stageDir}" && zip -r "${zipPath}" .`, { stdio: 'pipe' });
  } catch (e2) {
    console.error('ERROR: Could not create zip file. Install zip or use PowerShell.');
    process.exit(1);
  }
}

// Clean up staging
rmSync(stageDir, { recursive: true });

// Report
const stat = statSync(zipPath);
const sizeKB = (stat.size / 1024).toFixed(1);
console.log('');
console.log(`✓ ${zipPath}`);
console.log(`  Size: ${sizeKB} KB`);
console.log(`  Version: ${version}`);
console.log(`  Files: ${INCLUDE.length}`);
console.log('');
console.log('Ready to upload to:');
console.log('  • Chrome Web Store:  https://chrome.google.com/webstore/devconsole/');
console.log('  • Edge Add-ons:      https://partner.microsoft.com/dashboard/microsoftedge/');
