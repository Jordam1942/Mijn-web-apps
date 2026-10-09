// Friends at one table: a host and two friends, over a fake shared database that works
// like the real one (a hand only goes to the player it belongs to).
// Run with: node poker/tests/online.test.js
const O = require('../online.js');
const E = require('../engine.js');
const assert = require('assert');

function seeded(seed) { let a = seed >>> 0; return n => { a = (a * 1664525 + 1013904223) >>> 0; return Math.floor((a / 4294967296) * n); }; }

// A tiny shared store. Writes are queued and delivered on flush(), like a network.
function makeNet() {
  const store = {}, subs = [], queue = [];
  let counter = 0;
  function visibleTo(path, uid) {
    const m = /(?:^|\/)hands\/([^/]+)/.exec(path);
    return !m || m[1] === uid;
  }
  function write(path, value) { if (value === null || value === undefined) delete store[path]; else store[path] = JSON.parse(JSON.stringify(value)); queue.push({ path, value }); }
  return {
    store,
    dbFor(uid) {
      return {
        uid,
        set: (p, v) => { write(p, v); return Promise.resolve(); },
        remove: (p) => { write(p, null); return Promise.resolve(); },
        push: (p, v) => { const key = 'k' + (++counter); write(p + '/' + key, v); return Promise.resolve({ key }); },
        on: (p, cb) => { const s = { uid, kind: 'on', p, cb, last: undefined }; subs.push(s); if (store[p] !== undefined) { s.last = JSON.stringify(store[p]); cb(JSON.parse(s.last)); } return () => { subs.splice(subs.indexOf(s), 1); }; },
        onChildAdded: (p, cb) => {
          const s = { uid, kind: 'child', p, cb, seen: {} };
          subs.push(s);
          Object.keys(store).forEach(k => { if (k.startsWith(p + '/') && k.split('/').length === p.split('/').length + 1 && visibleTo(k, uid)) { s.seen[k] = 1; cb(k.split('/').pop(), JSON.parse(JSON.stringify(store[k]))); } });
          return () => { subs.splice(subs.indexOf(s), 1); };
        }
      };
    },
    flush() {
      let n = 0;
      while (queue.length && n++ < 100000) {
        const w = queue.shift();
        subs.slice().forEach(s => {
          if (!visibleTo(w.path, s.uid)) return;
          if (s.kind === 'on' && w.path === s.p) {
            const val = store[s.p];
            const js = val === undefined ? 'undefined' : JSON.stringify(val);
            if (js !== s.last) { s.last = js; s.cb(val === undefined ? null : JSON.parse(js)); }
          } else if (s.kind === 'child' && w.path.startsWith(s.p + '/') && w.path.split('/').length === s.p.split('/').length + 1 && store[w.path] !== undefined && !s.seen[w.path]) {
            s.seen[w.path] = 1; s.cb(w.path.split('/').pop(), JSON.parse(JSON.stringify(store[w.path])));
          }
        });
      }
      return n;
    }
  };
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('friends sit down, play a hand, and only see their own cards', () => {
  const net = makeNet();
  const q = [];
  const later = (fn) => { const t = { fn, dead: false }; q.push(t); return t; };
  const cancel = (t) => { if (t) t.dead = true; };
  const dbH = net.dbFor('H'), dbA = net.dbFor('A'), dbB = net.dbFor('B');
  const host = O.host(dbH, { code: 'abc', name: 'Host', level: { sb: 5, bb: 10, min: 200, max: 1000 }, speed: 'snel', turnTimer: 0, takeover: 0, rnd: seeded(4), later, cancel, autoNext: false });
  host.sitDown(500);
  net.flush();
  const seenA = [], seenB = [], chatB = [];
  const gA = O.guest(dbA, 'abc', 'Anna', 400, (kind, v) => { if (kind === 'hands') seenA.push(v); });
  net.flush();
  const gB = O.guest(dbB, 'abc', 'Bram', 400, (kind, v) => { if (kind === 'hands') seenB.push(v); if (kind === 'chat') chatB.push(v); });
  net.flush();
  assert.strictEqual(host.table.seats[1].name, 'Anna');
  assert.ok(host.table.hand, 'de ronde is gestart');
  assert.ok(seenA.length && seenA[seenA.length - 1].seat === 1);
  // Bram is not in this hand yet (queued until the hand is over)
  assert.strictEqual(host.table.seats[2].kind, 'empty');

  // Play: the host and Anna respond; the hand ends.
  let guard = 0;
  while (host.table.hand && !host.table.hand.done && guard++ < 500) {
    while (q.length) { const t = q.shift(); if (!t.dead) t.fn(); }
    net.flush();
    const h = host.table.hand;
    if (!h || h.done) break;
    const who = h.current;
    const L = E.legal(h, who);
    const act = L.canCheck ? { type: 'check' } : { type: 'call' };
    if (who === 0) host.act(act);
    else if (who === 1) gA.act(act);
    else break;
    net.flush();
  }
  net.flush();
  assert.ok(host.table.hand.done, 'de ronde is niet klaar');
  // Anna's last hand packet holds her cards, and nothing of anyone else's
  const annaCards = host.table.hand.players[1].cards;
  assert.deepStrictEqual(seenA[seenA.length - 1].cards.length, 2);
  assert.deepStrictEqual(seenA.find(v => v.cards.length === 2 && v.cards[0] === annaCards[0] && v.cards[1] === annaCards[1]) !== undefined, true);
  // Bram never got a hands packet with Anna's cards
  assert.ok(seenB.every(v => !(v.cards && v.cards[0] === annaCards[0] && v.cards[1] === annaCards[1])));
  // the public table view has no open cards while the hand runs (checked on the net store)
  const pub = net.store['pk/abc/pub'];
  assert.ok(pub.seats.every(s => s.cards.every(c => c === null) || pub.done));
  // chat reaches everyone
  gA.chat('Hallo!');
  net.flush();
  assert.ok(chatB.some(m => m.text === 'Hallo!'));
  // Bram sits down after the hand
  net.flush();
  while (q.length) { const t = q.shift(); if (!t.dead) t.fn(); }
  host.start();
  net.flush();
  assert.strictEqual(typeof host.table.seats[2].name, 'string');
});

test('a friend who leaves mid-hand gets the fiches back after the hand', () => {
  const net = makeNet();
  const q = [];
  const later = (fn) => { const t = { fn, dead: false }; q.push(t); return t; };
  const cancel = (t) => { if (t) t.dead = true; };
  const host = O.host(net.dbFor('H'), { code: 'zz', name: 'Host', level: { sb: 5, bb: 10, min: 200, max: 1000 }, speed: 'snel', turnTimer: 0, takeover: 0, rnd: seeded(9), later, cancel, autoNext: false });
  host.sitDown(600);
  net.flush();
  const gA = O.guest(net.dbFor('A'), 'zz', 'Anna', 500, () => {});
  net.flush();
  assert.ok(host.table.hand && host.table.seats[1].kind === 'remote' && host.table.seats[1].name === 'Anna');
  gA.leave();
  net.flush();
  // hand still running, Anna still has her fiches in the pot; she leaves after
  let guard = 0;
  while (host.table.hand && !host.table.hand.done && guard++ < 300) {
    while (q.length) { const t = q.shift(); if (!t.dead) t.fn(); }
    net.flush();
    const h = host.table.hand;
    if (!h || h.done) break;
    const L = E.legal(h, h.current);
    if (h.current === 0) host.act(L.canCheck ? { type: 'check' } : { type: 'call' });
    else if (h.current === 1) gA.act({ type: 'fold' });
    net.flush();
  }
  net.flush();
  assert.strictEqual(host.table.seats[1].kind, 'empty', 'Anna zit nog aan tafel: ' + JSON.stringify(host.table.seats.map(s => [s.name, s.kind, s.stack, s.leaving])) + ' hand done=' + !!(host.table.hand && host.table.hand.done) + ' inbox=' + Object.keys(net.store).filter(k => k.includes('inbox')).join(','));
});

test('a friend photo is only taken when it is a small JPEG from the app', () => {
  const net = makeNet();
  const host = O.host(net.dbFor('H'), { code: 'ph', name: 'Host', level: { sb: 5, bb: 10, min: 200, max: 1000 }, speed: 'snel', turnTimer: 0, takeover: 0, rnd: seeded(2), later: () => ({}), cancel: () => {}, autoNext: false });
  host.sitDown(500);
  net.flush();
  O.guest(net.dbFor('A'), 'ph', 'Anna', 400, () => {}, 'data:image/png;base64,AAAA');
  net.flush();
  assert.strictEqual(host.table.seats[1].img, null, 'een png is geaccepteerd');
  // a second table, so the friend sits down straight away (no hand is running yet)
  const host2 = O.host(net.dbFor('H2'), { code: 'pj', name: 'Host', level: { sb: 5, bb: 10, min: 200, max: 1000 }, speed: 'snel', turnTimer: 0, takeover: 0, rnd: seeded(3), later: () => ({}), cancel: () => {}, autoNext: false });
  net.flush();
  O.guest(net.dbFor('B'), 'pj', 'Bram', 400, () => {}, 'data:image/jpeg;base64,/9j/AAAA');
  net.flush();
  assert.strictEqual(host2.table.seats[1].img, 'data:image/jpeg;base64,/9j/AAAA');
});

test('a friend who comes back gets the same seat; a stranger does not get one', () => {
  const net = makeNet();
  const host = O.host(net.dbFor('H'), { code: 'rj', name: 'Host', level: { sb: 5, bb: 10, min: 200, max: 1000 }, speed: 'snel', turnTimer: 0, takeover: 0, rnd: seeded(5), later: () => ({}), cancel: () => {}, autoNext: false });
  host.sitDown(500);
  net.flush();
  O.guest(net.dbFor('A'), 'rj', 'Anna', 400, () => {});
  net.flush();
  const seatBefore = host.table.seats.findIndex(s => s.id === 'A');
  assert.ok(seatBefore > 0, 'Anna zit niet aan tafel');
  // the app was closed and opened again: same phone, so same id
  let got = null;
  O.guest(net.dbFor('A'), 'rj', 'Anna', 400, (kind, v) => { if (kind === 'hands') got = v; }, null, true);
  net.flush();
  assert.strictEqual(got && got.seat, seatBefore, 'Anna kreeg niet haar plek terug');
  assert.strictEqual(host.table.seats.filter(s => s.id === 'A').length, 1, 'Anna staat er dubbel in');
  // a stranger who asks to come back: told they are not seated, nothing changes
  let stranger = null;
  O.guest(net.dbFor('C'), 'rj', 'Carla', 400, (kind, v) => { if (kind === 'hands') stranger = v; }, null, true);
  net.flush();
  assert.strictEqual(stranger && stranger.code, 'not_seated');
  assert.strictEqual(host.table.seats.filter(s => s.id === 'C').length, 0, 'Carla is toch gezet');
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.stack.split('\n').slice(0, 3).join('\n     ')); }
}
console.log('\n' + (tests.length - failed) + '/' + tests.length + ' online-tests geslaagd.');
if (failed) process.exit(1);
