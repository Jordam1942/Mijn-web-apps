// Icon for the games menu: two playing cards on green felt, full square (no dark corners).
// Run with: node tools/make-hub-icon.js
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const OUT = path.join(__dirname, '..', 'icons');

function inSpade(x, y) {          // x, y in -1..1, y pointing down
  const circle = (cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  const body = y >= -0.62 && y <= 0.1 && Math.abs(x) <= (y + 0.62) * 0.62;
  const lobes = circle(-0.26, 0.0, 0.26) || circle(0.26, 0.0, 0.26);
  const stem = y > 0.0 && y <= 0.62 && Math.abs(x) <= 0.1;
  return body || lobes || stem;
}
function inHeart(x, y) {          // x, y in -1..1, y pointing down
  const yy = -y + 0.15, xx = x * 1.1;           // flip so the point is down, centre slightly up
  return Math.pow(xx * xx + yy * yy - 0.5, 3) - xx * xx * Math.pow(yy, 3) <= 0 && yy > -0.9;
}
const CARDS = [
  { cx: 0.31, cy: 0.52, ang: -0.27, w: 0.44, h: 0.62, suit: 'spade' },   // back card (spades)
  { cx: 0.64, cy: 0.5, ang: 0.22, w: 0.44, h: 0.62, suit: 'heart' }      // front card (hearts)
];

function pixel(px, py, size) {
  const x = (px + 0.5) / size, y = (py + 0.5) / size;
  // felt: a lit centre fading to deep green
  const d = Math.hypot(x - 0.5, y - 0.45) / 0.75;
  let r = Math.round(38 + (8 - 38) * Math.min(1, d)), g = Math.round(122 + (46 - 122) * Math.min(1, d)), b = Math.round(82 + (30 - 82) * Math.min(1, d));
  for (const c of CARDS) {
    const dx = x - c.cx, dy = y - c.cy;
    const u = (dx * Math.cos(-c.ang) - dy * Math.sin(-c.ang)) / (c.w / 2);
    const v = (dx * Math.sin(-c.ang) + dy * Math.cos(-c.ang)) / (c.h / 2);
    if (Math.abs(u) > 1 || Math.abs(v) > 1) continue;
    const edge = Math.max(Math.abs(u), Math.abs(v));
    if (edge > 0.9) { r = 205; g = 169; b = 79; continue; }                       // gold border
    r = 251; g = 248; b = 241;                                                       // paper
    const sr = c.suit === 'heart' ? [163, 32, 44] : [29, 29, 34];
    const hit = c.suit === 'heart' ? inHeart(u, v * 1.15) : inSpade(u, v * 1.15);
    if (hit) { r = sr[0]; g = sr[1]; b = sr[2]; }
  }
  return [r, g, b, 255];
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const p = pixel(x, y, size), o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = p[0]; raw[o + 1] = p[1]; raw[o + 2] = p[2]; raw[o + 3] = p[3];
    }
  }
  const table = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  const crc = buf => { let c = 0xffffffff; for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'spellen-192.png'), png(192));
fs.writeFileSync(path.join(OUT, 'spellen-512.png'), png(512));
fs.writeFileSync(path.join(OUT, 'spellen.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
  '<defs><radialGradient id="f" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#267a52"/><stop offset="1" stop-color="#08281a"/></radialGradient></defs>' +
  '<rect width="512" height="512" fill="url(#f)"/>' +
  '<g transform="translate(184 266) rotate(-12.7)"><rect x="-100" y="-140" width="200" height="280" rx="18" fill="#fbf8f1" stroke="#cda94f" stroke-width="10"/>' +
  '<path d="M0 -62 C-6 -62 -32 -36 -32 -16 C-32 0 -16 6 0 -10 C16 6 32 0 32 -16 C32 -36 6 -62 0 -62 Z" fill="none"/>' +
  '<path d="M0 -50 C-26 -20 -40 -4 -30 14 C-22 30 -6 22 0 12 L-12 48 L12 48 L0 12 C6 22 22 30 30 14 C40 -4 26 -20 0 -50 Z" fill="#1d1d22" transform="translate(0 -6) scale(0.9)"/></g>' +
  '<g transform="translate(330 262) rotate(12.7)"><rect x="-100" y="-140" width="200" height="280" rx="18" fill="#fbf8f1" stroke="#cda94f" stroke-width="10"/>' +
  '<path d="M0 -58 C-22 -84 -68 -54 -40 -16 L0 26 L40 -16 C68 -54 22 -84 0 -58 Z" fill="#a3202c" transform="translate(0 -4) scale(0.9)"/></g></svg>');
console.log('icons written');
