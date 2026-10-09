// Checks the Royal Flush Society rules: hand ranking, pots, betting rules,
// privacy, and thousands of random hands checked after every move.
// Run with: node poker/tests/engine.test.js
const E = require('../engine.js');
const assert = require('assert');

// Card from text: 'As' = ace of spades, '10h' = ten of hearts. Suits: s h r k.
function C(text) {
  const m = /^(10|[2-9AKQJ])([shrk])$/.exec(text);
  if (!m) throw new Error('Onbekende kaart ' + text);
  const ranks = { A: 14, K: 13, Q: 12, J: 11, '10': 10 };
  const rank = ranks[m[1]] || Number(m[1]);
  return ['s', 'h', 'r', 'k'].indexOf(m[2]) * 13 + (rank - 2);
}
const cards = list => list.split(' ').map(C);

function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Whole numbers 0..n-1 from a seed (for the deck shuffle).
function intRand(seed) { const r = seeded(seed); return n => Math.floor(r() * n); }

let checks = 0;
function test(name, fn) { fn(); checks++; console.log('ok  ' + name); }

// ---- Hand ranking ----------------------------------------------------------
test('royal flush is the best hand', () => {
  const ev = E.evaluate(cards('As Ks Qs Js 10s 2h 3r'));
  assert.strictEqual(ev.cat, 9);
  assert.strictEqual(E.describe(ev), 'een royal flush');
});

test('wheel (A-2-3-4-5) is a straight, and 6-high beats it', () => {
  const wheel = E.evaluate(cards('As 2h 3r 4c 5s'.replace(/c/g, 'k')));
  assert.strictEqual(wheel.cat, 4);
  assert.strictEqual(wheel.high, 5);
  const six = E.evaluate(cards('2s 3h 4r 5k 6s'.replace(/k/g, 'k')));
  assert.strictEqual(six.cat, 4);
  assert.strictEqual(E.compareKeys(six.key, wheel.key) > 0, true);
});

test('straight flush to the five beats quads', () => {
  const sf = E.evaluate(cards('As 2s 3s 4s 5s'));
  const quads = E.evaluate(cards('9s 9h 9r 9k Ks'));
  assert.strictEqual(sf.cat, 8);
  assert.strictEqual(E.compareKeys(sf.key, quads.key) > 0, true);
});

test('quads beat a full house; full house ranks by trips, then pair', () => {
  const quads = E.evaluate(cards('2s 2h 2r 2k 3s'));
  const boat = E.evaluate(cards('As Ah Ar Ks Kh'));
  assert.strictEqual(E.compareKeys(quads.key, boat.key) > 0, true);
  const kingsOver2 = E.evaluate(cards('Ks Kh Kr 2s 2h'));
  const queensOverA = E.evaluate(cards('Qs Qh Qr As Ah'));
  assert.strictEqual(E.compareKeys(kingsOver2.key, queensOverA.key) > 0, true);
  const acesKings = E.evaluate(cards('As Ah Ar Ks Kh'));
  const acesQueens = E.evaluate(cards('As Ah Ar Qs Qh'));
  assert.strictEqual(E.compareKeys(acesKings.key, acesQueens.key) > 0, true);
});

test('full house is described as in the rules text', () => {
  const ev = E.evaluate(cards('As Ah Ar Ks Kh'));
  assert.strictEqual(E.describe(ev), 'een full house, azen op koningen');
});

test('flush beats straight; flush compares by highest card first', () => {
  const flush = E.evaluate(cards('2h 5h 9h Jh Kh'));
  const straight = E.evaluate(cards('5s 6h 7r 8c 9s'.replace(/c/g, 'k')));
  assert.strictEqual(E.compareKeys(flush.key, straight.key) > 0, true);
  const flushA = E.evaluate(cards('As 3s 5s 7s 9s'));
  const flushK = E.evaluate(cards('Ks Qs Js 9s 8s'));
  assert.strictEqual(E.compareKeys(flushA.key, flushK.key) > 0, true);
});

