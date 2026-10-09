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

  // Characters. The seat name is shown next to the bust, so each one needs a name and a look.
  var PERSONAS = [
    { name: 'Anna', hair: '#3b2418', skin: '#f2c9a5', top: '#2d4f6b', style: 'long', glasses: false },
    { name: 'Bram', hair: '#1f1f22', skin: '#d9a77b', top: '#4b2a2a', style: 'short', beard: true },
    { name: 'Carla', hair: '#8c3b1e', skin: '#f5d3b5', top: '#3d5a2b', style: 'bun', glasses: true },
    { name: 'Daan', hair: '#c9a24a', skin: '#f0c7a0', top: '#1f3a4f', style: 'short' },
    { name: 'Eva', hair: '#111111', skin: '#8d5a3b', top: '#6b2740', style: 'long' },
    { name: 'Finn', hair: '#6b4a2b', skin: '#e8bf98', top: '#2e2e36', style: 'short', beard: true },
    { name: 'Gijs', hair: '#a39f95', skin: '#f0cfae', top: '#5b4a2e', style: 'bald', glasses: true },
    { name: 'Hanna', hair: '#2d1b33', skin: '#e9b98f', top: '#7a5a1f', style: 'bun' },
    { name: 'Ivo', hair: '#4a3223', skin: '#c68e62', top: '#1d4b4a', style: 'short', glasses: true },
    { name: 'Jolien', hair: '#d8b06a', skin: '#fbd9bd', top: '#7a1420', style: 'long' },
    { name: 'Koen', hair: '#2b2b2b', skin: '#b87b52', top: '#34465a', style: 'short', beard: true },
    { name: 'Lotte', hair: '#5a2e1d', skin: '#f6d2b4', top: '#4a3a6b', style: 'bun', glasses: false }
  ];

  // A bust for the character with this index (0..11, wraps around).
  function avatar(i) {
    var p = PERSONAS[((i % PERSONAS.length) + PERSONAS.length) % PERSONAS.length];
    var hair = '';
    if (p.style === 'long') hair = '<path d="M28 44 Q26 18 50 14 Q74 18 72 44 L76 78 Q60 70 50 70 Q40 70 24 78 Z" fill="' + p.hair + '"/>';
    else if (p.style === 'short') hair = '<path d="M30 40 Q32 18 50 16 Q68 18 70 40 Q62 30 50 30 Q38 30 30 40 Z" fill="' + p.hair + '"/>';
    else if (p.style === 'bun') hair = '<circle cx="50" cy="16" r="9" fill="' + p.hair + '"/><path d="M30 42 Q32 22 50 20 Q68 22 70 42 Q60 32 50 32 Q40 32 30 42 Z" fill="' + p.hair + '"/>';
    var beard = p.beard ? '<path d="M36 58 Q50 84 64 58 Q60 72 50 74 Q40 72 36 58 Z" fill="' + p.hair + '"/>' : '';
    var glasses = p.glasses ? '<g fill="none" stroke="#c9a24a" stroke-width="2"><circle cx="41" cy="46" r="7"/><circle cx="59" cy="46" r="7"/><line x1="48" y1="46" x2="52" y2="46"/></g>' : '';
    return '<svg class="avatar" viewBox="0 0 100 100" aria-label="' + esc(p.name) + '" role="img">' +
      '<defs><radialGradient id="bg' + i + '" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#2c5a40"/><stop offset="1" stop-color="#0c2418"/></radialGradient></defs>' +
      '<rect width="100" height="100" fill="url(#bg' + i + ')"/>' +
      '<path d="M8 100 Q12 72 50 68 Q88 72 92 100 Z" fill="' + p.top + '"/>' +
      '<path d="M42 66 L50 78 L58 66 Z" fill="#f6efe2"/>' +
      '<rect x="44" y="56" width="12" height="14" fill="' + p.skin + '"/>' +
      '<ellipse cx="50" cy="44" rx="20" ry="23" fill="' + p.skin + '"/>' +
      hair + beard + glasses +
      '<circle cx="43" cy="46" r="1.8" fill="#222"/><circle cx="57" cy="46" r="1.8" fill="#222"/>' +
      '<path d="M44 58 Q50 62 56 58" fill="none" stroke="#7a3b2e" stroke-width="1.6" stroke-linecap="round"/>' +
      '</svg>';
  }
  function name(i) { return PERSONAS[((i % PERSONAS.length) + PERSONAS.length) % PERSONAS.length].name; }
  function personaCount() { return PERSONAS.length; }

  var api = { card: card, back: back, avatar: avatar, name: name, personaCount: personaCount };
  root.PokerArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
