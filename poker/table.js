/*
 * One table: seats, the hands, the computer players, turn timers and saving.
 * It runs the same on your phone (solo), and on the host phone (with friends).
 * Each player only gets their own cards (view(seat)); the host keeps the rest.
 */
(function (root) {
  'use strict';

  var E = root.PokerEngine || require('./engine.js');
  var AI = root.PokerAI || require('./ai.js');
  var SPEED = { rustig: 1600, normaal: 900, snel: 350 };

  // seats: [{id, name, kind: 'human'|'remote'|'bot'|'empty', style, stack, persona}]
  // cfg: level {sb, bb, min, max}, speed, turnTimer (s), takeover (s), rnd, later, cancel,
  //      onChange(seatIndexOrNull, view), onCashOut(seatIndex, amount), onLog(text)
  function createTable(cfg) {
    var later = cfg.later || function (fn, ms) { return setTimeout(fn, ms); };
    var cancel = cfg.cancel || function (t) { clearTimeout(t); };
    var rnd = cfg.rnd || E.randomInt;
    var pace = SPEED[cfg.speed] || SPEED.normaal;
    var T = {
      level: cfg.level,
      seats: (cfg.seats || []).map(function (s, i) {
        return { id: s.id || ('s' + i), name: s.name || ('Speler ' + (i + 1)), kind: s.kind || 'empty', style: s.style || 'gemiddeld', stack: s.stack || 0, persona: s.persona || 0, img: s.img || null, leaving: false };
      }),
      dealer: cfg.dealer || 0,
      handCount: 0,
      score: {},             // per seat: start, money put in again (in), cashed out (out), hands, hands won
      hand: null,
      rebought: 0,           // fiches the computer players bought in again (new money on the table)
      log: [],
      turnDeadline: 0,
      turnTimer: cfg.turnTimer || 0,
      takeover: cfg.takeover || 0,
      autoNext: cfg.autoNext !== false
    };
    var timer = null, pauseTimer = null;

    // Sound events for the table (the screen or the network plays them).
    function sfx(kind) { if (cfg.onSound) cfg.onSound(kind); }
    function note(text) {
      T.log.push(text);
      if (T.log.length > 40) T.log.shift();
      if (cfg.onLog) cfg.onLog(text);
    }
    function sync() {
      if (!T.hand) return;
      T.seats.forEach(function (s, i) { s.stack = T.hand.players[i].stack; });
    }
    function publish() {
      if (!cfg.onChange) return;
      T.seats.forEach(function (s, i) { if (s.kind === 'human' || s.kind === 'remote') cfg.onChange(i, view(i)); });
      cfg.onChange(null, view(null));
    }
    function stopTimer() { if (timer) { cancel(timer); timer = null; } T.turnDeadline = 0; }

    function seatName(i) { return T.seats[i].name; }
    function describeAction(i, a) {
      var name = seatName(i);
      if (a.type === 'fold') return name + ' past';
      if (a.type === 'check') return name + ' checkt';
      if (a.type === 'call') return name + ' gaat mee';
      if (a.type === 'allin') return name + ' gaat all-in';
      if (a.type === 'raise') return name + ' verhoogt naar ' + a.to;
      return name;
    }

    // Start the next hand, if at least two seats still have fiches.
    function startHand() {
      var active, sb = T.level.sb, bb = T.level.bb;
      if (T.hand && !T.hand.done) return;
      if (pauseTimer) { cancel(pauseTimer); pauseTimer = null; }
      if (cfg.beforeHand) cfg.beforeHand();   // e.g. friends who sit down between hands
      if (cfg.blindEvery && T.handCount > 0 && T.handCount % cfg.blindEvery === 0 && cfg.nextLevel) {
        var up = cfg.nextLevel(T.level);
        if (up !== T.level) { T.level = up; note('De blinds gaan omhoog: ' + up.sb + ' / ' + up.bb + '.'); }
      }
      T.seats.forEach(function (s, i) {
        if (s.leaving && s.kind !== 'empty') cashOut(i);
      });
      T.seats.forEach(function (s) {
        // a computer player with too few fiches: buys in again (if that is switched on) or leaves the table
        if (s.kind === 'bot' && s.stack < bb) {
          if (cfg.botRebuy) { T.rebought += T.level.min - s.stack; recordIn(i, T.level.min - s.stack); s.stack = T.level.min; note(s.name + ' koopt weer in'); }
          else { s.kind = 'empty'; s.stack = 0; note(s.name + ' gaat van tafel.'); }
        }
      });
      active = T.seats.filter(function (s) { return s.kind !== 'empty' && s.stack > 0; });
      if (active.length < 2) { T.hand = null; stopTimer(); publish(); return; }
      T.hand = E.newHand({
        players: T.seats.map(function (s) { return { id: s.id, name: s.name, stack: s.kind === 'empty' ? 0 : s.stack }; }),
        dealer: (T.dealer + 1) % T.seats.length, sb: sb, bb: bb, rnd: rnd
      });
      T.dealer = T.hand.dealer;
      T.handCount++;
      sync();
      T.seats.forEach(function (s, i) {
        if (T.hand.players[i].out) return;
        var sc = T.score[i] || (T.score[i] = { start: T.hand.players[i].stack, inn: 0, out: 0, hands: 0, won: 0 });
        sc.hands++;
      });
      sfx('deal');
      note('Nieuwe ronde. ' + seatName(T.hand.dealer) + ' is de knop.');
      publish();
      scheduleTurn();
    }

    // What happens next: a computer player thinks, a person has a turn timer.
    function scheduleTurn() {
      var i, s, limit;
      stopTimer();
      if (!T.hand || T.hand.done) return;
      i = T.hand.current;
      s = T.seats[i];
      if (s.kind === 'bot') {
        timer = later(function () { timer = null; botMove(i); }, Math.round(pace * (0.7 + 0.6 * rnd(1000) / 1000)));
        return;
      }
      limit = s.kind === 'human' ? T.turnTimer : T.takeover;
      if (limit > 0) {
        T.turnDeadline = Date.now() + limit * 1000;
        timer = later(function () { timer = null; timeOut(i); }, limit * 1000);
      }
      if (cfg.onTurn) cfg.onTurn(i);
    }
    function botMove(i) {
      if (!T.hand || T.hand.done || T.hand.current !== i) return;
      apply(i, AI.decide(T.hand, i, T.seats[i].style, function () { return rnd(1000000) / 1000000; }));
    }
    // Time is up: a person gets check or fold; someone away is taken over by the computer.
    function timeOut(i) {
      var s = T.seats[i], L;
      if (!T.hand || T.hand.done || T.hand.current !== i) return;
      if (s.kind === 'human') {
        L = E.legal(T.hand, i);
        note('De tijd is om. ' + s.name + ' ' + (L.canCheck ? 'checkt' : 'past') + '.');
        apply(i, { type: L.canCheck ? 'check' : 'fold' });
      } else {
        note('De computer speelt voor ' + s.name + '.');
        apply(i, AI.decide(T.hand, i, s.style, function () { return rnd(1000000) / 1000000; }));
      }
    }

    // A move by a player (from the screen, the network, or a timer). Returns {ok} or {ok:false, error}.
    function apply(i, action) {
      var res;
      if (!T.hand || T.hand.done) return { ok: false, error: 'Er is geen ronde bezig.' };
      if (T.hand.current !== i) return { ok: false, error: 'Het is niet jouw beurt.' };
      stopTimer();
      var stageBefore = T.hand.stage;
      res = E.act(T.hand, i, action);
      if (!res.ok) { if (T.seats[i].kind === 'bot') return apply(i, { type: 'fold' }); scheduleTurn(); return res; }
      sfx(action.type === 'fold' ? 'fold' : action.type === 'check' ? 'check' : action.type === 'call' ? 'call' : T.hand.players[i].allIn ? 'allin' : 'raise');
      if (!T.hand.done && T.hand.stage !== stageBefore) sfx('street');
      note(describeAction(i, { type: action.type, to: T.hand.players[i].bet }));
      sync();
      if (T.hand.done) return finishHand(res);
      publish();
      scheduleTurn();
      return res;
    }
    function act(i, action) { return apply(i, action); }

    function recordIn(i, amount) { var sc = T.score[i] || (T.score[i] = { start: 0, inn: 0, out: 0, hands: 0, won: 0 }); sc.inn += amount; }
    function recordOut(i, amount) { var sc = T.score[i] || (T.score[i] = { start: 0, inn: 0, out: 0, hands: 0, won: 0 }); sc.out += amount; }
    // Per seat: what they have now, and their result for this session (money out + now - money in - start)
    function scoreRows() {
      return T.seats.map(function (s, i) {
        var sc = T.score[i];
        if (!sc) return null;
        var now = s.kind === 'empty' ? 0 : s.stack;
        return { i: i, name: s.name, now: now, net: now + sc.out - sc.inn - sc.start, hands: sc.hands, won: sc.won };
      }).filter(function (r) { return r; });
    }

    function finishHand(res) {
      var lines = E.summary(T.hand);
      T.hand.awards.map(function (a) { return a.idx; }).filter(function (x, k, arr) { return arr.indexOf(x) === k && T.hand.awards.some(function (a) { return a.idx === x && a.amount > 0; }); })
        .forEach(function (i) { if (T.score[i]) T.score[i].won++; });
      sfx('win');
      lines.forEach(note);
      if (T.hand.board.length) note('Bord: ' + T.hand.board.map(E.cardLabel).join(' '));
      T.seats.forEach(function (s, i) { if (s.leaving && s.kind !== 'empty') cashOut(i); });
      publish();
      if (T.autoNext) pauseTimer = later(function () { pauseTimer = null; startHand(); }, pace * 2.5);
      return res || { ok: true };
    }

    // A person leaves. In a hand they are folded (or checked) for now; the fiches come back after the hand.
    function leave(i) {
      var s = T.seats[i];
      if (s.kind === 'empty') return;
      if (!T.hand || T.hand.done) { cashOut(i); publish(); return; }
      s.leaving = true;
      note(s.name + ' verlaat de tafel na deze ronde.');
      if (T.hand.current === i) timeOut(i);
      else publish();
    }
    // Leave at once: folded out of the hand, and the stack that is not in the pot goes back now.
    function leaveNow(i) {
      var s = T.seats[i], hp = T.hand && T.hand.players[i], amount;
      if (s.kind === 'empty') return;
      if (T.hand && !T.hand.done && hp && !hp.folded) {
        E.forceFold(T.hand, i);
        sync();
      }
      amount = hp ? hp.stack : s.stack;
      if (hp) hp.stack = 0;
      if (T.hand) T.hand.startTotal -= amount;   // these chips have left the table: the hand's total goes down
      s.kind = 'empty'; s.stack = 0; s.leaving = false;
      recordOut(i, amount);
      if (cfg.onCashOut) cfg.onCashOut(i, amount);
      if (T.hand && T.hand.done) finishHand();
      else { publish(); scheduleTurn(); }
    }
    function cashOut(i) {
      var s = T.seats[i], amount = s.stack;
      if (T.hand && !T.hand.done) return;   // the chips stay in the pot until the hand is over
      s.kind = 'empty'; s.stack = 0; s.leaving = false;
      recordOut(i, amount);
      if (cfg.onCashOut) cfg.onCashOut(i, amount);
    }

    // What one viewer may see. viewer: seat index or null (spectator). Other players' cards are hidden
    // until the showdown.
    function view(v) {
      var h = T.hand, seats = T.seats.map(function (s, i) {
        var hp = h && h.players[i];
        var cards = [];
        if (hp && hp.cards.length) {
          var shown = i === v || (h.done && h.showdown.some(function (x) { return x.idx === i; }));
          cards = shown ? hp.cards.slice() : hp.cards.map(function () { return null; });
        }
        return {
          i: i, name: s.name, kind: s.kind, persona: s.persona, img: s.img || null,
          stack: hp ? hp.stack : s.stack, bet: hp ? hp.bet : 0, total: hp ? hp.total : 0,
          folded: hp ? hp.folded : false, allIn: hp ? hp.allIn : false,
          out: hp ? hp.out : s.kind === 'empty', leaving: s.leaving,
          button: i === T.dealer, turn: !!(h && !h.done && h.current === i),
          cards: cards
        };
      });
      return {
        level: T.level, dealer: T.dealer, stage: h ? h.stage : 'wait', current: h ? h.currentBet : 0,
        winners: h && h.done ? h.awards.map(function (a) { return a.idx; }).filter(function (x, k, arr) { return arr.indexOf(x) === k; }) : [],
        board: h ? h.board.slice() : [], pot: h ? h.players.reduce(function (a, p) { return a + p.total; }, 0) : 0,
        seats: seats, you: v, legal: (h && v !== null && h.current === v && !h.done) ? E.legal(h, v) : null,
        deadline: T.turnDeadline, log: T.log.slice(-8), done: !!(h && h.done), score: scoreRows(),
        result: h && h.done ? E.summary(h) : null,
        showdown: h && h.done ? h.showdown.map(function (x) { return { idx: x.idx, name: T.seats[x.idx].name, text: E.describe(x.ev), cards: x.cards }; }) : []
      };
    }

    // Saving: no deck and no computer cards in the saved state. Those are dealt again from the cards
    // nobody has seen, which is as fair as before (see reseal).
    function snapshot() {
      var h = T.hand, copy = null;
      if (h && !h.done) {
        copy = JSON.parse(JSON.stringify(h));
        delete copy.deck; delete copy.pos;
        copy.players.forEach(function (p, i) { if (T.seats[i].kind === 'bot') p.cards = []; });
      }
      return {
        v: 1, level: T.level, dealer: T.dealer, seats: T.seats, log: T.log, hand: copy,
        turnTimer: T.turnTimer, takeover: T.takeover, autoNext: T.autoNext
      };
    }
    function reseal(h) {
      var known = h.board.slice(), pool = [], i, j, t, pos = 0, deck;
      h.players.forEach(function (p) { known = known.concat(p.cards); });
      for (i = 0; i < 52; i++) if (known.indexOf(i) < 0) pool.push(i);
      for (i = pool.length - 1; i > 0; i--) { j = rnd(i + 1); t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
      deck = pool;
      h.players.forEach(function (p, k) {
        if (T.seats[k].kind === 'bot' && !p.out && !p.folded && p.cards.length === 0) { p.cards = [deck[pos++], deck[pos++]]; }
      });
      h.deck = deck; h.pos = pos;
    }
    function restore(snap) {
      T.level = snap.level; T.dealer = snap.dealer; T.log = snap.log || []; T.turnTimer = snap.turnTimer; T.takeover = snap.takeover; T.autoNext = snap.autoNext;
      T.seats = snap.seats;
      T.hand = snap.hand;
      if (T.hand) { reseal(T.hand); sync(); }
      publish();
      if (T.hand) scheduleTurn();
      else if (T.autoNext) startHand();
    }
    // Undo (solo, in memory only): the whole state including computer cards, so nothing can be re-dealt.
    function fullSnapshot() { return T.hand ? JSON.parse(JSON.stringify({ hand: T.hand, seats: T.seats, dealer: T.dealer })) : null; }
    function restoreFull(s) { if (!s) return; T.hand = s.hand; T.seats = s.seats; T.dealer = s.dealer; sync(); publish(); scheduleTurn(); }
    function stop() { stopTimer(); if (pauseTimer) { cancel(pauseTimer); pauseTimer = null; } }

    T.startHand = startHand;
    T.act = act;
    T.leave = leave;
    T.leaveNow = leaveNow;
    T.view = view;
    T.publish = publish;
    T.snapshot = snapshot;
    T.restore = restore;
    T.stop = stop;
    T.fullSnapshot = fullSnapshot;
    T.restoreFull = restoreFull;
    T.seatName = seatName;
    return T;
  }

  var api = { create: createTable, SPEED: SPEED };
  root.PokerTable = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
