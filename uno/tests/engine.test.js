// Controleert de Uno-regels: het spel, de beurt, de richting, UNO roepen en straffen,
// en duizenden willekeurige potjes die na elke zet worden gecontroleerd.
// Draai met: node uno/tests/engine.test.js
const U = require('../engine.js');
const assert = require('assert');

// Zelfde gewone random-generator als bij poker, zodat elke test steeds hetzelfde speelt.
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Kaartnaam: r=rood y=geel g=groen b=blauw, daarna het getal of S (sla over), R (keer om), D (pak 2). W = wild, W4 = pak 4.
const LETTER = ['r', 'y', 'g', 'b'];
const SYMBOL = { skip: 'S', reverse: 'R', draw2: 'D' };
function code(id) {
  const c = U.CARDS[id];
  if (c.kind === 'wild') return 'W';
  if (c.kind === 'wild4') return 'W4';
  return LETTER[c.color] + (c.kind === 'num' ? String(c.value) : SYMBOL[c.kind]);
}

// Maakt een spel met vaste handen en een vaste bovenkaart. Namen worden in de volgorde van de lijst gebruikt.
function setup(players, hands, top) {
  const taken = new Set();
  const take = name => {
    const id = U.CARDS.findIndex((_, i) => !taken.has(i) && code(i) === name);
    if (id < 0) throw new Error('Geen kaart meer: ' + name);
    taken.add(id);
    return id;
  };
  const h = hands.map(list => list.map(take));
  const t = take(top);
  return U.newGame({ players, rng: seeded(3), deal: { hands: h, top: t } });
}
function act(s, action) { return U.apply(s, action, seeded(5)); }
function play(s, p, name, color) {
  const id = s.hands[p].find(i => code(i) === name);
  if (id === undefined) throw new Error('Speler ' + p + ' heeft ' + name + ' niet');
  return act(s, { type: 'play', p, card: id, color });
}
function has(s, p, type) { return U.legalActions(s, p).some(a => a.type === type); }

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('het spel heeft 108 kaarten: 76 getal, 8 sla over, 8 keer om, 8 pak 2, 4 wild en 4 wild pak 4', () => {
  const count = {};
  U.CARDS.forEach(c => { count[c.kind] = (count[c.kind] || 0) + 1; });
  assert.strictEqual(U.CARDS.length, 108);
  assert.strictEqual(count.num, 76);
  assert.strictEqual(count.skip, 8);
  assert.strictEqual(count.reverse, 8);
  assert.strictEqual(count.draw2, 8);
  assert.strictEqual(count.wild, 4);
  assert.strictEqual(count.wild4, 4);
  for (let c = 0; c < 4; c++) {
    assert.strictEqual(U.CARDS.filter(x => x.color === c && x.kind === 'num' && x.value === 0).length, 1);
  }
});

test('start: elk 7 kaarten, en de kaarten zijn allemaal verschillend', () => {
  const s = U.newGame({ players: 4, rng: seeded(1) });
  s.hands.forEach(h => assert.strictEqual(h.length, 7));
  assert.strictEqual(s.discard.length, 1);
  assert.notStrictEqual(U.CARDS[U.topId(s)].kind, 'wild4');
});

test('beurt: na een gewone kaart is de volgende speler aan de beurt', () => {
  const s = setup(3, [['r3', 'b9'], ['g1', 'y2'], ['b2', 'g8']], 'r5');
  const s2 = play(s, 0, 'r3');
  assert.strictEqual(s2.cur, 1);
  assert.throws(() => play(s2, 0, 'b9'), /Deze zet mag nu niet/);
});

test('buiten de beurt spelen mag niet, en een kaart van iemand anders ook niet', () => {
  const s = setup(2, [['r3'], ['r1', 'g2']], 'r5');
  assert.throws(() => act(s, { type: 'play', p: 1, card: s.hands[1][0] }), /Deze zet mag nu niet/);
  assert.throws(() => act(s, { type: 'play', p: 0, card: s.hands[1][0] }), /Deze zet mag nu niet/);
});

test('sla over: de volgende speler wordt overgeslagen', () => {
  const s = setup(3, [['rS', 'b9'], ['g1', 'y2'], ['b2', 'g8']], 'r5');
  assert.strictEqual(play(s, 0, 'rS').cur, 2);
});

test('keer om: de richting draait en de beurt gaat de andere kant op', () => {
  const s = setup(3, [['rR', 'b9'], ['g1', 'y2'], ['r1', 'g8']], 'r5');
  const s2 = play(s, 0, 'rR');
  assert.strictEqual(s2.dir, -1);
  assert.strictEqual(s2.cur, 2);
  assert.strictEqual(play(s2, 2, 'r1').cur, 1);
});

test('keer om bij twee spelers werkt als overslaan: dezelfde speler is weer aan de beurt', () => {
  const s = setup(2, [['rR', 'b9'], ['r4', 'g4']], 'r5');
  const s2 = play(s, 0, 'rR');
  assert.strictEqual(s2.cur, 0);
  assert.ok(has(s2, 0, 'draw'));
});

