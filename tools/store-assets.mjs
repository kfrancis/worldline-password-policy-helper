#!/usr/bin/env node
// Generate store listing assets for Chrome Web Store and Edge Add-ons.
// Run:  node tools/store-assets.mjs
//
// Outputs to dist/store-assets/:
//   - logo-300x300.png         (Edge store listing logo, 1:1 aspect ratio)
//   - promo-small-440x280.png  (Edge small promotional tile)
//   - promo-large-1400x560.png (Edge large promotional tile)
//   - promo-chrome-440x280.png (Chrome promotional image)
//   - screenshot-fix.png       (1280x800 screenshot placeholder - Fix tab)
//   - screenshot-generate.png  (1280x800 screenshot placeholder - Generate tab)
//   - screenshot-validate.png  (1280x800 screenshot placeholder - Validate tab)
//
// These are placeholder/template images. Replace screenshot-*.png with
// actual browser screenshots before publishing.

import { writeFileSync, mkdirSync, existsSync } from 'fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

// ── Reuse the PNG encoder from generate-icons.mjs ───────────────────
function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function adler32(data) {
  let a = 1, b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function pngChunk(type, data) {
  const buf = new Uint8Array(4 + type.length + data.length + 4);
  const view = new DataView(buf.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < type.length; i++) buf[4 + i] = type.charCodeAt(i);
  buf.set(data, 4 + type.length);
  const crcData = new Uint8Array(type.length + data.length);
  for (let i = 0; i < type.length; i++) crcData[i] = type.charCodeAt(i);
  crcData.set(data, type.length);
  view.setUint32(4 + type.length + data.length, crc32(crcData));
  return buf;
}

function createPNG(width, height, pixels) {
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 6;

  const rawSize = height * (1 + width * 4);
  const raw = new Uint8Array(rawSize);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      raw[offset++] = pixels[srcIdx];
      raw[offset++] = pixels[srcIdx + 1];
      raw[offset++] = pixels[srcIdx + 2];
      raw[offset++] = pixels[srcIdx + 3];
    }
  }

  const maxBlock = 65535;
  const numBlocks = Math.ceil(raw.length / maxBlock);
  const deflated = new Uint8Array(2 + raw.length + 5 * numBlocks + 4);
  let d = 0;
  deflated[d++] = 0x78; deflated[d++] = 0x01;
  for (let i = 0; i < numBlocks; i++) {
    const start = i * maxBlock;
    const end = Math.min(start + maxBlock, raw.length);
    const len = end - start;
    deflated[d++] = (i === numBlocks - 1) ? 1 : 0;
    deflated[d++] = len & 0xFF; deflated[d++] = (len >> 8) & 0xFF;
    deflated[d++] = (~len) & 0xFF; deflated[d++] = ((~len) >> 8) & 0xFF;
    deflated.set(raw.subarray(start, end), d); d += len;
  }
  const a = adler32(raw);
  deflated[d++] = (a >> 24) & 0xFF; deflated[d++] = (a >> 16) & 0xFF;
  deflated[d++] = (a >> 8) & 0xFF; deflated[d++] = a & 0xFF;

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const c1 = pngChunk('IHDR', ihdr);
  const c2 = pngChunk('IDAT', deflated.subarray(0, d));
  const c3 = pngChunk('IEND', new Uint8Array(0));
  const png = new Uint8Array(sig.length + c1.length + c2.length + c3.length);
  let p = 0;
  png.set(sig, p); p += sig.length;
  png.set(c1, p); p += c1.length;
  png.set(c2, p); p += c2.length;
  png.set(c3, p);
  return png;
}

// ── Drawing helpers ─────────────────────────────────────────────────
function fillRect(pixels, W, x0, y0, w, h, r, g, b, a = 255) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const px = x0 + dx, py = y0 + dy;
      if (px < 0 || px >= W || py < 0) continue;
      const idx = (py * W + px) * 4;
      pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b; pixels[idx + 3] = a;
    }
  }
}

