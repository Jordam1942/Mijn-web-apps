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

  // The expert: the move the robot makes for you (and for the host). It uses only your own cards and the
  // table as you see it. It reads the position at the table, plays tighter early and looser on the button,
  // counts the pot odds with a little extra for deep stacks, sizes its raises to the strength of the hand,
  // and bluffs rarely and only when it is heads-up and checked to.
  var EXPERT = { iters: 700, preIters: 500, raiseBase: 0.62, bluffRate: 0.15, implied: 0.03, margin: 0.02 };
  function seatOrder(h, idx) {
    var n = h.players.length, k = (idx - h.dealer + n) % n;   // 0 = button, 1 = small blind, n-1 = cutoff
    if (k === 0) return 'btn';
    if (k === n - 1) return 'late';
    if (k <= 2) return 'early';
    return 'mid';
  }
  var POS_ADJ = { btn: -0.06, late: -0.03, mid: 0, early: 0.04 };
  function expert(h, idx, rand) {
    var P = h.players, me = P[idx], L = E.legal(h, idx), rnd = rand || Math.random;
    var opponents = P.filter(function (q, i) { return i !== idx && !q.out && !q.folded; }).length;
    var pot = P.reduce(function (s, q) { return s + q.total; }, 0);
    var eq = share(odds(me.cards, h.board, opponents, h.board.length ? EXPERT.iters : EXPERT.preIters, rnd));
    var pos = seatOrder(h, idx);
    var raiseAt = EXPERT.raiseBase + POS_ADJ[pos];
    var needed = L.toCall / (pot + L.toCall);
    var deep = me.stack > 20 * h.bbAmt ? EXPERT.implied : 0;
    function raise(frac) {
      var to = h.currentBet + Math.max(h.lastRaise, Math.round(pot * frac));
      to = Math.max(L.minTo, Math.min(to, L.maxTo));
      return to >= L.maxTo ? { type: 'allin' } : { type: 'raise', to: to };
    }
    // Size the raise to the hand: a strong hand bets more of the pot
    function sizeFor(e) { return e > 0.85 ? 1.0 : e > 0.72 ? 0.75 : 0.5; }
    var headsUp = opponents === 1;
    if (L.canCheck) {
      if (L.canRaise && eq > raiseAt) return raise(sizeFor(eq));
      if (L.canRaise && headsUp && pos !== 'early' && eq > 0.35 && rnd() < EXPERT.bluffRate) return raise(0.5);
      return { type: 'check' };
    }
    if (L.canRaise && eq > raiseAt + 0.15) return raise(sizeFor(eq));
    if (eq + deep >= needed + EXPERT.margin) return { type: 'call' };
    return { type: 'fold' };
  }

  // Name of the strongest hand you have now (with at least five cards), in Dutch.
  function currentHand(hole, board) {
    if (hole.length + board.length < 5) return null;
    return E.evaluate(hole.concat(board));
  }

  var api = { odds: odds, share: share, decide: decide, expert: expert, currentHand: currentHand, STYLE: STYLE, LEVEL: LEVEL };
  root.PokerAI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
