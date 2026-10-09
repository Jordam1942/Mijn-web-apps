/*
 * Playing with friends: the host phone runs the table (table.js); the others send
 * their moves to it. Everything goes through a small shared database (PokerNet: PeerJS
 * over the internet, or the QR ring without internet). Paths under pk/<code>/:
 *   pub              public view of the table (no hidden cards)
 *   hands/<uid>      only that player's cards and options (the data layer only sends it to them)
 *   join             requests to sit down      (host reads, then removes)
 *   inbox            moves and leaving         (host reads, then removes)
 *   chat             table chat
 * The host is the referee: it decides, deals, and keeps the fiches of the table.
 */
(function (root) {
  'use strict';

  var T = root.PokerTable || require('./table.js');

  function base(code) { return 'pk/' + code; }
  function handsPath(code, uid) { return base(code) + '/hands/' + uid; }

  // Host: runs the table and answers the others. db: PokerNet backend. o: {code, name, level, speed, turnTimer, takeover, rnd, onView(view), onLog(text)}
  function host(db, o) {
    var code = o.code, uid = db.uid, seats = [], table, unsub = [], queuedJoins = [];
    seats.push({ id: uid, name: o.name || 'Host', kind: 'human', stack: 0, persona: 12 });
    for (var k = 1; k < 8; k++) seats.push({ id: null, name: 'Vrije stoel', kind: 'empty', stack: 0 });
    table = T.create({
      level: o.level, seats: seats, speed: o.speed, turnTimer: o.turnTimer, takeover: o.takeover, rnd: o.rnd, later: o.later, cancel: o.cancel, autoNext: o.autoNext,
      onChange: function (i, view) {
        if (i === null) { db.set(base(code) + '/pub', view); return; }
        var s = table.seats[i];
        if (i === 0) { if (o.onView) o.onView(view); return; }
        if (s.kind === 'remote' && s.id) db.set(handsPath(code, s.id), { seat: i, cards: view.seats[i].cards, legal: view.legal, deadline: view.deadline });
      },
      onCashOut: function (i, amount) {
        var s = table.seats[i];
        if (s.id) db.set(handsPath(code, s.id), { seat: null, cashed: amount, left: true });
        s.id = null; s.name = 'Vrije stoel'; s.kind = 'empty';
        if (i === 0 && o.onCashOut) o.onCashOut(i, amount);
      },
      onLog: function (text) { if (o.onLog) o.onLog(text); },
      onSound: function (kind) {
        if (o.onSound) o.onSound(kind);
        // the friends hear the same sound: it is put in the table for a few seconds, then taken out again
        db.push(base(code) + '/sfx', { k: kind, at: Date.now() }).then(function (r) {
          if (r && r.key) setTimeout(function () { db.remove(base(code) + '/sfx/' + r.key); }, 4000);
        });
      },
      // Joins that arrived during a hand sit down when it is over (before the next deal).
      beforeHand: function () { while (queuedJoins.length) sit(queuedJoins.shift(), false); }
    });
    table.publish();
    function seatOf(id) { for (var i = 1; i < 8; i++) if (table.seats[i].id === id && table.seats[i].kind === 'remote') return i; return -1; }
    function sit(req, startNow) {
      var i = seatOf(req.uid), free = -1, buy = Math.floor(Number(req.buy)), lvl = table.level;
      if (i >= 0) { db.set(handsPath(code, req.uid), { seat: i, cards: [], legal: null }); return; }
      if (!(buy >= lvl.min && buy <= lvl.max)) { db.set(handsPath(code, req.uid), { error: 'Instap moet tussen ' + lvl.min + ' en ' + lvl.max + ' liggen.' }); return; }
      for (var k = 1; k < 8; k++) if (table.seats[k].kind === 'empty' && free < 0) free = k;
      if (free < 0) { db.set(handsPath(code, req.uid), { error: 'De tafel is vol.' }); return; }
      table.seats[free] = { id: req.uid, name: String(req.name || 'Vriend').slice(0, 14), kind: 'remote', style: 'gemiddeld', stack: buy, persona: free, leaving: false };
      db.set(handsPath(code, req.uid), { seat: free, cards: [], legal: null });
      if (o.onLog) o.onLog(table.seats[free].name + ' zit aan tafel.');
      if (startNow) table.startHand(); else table.publish();
    }
    unsub.push(db.onChildAdded(base(code) + '/join', function (key, req) {
      db.remove(base(code) + '/join/' + key);
      if (!req || !req.uid) return;
      if (table.hand && !table.hand.done) queuedJoins.push(req); else sit(req, true);
    }));
    unsub.push(db.onChildAdded(base(code) + '/inbox', function (key, msg) {
      db.remove(base(code) + '/inbox/' + key);
      if (!msg || !msg.uid) return;
      var i = seatOf(msg.uid);
      if (i < 0) return;
      if (msg.leave) { table.leave(i); return; }
      if (msg.action) table.act(i, msg.action);
    }));
    return {
      table: table,
      // The host's own moves
      act: function (action) { return table.act(0, action); },
      // Sit down at the table yourself with this many fiches (the hand starts when two can play).
      sitDown: function (buy) { table.seats[0].stack = buy; table.startHand(); },
      leave: function () { table.leave(0); },
      start: function () { table.startHand(); },
      chat: function (text) { db.push(base(code) + '/chat', { name: o.name || 'Host', text: String(text).slice(0, 200), at: Date.now() }); },
      snapshot: function () { return table.snapshot(); },
      restore: function (snap) { table.restore(snap); },
      stop: function () { unsub.forEach(function (f) { if (typeof f === 'function') f(); }); table.stop(); }
    };
  }

  // A friend: sends a request to sit down, then follows the table and sends moves.
  function guest(db, code, name, buy, cb) {
    var uid = db.uid, unsub = [], me = { seat: null, cards: [], legal: null, error: null };
    unsub.push(db.on(handsPath(code, uid), function (p) {
      if (!p) return;
      me = { seat: p.seat, cards: p.cards || [], legal: p.legal || null, deadline: p.deadline || 0, error: p.error || null, cashed: p.cashed };
      if (cb) cb('hands', me);
    }));
    unsub.push(db.on(base(code) + '/pub', function (pub) { if (cb) cb('pub', pub); }));
    unsub.push(db.onChildAdded(base(code) + '/chat', function (key, msg) { if (cb) cb('chat', msg); }));
    unsub.push(db.onChildAdded(base(code) + '/sfx', function (key, msg) {
      // only sounds from the last few seconds: older ones are still there when you join
      if (msg && cb && Date.now() - msg.at < 4000) cb('sfx', msg.k);
    }));
    db.push(base(code) + '/join', { uid: uid, name: name, buy: buy });
    return {
      me: function () { return me; },
      act: function (action) { db.push(base(code) + '/inbox', { uid: uid, action: action }); },
      leave: function () { db.push(base(code) + '/inbox', { uid: uid, leave: true }); },
      chat: function (text) { db.push(base(code) + '/chat', { name: name, text: String(text).slice(0, 200), at: Date.now() }); },
      stop: function () { unsub.forEach(function (f) { if (typeof f === 'function') f(); }); }
    };
  }

  var api = { host: host, guest: guest, handsPath: handsPath, base: base };
  root.PokerOnline = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
