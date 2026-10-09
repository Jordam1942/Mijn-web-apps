/*
 * Your bank (play money), the 20 table levels, and the income per day.
 * 200 fiches per day, also while the app is closed, up to one week at a time.
 */
(function (root) {
  'use strict';

  var KEY = 'poker-bank-v1';
  var PER_DAY = 200;                         // fiches per day, also while the app is closed
  var DAY_MS = 86400000;
  var STEP_MS = DAY_MS / PER_DAY;            // one fiche every 7 minutes 12 seconds
  var WEEK_MS = 7 * DAY_MS;                  // at most one week of income at a time
  var START = 2000;

  // Level n: blinds sb/bb, buy-in between min and max.
  var LEVELS = [
    [5, 10, 200, 1000], [10, 20, 400, 2000], [15, 30, 600, 3000], [25, 50, 1000, 5000],
    [40, 80, 1500, 8000], [60, 120, 2500, 12000], [100, 200, 4000, 20000], [150, 300, 6000, 30000],
    [250, 500, 10000, 50000], [400, 800, 15000, 80000], [600, 1200, 25000, 120000], [1000, 2000, 40000, 200000],
    [1500, 3000, 60000, 300000], [2500, 5000, 100000, 500000], [4000, 8000, 150000, 800000], [6000, 12000, 250000, 1200000],
    [10000, 20000, 400000, 2000000], [15000, 30000, 600000, 3000000], [25000, 50000, 1000000, 5000000], [50000, 100000, 2000000, 10000000]
  ].map(function (r, i) {
    return { level: i + 1, sb: r[0], bb: r[1], min: r[2], max: r[3] };
  });

  function read() {
    try { var o = JSON.parse(localStorage.getItem(KEY)); return o && typeof o.balance === 'number' ? o : null; } catch (e) { return null; }
  }
  function write(b) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) {} }

  // Credit the income since the last time. Called on start-up and every few seconds while open.
  // The time is kept exactly, so no fiches are lost by rounding.
  function tick(now) {
    now = now || Date.now();
    var b = read() || { balance: START, at: now }, elapsed = now - b.at, n;
    if (elapsed > WEEK_MS) { b.balance += PER_DAY * 7; b.at = now; }   // past a week: a week's income, counting starts again
    else if (elapsed >= STEP_MS) { n = Math.floor(elapsed / STEP_MS); b.balance += n; b.at += n * STEP_MS; }
    write(b);
    return b.balance;
  }

  var api = {
    PER_DAY: PER_DAY, START: START, LEVELS: LEVELS,
    tick: tick,
    balance: function () { return tick(Date.now()); },
    // Take fiches out of the bank (for a buy-in). False when there is not enough.
    take: function (n) {
      var b = read() || { balance: START, at: Date.now() };
      tick(Date.now());
      b = read();
      if (n <= 0 || b.balance < n) return false;
      b.balance -= n;
      write(b);
      return true;
    },
    // Put fiches back (leaving a table, or the rest of a stack).
    give: function (n) {
      tick(Date.now());
      var b = read();
      b.balance += Math.max(0, Math.floor(n));
      write(b);
      return b.balance;
    },
    // Only for tests and the reset button.
    reset: function () { write({ balance: START, at: Date.now() }); },
    // Levels you may sit at with the bank you have.
    affordable: function (balance) { return LEVELS.filter(function (l) { return balance >= l.min; }); },
    fmt: function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  };
  root.PokerMoney = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