test('two pair and pair use the kicker', () => {
  const q = E.evaluate(cards('As Ah Ks Kh Qr'.replace('Qr', 'Qk')));
  const j = E.evaluate(cards('As Ah Ks Kh Jr'.replace('Jr', 'Jk')));
  assert.strictEqual(E.compareKeys(q.key, j.key) > 0, true);
  const p1 = E.evaluate(cards('As Ah 9s 8h 7r'.replace('7r', '7k')));
  const p2 = E.evaluate(cards('As Ah 9s 8h 6r'.replace('6r', '6k')));
  assert.strictEqual(E.compareKeys(p1.key, p2.key) > 0, true);
});

test('best five out of seven: the board can make the hand', () => {
  // Two 2s in the hand, but the board holds a straight 5 to 9: the straight wins.
  const ev = E.evaluate(cards('2h 2r 5s 6s 7s 8s 9h'.replace('7s 8s', '7k 8s')));
  assert.strictEqual(ev.cat, 4);
  assert.strictEqual(ev.high, 9);
});

test('same best five cards on the board: equal keys (split pot)', () => {
  const a = E.evaluate(cards('2h 3h Ks Qs Js 9r 8k'));
  const b = E.evaluate(cards('4s 5h Ks Qs Js 9r 8k'));
  assert.strictEqual(E.compareKeys(a.key, b.key), 0);
});

// ---- Side pots --------------------------------------------------------------
test('side pots: main pot, a side pot, and an uncalled bet back', () => {
  const pl = [
    { total: 100, folded: false },
    { total: 300, folded: false },
    { total: 500, folded: false }
  ];
  const pots = E.buildPots(pl);
  assert.deepStrictEqual(pots.map(p => p.amount), [300, 400, 200]);
  assert.deepStrictEqual(pots.map(p => p.eligible), [[0, 1, 2], [1, 2], [2]]);
  assert.strictEqual(pots[2].refund, true);
  assert.strictEqual(pots[0].refund, false);
});

test('folded chips stay in the pot but cannot win it', () => {
  const pl = [
    { total: 50, folded: true },
    { total: 100, folded: false },
    { total: 100, folded: false }
  ];
  const pots = E.buildPots(pl);
  assert.strictEqual(pots.reduce((s, p) => s + p.amount, 0), 250);
  pots.forEach(p => assert.ok(!p.eligible.includes(0)));
});

// ---- Betting rules -----------------------------------------------------------
function headsUp(stack, rnd, deck) {
  return E.newHand({
    players: [{ id: 'a', name: 'Anna', stack: stack }, { id: 'b', name: 'Bram', stack: stack }],
    dealer: 0, sb: 5, bb: 10, rnd: rnd, deck: deck
  });
}

test('heads-up: the button posts the small blind and acts first before the flop', () => {
  const h = headsUp(1000, seeded(1));
  assert.strictEqual(h.sb, 0);
  assert.strictEqual(h.bb, 1);
  assert.strictEqual(h.current, 0);
  assert.strictEqual(h.players[0].bet, 5);
  assert.strictEqual(h.players[1].bet, 10);
});

test('minimum raise is the size of the last raise; below that is refused', () => {
  const h = headsUp(1000, seeded(2));
  assert.deepStrictEqual([E.legal(h, 0).minTo, E.legal(h, 0).maxTo], [20, 1000]);
  assert.strictEqual(E.act(h, 0, { type: 'raise', to: 15 }).ok, false);
  assert.strictEqual(E.act(h, 0, { type: 'raise', to: 20 }).ok, true);
  assert.strictEqual(h.current, 1);
});

test('check is refused when there is a bet to call; not your turn is refused', () => {
  const h = headsUp(1000, seeded(3));
  assert.strictEqual(E.act(h, 0, { type: 'check' }).ok, false);
  assert.strictEqual(E.act(h, 1, { type: 'check' }).ok, false);
});

