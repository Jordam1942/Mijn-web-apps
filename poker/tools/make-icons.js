// Makes the app icons (PNG 192 and 512, plus the SVG): a gold spade on a deep green felt disc.
// Run with: node poker/tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const OUT = path.join(__dirname, '..', 'icons');

// Is point (x, y), in -1..1 coordinates, inside the spade?
function inSpade(x, y) {
  const circle = (cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  const body = y >= -0.62 && y <= 0.1 && Math.abs(x) <= (y + 0.62) * 0.62;   // the point and the middle
  const lobes = circle(-0.26, 0.0, 0.26) || circle(0.26, 0.0, 0.26);          // the two round lobes
  const stem = y > 0.0 && y <= 0.62 && Math.abs(x) <= 0.1;                    // the foot
  return body || lobes || stem;
}

function pixel(x, y, size) {
  const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1;
  const d = Math.sqrt(u * u + v * v);
  // background: dark burgundy outside, felt green in the middle
  let r = 18, g = 12, b = 14;
  if (d < 1) {
    const t = Math.min(1, d);
    r = Math.round(30 + (12 - 30) * t); g = Math.round(100 + (40 - 100) * t); b = Math.round(70 + (30 - 70) * t);
  }
  if (d > 0.82 && d < 0.9) { r = 205; g = 169; b = 79; }                 // gold rim of the disc
  if (d <= 0.82 && inSpade(u / 0.6, v / 0.6)) {                          // the spade, in gold
    const shade = 1 - Math.max(0, v) * 0.15;
    r = Math.round(240 * shade); g = Math.round(207 * shade); b = Math.round(122 * shade);
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
  const crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = buf => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon-192.png'), png(192));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), png(512));
fs.writeFileSync(path.join(OUT, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
  '<defs><radialGradient id="f" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#1e6a46"/><stop offset="1" stop-color="#0c2d1d"/></radialGradient>' +
  '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0cf7a"/><stop offset="1" stop-color="#b98b33"/></linearGradient></defs>' +
  '<rect width="512" height="512" fill="#120c0e"/>' +
  '<circle cx="256" cy="256" r="236" fill="url(#f)" stroke="#cda94f" stroke-width="14"/>' +
  '<g fill="url(#g)"><circle cx="208" cy="262" r="66"/><circle cx="304" cy="262" r="66"/>' +
  '<path d="M256 96 L150 282 L362 282 Z"/><path d="M236 300 L276 300 L292 396 L220 396 Z"/></g></svg>');
console.log('icons written to', OUT);
