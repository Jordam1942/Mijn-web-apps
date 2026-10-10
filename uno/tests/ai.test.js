// Controleert de computerspelers: ze spelen alleen geldige zetten, roepen UNO voordat er
// iemand anders speelt, en maken hun potjes af, in alle drie de stijlen en in alle combinaties.
// Draai met: node uno/tests/ai.test.js
const U = require('../engine.js');
const AI = require('../ai.js');
const assert = require('assert');

function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Eén stap van de computers. Eerst komen UNO-roepen, daarna de zetten buiten de beurt
// (kleur kiezen, accepteren), en pas dan de speler aan de beurt. Geeft de nieuwe staat en de gekozen zet.
function botStep(s, stijlen, rng) {
  for (let p = 0; p < s.n; p++) {
    const a = AI.choose(s, p, stijlen[p], rng);
    if (a && a.type === 'uno') return { s: U.apply(s, a, rng), a };
  }
  for (let p = 0; p < s.n; p++) {
    const a = AI.choose(s, p, stijlen[p], rng);
    if (a && !['play', 'draw', 'pass'].includes(a.type)) return { s: U.apply(s, a, rng), a };
  }
  const a = AI.choose(s, s.cur, stijlen[s.cur], rng);
  assert.ok(a, 'De computer aan de beurt kan niets doen');
  return { s: U.apply(s, a, rng), a };
}

function stijlenVoor(players, g) {
  const stijlen = [];
  for (let p = 0; p < players; p++) stijlen.push(AI.STYLES[(p + g) % AI.STYLES.length]);
  return stijlen;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('elke stijl kiest een geldige zet, ook bij een wild of een kleurkeuze', () => {
  for (const stijl of AI.STYLES) {
    for (let i = 0; i < 50; i++) {
      const rng = seeded(i + 1);
      const s = U.newGame({ players: 2 + (i % 7), rng });
      const a = AI.choose(s, s.cur, stijl, rng);
      assert.ok(a, 'geen zet gekozen');
      U.apply(s, a, rng); // gooit een fout als de zet niet mag
    }
  }
});

test('de computer roept UNO voordat iemand anders speelt', () => {
  let roepen = 0;
  for (let players = 2; players <= 8; players++) {
    for (let g = 0; g < 80; g++) {
      const rng = seeded(players * 500 + g);
      const stijlen = stijlenVoor(players, g);
      let s = U.newGame({ players, rng });
      for (let step = 0; step < 1500 && !s.over; step++) {
        const voor = s;
        const r = botStep(s, stijlen, rng);
        s = r.s;
        // Stond er een venster open dat niet is afgeroepen, dan moet de computer nu UNO roepen
        if (voor.unoWindow && !voor.unoWindow.called) {
          assert.strictEqual(r.a.type, 'uno', 'De computer roept UNO niet op tijd');
          roepen++;
        }
      }
    }
  }
  assert.ok(roepen > 0, 'De computer heeft nooit UNO geroepen');
  console.log('   ' + roepen + ' keer UNO op tijd geroepen');
});

test('alle drie de stijlen maken potjes af, ook als ze tegen elkaar spelen', () => {
  const gewonnen = { rustig: 0, normaal: 0, agressief: 0 };
  let klaar = 0;
  for (let players = 2; players <= 8; players++) {
    for (let g = 0; g < 60; g++) {
      const rng = seeded(7000 + players * 100 + g);
      const stijlen = stijlenVoor(players, g);
      let s = U.newGame({ players, rng });
      s.target = 100;
      for (let step = 0; step < 4000 && !s.over; step++) s = botStep(s, stijlen, rng).s;
      if (s.over) {
        klaar++;
        gewonnen[stijlen[s.winner]]++;
        assert.ok(s.scores[s.winner] >= s.target);
      }
    }
  }
  assert.ok(klaar > 0, 'Geen enkel potje is afgemaakt');
  console.log('   ' + klaar + ' potjes af, gewonnen per stijl: ' + JSON.stringify(gewonnen));
});

test('pakken: de computer pakt alleen een mens die UNO vergeten is, en alleen als pakken is toegestaan', () => {
  const s = U.newGame({ players: 2, rng: seeded(1) });
  // Speler 0 (de mens) heeft één kaart en heeft niet geroepen
  s.unoWindow = { p: 0, called: false };
  s.hands[0] = [s.hands[0][0]];
  s.cur = 1;
  // Zonder pakken-optie komt er nooit een pak-zet
  for (let i = 0; i < 200; i++) {
    const a = AI.choose(s, 1, 'agressief', seeded(i), {});
    assert.ok(!a || a.type !== 'catch');
  }
  // Met de optie pakt de agressieve computer altijd
  assert.strictEqual(AI.choose(s, 1, 'agressief', seeded(3), { pakken: true }).type, 'catch');
  // Een rustige computer pakt maar soms
  let rustig = 0;
  for (let i = 0; i < 400; i++) {
    const a = AI.choose(s, 1, 'rustig', seeded(i + 100), { pakken: true });
    if (a && a.type === 'catch') rustig++;
  }
  assert.ok(rustig > 100 && rustig < 300, 'Rustige pakkans is ' + rustig + ' van 400');
});

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log('ok   ' + t.name);
  } catch (e) {
    failed++;
    console.log('FOUT ' + t.name + '\n     ' + e.message);
  }
}
console.log(failed ? failed + ' test(s) gefaald' : 'Alle ' + tests.length + ' tests zijn goed');
process.exitCode = failed ? 1 : 0;