test('folding ends the hand and the other player takes the blinds', () => {
  const h = headsUp(1000, seeded(4));
  E.act(h, 0, { type: 'fold' });
  assert.strictEqual(h.done, true);
  assert.strictEqual(h.players[1].stack, 1005);
  assert.strictEqual(h.players[0].stack, 995);
  assert.deepStrictEqual(E.summary(h), ['Bram wint 15, de anderen passen.']);
});

test('a short all-in does not reopen betting for a player who already acted', () => {
  // Anna raises to 100, Bram calls, Carla goes all-in for 130. That is less than
  // the minimum raise (190), so it does not reopen betting: Anna may call, not raise.
  const h = E.newHand({
    players: [{ id: 'a', name: 'Anna', stack: 1000 }, { id: 'b', name: 'Bram', stack: 1000 }, { id: 'c', name: 'Carla', stack: 130 }],
    dealer: 0, sb: 5, bb: 10, rnd: intRand(5)
  });
  assert.strictEqual(h.current, 0);                       // first to act: left of the big blind
  assert.strictEqual(E.act(h, 0, { type: 'raise', to: 100 }).ok, true);
  assert.strictEqual(E.act(h, 1, { type: 'call' }).ok, true);
  assert.strictEqual(E.act(h, 2, { type: 'raise', to: 130 }).ok, true);   // 30 more: less than the 90 minimum raise
  assert.strictEqual(E.legal(h, 0).canRaise, false);      // Anna already acted: no re-raise
  assert.strictEqual(E.legal(h, 0).canCall, true);
});

// ---- Privacy -----------------------------------------------------------------
test('each phone only gets its own cards until the showdown', () => {
  const h = E.newHand({
    players: [{ id: 'a', name: 'Anna', stack: 1000 }, { id: 'b', name: 'Bram', stack: 1000 }, { id: 'c', name: 'Carla', stack: 1000 }],
    dealer: 0, sb: 5, bb: 10, rnd: intRand(6)
  });
  const v = E.viewFor(h, 0);
  assert.strictEqual(v.deck, undefined);
  assert.deepStrictEqual(v.players[0].cards, h.players[0].cards);
  assert.ok(v.players[1].cards.every(c => c === null));
  assert.ok(v.players[2].cards.every(c => c === null));
});

// ---- Random hands ------------------------------------------------------------
// Plays many random hands with random legal moves and checks the rules after every move.
function randomMove(h, rand) {
  const L = E.legal(h, h.current);
  const r = rand();
  if (L.canCheck) {
    if (r < 0.6 || !L.canRaise) return { type: 'check' };
    if (r < 0.85) return { type: 'raise', to: pickTo(L, rand) };
    return { type: 'allin' };
  }
  if (r < 0.2) return { type: 'fold' };
  if (r < 0.6) return { type: 'call' };
  if (L.canRaise && r < 0.85) return { type: 'raise', to: pickTo(L, rand) };
  if (L.canRaise && r < 0.92) return { type: 'allin' };
  return { type: 'fold' };
}
function pickTo(L, rand) {
  if (rand() < 0.2) return L.maxTo;
  return L.minTo + Math.floor(rand() * (L.maxTo - L.minTo + 1));
}

function checkInvariants(h, start) {
  const P = h.players;
  P.forEach(p => {
    assert.ok(p.stack >= 0 && p.bet >= 0 && p.total >= 0, 'negative chips');
    if (p.out) { assert.strictEqual(p.stack, 0); assert.strictEqual(p.cards.length, 0); }
  });
  if (!h.done) {
    const sum = P.reduce((s, p) => s + p.stack + p.total, 0);
    assert.strictEqual(sum, start, 'chips went missing during the hand');
  }
  if (h.done) {
    const paid = h.awards.reduce((s, a) => s + a.amount, 0);
    const put = P.reduce((s, p) => s + p.total, 0);
    assert.strictEqual(paid, put, 'pots not fully paid out');
    assert.strictEqual(P.reduce((s, p) => s + p.stack, 0), start, 'chips changed after the hand');
    const live = P.filter(p => !p.folded && !p.out).length;
    if (live > 1) assert.strictEqual(h.board.length, 5, 'showdown without a full board');
  }
  // no card is dealt twice
  const used = [];
  P.forEach(p => used.push(...p.cards));
  used.push(...h.board);
  assert.strictEqual(new Set(used).size, used.length, 'a card was dealt twice');
}

