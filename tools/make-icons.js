// Generates the app icons (PNG 180/192/512 + icons/icon.svg) without dependencies:
// the starter monster Pecling (from js/game/monsters.js) lifting a dumbbell on a FireRed checkered background.
// Usage: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const N = 32; // icon pixel grid

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

async function buildGrid() {
  const { MONSTERS } = await import('../js/game/monsters.js');
  const mon = MONSTERS.Borst.forms[0];
  const px = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => (((x >> 2) + (y >> 2)) % 2 ? '#6890e0' : '#5880d0')));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) px[y][x] = c; };

  // ground shadow
  for (let x = 9; x <= 22; x++) for (let y = 28; y <= 29; y++) if (!((x === 9 || x === 22) && y === 29)) set(x, y, '#3c60a8');

  // monster (24x24) placed at offset
  const ox = 4, oy = 7;
  mon.grid.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') set(ox + x, oy + y, mon.palette[ch]); }));

  // dumbbell held overhead: bar + red plates with dark outline
  const ink = '#283040', bar = '#c8ccd4', barDark = '#888c98', plate = '#e03828', plateDark = '#a01810';
  for (let x = 6; x <= 25; x++) { set(x, 4, ink); set(x, 5, bar); set(x, 6, barDark); set(x, 7, ink); }
  for (const x0 of [2, 26]) {
    for (let x = x0; x <= x0 + 3; x++) for (let y = 1; y <= 10; y++) {
      const edge = x === x0 || x === x0 + 3 || y === 1 || y === 10;
      set(x, y, edge ? ink : x === x0 + 1 ? plate : plateDark);
    }
  }
  // arms from the shoulders up to the bar (only drawn over background, so the monster stays intact)
  const isBg = (x, y) => px[y][x] === '#5880d0' || px[y][x] === '#6890e0';
  const arm = (cols, y0, y1) => { for (let y = y0; y <= y1; y++) cols.forEach(([x, c]) => { if (isBg(x, y)) set(x, y, c); }); };
  arm([[9, ink], [10, '#f06a30'], [11, '#ab4b2d'], [12, ink]], 8, 20);
  arm([[19, ink], [20, '#f06a30'], [21, '#ab4b2d'], [22, ink]], 8, 20);
  // fists around the bar
  for (const x0 of [9, 19]) for (let x = x0; x <= x0 + 3; x++) { set(x, 3, ink); set(x, 8, ink); }
  return px;
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

function png(grid, size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = hex(grid[Math.floor((y * N) / size)][Math.floor((x * N) / size)]);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg(grid) {
  let rects = '';
  grid.forEach((row, y) => {
    let x = 0;
    while (x < N) {
      let w = 1;
      while (x + w < N && row[x + w] === row[x]) w++;
      rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${row[x]}"/>`;
      x += w;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">${rects}</svg>\n`;
}

(async () => {
  const grid = await buildGrid();
  const dir = path.join(__dirname, '..', 'icons');
  for (const size of [180, 192, 512]) {
    // sizes not divisible by 32 get nearest-neighbour scaling; 512 is exact
    fs.writeFileSync(path.join(dir, `icon-${size}.png`), png(grid, size));
    console.log(`icons/icon-${size}.png`);
  }
  fs.writeFileSync(path.join(dir, 'icon.svg'), svg(grid));
  console.log('icons/icon.svg');
})();
