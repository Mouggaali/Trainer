// Generates PNG app icons (same design as icons/icon.svg) without dependencies.
// Usage: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [0x14, 0x19, 0x1e], BLUE = [0x3b, 0x9e, 0xff], WHITE = [0xee, 0xf2, 0xf5];
// Shapes in a 512 grid: [x, y, w, h, radius, color]
const SHAPES = [
  [96, 176, 48, 160, 14, BLUE], [368, 176, 48, 160, 14, BLUE],
  [56, 208, 40, 96, 12, BLUE], [416, 208, 40, 96, 12, BLUE],
  [144, 236, 224, 40, 10, WHITE],
];

function inRoundRect(px, py, x, y, w, h, r) {
  if (px < x || py < y || px >= x + w || py >= y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const s = size / 512;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const gx = (x + 0.5) / s, gy = (y + 0.5) / s;
      let col = BG;
      for (const [sx, sy, w, h, r, c] of SHAPES) if (inRoundRect(gx, gy, sx, sy, w, h, r)) col = c;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [180, 192, 512]) {
  fs.writeFileSync(path.join(__dirname, '..', 'icons', `icon-${size}.png`), png(size));
  console.log(`icons/icon-${size}.png`);
}
