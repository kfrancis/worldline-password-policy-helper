// Generate simple placeholder PNG icons for the extension.
// These are minimal valid PNGs with a blue background and "PP" text.
// Run: node tools/generate-icons.mjs

import { writeFileSync, mkdirSync } from 'fs';

// Minimal PNG encoder - creates uncompressed PNGs (no dependencies needed)
function createPNG(width, height, pixels) {
  // pixels is a Uint8Array of RGBA values (width * height * 4)

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

  function chunk(type, data) {
    const len = data.length;
    const buf = new Uint8Array(4 + type.length + data.length + 4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, len);
    for (let i = 0; i < type.length; i++) buf[4 + i] = type.charCodeAt(i);
    buf.set(data, 4 + type.length);
    const crcData = new Uint8Array(type.length + data.length);
    for (let i = 0; i < type.length; i++) crcData[i] = type.charCodeAt(i);
    crcData.set(data, type.length);
    view.setUint32(4 + type.length + data.length, crc32(crcData));
    return buf;
  }

  // IHDR
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw image data with filter byte (0 = None) per row
  const rawSize = height * (1 + width * 4);
  const raw = new Uint8Array(rawSize);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      raw[offset++] = pixels[srcIdx];
      raw[offset++] = pixels[srcIdx + 1];
      raw[offset++] = pixels[srcIdx + 2];
      raw[offset++] = pixels[srcIdx + 3];
    }
  }

  // Deflate: store blocks (uncompressed)
  // zlib header + stored blocks + adler32
  const maxBlock = 65535;
  const numBlocks = Math.ceil(raw.length / maxBlock);
  const deflatedSize = 2 + raw.length + 5 * numBlocks + 4;
  const deflated = new Uint8Array(deflatedSize);
  let dOffset = 0;
  deflated[dOffset++] = 0x78; // zlib header
  deflated[dOffset++] = 0x01;
  for (let i = 0; i < numBlocks; i++) {
    const start = i * maxBlock;
    const end = Math.min(start + maxBlock, raw.length);
    const len = end - start;
    const isLast = (i === numBlocks - 1) ? 1 : 0;
    deflated[dOffset++] = isLast;
    deflated[dOffset++] = len & 0xFF;
    deflated[dOffset++] = (len >> 8) & 0xFF;
    deflated[dOffset++] = (~len) & 0xFF;
    deflated[dOffset++] = ((~len) >> 8) & 0xFF;
    deflated.set(raw.subarray(start, end), dOffset);
    dOffset += len;
  }
  const adler = adler32(raw);
  deflated[dOffset++] = (adler >> 24) & 0xFF;
  deflated[dOffset++] = (adler >> 16) & 0xFF;
  deflated[dOffset++] = (adler >> 8) & 0xFF;
  deflated[dOffset++] = adler & 0xFF;

  const idatData = deflated.subarray(0, dOffset);

  // IEND
  const iendData = new Uint8Array(0);

  // Assemble PNG
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = chunk('IHDR', ihdr);
  const idatChunk = chunk('IDAT', idatData);
  const iendChunk = chunk('IEND', iendData);

  const png = new Uint8Array(signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
  let pos = 0;
  png.set(signature, pos); pos += signature.length;
  png.set(ihdrChunk, pos); pos += ihdrChunk.length;
  png.set(idatChunk, pos); pos += idatChunk.length;
  png.set(iendChunk, pos);

  return png;
}

function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);

  // Blue background (#3b82f6)
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4] = 59;      // R
    pixels[i * 4 + 1] = 130; // G
    pixels[i * 4 + 2] = 246; // B
    pixels[i * 4 + 3] = 255; // A
  }

  // Draw "PP" text in white - simple bitmap font
  function setPixel(x, y, r, g, b) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    pixels[idx] = r;
    pixels[idx + 1] = g;
    pixels[idx + 2] = b;
    pixels[idx + 3] = 255;
  }

  function fillRect(x, y, w, h, r, g, b) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        setPixel(x + dx, y + dy, r, g, b);
      }
    }
  }

  // Draw a simple "P" character
  function drawP(startX, startY, charW, charH, thickness) {
    // Vertical bar
    fillRect(startX, startY, thickness, charH, 255, 255, 255);
    // Top horizontal
    fillRect(startX, startY, charW, thickness, 255, 255, 255);
    // Middle horizontal
    const midY = startY + Math.floor(charH / 2);
    fillRect(startX, midY, charW, thickness, 255, 255, 255);
    // Right vertical (top half)
    fillRect(startX + charW - thickness, startY, thickness, midY - startY + thickness, 255, 255, 255);
  }

  // Scale based on icon size
  const t = Math.max(1, Math.round(size / 10)); // thickness
  const charW = Math.round(size * 0.3);
  const charH = Math.round(size * 0.6);
  const startY = Math.round((size - charH) / 2);
  const gap = Math.round(size * 0.06);
  const totalW = charW * 2 + gap;
  const startX = Math.round((size - totalW) / 2);

  drawP(startX, startY, charW, charH, t);
  drawP(startX + charW + gap, startY, charW, charH, t);

  // Add rounded corners (simple: set corner pixels to transparent)
  const r = Math.max(1, Math.round(size / 8));
  for (let y = 0; y < r; y++) {
    for (let x = 0; x < r; x++) {
      const dist = Math.sqrt((r - x) * (r - x) + (r - y) * (r - y));
      if (dist > r) {
        // Set corners to transparent
        const corners = [
          [x, y],
          [size - 1 - x, y],
          [x, size - 1 - y],
          [size - 1 - x, size - 1 - y],
        ];
        for (const [cx, cy] of corners) {
          const idx = (cy * size + cx) * 4;
          pixels[idx + 3] = 0;
        }
      }
    }
  }

  return createPNG(size, size, pixels);
}

// Generate icons
const sizes = [16, 48, 128];
for (const size of sizes) {
  const png = drawIcon(size);
  writeFileSync(`icons/icon-${size}.png`, png);
  console.log(`Created icons/icon-${size}.png (${png.length} bytes)`);
}