test('pak 2: de volgende speler pakt 2 kaarten en wordt overgeslagen', () => {
  const s = setup(2, [['rD', 'b9'], ['g4', 'y4']], 'r5');
  const s2 = play(s, 0, 'rD');
  assert.strictEqual(s2.hands[1].length, 4);
  assert.strictEqual(s2.cur, 0);
});

test('startkaart pak 2: de eerste speler pakt 2 en moet een beurt overslaan', () => {
  const s = setup(3, [['b9', 'g9'], ['b1', 'g1'], ['b2', 'g2']], 'rD');
  assert.strictEqual(s.hands[0].length, 4);
  assert.strictEqual(s.cur, 1);
});

test('startkaart wild: de eerste speler kiest de kleur', () => {
  const s = setup(2, [['b1', 'g1'], ['b2', 'g2']], 'W');
  assert.strictEqual(s.needColor, 0);
  assert.ok(U.legalActions(s, 0).every(a => a.type === 'chooseColor'));
  assert.ok(U.legalActions(s, 1).length === 0);
  const s2 = act(s, { type: 'chooseColor', p: 0, color: 3 });
  assert.strictEqual(s2.color, 3);
  assert.strictEqual(play(s2, 0, 'b1').cur, 1);
});

test('wild: de speler kiest de kleur, en de volgende speler moet die kleur volgen', () => {
  const s = setup(2, [['W', 'g1'], ['g5', 'y2']], 'r5');
  assert.throws(() => play(s, 0, 'W'), /Kies een kleur/);
  const s2 = play(s, 0, 'W', 1);
  assert.strictEqual(s2.color, 1);
  const legal = U.legalActions(s2, 1).filter(a => a.type === 'play').map(a => code(a.card));
  assert.deepStrictEqual(legal, ['y2']);
});

test('wild pak 4 mag niet als je een kaart van de kleur hebt', () => {
  const s = setup(2, [['W4', 'r3'], ['g1', 'y1']], 'r5');
  assert.ok(!U.legalActions(s, 0).some(a => a.type === 'play' && code(a.card) === 'W4'));
  assert.throws(() => play(s, 0, 'W4', 2), /Deze zet mag nu niet/);
});

test('wild pak 4: de volgende speler kan accepteren (4 kaarten en beurt over) of aanvechten', () => {
  const s = setup(3, [['W4', 'b9'], ['g1', 'y1'], ['b2', 'b3']], 'r5');
  const pending = play(s, 0, 'W4', 2);
  assert.strictEqual(pending.cur, 1);
  assert.ok(has(pending, 1, 'accept') && has(pending, 1, 'challenge'));
  const accepted = act(pending, { type: 'accept', p: 1 });
  assert.strictEqual(accepted.hands[1].length, 6);
  assert.strictEqual(accepted.cur, 2);
  // Aanvechten: speler 0 had geen rood, dus de aanvaller pakt 6 kaarten
  const challenged = act(pending, { type: 'challenge', p: 1 });
  assert.strictEqual(challenged.hands[1].length, 8);
  assert.strictEqual(challenged.cur, 2);
  assert.strictEqual(challenged.hands[0].length, 1);
});

test('UNO: wie met één kaart staat, kan gepakt worden voordat de volgende speler zet, tenzij hij UNO roept', () => {
  const s = setup(2, [['r3', 'r9'], ['g1', 'g2']], 'r5');
  const s2 = play(s, 0, 'r3');
  assert.ok(has(s2, 1, 'catch'));
  const caught = act(s2, { type: 'catch', p: 1, target: 0 });
  assert.strictEqual(caught.hands[0].length, 3);
  assert.strictEqual(caught.unoWindow, null);

  const called = act(s2, { type: 'uno', p: 0 });
  assert.ok(!has(called, 1, 'catch'));
  assert.strictEqual(called.hands[0].length, 1);
});

test('UNO: na de volgende zet kan je niet meer gepakt worden', () => {
  const s = setup(2, [['r3', 'r9'], ['b1', 'g2']], 'r5');
  const s2 = play(s, 0, 'r3');
  const after = act(s2, { type: 'draw', p: 1 });
  assert.strictEqual(after.unoWindow, null);
});

test('niet kunnen spelen: je pakt één kaart, en je mag die alleen leggen als hij past of je past', () => {
  const s = setup(2, [['b9', 'g9'], ['b1', 'g1']], 'r5');
  assert.ok(has(s, 0, 'draw'));
  assert.ok(!has(s, 0, 'pass'));
  const drawn = act(s, { type: 'draw', p: 0 });
  assert.strictEqual(drawn.hands[0].length, 3);
  assert.ok(has(drawn, 0, 'pass'));
  assert.ok(!has(drawn, 0, 'draw'));
  const passed = act(drawn, { type: 'pass', p: 0 });
  assert.strictEqual(passed.cur, 1);
});