// Bitmap font - 5x7 pixel characters (uppercase + digits + some symbols)
const FONT = {
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'B': ['11110','10001','10001','11110','10001','10001','11110'],
  'C': ['01110','10001','10000','10000','10000','10001','01110'],
  'D': ['11100','10010','10001','10001','10001','10010','11100'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'F': ['11111','10000','10000','11110','10000','10000','10000'],
  'G': ['01110','10001','10000','10111','10001','10001','01110'],
  'H': ['10001','10001','10001','11111','10001','10001','10001'],
  'I': ['01110','00100','00100','00100','00100','00100','01110'],
  'J': ['00111','00010','00010','00010','00010','10010','01100'],
  'K': ['10001','10010','10100','11000','10100','10010','10001'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10101','10001','10001','10001'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'Q': ['01110','10001','10001','10001','10101','10010','01101'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'V': ['10001','10001','10001','10001','01010','01010','00100'],
  'W': ['10001','10001','10001','10101','10101','10101','01010'],
  'X': ['10001','10001','01010','00100','01010','10001','10001'],
  'Y': ['10001','10001','01010','00100','00100','00100','00100'],
  'Z': ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00110','01000','10000','11111'],
  '3': ['01110','10001','00001','00110','00001','10001','01110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','11110','00001','00001','10001','01110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','01110'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '.': ['00000','00000','00000','00000','00000','00000','00100'],
  ':': ['00000','00100','00000','00000','00000','00100','00000'],
  '/': ['00001','00010','00010','00100','01000','01000','10000'],
  '|': ['00100','00100','00100','00100','00100','00100','00100'],
  '#': ['01010','01010','11111','01010','11111','01010','01010'],
  '?': ['01110','10001','00001','00110','00100','00000','00100'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  '@': ['01110','10001','10111','10101','10110','10000','01110'],
  '$': ['00100','01111','10100','01110','00101','11110','00100'],
  '%': ['11001','11010','00010','00100','01000','01011','10011'],
  '^': ['00100','01010','10001','00000','00000','00000','00000'],
  '&': ['01100','10010','10100','01000','10101','10010','01101'],
  '*': ['00000','10101','01110','11111','01110','10101','00000'],
  '(': ['00010','00100','01000','01000','01000','00100','00010'],
  ')': ['01000','00100','00010','00010','00010','00100','01000'],
  '+': ['00000','00100','00100','11111','00100','00100','00000'],
  '=': ['00000','00000','11111','00000','11111','00000','00000'],
  '>': ['01000','00100','00010','00001','00010','00100','01000'],
  '<': ['00010','00100','01000','10000','01000','00100','00010'],
};

function drawText(pixels, W, H, text, startX, startY, scale, r, g, b) {
  let cx = startX;
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch];
    if (!glyph) { cx += 4 * scale; continue; }
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === '1') {
          fillRect(pixels, W, cx + col * scale, startY + row * scale, scale, scale, r, g, b);
        }
      }
    }
    cx += 6 * scale;
  }
  return cx - startX; // width used
}

function measureText(text, scale) {
  return text.length * 6 * scale - scale; // 6 per char minus trailing gap
}

function drawTextCentered(pixels, W, H, text, cy, scale, r, g, b) {
  const tw = measureText(text, scale);
  const cx = Math.round((W - tw) / 2);
  drawText(pixels, W, H, text, cx, cy, scale, r, g, b);
}

// ── Asset generators ────────────────────────────────────────────────

function generateLogo(size) {
  const W = size, H = size;
  const pixels = new Uint8Array(W * H * 4);

  // Blue background
  fillRect(pixels, W, 0, 0, W, H, 59, 130, 246);

  // White "PP" text centered
  const scale = Math.round(size / 30);
  const textH = 7 * scale;
  const cy = Math.round((H - textH) / 2);
  drawTextCentered(pixels, W, H, 'PP', cy, scale, 255, 255, 255);

  // Rounded corners
  const rad = Math.round(size / 8);
  for (let y = 0; y < rad; y++) {
    for (let x = 0; x < rad; x++) {
      if (Math.sqrt((rad - x) ** 2 + (rad - y) ** 2) > rad) {
        for (const [cx, cy] of [[x,y],[W-1-x,y],[x,H-1-y],[W-1-x,H-1-y]]) {
          const idx = (cy * W + cx) * 4;
          pixels[idx + 3] = 0;
        }
      }
    }
  }

  return createPNG(W, H, pixels);
}

