// Draws the launcher icon (same shapes as src/res/drawable/ic_fg.xml) into PNG files
// for the web version and iPhone home screen. No image libraries: shapes are tested
// per pixel with 4x4 supersampling and written with zlib.
// Usage: node tools/make-icons.js <out dir>
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [0x2B, 0x3A, 0xC4], WHITE = [255, 255, 255], TAG = [0xFF, 0xC9, 0x4D];

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// colour of one point in the 108-unit icon space
function shade(x, y) {
  if (inPolygon(x, y, [[58, 50], [70, 50], [78, 58], [66, 70], [58, 62]]) && (x - 68) ** 2 + (y - 55.5) ** 2 > 2.5 ** 2) return TAG;
  if (inRoundRect(x, y, 36, 30, 66, 78, 6) && !inRoundRect(x, y, 40.5, 35, 61.5, 73, 1.5)) return WHITE;
  if (inRoundRect(x, y, 46, 37.5, 56, 39.5, 1)) return WHITE;
  return BG;
}

// view: the part of the 108-unit canvas that fills the image (smaller = bigger artwork)
function render(size, view) {
  const [v0, v1] = view, k = (v1 - v0) / size, S = 4;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const c = shade(v0 + (px + (sx + 0.5) / S) * k, v0 + (py + (sy + 0.5) / S) * k);
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
      }
      for (let i = 0; i < 3; i++) row[1 + px * 3 + i] = Math.round(acc[i] / (S * S));
    }
    rows.push(row);
  }
  return png(size, size, Buffer.concat(rows));
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = process.argv[2];
if (!out) { console.error('usage: node tools/make-icons.js <out dir>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const FULL = [0, 108], TIGHT = [14, 94];   // maskable icons keep the safe zone; plain icons zoom in
const files = { 'icon-192.png': [192, TIGHT], 'icon-512.png': [512, TIGHT], 'icon-maskable-512.png': [512, FULL],
  'apple-touch-icon.png': [180, TIGHT], 'favicon-32.png': [32, TIGHT] };
for (const [name, [size, view]] of Object.entries(files)) fs.writeFileSync(path.join(out, name), render(size, view));
console.log('icons:', Object.keys(files).join(', '));