test('je mag niet pakken als je wel een kaart kunt leggen', () => {
  const s = setup(2, [['r3', 'g9'], ['b1', 'g1']], 'r5');
  assert.ok(!has(s, 0, 'draw'));
});

test('uitgaan: de punten van de andere kaarten gaan naar de winnaar, en er begint een nieuwe ronde', () => {
  const s = setup(2, [['r3'], ['b9', 'g4']], 'r5');
  const s2 = play(s, 0, 'r3');
  assert.strictEqual(s2.scores[0], 13);
  assert.strictEqual(s2.over, false);
  assert.strictEqual(s2.round, 2);
  s2.hands.forEach(h => assert.strictEqual(h.length, 7));
});

test('het spel is afgelopen bij het doel, en de hoogste score wint', () => {
  const s = setup(2, [['r3'], ['b9', 'g4']], 'r5');
  s.target = 13;
  const done = play(s, 0, 'r3');
  assert.strictEqual(done.over, true);
  assert.strictEqual(done.winner, 0);
  assert.deepStrictEqual(U.legalActions(done, 0), []);
  assert.deepStrictEqual(U.legalActions(done, 1), []);
});

test('privé: een speler ziet alleen zijn eigen hand, niet de trekstapel', () => {
  const s = U.newGame({ players: 3, rng: seeded(11) });
  const v = U.viewFor(s, 1);
  assert.strictEqual(v.hands[1].length, 7);
  assert.ok(v.hands[1].every(x => typeof x === 'number'));
  assert.ok(v.hands[0].every(x => x === null));
  assert.ok(v.hands[2].every(x => x === null));
  assert.deepStrictEqual(v.draw, []);
  assert.strictEqual(v.drawCount, s.draw.length);
});

// Duizenden willekeurige potjes. Na elke zet worden de regels gecontroleerd.
test('duizenden willekeurige potjes: 108 kaarten, de beurt, de richting en geen ongeldige kaart', () => {
  let moves = 0, finished = 0, rounds = 0, unoCalls = 0, catches = 0;
  for (let players = 2; players <= 8; players++) {
    for (let g = 0; g < 120; g++) {
      const rng = seeded(players * 1000 + g);
      let s = U.newGame({ players, rng });
      for (let step = 0; step < 600 && !s.over; step++) {
        // Alle zetten van alle spelers, dan één willekeurige kiezen
        const options = [];
        for (let p = 0; p < players; p++) U.legalActions(s, p).forEach(a => options.push(a));
        assert.ok(options.length > 0, 'Vastgelopen spel: niemand kan iets doen');
        const pick = options[Math.floor(rng() * options.length)];
        if (pick.type === 'play' && U.CARDS[pick.card].color === 4) pick.color = Math.floor(rng() * 4);

        // Een kaart die niet mag, moet een fout geven
        if (pick.type === 'play' && s.needColor === null) {
          const allowed = U.legalActions(s, pick.p).filter(a => a.type === 'play').map(a => a.card);
          s.hands[s.cur].filter(id => !allowed.includes(id)).forEach(id => {
            assert.throws(() => act(s, { type: 'play', p: s.cur, card: id, color: 0 }), /Deze zet mag nu niet/);
          });
        }

        const before = s;
        const prevDir = before.dir;
        const prevRound = before.round;
        s = U.apply(s, pick, rng);
        moves++;
        if (pick.type === 'uno') unoCalls++;
        if (pick.type === 'catch') catches++;

        // 108 kaarten, altijd
        const all = [].concat(...s.hands, s.draw, s.discard).sort((a, b) => a - b);
        assert.strictEqual(all.length, 108);
        assert.deepStrictEqual(all, U.CARDS.map((_, i) => i));
        assert.ok(s.cur >= 0 && s.cur < players);
        assert.ok(s.dir === 1 || s.dir === -1);

        // Alleen de speler aan de beurt speelt of trekt
        if (['play', 'draw', 'pass'].includes(pick.type)) assert.strictEqual(pick.p, before.cur);

        if (pick.type === 'play' && s.round === prevRound) {
          const c = U.CARDS[pick.card];
          if (c.kind === 'num' && !s.over) {
            // Gewone kaart: de volgende speler in dezelfde richting
            assert.strictEqual(s.cur, ((pick.p + prevDir) % players + players) % players);
          }
          // Met één kaart moet het UNO-venster openstaan voor die speler
          if (s.hands[pick.p].length === 1) assert.strictEqual(s.unoWindow.p, pick.p);
        }
        if (s.round !== prevRound) rounds++;
      }
      if (s.over) {
        finished++;
        assert.ok(s.scores[s.winner] >= s.target);
      }
    }
  }
  assert.ok(finished > 0, 'Er is geen enkel potje uitgespeeld');
  console.log('   ' + moves + ' zetten, ' + finished + ' potjes uit, ' + rounds + ' rondes, ' + unoCalls + ' keer UNO, ' + catches + ' keer gepakt');
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