function generatePromo(width, height) {
  const W = width, H = height;
  const pixels = new Uint8Array(W * H * 4);

  // Gradient-ish background (dark blue to blue)
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const r = Math.round(15 + t * 30);
    const g = Math.round(23 + t * 60);
    const b = Math.round(42 + t * 140);
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b; pixels[idx + 3] = 255;
    }
  }

  // Title: "PASSWORD POLICY HELPER"
  const titleScale = Math.max(2, Math.round(Math.min(W, H) / 80));
  const subtitleScale = Math.max(1, Math.round(titleScale * 0.6));
  const titleH = 7 * titleScale;
  const subH = 7 * subtitleScale;
  const gap = titleScale * 3;
  const totalH = titleH + gap + subH;
  const topY = Math.round((H - totalH) / 2);

  drawTextCentered(pixels, W, H, 'PASSWORD POLICY', topY, titleScale, 255, 255, 255);
  drawTextCentered(pixels, W, H, 'HELPER', topY + titleH + gap, titleScale, 96, 165, 250);

  // Subtitle below
  const subY = topY + titleH + gap + titleH + gap;
  drawTextCentered(pixels, W, H, 'FIX . GENERATE . VALIDATE', subY, subtitleScale, 180, 200, 230);

  return createPNG(W, H, pixels);
}

function generateScreenshot(width, height, tabName, description) {
  const W = width, H = height;
  const pixels = new Uint8Array(W * H * 4);

  // Light gray background
  fillRect(pixels, W, 0, 0, W, H, 248, 250, 252);

  // Simulated browser chrome bar at top
  fillRect(pixels, W, 0, 0, W, 60, 240, 240, 240);
  fillRect(pixels, W, 0, 60, W, 1, 220, 220, 220); // border

  // URL bar
  fillRect(pixels, W, 200, 15, W - 400, 30, 255, 255, 255);
  const urlScale = 2;
  drawText(pixels, W, H, 'EXAMPLE.COM/PASSWORD-RESET', 215, 22, urlScale, 100, 100, 100);

  // Extension popup card (centered)
  const popupW = 360;
  const popupH = 500;
  const popupX = Math.round((W - popupW) / 2);
  const popupY = 100;

  // Popup shadow
  fillRect(pixels, W, popupX + 4, popupY + 4, popupW, popupH, 200, 200, 200);
  // Popup body
  fillRect(pixels, W, popupX, popupY, popupW, popupH, 255, 255, 255);
  // Popup border
  fillRect(pixels, W, popupX, popupY, popupW, 1, 226, 232, 240);
  fillRect(pixels, W, popupX, popupY + popupH, popupW, 1, 226, 232, 240);
  fillRect(pixels, W, popupX, popupY, 1, popupH, 226, 232, 240);
  fillRect(pixels, W, popupX + popupW - 1, popupY, 1, popupH, 226, 232, 240);

  // Tab bar
  const tabY = popupY + 10;
  const tabW = 100;
  const tabs = ['FIX', 'GENERATE', 'VALIDATE'];
  for (let i = 0; i < 3; i++) {
    const tx = popupX + 20 + i * (tabW + 10);
    const isActive = tabs[i] === tabName.toUpperCase();
    if (isActive) {
      fillRect(pixels, W, tx, tabY + 25, tabW, 2, 59, 130, 246);
    }
    const color = isActive ? [59, 130, 246] : [148, 163, 184];
    drawText(pixels, W, H, tabs[i], tx + 15, tabY + 5, 2, ...color);
  }

  // Tab content area
  const contentY = tabY + 40;

  // Input field
  fillRect(pixels, W, popupX + 20, contentY, popupW - 40, 30, 248, 250, 252);
  fillRect(pixels, W, popupX + 20, contentY, popupW - 40, 1, 226, 232, 240);
  fillRect(pixels, W, popupX + 20, contentY + 29, popupW - 40, 1, 226, 232, 240);

  // Blue action button
  const btnY = contentY + 45;
  fillRect(pixels, W, popupX + 20, btnY, popupW - 40, 30, 59, 130, 246);
  drawTextCentered(pixels, popupW, popupH, tabName.toUpperCase() + ' PASSWORD', popupX + 20 + btnY + 8 - popupX, 2, 255, 255, 255);
  // fix: center the button text within the popup card
  const btnText = tabName.toUpperCase() === 'VALIDATE' ? 'VALIDATE' : tabName.toUpperCase() + ' PASSWORD';
  const btnTextW = measureText(btnText, 2);
  drawText(pixels, W, H, btnText, popupX + 20 + Math.round((popupW - 40 - btnTextW) / 2), btnY + 8, 2, 255, 255, 255);

  // Validation checklist
  const checkY = btnY + 50;
  const rules = [
    'AT LEAST 8 CHARACTERS',
    'AT LEAST 1 UPPERCASE',
    'AT LEAST 1 LOWERCASE',
    'AT LEAST 1 SPECIAL CHAR',
    'AT LEAST 1 DIGIT',
    'NO CHAR > 2 TIMES',
  ];
  for (let i = 0; i < rules.length; i++) {
    const ry = checkY + i * 22;
    // Green check or red X based on tab
    const pass = tabName !== 'VALIDATE' || i < 4; // show mix for validate tab
    const checkColor = pass ? [34, 197, 94] : [239, 68, 68];
    const mark = pass ? '+' : '-';
    drawText(pixels, W, H, mark, popupX + 25, ry, 2, ...checkColor);
    drawText(pixels, W, H, rules[i], popupX + 45, ry, 1, ...checkColor);
  }

  // Large label: which tab is shown
  const labelScale = 5;
  const labelText = tabName.toUpperCase() + ' TAB';
  const labelW = measureText(labelText, labelScale);
  drawText(pixels, W, H, labelText, W - labelW - 60, H - 80, labelScale, 59, 130, 246);

  // Description at bottom
  drawText(pixels, W, H, description.toUpperCase(), 60, H - 40, 2, 100, 116, 139);

  return createPNG(W, H, pixels);
}

