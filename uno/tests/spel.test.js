// Controleert het potje tegen de computer: spelen tot het eind, bewaren en hervatten,
// en de ranglijst (oefenpotjes tellen niet mee).
// Draai met: node uno/tests/spel.test.js
const U = require('../engine.js');
const SPEL = require('../spel.js');
const assert = require('assert');

// Nep-opslag, zoals localStorage in de browser
const opslag = new Map();
global.localStorage = {
  getItem: k => (opslag.has(k) ? opslag.get(k) : null),
  setItem: (k, v) => opslag.set(k, String(v)),
  removeItem: k => opslag.delete(k)
};

function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Speelt een heel potje: de mens kiest willekeurig uit de geldige zetten, de computers spelen zelf.
function speelUit(spel, rng, maxStappen) {
  for (let i = 0; i < maxStappen && !spel.staat.over; i++) {
    const computer = SPEL.computerZet(spel, rng);
    if (computer) { spel = SPEL.doe(spel, computer, rng); continue; }
    const mijn = U.legalActions(spel.staat, 0);
    assert.ok(mijn.length > 0, 'De speler kan niets doen en het spel loopt vast');
    const keuze = mijn[Math.floor(rng() * mijn.length)];
    if (keuze.type === 'play' && U.CARDS[keuze.card].color === 4) keuze.color = Math.floor(rng() * 4);
    spel = SPEL.doe(spel, keuze, rng);
  }
  return spel;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('een potje speelt tot het eind, met mens en computers, en tot 500 punten', () => {
  let klaar = 0;
  for (let g = 0; g < 40; g++) {
    opslag.clear();
    const rng = seeded(100 + g);
    const spel = SPEL.nieuw({ players: 2 + (g % 4), rng });
    spel.staat.target = 60;
    const af = speelUit(spel, rng, 20000);
    if (af.staat.over) {
      klaar++;
      assert.ok(af.staat.scores[af.staat.winner] >= 60);
    }
  }
  assert.ok(klaar > 30, 'Te weinig potjes af: ' + klaar);
});

test('bewaren en hervatten: een lopend potje komt terug zoals het was', () => {
  opslag.clear();
  const rng = seeded(5);
  let spel = SPEL.nieuw({ players: 3, rng });
  spel = SPEL.doe(spel, SPEL.computerZet(spel, rng) || U.legalActions(spel.staat, 0)[0], rng);
  SPEL.bewaar(spel);
  const terug = SPEL.laad();
  assert.deepStrictEqual(terug.staat, spel.staat);
  assert.deepStrictEqual(terug.zetels, spel.zetels);
});

test('een afgelopen potje wordt niet meer hervat', () => {
  opslag.clear();
  const spel = SPEL.nieuw({ players: 2, rng: seeded(9) });
  spel.staat.over = true;
  SPEL.bewaar(spel);
  assert.strictEqual(SPEL.laad(), null);
});

test('de ranglijst telt alleen gewonnen potjes, en oefenpotjes tellen niet mee', () => {
  opslag.clear();
  const rng = seeded(77);
  const gewoon = SPEL.nieuw({ players: 2, rng });
  gewoon.staat.target = 1;          // het potje is na de eerste uitgaande kaart af
  const einde = speelUit(gewoon, rng, 20000);
  assert.ok(einde.staat.over);
  SPEL.telAf(einde);
  const winnaar = einde.zetels[einde.staat.winner].naam;

  const oefen = SPEL.nieuw({ players: 2, rng, oefenen: true });
  oefen.staat.target = 1;
  const oefenAf = speelUit(oefen, rng, 20000);
  SPEL.telAf(oefenAf);

  const rang = SPEL.ranglijst();
  const totaal = rang.reduce((t, r) => t + r.gewonnen, 0);
  assert.strictEqual(totaal, 1, 'alleen het gewone potje telt mee');
  assert.strictEqual(rang[0].naam, winnaar);
});

test('een potje telt maar één keer mee, ook als het opnieuw wordt opgeslagen', () => {
  opslag.clear();
  const rng = seeded(31);
  const spel = SPEL.nieuw({ players: 2, rng });
  spel.staat.target = 1;
  const af = speelUit(spel, rng, 20000);
  const eerste = SPEL.telAf(af);
  SPEL.telAf(eerste);
  const totaal = SPEL.ranglijst().reduce((t, r) => t + r.gewonnen, 0);
  assert.strictEqual(totaal, 1);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('ok   ' + t.name); }
  catch (e) { failed++; console.log('FOUT ' + t.name + '\n     ' + e.message); }
}
console.log(failed ? failed + ' test(s) gefaald' : 'Alle ' + tests.length + ' tests zijn goed');
process.exitCode = failed ? 1 : 0;