function playOneHand(players, dealer, sb, bb, rand, stats) {
  const h = E.newHand({ players, dealer, sb, bb, rnd: n => Math.floor(rand() * n) });
  const start = h.startTotal;
  let guard = 0;
  checkInvariants(h, start);
  while (!h.done) {
    assert.ok(++guard < 500, 'hand does not end');
    const idx = h.current;
    assert.ok(idx >= 0 && !h.players[idx].folded && !h.players[idx].out, 'turn on someone who cannot act');
    const L = E.legal(h, idx);
    const move = randomMove(h, rand);
    // a move that is not allowed must be refused, and change nothing
    if (move.type === 'check' && L.toCall > 0) {
      const before = JSON.stringify(h);
      assert.strictEqual(E.act(h, idx, move).ok, false);
      assert.strictEqual(JSON.stringify(h), before);
    }
    const res = E.act(h, idx, move);
    assert.strictEqual(res.ok, true, 'legal move refused: ' + JSON.stringify(move) + ' ' + res.error);
    if (move.type === 'allin') stats.allIns++;
    checkInvariants(h, start);
  }
  if (h.showdown.length) stats.showdowns++;
  if (h.showdown.length && h.awards.length) {
    // every pot went to a best hand among those who could win it
    const pots = E.buildPots(h.players);
    const best = {};
    h.showdown.forEach(s => { best[s.idx] = s.ev; });
    pots.forEach(pot => {
      if (pot.eligible.length < 2) return;
      const top = pot.eligible.map(i => best[i]).reduce((a, b) => (E.compareKeys(a.key, b.key) >= 0 ? a : b));
      h.awards.filter(a => a.pot === pots.indexOf(pot) && a.amount > 0).forEach(a => {
        assert.strictEqual(E.compareKeys(best[a.idx].key, top.key), 0, 'a losing hand won a pot');
      });
    });
  }
  if (E.buildPots(h.players).length > 1) stats.multiPotHands++;
  return h;
}

test('thousands of random hands keep every rule and every chip', () => {
  const stats = { hands: 0, showdowns: 0, allIns: 0, multiPotHands: 0, games: 0 };
  for (let g = 0; g < 700; g++) {
    const seed = 1000 + g;
    const rand = seeded(seed);
    const n = 2 + Math.floor(rand() * 7);
    let players = [];
    const stackChoices = [0, 20, 50, 100, 200, 500, 1000, 2000];
    for (let i = 0; i < n; i++) players.push({ id: 'p' + i, name: 'P' + i, stack: stackChoices[Math.floor(rand() * stackChoices.length)] });
    if (players.filter(p => p.stack > 0).length < 2) { players[0].stack = 400; players[1].stack = 400; }
    let dealer = Math.floor(rand() * n);
    stats.games++;
    for (let hand = 0; hand < 60; hand++) {
      const alive = players.filter(p => p.stack > 0);
      if (alive.length < 2) break;
      const blindSets = [[5, 10], [10, 20], [25, 50], [1, 2]];
      const [sb, bb] = blindSets[Math.floor(rand() * blindSets.length)];
      const h = playOneHand(players, dealer, sb, bb, rand, stats);
      stats.hands++;
      players = h.players.map(p => ({ id: p.id, name: p.name, stack: p.stack }));
      dealer = (dealer + 1) % n;
    }
  }
  assert.ok(stats.hands > 5000, 'too few hands: ' + stats.hands);
  assert.ok(stats.showdowns > 100);
  assert.ok(stats.allIns > 50);
  console.log('    ' + JSON.stringify(stats));
});

console.log('\n' + checks + ' test-groepen geslaagd.');