// ── Main ────────────────────────────────────────────────────────────
const outDir = `${ROOT}/dist/store-assets`;
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const assets = [
  { name: 'logo-300x300.png', desc: 'Edge store logo (300x300)', gen: () => generateLogo(300) },
  { name: 'promo-small-440x280.png', desc: 'Small promo tile (440x280)', gen: () => generatePromo(440, 280) },
  { name: 'promo-large-1400x560.png', desc: 'Large promo tile (1400x560)', gen: () => generatePromo(1400, 560) },
  { name: 'promo-chrome-440x280.png', desc: 'Chrome promo image (440x280)', gen: () => generatePromo(440, 280) },
  { name: 'screenshot-fix-1280x800.png', desc: 'Screenshot: Fix tab (1280x800)',
    gen: () => generateScreenshot(1280, 800, 'Fix', 'Fix 1Password passwords with minimal changes') },
  { name: 'screenshot-generate-1280x800.png', desc: 'Screenshot: Generate tab (1280x800)',
    gen: () => generateScreenshot(1280, 800, 'Generate', 'Generate compliant passwords from scratch') },
  { name: 'screenshot-validate-1280x800.png', desc: 'Screenshot: Validate tab (1280x800)',
    gen: () => generateScreenshot(1280, 800, 'Validate', 'Real-time validation against 6 rules') },
];

console.log('Generating store listing assets...\n');
for (const asset of assets) {
  const png = asset.gen();
  const path = `${outDir}/${asset.name}`;
  writeFileSync(path, png);
  const sizeKB = (png.length / 1024).toFixed(1);
  console.log(`  ✓ ${asset.name}  (${sizeKB} KB) — ${asset.desc}`);
}

console.log(`\nAll assets written to: dist/store-assets/`);
console.log(`\nNOTE: Screenshot images are placeholders. For best results,`);
console.log(`replace them with actual browser screenshots of the extension in use.`);
console.log(`\nRequired sizes:`);
console.log(`  Edge logo:        300x300  (min 128x128, 1:1 ratio)`);
console.log(`  Edge small promo: 440x280`);
console.log(`  Edge large promo: 1400x560`);
console.log(`  Chrome promo:     440x280`);
console.log(`  Screenshots:      1280x800 or 640x480 (max 6 for Edge, 5 for Chrome)`);
