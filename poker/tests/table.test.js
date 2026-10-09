// Table rules with computer players: chips stay whole, a saved game holds no hidden
// computer cards, and a player can leave in the middle of a hand.
// Run with: node poker/tests/table.test.js
const T = require('../table.js');
const E = require('../engine.js');
const assert = require('assert');

// A simple scheduler: callbacks wait in a queue and run one by one (no real timers).
function makeQueue() {
  const q = [];
  return {
    later: (fn) => { const t = { fn, dead: false }; q.push(t); return t; },
    cancel: (t) => { if (t) t.dead = true; },
    run: (max) => { let n = 0; while (q.length && n++ < max) { const t = q.shift(); if (!t.dead) t.fn(); } return n; },
    size: () => q.length
  };
}
function seededRnd(seed) { let a = seed >>> 0; return n => { a = (a * 1664525 + 1013904223) >>> 0; return Math.floor((a / 4294967296) * n); }; }

function setup(seed, stacks) {
  const Q = makeQueue();
  const seats = stacks.map((s, i) => ({ id: 'p' + i, name: 'P' + i, kind: i === 0 ? 'human' : 'bot', stack: s, style: ['voorzichtig', 'gemiddeld', 'agressief'][i % 3] }));
  let cashed = 0;
  const table = T.create({
    level: { sb: 5, bb: 10, min: 200, max: 1000 }, seats, speed: 'snel', rnd: seededRnd(seed), autoNext: false,
    later: Q.later, cancel: Q.cancel, onCashOut: (i, amount) => { cashed += amount; }
  });
  return { table, Q, total: () => {
      // during a hand the chips in the pot count too; after it, the stacks hold everything
      const h = table.hand;
      const onTable = h && !h.done ? h.players.reduce((s, p) => s + p.stack + p.total, 0) : table.seats.reduce((s, x) => s + x.stack, 0);
      return onTable + cashed - table.rebought;
    } };
}

