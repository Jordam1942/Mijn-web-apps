/*
 * Drawings made in code (no image files): playing cards and the characters at the table.
 * Cards: rank and suit in the top-left and bottom-right corners, large in the middle.
 * Characters: a bust with hair, a face and an outfit, each one with its own look.
 */
(function (root) {
  'use strict';

  var E = root.PokerEngine || require('./engine.js');
  var SUIT_SYMBOL = ['♠', '♥', '♦', '♣'];
  var RANK_TEXT = { 11: 'B', 12: 'V', 13: 'K', 14: 'A' };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // A card as SVG. c: card number 0..51 (see engine.js), or null for a card you may not see.
  function card(c) {
    if (c === null || c === undefined) return back();
    var suit = E.suitOf(c), rank = E.rankOf(c);
    var red = suit === 1 || suit === 2;
    var label = RANK_TEXT[rank] || String(rank);
    var sym = SUIT_SYMBOL[suit];
    var ink = red ? '#9b1c24' : '#1d1d22';
    return '<svg class="card-face" viewBox="0 0 100 140" aria-label="' + esc(label + sym) + '" role="img">' +
      '<rect x="2" y="2" width="96" height="136" rx="10" fill="#fbf8f1" stroke="#b9a77a" stroke-width="2"/>' +
      '<rect x="8" y="8" width="84" height="124" rx="6" fill="none" stroke="#e5dcc4" stroke-width="1"/>' +
      '<text x="14" y="30" font-family="Georgia, serif" font-size="22" font-weight="700" fill="' + ink + '">' + esc(label) + '</text>' +
      '<text x="14" y="46" font-size="18" fill="' + ink + '">' + sym + '</text>' +
      '<text x="50" y="86" text-anchor="middle" font-size="46" fill="' + ink + '">' + sym + '</text>' +
      '<g transform="rotate(180 50 70)"><text x="14" y="30" font-family="Georgia, serif" font-size="22" font-weight="700" fill="' + ink + '">' + esc(label) + '</text>' +
      '<text x="14" y="46" font-size="18" fill="' + ink + '">' + sym + '</text></g>' +
      '</svg>';
  }

  // The back of a card (for the other players).
  function back() {
    return '<svg class="card-face card-back" viewBox="0 0 100 140" aria-hidden="true">' +
      '<defs><pattern id="pk" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="10" height="10" fill="#7a1420"/><line x1="0" y1="0" x2="0" y2="10" stroke="#c9a24a" stroke-width="2"/></pattern></defs>' +
      '<rect x="2" y="2" width="96" height="136" rx="10" fill="#7a1420" stroke="#c9a24a" stroke-width="2"/>' +
      '<rect x="10" y="10" width="80" height="120" rx="6" fill="url(#pk)" stroke="#c9a24a" stroke-width="1.5"/></svg>';
  }

  // Characters: adult portraits drawn in code. Each has its own hair, skin, eyes and clothes.
  var PERSONAS = [
    { name: 'Anna', hair: '#3b2418', skin: '#f2c9a5', top: '#2d4f6b', style: 'long', brow: '#3b2418', eyes: '#4a3520' },
    { name: 'Bram', hair: '#1f1f22', skin: '#d9a77b', top: '#2b2b33', style: 'short', beard: true, brow: '#1f1f22', eyes: '#2a2a2a', suit: true },
    { name: 'Carla', hair: '#8c3b1e', skin: '#f5d3b5', top: '#3d5a2b', style: 'bun', glasses: true, brow: '#6a2e16', eyes: '#3a5a6a' },
    { name: 'Daan', hair: '#b8923f', skin: '#f0c7a0', top: '#1f3a4f', style: 'short', brow: '#9a7a3a', eyes: '#3d6b8a', suit: true },
    { name: 'Eva', hair: '#111111', skin: '#8d5a3b', top: '#6b2740', style: 'long', brow: '#111111', eyes: '#2a1a10' },
    { name: 'Finn', hair: '#6b4a2b', skin: '#e8bf98', top: '#2e2e36', style: 'short', beard: true, brow: '#5a3c22', eyes: '#4a6a4a' },
    { name: 'Gijs', hair: '#a39f95', skin: '#f0cfae', top: '#5b4a2e', style: 'bald', glasses: true, brow: '#8a857a', eyes: '#5a6a7a', suit: true },
    { name: 'Hanna', hair: '#2d1b33', skin: '#e9b98f', top: '#7a5a1f', style: 'bun', brow: '#2d1b33', eyes: '#3a2a4a' },
    { name: 'Ivo', hair: '#4a3223', skin: '#c68e62', top: '#1d4b4a', style: 'short', glasses: true, brow: '#3a2a1c', eyes: '#2a2018', suit: true },
    { name: 'Jolien', hair: '#d8b06a', skin: '#fbd9bd', top: '#7a1420', style: 'long', brow: '#b08a4a', eyes: '#4a7a9a' },
    { name: 'Koen', hair: '#2b2b2b', skin: '#b87b52', top: '#34465a', style: 'short', beard: true, brow: '#2b2b2b', eyes: '#2a2018', suit: true },
    { name: 'Lotte', hair: '#5a2e1d', skin: '#f6d2b4', top: '#4a3a6b', style: 'bun', brow: '#5a2e1d', eyes: '#3a5a3a' },
    { name: 'Jij', hair: '#6b4a2b', skin: '#f6d7bc', top: '#2b3a4a', style: 'short', brow: '#6b4a2b', eyes: '#3d6b8a', suit: true }
  ];
  var YOU = PERSONAS.length - 1;   // your own character (the computer players never get it)

  // A portrait for the character with this index (0..11, wraps around).
  function avatar(i) {
    var p = PERSONAS[((i % PERSONAS.length) + PERSONAS.length) % PERSONAS.length], id = 'av' + i;
    var hair = '', beard = '', brows = '', glasses = '', suit = '', backHair = '';
    // hair: adult styles, with a little shine on top
    // long hair falls behind the face; only a fringe lies over the forehead
    if (p.style === 'long') { backHair = '<path d="M27 48 Q24 20 50 16 Q76 20 73 48 L76 80 Q62 74 50 74 Q38 74 24 80 Z" fill="' + p.hair + '"/>'; hair = '<path d="M30 44 Q29 24 50 20 Q71 24 70 44 Q63 30 50 31 Q37 31 30 44 Z" fill="' + p.hair + '"/>'; }
    else if (p.style === 'short') hair = '<path d="M30 42 Q28 22 50 19 Q71 22 70 42 Q66 30 56 28 Q44 33 30 42 Z" fill="' + p.hair + '"/><path d="M40 24 Q52 20 64 26" fill="none" stroke="#fff" stroke-opacity="0.14" stroke-width="2"/>';
    else if (p.style === 'bun') hair = '<ellipse cx="50" cy="15" rx="9" ry="8" fill="' + p.hair + '"/><path d="M30 42 Q31 23 50 20 Q69 23 70 42 Q66 31 50 31 Q35 31 30 42 Z" fill="' + p.hair + '"/>';
    else if (p.style === 'bald') hair = '<path d="M31 36 Q36 28 50 28 Q64 28 69 36 Q60 33 50 33 Q40 33 31 36 Z" fill="' + p.hair + '" fill-opacity="0.5"/>';
    if (p.beard) beard = '<path d="M34 56 Q36 76 50 80 Q64 76 66 56 Q62 66 50 67 Q38 66 34 56 Z" fill="' + p.hair + '" fill-opacity="0.92"/>';
    // eyebrows, eyes (almond with a lid line), nose, lips
    brows = '<path d="M36 40 Q41 37 46 39" fill="none" stroke="' + p.brow + '" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M54 39 Q59 37 64 40" fill="none" stroke="' + p.brow + '" stroke-width="2.2" stroke-linecap="round"/>';
    var eyes = '<path d="M36 46 Q41 42 46 46 Q41 49 36 46 Z" fill="#fbf7ef"/><path d="M54 46 Q59 42 64 46 Q59 49 54 46 Z" fill="#fbf7ef"/>' +
      '<circle cx="41" cy="46" r="1.9" fill="' + p.eyes + '"/><circle cx="59" cy="46" r="1.9" fill="' + p.eyes + '"/>' +
      '<circle cx="41" cy="46" r="0.8" fill="#111"/><circle cx="59" cy="46" r="0.8" fill="#111"/>' +
      '<path d="M36 45.5 Q41 42.2 46 45.5" fill="none" stroke="#2a1d14" stroke-width="0.9" opacity="0.75"/><path d="M54 45.5 Q59 42.2 64 45.5" fill="none" stroke="#2a1d14" stroke-width="0.9" opacity="0.75"/>';
    if (p.glasses) glasses = '<g fill="none" stroke="#c9a24a" stroke-width="1.4"><rect x="34" y="42" width="14" height="9" rx="4"/><rect x="52" y="42" width="14" height="9" rx="4"/><line x1="48" y1="45" x2="52" y2="45"/></g>';
    var nose = '<path d="M50 48 Q48 56 50 58 Q52 59 53 58" fill="none" stroke="#7a4a30" stroke-opacity="0.55" stroke-width="1.3" stroke-linecap="round"/>';
    var lips = '<path d="M43 66 Q47 63 50 64.5 Q53 63 57 66 Q53 70 50 70 Q47 70 43 66 Z" fill="#a8554a" fill-opacity="0.85"/><path d="M43 66 Q50 68 57 66" fill="none" stroke="#6a3028" stroke-width="0.9" stroke-opacity="0.7"/>';
    // a little shading: under the cheekbones and the jaw, and faint lines for an adult face
    var shade = '<ellipse cx="50" cy="74" rx="22" ry="8" fill="#000" fill-opacity="0.12"/><ellipse cx="36" cy="60" rx="6" ry="4" fill="#c0603a" fill-opacity="0.12"/><ellipse cx="64" cy="60" rx="6" ry="4" fill="#c0603a" fill-opacity="0.12"/>' +
      '<path d="M38 36 Q50 33 62 36" fill="none" stroke="#000" stroke-opacity="0.09" stroke-width="0.8"/>';
    // clothes: a jacket with lapels and a white shirt, or a dark polo for the others
    suit = p.suit ? '<path d="M10 100 Q14 74 40 70 L50 84 L60 70 Q86 74 90 100 Z" fill="' + p.top + '"/><path d="M40 70 L50 84 L44 100 L36 80 Z" fill="#000" fill-opacity="0.18"/><path d="M60 70 L50 84 L56 100 L64 80 Z" fill="#000" fill-opacity="0.18"/><path d="M44 70 L50 82 L56 70 Z" fill="#f4efe4"/>'
      : '<path d="M8 100 Q12 74 42 69 Q50 76 58 69 Q88 74 92 100 Z" fill="' + p.top + '"/><path d="M42 69 Q50 78 58 69" fill="none" stroke="#f4efe4" stroke-width="2"/>';
    return '<svg class="avatar" viewBox="0 0 100 100" aria-label="' + esc(p.name) + '" role="img">' +
      '<defs><radialGradient id="bg' + id + '" cx="50%" cy="30%" r="75%"><stop offset="0" stop-color="#3a6b4e"/><stop offset="1" stop-color="#0b2118"/></radialGradient>' +
      '<linearGradient id="sk' + id + '" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/><stop offset="1" stop-color="#000" stop-opacity="0.12"/></linearGradient></defs>' +
      '<rect width="100" height="100" fill="url(#bg' + id + ')"/>' +
      suit +
      '<path d="M43 60 L43 72 Q50 77 57 72 L57 60 Z" fill="' + p.skin + '"/>' + backHair +
      '<path d="M30 44 Q30 22 50 20 Q70 22 70 44 Q70 66 58 74 Q50 80 42 74 Q30 66 30 44 Z" fill="' + p.skin + '"/>' +
      '<path d="M30 44 Q30 22 50 20 Q70 22 70 44 Q70 66 58 74 Q50 80 42 74 Q30 66 30 44 Z" fill="url(#sk' + id + ')"/>' +
      '<ellipse cx="29.5" cy="48" rx="2.6" ry="4" fill="' + p.skin + '"/><ellipse cx="70.5" cy="48" rx="2.6" ry="4" fill="' + p.skin + '"/>' +
      backHair + hair + beard + shade + brows + eyes + nose + lips + glasses +
      '</svg>';
  }
  function name(i) { return PERSONAS[((i % PERSONAS.length) + PERSONAS.length) % PERSONAS.length].name; }
  function personaCount() { return PERSONAS.length; }

  var api = { card: card, back: back, avatar: avatar, name: name, personaCount: personaCount, YOU: YOU };
  root.PokerArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
