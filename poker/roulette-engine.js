/*
 * Roulette rules (European wheel, one zero) with play money.
 * The wheel is turned with crypto.getRandomValues, so every number has the same chance.
 * Bets are keys: 'n:17' (one number), 'red', 'black', 'even', 'odd', 'low' (1-18),
 * 'high' (19-36), 'd:1' / 'd:2' / 'd:3' (dozens), 'c:1' / 'c:2' / 'c:3' (columns).
 */
(function (root) {
  'use strict';

  // The wheel in order around the rim (European layout)
  var WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  var RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

  // A random whole number 0..n-1 without bias (rejection sampling on 32-bit values)
  function randomInt(n) {
    var c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : require('crypto').webcrypto;
    var limit = Math.floor(4294967296 / n) * n, buf = new Uint32Array(1);
    do { c.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  }

  // The number the ball lands on. rnd(n) gives a whole number 0..n-1 (the tests pass a seeded one).
  function spin(rnd) { return WHEEL[(rnd || randomInt)(37)]; }

  function color(n) { return n === 0 ? 'green' : RED.indexOf(n) >= 0 ? 'red' : 'black'; }

  // Does this bet win on the number n?
  function wins(key, n) {
    var p = key.split(':');
    if (key.indexOf('n:') === 0) return Number(p[1]) === n;
    if (n === 0) return false;                       // on the zero, all outside bets lose
    switch (key) {
      case 'red': return RED.indexOf(n) >= 0;
      case 'black': return RED.indexOf(n) < 0;
      case 'even': return n % 2 === 0;
      case 'odd': return n % 2 === 1;
      case 'low': return n <= 18;
      case 'high': return n >= 19;
    }
    if (key.indexOf('d:') === 0) return Math.ceil(n / 12) === Number(p[1]);
    if (key.indexOf('c:') === 0) return ((n - 1) % 3) + 1 === Number(p[1]);
    return false;
  }

  // Times the stake that comes back as winnings (1:1 outside, 2:1 dozen and column, 35:1 number)
  function odds(key) {
    if (key.indexOf('n:') === 0) return 35;
    if (key.indexOf('d:') === 0 || key.indexOf('c:') === 0) return 2;
    return 1;
  }

  // placed: {key: amount}. Returns what goes back to the player (stakes of winners plus winnings) and the net result.
  function settle(placed, n) {
    var back = 0, staked = 0, keys = Object.keys(placed), i;
    for (i = 0; i < keys.length; i++) {
      var k = keys[i], a = placed[k];
      staked += a;
      if (wins(k, n)) back += a + a * odds(k);
    }
    return { back: back, staked: staked, net: back - staked };
  }

  var LABEL = { red: 'Rood', black: 'Zwart', even: 'Even', odd: 'Oneven', low: '1 t/m 18', high: '19 t/m 36' };
  function label(key) {
    if (key.indexOf('n:') === 0) return key.slice(2);
    if (key.indexOf('d:') === 0) return ['1e dozijn', '2e dozijn', '3e dozijn'][Number(key.slice(2)) - 1];
    if (key.indexOf('c:') === 0) return ['1e kolom', '2e kolom', '3e kolom'][Number(key.slice(2)) - 1];
    return LABEL[key];
  }

  var api = { WHEEL: WHEEL, RED: RED, randomInt: randomInt, spin: spin, color: color, wins: wins, odds: odds, settle: settle, label: label };
  root.Roulette = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