// Plays the human seat with random legal moves, lets computer players play, checks chips after every step.
function playUntilDone(ctx, rand, guard) {
  for (let steps = 0; steps < guard; steps++) {
    const h = ctx.table.hand;
    if (h && h.done) break;
    if (h && h.current === 0) {
      const L = E.legal(h, 0);
      const pick = rand(4);
      if (pick === 0 || (!L.canCheck && pick === 1)) ctx.table.act(0, { type: 'fold' });
      else if (L.canCheck) ctx.table.act(0, { type: 'check' });
      else if (L.canRaise && pick === 2) ctx.table.act(0, { type: 'raise', to: L.minTo });
      else ctx.table.act(0, { type: 'call' });
      continue;
    }
    if (ctx.Q.size() === 0) break;
    ctx.Q.run(1);
  }
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('chips stay whole over a long session with computer players', () => {
  const ctx = setup(7, [1000, 800, 1200, 600]);
  const start = ctx.total();
  const rand = seededRnd(99);
  for (let round = 0; round < 80; round++) {
    if (ctx.table.seats.filter(s => s.stack > 0 && s.kind !== 'empty').length < 2) break;
    if (!ctx.table.hand || ctx.table.hand.done) ctx.table.startHand();
    playUntilDone(ctx, rand, 2000);
    assert.strictEqual(ctx.total(), start + 0, 'fiches verdwenen of erbij gekomen');
  }
});

test('a saved game in the middle of a hand holds no computer cards, and resumes fairly', () => {
  const ctx = setup(11, [1000, 1000, 1000]);
  ctx.table.startHand();
  // run until it is the human's turn in a live hand
  for (let k = 0; k < 500 && !(ctx.table.hand && !ctx.table.hand.done && ctx.table.hand.current === 0); k++) ctx.Q.run(1);
  assert.ok(ctx.table.hand && ctx.table.hand.current === 0, 'geen beurt voor jou gevonden');
  const humanCards = ctx.table.hand.players[0].cards.slice();
  const saved = JSON.parse(JSON.stringify(ctx.table.snapshot()));
  assert.strictEqual(saved.hand.deck, undefined);
  assert.strictEqual(saved.hand.pos, undefined);
  saved.hand.players.forEach((p, i) => { if (i !== 0) assert.strictEqual(p.cards.length, 0, 'bot-kaarten opgeslagen'); });
  assert.deepStrictEqual(saved.hand.players[0].cards, humanCards);

  const Q2 = makeQueue();
  const seats = saved.seats;
  const again = T.create({ level: saved.level, seats, speed: 'snel', rnd: seededRnd(5), autoNext: false, later: Q2.later, cancel: Q2.cancel });
  again.restore(saved);
  const all = [];
  again.hand.players.forEach(p => all.push(...p.cards));
  again.hand.board.forEach(c => all.push(c));
  assert.strictEqual(new Set(all).size, all.length, 'een kaart dubbel na herstel');
  assert.deepStrictEqual(again.hand.players[0].cards, humanCards);
});

test('leaving during a hand: the fiches come back only after the hand', () => {
  const cashes = [];
  const Q = makeQueue();
  const seats = [
    { id: 'a', name: 'Anna', kind: 'human', stack: 1000 },
    { id: 'b', name: 'Bram', kind: 'bot', stack: 1000, style: 'gemiddeld' },
    { id: 'c', name: 'Carla', kind: 'bot', stack: 1000, style: 'agressief' }
  ];
  const table = T.create({ level: { sb: 5, bb: 10, min: 200, max: 1000 }, seats, speed: 'snel', rnd: seededRnd(3), autoNext: false, later: Q.later, cancel: Q.cancel, onCashOut: (i, a) => cashes.push([i, a]) });
  table.startHand();
  table.leave(0);
  assert.strictEqual(cashes.length, 0, 'te vroeg uitbetaald');
  const rand = seededRnd(4);
  playUntilDone({ table, Q, total: () => 0 }, rand, 3000);
  assert.strictEqual(cashes.length, 1);
  assert.strictEqual(cashes[0][0], 0);
  assert.strictEqual(table.seats[0].kind, 'empty');
});

test('blinds go up every N hands when the tournament option is on', () => {
  const Q = makeQueue();
  const levels = [{ level: 1, sb: 5, bb: 10, min: 200, max: 1000 }, { level: 2, sb: 10, bb: 20, min: 400, max: 2000 }, { level: 3, sb: 15, bb: 30, min: 600, max: 3000 }];
  const seats = [{ id: 'a', name: 'A', kind: 'bot', stack: 5000, style: 'gemiddeld' }, { id: 'b', name: 'B', kind: 'bot', stack: 5000, style: 'gemiddeld' }];
  const table = T.create({ level: levels[0], seats, speed: 'snel', rnd: seededRnd(8), autoNext: false, blindEvery: 2, nextLevel: l => levels[Math.min(levels.length - 1, l.level)], later: Q.later, cancel: Q.cancel });
  const rand = seededRnd(12);
  for (let k = 0; k < 6; k++) {
    table.startHand();
    playUntilDone({ table, Q }, rand, 3000);
  }
  assert.strictEqual(table.level.level, 3, 'blinds zijn niet omhoog gegaan');
});

test('leaving at once: the stack comes back now, the pot stays, the chips still add up', () => {
  const cashes = [];
  const Q = makeQueue();
  const seats = [
    { id: 'a', name: 'Anna', kind: 'human', stack: 1000 },
    { id: 'b', name: 'Bram', kind: 'bot', stack: 1000, style: 'gemiddeld' },
    { id: 'c', name: 'Carla', kind: 'bot', stack: 1000, style: 'agressief' }
  ];
  const table = T.create({ level: { sb: 5, bb: 10, min: 200, max: 1000 }, seats, speed: 'snel', rnd: seededRnd(21), autoNext: false, later: Q.later, cancel: Q.cancel, onCashOut: (i, a) => cashes.push([i, a]) });
  table.startHand();
  const before = table.hand.players.reduce((s, p) => s + p.stack + p.total, 0);
  table.leaveNow(0);
  assert.strictEqual(cashes.length, 1, 'fiches niet direct teruggegeven');
  assert.strictEqual(cashes[0][0], 0);
  assert.ok(cashes[0][1] > 0 && cashes[0][1] < 1000, 'verkeerd bedrag: ' + cashes[0][1]);
  assert.strictEqual(table.seats[0].kind, 'empty');
  // the rest of the hand is played without Anna and the chips still add up
  playUntilDone({ table, Q }, seededRnd(22), 3000);
  const after = table.hand.players.reduce((s, p) => s + p.stack, 0) + cashes[0][1];   // after the hand: stacks hold the rest
  assert.ok(table.hand.done, 'ronde is niet klaar');
  assert.strictEqual(after, before, 'fiches kloppen niet');
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
console.log('\n' + (tests.length - failed) + '/' + tests.length + ' table-tests geslaagd.');
if (failed) process.exit(1);
