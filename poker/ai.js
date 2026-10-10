/*
 * Chance of winning from the cards you can see, and the computer players.
 * The chance is estimated by dealing the unknown cards many times at random
 * (Monte Carlo) and checking who wins. The computer uses the same estimate.
 */
(function (root) {
  'use strict';

  var E = root.PokerEngine || require('./engine.js');

  // Win, tie and lose chance (fractions) for `hole` on `board` against `opponents` random hands.
  function odds(hole, board, opponents, iterations, rnd) {
    var used = hole.concat(board), pool = [], i, it, win = 0, tie = 0, lose = 0;
    var need = 5 - board.length, n = iterations || 300, rand = rnd || Math.random;
    for (i = 0; i < 52; i++) if (used.indexOf(i) < 0) pool.push(i);
    if (opponents <= 0) return { win: 1, tie: 0, lose: 0 };
    for (it = 0; it < n; it++) {
      var deck = pool.slice(), k, j, t, b, mine, bestOther = null, p;
      // Shuffle only as far as the cards we need: rest of the board and two cards per opponent.
      var take = need + 2 * opponents;
      for (k = 0; k < take; k++) {
        j = k + Math.floor(rand() * (deck.length - k));
        t = deck[k]; deck[k] = deck[j]; deck[j] = t;
      }
      b = board.concat(deck.slice(0, need));
      mine = E.evaluate(hole.concat(b)).key;
      for (p = 0; p < opponents; p++) {
        var ok = E.evaluate([deck[need + 2 * p], deck[need + 2 * p + 1]].concat(b)).key;
        if (!bestOther || E.compareKeys(ok, bestOther) > 0) bestOther = ok;
      }
      var c = E.compareKeys(mine, bestOther);
      if (c > 0) win++;
      else if (c === 0) tie++;
      else lose++;
    }
    return { win: win / n, tie: tie / n, lose: lose / n };
  }

  // The chance we show: wins plus half of the ties.
  function share(o) { return o.win + o.tie / 2; }

  var STYLE = {
    voorzichtig: { raise: 0.74, bluff: 0.02, callBonus: 0.04, size: 0.5 },
    gemiddeld: { raise: 0.62, bluff: 0.08, callBonus: 0.0, size: 0.7 },
    agressief: { raise: 0.5, bluff: 0.2, callBonus: -0.05, size: 1.0 }
  };

  // Levels for the computer players. Easy plays loosely and sometimes makes a mistake; Extreme reads the
  // cards more carefully, raises more and bluffs more. The odds shown to you do not change.
  var LEVEL = {
    easy:    { raiseAdd: 0.40, bluffMul: 0, callAdd: -0.15, mistake: 0.35, iters: 150 },
    normal:  { raiseAdd: 0.10, bluffMul: 0.5, callAdd: 0.05, mistake: 0.05, iters: 250 },
    hard:    { raiseAdd: -0.05, bluffMul: 1.5, callAdd: -0.02, mistake: 0, iters: 300 },
    extreme: { raiseAdd: -0.10, bluffMul: 1.5, callAdd: -0.04, mistake: 0, iters: 500 }
  };

  // The move for a computer player: returns {type, to}. Uses only what the player may see.
  function decide(h, idx, style, rand, level) {
    var P = h.players, me = P[idx], L = E.legal(h, idx), rnd = rand || Math.random;
    var st = STYLE[style] || STYLE.gemiddeld, d = LEVEL[level] || LEVEL.normal;
    var opponents = P.filter(function (q, i) { return i !== idx && !q.out && !q.folded; }).length;
    var pot = P.reduce(function (s, q) { return s + q.total; }, 0);
    if (d.mistake > 0 && rnd() < d.mistake) {      // an easy computer sometimes just checks, calls or folds
      if (L.canCheck) return { type: 'check' };
      return rnd() < 0.5 ? { type: 'call' } : { type: 'fold' };
    }
    var eq = share(odds(me.cards, h.board, opponents, h.board.length ? d.iters : Math.round(d.iters * 0.8), rnd));
    var needed = L.toCall / (pot + L.toCall);      // pot odds
    var bluff = rnd() < st.bluff * d.bluffMul;
    var raiseAt = st.raise + d.raiseAdd, callBonus = st.callBonus + d.callAdd;

    function raise() {
      var frac = st.size * (0.6 + 0.4 * rnd());
      var to = h.currentBet + Math.max(h.lastRaise, Math.round(pot * frac));
      to = Math.max(L.minTo, Math.min(to, L.maxTo));
      return to >= L.maxTo ? { type: 'allin' } : { type: 'raise', to: to };
    }
    if (L.canCheck) {
      if (L.canRaise && (eq > raiseAt || bluff)) return raise();
      return { type: 'check' };
    }
    if (L.canRaise && eq > raiseAt + 0.12) return raise();
    if (L.canRaise && bluff && eq > 0.3) return raise();
    if (eq + callBonus >= needed) return { type: 'call' };
    return { type: 'fold' };
  }

  // Name of the strongest hand you have now (with at least five cards), in Dutch.
  function currentHand(hole, board) {
    if (hole.length + board.length < 5) return null;
    return E.evaluate(hole.concat(board));
  }

  var api = { odds: odds, share: share, decide: decide, currentHand: currentHand, STYLE: STYLE, LEVEL: LEVEL };
  root.PokerAI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
