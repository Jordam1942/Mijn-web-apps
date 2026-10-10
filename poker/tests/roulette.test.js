// Roulette rules: the wheel, the colours, the payouts and a fair spin.
// Run with: node poker/tests/roulette.test.js
const R = require('../roulette-engine.js');
const assert = require('assert');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('the wheel has every number 0-36 once, and 18 red, 18 black and one green zero', () => {
  assert.strictEqual(R.WHEEL.length, 37);
  assert.deepStrictEqual([...R.WHEEL].sort((a, b) => a - b), Array.from({ length: 37 }, (_, i) => i));
  const colors = R.WHEEL.map(n => R.color(n));
  assert.strictEqual(colors.filter(c => c === 'red').length, 18);
  assert.strictEqual(colors.filter(c => c === 'black').length, 18);
  assert.strictEqual(R.color(0), 'green');
});

test('outside bets win on their group and lose on the zero', () => {
  assert.ok(R.wins('red', 1) && !R.wins('black', 1));
  assert.ok(R.wins('even', 2) && R.wins('odd', 3));
  assert.ok(R.wins('low', 18) && R.wins('high', 19));
  assert.ok(R.wins('d:2', 13) && !R.wins('d:2', 25));
  assert.ok(R.wins('c:1', 1) && R.wins('c:1', 34) && !R.wins('c:1', 3));
  for (const k of ['red', 'black', 'even', 'odd', 'low', 'high', 'd:1', 'c:1']) assert.ok(!R.wins(k, 0), k + ' wint op de nul');
});

test('payouts: 35 to 1 on a number, 2 to 1 on dozens and columns, 1 to 1 outside', () => {
  assert.strictEqual(R.odds('n:7'), 35);
  assert.strictEqual(R.odds('d:1'), 2);
  assert.strictEqual(R.odds('c:3'), 2);
  assert.strictEqual(R.odds('red'), 1);
});

test('settle gives back the stake plus the winnings, and the net result is exact', () => {
  const placed = { 'n:17': 10, black: 50, 'd:2': 20 };     // 17 is black and in the 2nd dozen
  const s = R.settle(placed, 17);
  assert.strictEqual(s.staked, 80);
  assert.strictEqual(s.back, 10 + 350 + 50 + 50 + 20 + 40);  // number 10 + 350, black 50 + 50, dozen 20 + 40
  assert.strictEqual(s.net, s.back - 80);
  const lose = R.settle({ black: 100 }, 0);
  assert.deepStrictEqual(lose, { back: 0, staked: 100, net: -100 });
});

test('a spin is fair: every number comes up about as often', () => {
  let a = 12345;
  const rnd = n => { a = (a * 1664525 + 1013904223) >>> 0; return Math.floor((a / 4294967296) * n); };
  const counts = new Array(37).fill(0);
  const runs = 37000;
  for (let i = 0; i < runs; i++) counts[R.spin(rnd)]++;
  const expected = runs / 37;
  for (let n = 0; n < 37; n++) assert.ok(Math.abs(counts[n] - expected) < expected * 0.15, 'nummer ' + n + ' komt te vaak of te weinig voor');
});

test('the real random source gives whole numbers in range', () => {
  for (let i = 0; i < 2000; i++) { const v = R.randomInt(37); assert.ok(Number.isInteger(v) && v >= 0 && v < 37); }
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
if (failed) { console.log('\n' + failed + ' van ' + tests.length + ' roulette-tests mislukt.'); process.exit(1); }
console.log('\n' + tests.length + ' roulette-tests geslaagd.');
