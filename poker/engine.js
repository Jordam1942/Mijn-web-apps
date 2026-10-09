/*
 * Royal Flush Society: Texas Hold'em rules. Pure functions on one plain
 * state object, so the same code runs on the host phone and in tests (Node).
 *
 * Cards are numbers 0..51: rank = card % 13 + 2 (14 = aas), suit = floor(card / 13).
 * Suits: 0 schoppen (s), 1 harten (h), 2 ruiten (r), 3 klaveren (k).
 * Money is whole fiches. A hand runs by itself: newHand, then act() for each
 * move, until h.done is true. Nothing here touches the screen.
 */
(function (root) {
  'use strict';

  var SUITS = ['s', 'h', 'r', 'k'];
  var CAT = ['Hoge kaart', 'Paar', 'Twee paar', 'Drie gelijke', 'Straat', 'Kleur', 'Full house', 'Carré', 'Straight flush', 'Royal flush'];
  var SING = { 2: 'twee', 3: 'drie', 4: 'vier', 5: 'vijf', 6: 'zes', 7: 'zeven', 8: 'acht', 9: 'negen', 10: 'tien', 11: 'boer', 12: 'vrouw', 13: 'koning', 14: 'aas' };
  var PLUR = { 2: 'tweeën', 3: 'drieën', 4: 'vieren', 5: 'vijven', 6: 'zessen', 7: 'zevens', 8: 'achten', 9: 'negens', 10: 'tienen', 11: 'boeren', 12: 'vrouwen', 13: 'koningen', 14: 'azen' };
  var LABEL = { 10: '10', 11: 'B', 12: 'V', 13: 'K', 14: 'A' };
  var STAGES = ['preflop', 'flop', 'turn', 'river'];

  function rankOf(c) { return c % 13 + 2; }
  function suitOf(c) { return Math.floor(c / 13); }
  function cardLabel(c) { return (LABEL[rankOf(c)] || String(rankOf(c))) + SUITS[suitOf(c)]; }

  // Random numbers: the browser's crypto generator, with rejection sampling so every value is equally likely.
  function cryptoApi() {
    if (root.crypto && root.crypto.getRandomValues) return root.crypto;
    return require('crypto').webcrypto;
  }
  function randomInt(n) {
    var c = cryptoApi(), buf = new Uint32Array(1), limit = 4294967296 - (4294967296 % n);
    do { c.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  }
  // Fisher-Yates shuffle. rnd(n) must return an integer 0..n-1.
  function newDeck(rnd) {
    var d = [], i, j, t;
    rnd = rnd || randomInt;
    for (i = 0; i < 52; i++) d.push(i);
    for (i = 51; i > 0; i--) { j = rnd(i + 1); t = d[i]; d[i] = d[j]; d[j] = t; }
    return d;
  }

  // ---- Hand evaluation -------------------------------------------------
  // A key is [category, tiebreak ranks...]; a bigger key wins.
  function eval5(cs) {
    var ranks = cs.map(rankOf).sort(function (a, b) { return b - a; });
    var flush = cs.every(function (c) { return suitOf(c) === suitOf(cs[0]); });
    var count = {}, groups, high = 0, n0, n1, cat, order;
    ranks.forEach(function (r) { count[r] = (count[r] || 0) + 1; });
    groups = Object.keys(count).map(Number).sort(function (a, b) { return count[b] - count[a] || b - a; });
    if (groups.length === 5) {
      if (ranks[0] - ranks[4] === 4) high = ranks[0];
      else if (ranks.join() === '14,5,4,3,2') high = 5;   // the wheel: A-2-3-4-5
    }
    n0 = count[groups[0]];
    n1 = count[groups[1]];
    if (high && flush) { cat = high === 14 ? 9 : 8; order = [high]; }
    else if (n0 === 4) { cat = 7; order = groups; }
    else if (n0 === 3 && n1 === 2) { cat = 6; order = groups; }
    else if (flush) { cat = 5; order = ranks; }
    else if (high) { cat = 4; order = [high]; }
    else if (n0 === 3) { cat = 3; order = groups; }
    else if (n0 === 2 && n1 === 2) { cat = 2; order = groups; }
    else if (n0 === 2) { cat = 1; order = groups; }
    else { cat = 0; order = ranks; }
    return { cat: cat, key: [cat].concat(order), groups: groups, high: high, cards: cs.slice() };
  }

  // Best hand from 5 to 7 cards: the best of all five-card combinations.
  function evaluate(cards) {
    var best = null, n = cards.length;
    if (n < 5) throw new Error('Minstens 5 kaarten nodig.');
    (function walk(start, chosen) {
      if (chosen.length === 5) {
        var ev = eval5(chosen);
        if (!best || compareKeys(ev.key, best.key) > 0) best = ev;
        return;
      }
      for (var i = start; i < n; i++) {
        chosen.push(cards[i]);
        walk(i + 1, chosen);
        chosen.pop();
      }
    })(0, []);
    return best;
  }

  function compareKeys(a, b) {
    var len = Math.max(a.length, b.length), i, x, y;
    for (i = 0; i < len; i++) {
      x = a[i] || 0; y = b[i] || 0;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }

  // Dutch sentence for a hand, e.g. "een full house, azen op koningen".
  function describe(ev) {
    var g = ev.groups, h = ev.high, top = ev.key[1];
    switch (ev.cat) {
      case 9: return 'een royal flush';
      case 8: return 'een straight flush tot ' + SING[h];
      case 7: return 'vier ' + PLUR[g[0]];
      case 6: return 'een full house, ' + PLUR[g[0]] + ' op ' + PLUR[g[1]];
      case 5: return 'een kleur, ' + SING[top] + ' hoog';
      case 4: return 'een straat tot ' + SING[h];
      case 3: return 'drie ' + PLUR[g[0]];
      case 2: return 'twee paar, ' + PLUR[g[0]] + ' en ' + PLUR[g[1]];
      case 1: return 'een paar ' + PLUR[g[0]];
      default: return 'hoge ' + SING[top];
    }
  }

  // ---- Pots ------------------------------------------------------------
  // Splits the chips put in by everyone into a main pot and side pots.
  // Each pot lists who may win it. A pot with one contributor is a bet nobody
  // called: it goes back to that player (refund).
  function buildPots(players) {
    var levels = [], pots = [], prev = 0;
    players.forEach(function (p) { if (p.total > 0 && levels.indexOf(p.total) < 0) levels.push(p.total); });
    levels.sort(function (a, b) { return a - b; });
    levels.forEach(function (lv) {
      var amount = 0, contrib = [], elig = [];
      players.forEach(function (p, i) {
        var part = Math.min(p.total, lv) - prev;
        if (part > 0) amount += part;
        if (p.total >= lv) {
          contrib.push(i);
          if (!p.folded) elig.push(i);
        }
      });
      if (elig.length === 0 && pots.length) pots[pots.length - 1].amount += amount;   // only folded players reached this level
      else pots.push({ amount: amount, eligible: elig, contributors: contrib, refund: contrib.length === 1 });
      prev = lv;
    });
    return pots;
  }

  // ---- Hand state --------------------------------------------------------
  function inHand(p) { return !p.out && !p.folded; }
  function ableOK(p) { return inHand(p) && !p.allIn; }

  // First seat after `from` (or at `from` when inclusive) that is still in the game.
  function nextSeat(players, from, inclusive) {
    var n = players.length, k, i;
    for (k = inclusive ? 0 : 1; k <= n; k++) {
      i = (from + k) % n;
      if (!players[i].out) return i;
    }
    return -1;
  }
  // First seat after `from` that matches pred.
  function nextIdx(h, from, pred) {
    var n = h.players.length, k, i;
    for (k = 1; k <= n; k++) {
      i = (from + k) % n;
      if (pred(h.players[i], i)) return i;
    }
    return -1;
  }
  function draw(h) {
    if (h.pos >= h.deck.length) throw new Error('Interne fout: het spel heeft geen kaarten meer.');
    return h.deck[h.pos++];
  }
  // Moves chips from the stack into the pot for this street. A short stack goes all-in.
  function put(h, idx, amount) {
    var p = h.players[idx], x = Math.min(Math.max(0, amount), p.stack);
    p.stack -= x; p.bet += x; p.total += x;
    if (p.stack === 0) p.allIn = true;
  }

  // Start a hand. players: [{id, name, stack}], dealer: seat index of the button.
  // sb, bb: blinds. Optional: deck (fixed card order, for tests), rnd (random source, for tests).
  function newHand(opts) {
    var players = opts.players.map(function (p) {
      return { id: p.id, name: p.name, stack: p.stack, bet: 0, total: 0, folded: false, allIn: false, out: !(p.stack > 0), cards: [], needAct: false, raiseOk: false };
    });
    var seated = players.filter(function (p) { return !p.out; }).length;
    var dealer, sb, bb, order = [], r, i, k, n = players.length, startTotal = 0, h;
    if (seated < 2) throw new Error('Minstens twee spelers met fiches.');
    if (!(opts.sb > 0) || !(opts.bb >= opts.sb)) throw new Error('Ongeldige blinds.');
    dealer = nextSeat(players, (opts.dealer || 0) % n, true);
    if (seated === 2) { sb = dealer; bb = nextSeat(players, dealer, false); }
    else { sb = nextSeat(players, dealer, false); bb = nextSeat(players, sb, false); }
    players.forEach(function (p) { startTotal += p.stack; });
    h = {
      players: players, dealer: dealer, sb: sb, bb: bb, sbAmt: opts.sb, bbAmt: opts.bb,
      board: [], stage: 'preflop', deck: opts.deck ? opts.deck.slice() : newDeck(opts.rnd),
      pos: 0, currentBet: 0, lastRaise: opts.bb, current: -1, history: [],
      startTotal: startTotal, awards: [], showdown: [], done: false
    };
    put(h, sb, opts.sb);
    put(h, bb, opts.bb);
    for (k = 1; k <= n; k++) { i = (dealer + k) % n; if (!players[i].out) order.push(i); }
    for (r = 0; r < 2; r++) order.forEach(function (j) { players[j].cards.push(draw(h)); });
    h.currentBet = Math.max.apply(null, players.map(function (p) { return p.bet; }));
    markNeedAct(h);
    h.current = nextIdx(h, bb, function (p) { return p.needAct && ableOK(p); });
    if (h.current === -1) endStreet(h);
    return h;
  }

  // Someone leaves the hand at once: they are folded, and the hand goes on without them.
  // Their chips already in the pot stay there.
  function forceFold(h, idx) {
    var p = h.players[idx];
    if (h.done || !inHand(p)) return { ok: false, error: 'Deze speler zit niet in de ronde.' };
    p.folded = true;
    p.needAct = false;
    if (h.current === idx) afterAction(h, idx);
    else if (h.players.filter(inHand).length === 1) settle(h);
    return { ok: true };
  }

  // Who has to act in this street. Nobody has to act when only one player can still bet and nobody is owed a call.
  function markNeedAct(h) {
    var able = h.players.filter(ableOK);
    h.players.forEach(function (p) {
      if (ableOK(p)) {
        p.needAct = able.length >= 2 || p.bet < h.currentBet;
        p.raiseOk = true;
      } else {
        p.needAct = false;
        p.raiseOk = false;
      }
    });
  }

  // What the player on turn may do. null if it is not their turn.
  function legal(h, idx) {
    if (h.done || idx !== h.current) return null;
    var P = h.players, p = P[idx];
    var toCall = Math.max(0, h.currentBet - p.bet);
    var maxTo = p.bet + p.stack;
    var minTo = h.currentBet + h.lastRaise;
    var others = P.some(function (q, i) { return i !== idx && ableOK(q); });
    var canRaise = p.raiseOk && others && maxTo > h.currentBet;
    return {
      toCall: toCall,
      canCheck: toCall === 0,
      canCall: toCall > 0,
      canFold: true,
      canRaise: canRaise,
      minTo: Math.min(minTo, maxTo),   // raise TO this total (not by this much)
      maxTo: maxTo
    };
  }

  // Do one move. action: {type: 'fold'|'check'|'call'|'raise'|'allin', to}.
  // Returns {ok: true} or {ok: false, error: '...'}; the state is not changed on error.
  function act(h, idx, action) {
    var L = legal(h, idx), P = h.players, p, type, to, full, prevCurrent;
    if (!L) return { ok: false, error: 'Het is niet jouw beurt.' };
    p = P[idx];
    type = action && action.type;
    if (type === 'allin') {
      if (L.canRaise) action = { type: 'raise', to: L.maxTo };
      else if (L.canCall) action = { type: 'call' };
      else return { ok: false, error: 'Je kunt nu niet all-in gaan.' };
      type = action.type;
    }
    if (type === 'fold') {
      p.folded = true;
      p.needAct = false;
    } else if (type === 'check') {
      if (L.toCall > 0) return { ok: false, error: 'Je kunt niet checken, er ligt een inzet.' };
      p.needAct = false;
    } else if (type === 'call') {
      if (!L.canCall) return { ok: false, error: 'Er is niets om te callen.' };
      put(h, idx, L.toCall);
      p.needAct = false;
    } else if (type === 'raise') {
      to = action.to;
      if (!L.canRaise) return { ok: false, error: 'Je kunt nu niet verhogen.' };
      if (!Number.isInteger(to) || to > L.maxTo || to <= h.currentBet) return { ok: false, error: 'Ongeldig bedrag.' };
      if (to < L.minTo && to !== L.maxTo) return { ok: false, error: 'Minimaal ' + L.minTo + '.' };
      // A full raise is at least as big as the last raise. A short all-in does not reopen betting for players who already acted.
      full = to >= h.currentBet + h.lastRaise;
      prevCurrent = h.currentBet;
      put(h, idx, to - p.bet);
      p.needAct = false;
      p.raiseOk = false;
      if (full) h.lastRaise = to - prevCurrent;
      h.currentBet = p.bet;
      P.forEach(function (q, i) {
        if (i !== idx && ableOK(q)) {
          q.needAct = true;
          if (full) q.raiseOk = true;
        }
      });
    } else {
      return { ok: false, error: 'Onbekende actie.' };
    }
    h.history.push({ idx: idx, type: type, bet: p.bet, stage: h.stage });
    afterAction(h, idx);
    return { ok: true };
  }

  // The move a timer makes for someone who is away: check if possible, otherwise fold.
  function autoAction(h, idx) {
    var L = legal(h, idx);
    if (!L) return { ok: false, error: 'Het is niet jouw beurt.' };
    return act(h, idx, { type: L.canCheck ? 'check' : 'fold' });
  }

  function afterAction(h, last) {
    if (h.players.filter(inHand).length === 1) { settle(h); return; }
    var next = nextIdx(h, last, function (q) { return q.needAct && ableOK(q); });
    if (next === -1) endStreet(h);
    else h.current = next;
  }

  function nextStage(h) {
    var i = STAGES.indexOf(h.stage), count, k;
    h.stage = STAGES[i + 1];
    draw(h);                                   // burn card
    count = h.stage === 'flop' ? 3 : 1;
    for (k = 0; k < count; k++) h.board.push(draw(h));
    h.players.forEach(function (p) { p.bet = 0; });
    h.currentBet = 0;
    h.lastRaise = h.bbAmt;
  }

  // Betting in this street is over. Deal on, or run the board out when nobody can bet any more.
  function endStreet(h) {
    var first;
    if (h.stage === 'river') { settle(h); return; }
    nextStage(h);
    markNeedAct(h);
    first = nextIdx(h, h.dealer, function (q) { return q.needAct && ableOK(q); });
    if (first === -1) endStreet(h);
    else h.current = first;
  }

  // Pays out every pot and ends the hand. Winners of a split pot share it equally;
  // odd chips go to the winner closest after the button.
  function settle(h) {
    var P = h.players, n = P.length, live = [], evOf = {}, pots;
    P.forEach(function (p, i) { if (inHand(p)) live.push(i); });
    if (live.length > 1) {
      live.forEach(function (i) {
        var ev = evaluate(P[i].cards.concat(h.board));
        h.showdown.push({ idx: i, cards: P[i].cards.slice(), ev: ev });
        evOf[i] = ev;
      });
    }
    pots = buildPots(P);
    h.awards = [];
    pots.forEach(function (pot, pi) {
      var winners, best = null, share, rem;
      if (pot.eligible.length === 1) winners = pot.eligible.slice();
      else {
        pot.eligible.forEach(function (i) { if (!best || compareKeys(evOf[i].key, best.key) > 0) best = evOf[i]; });
        winners = pot.eligible.filter(function (i) { return compareKeys(evOf[i].key, best.key) === 0; });
      }
      winners.sort(function (a, b) { return (a - h.dealer + n) % n - (b - h.dealer + n) % n; });
      share = Math.floor(pot.amount / winners.length);
      rem = pot.amount - share * winners.length;
      winners.forEach(function (idx, k) {
        var x = share + (k < rem ? 1 : 0);
        P[idx].stack += x;
        h.awards.push({ idx: idx, amount: x, pot: pi, refund: pot.refund, ev: evOf[idx] || null });
      });
    });
    P.forEach(function (p) { p.bet = 0; });
    h.done = true;
    h.stage = 'done';
    h.current = -1;
    if (P.reduce(function (s, p) { return s + p.stack; }, 0) !== h.startTotal) throw new Error('Interne fout: fiches kloppen niet.');
  }

  // Dutch sentences about the result, e.g. "Anna wint 240 met een full house, azen op koningen".
  function summary(h) {
    var out = [], per = {}, order = [];
    h.awards.forEach(function (a) {
      if (!per[a.idx]) { per[a.idx] = { amount: 0, ev: null, refund: true }; order.push(a.idx); }
      per[a.idx].amount += a.amount;
      if (!a.refund) per[a.idx].refund = false;
      if (a.ev && !per[a.idx].ev) per[a.idx].ev = a.ev;
    });
    order.forEach(function (idx) {
      var p = h.players[idx], s = per[idx];
      if (s.refund) out.push(p.name + ' krijgt ' + s.amount + ' terug, dat was niet gedekt.');
      else if (s.ev) out.push(p.name + ' wint ' + s.amount + ' met ' + describe(s.ev) + '.');
      else out.push(p.name + ' wint ' + s.amount + ', de anderen passen.');
    });
    return out;
  }

  // What one phone may see: its own cards, and everyone's cards after a showdown. Never the deck.
  function viewFor(h, viewer) {
    var v = JSON.parse(JSON.stringify(h));
    delete v.deck;
    delete v.pos;
    v.players.forEach(function (p, i) {
      var revealed = h.done && h.showdown.some(function (s) { return s.idx === i; });
      if (i !== viewer && !revealed) p.cards = p.cards.map(function () { return null; });
    });
    return v;
  }

  var api = {
    CAT: CAT, rankOf: rankOf, suitOf: suitOf, cardLabel: cardLabel,
    randomInt: randomInt, newDeck: newDeck,
    eval5: eval5, evaluate: evaluate, compareKeys: compareKeys, describe: describe,
    buildPots: buildPots, newHand: newHand, legal: legal, act: act, autoAction: autoAction, forceFold: forceFold,
    summary: summary, viewFor: viewFor
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PokerEngine = api;
})(this);
