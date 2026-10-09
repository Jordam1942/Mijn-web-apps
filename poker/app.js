/*
 * Royal Flush Society: the screens. Game rules live in engine.js, computer players in ai.js,
 * the table in table.js, friends in online.js. Here: what you see and tap.
 */
(function () {
  'use strict';

  var E = window.PokerEngine, M = window.PokerMoney, A = window.PokerAI, ART = window.PokerArt;
  var TB = window.PokerTable, ON = window.PokerOnline, P = window.PokerPrefs, SFX = window.PokerSfx;
  var NET = window.PokerNet;
  var $ = function (id) { return document.getElementById(id); };
  var SAVE_SOLO = 'poker-saved-solo', SAVE_HOST = 'poker-saved-host', SAVE_COUNT = 'poker-count-v1';
  var ROOM_CODE = 'kamer';
  var game = null;          // {kind:'solo'|'host'|'guest', table?, host?, guest?, db?, code?, pub?, me?, undo?}
  var oddsCache = { key: '', value: null };
  var lastTurn = false, wakeLock = null;
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  // ---- Screens ---------------------------------------------------------------
  function show(name) {
    document.querySelectorAll('.screen').forEach(function (s) { s.hidden = s.id !== 's-' + name; });
    if (name === 'menu') refreshMenu();
    if (name === 'table') keepAwake(true); else keepAwake(false);
  }
  function go(name) {
    if (name === 'setup') renderSetup();
    if (name === 'settings') renderSettings();
    if (name === 'count') renderCount();
    if (name === 'online') renderOnline();
    show(name);
  }
  function keepAwake(on) {
    try {
      if (on && P.get().wake && navigator.wakeLock && !wakeLock) navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () {});
      if (!on && wakeLock) { wakeLock.release(); wakeLock = null; }
    } catch (e) {}
  }
  function buzz(ms) { try { if (P.get().vibrate && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
  function sound(k) { try { if (SFX) SFX.play(k); } catch (e) {} }
  function refreshBank() { $('bank').textContent = M.fmt(M.balance()); }
  function refreshMenu() {
    refreshBank();
    $('btn-resume').hidden = !store.get(SAVE_SOLO);
  }
  function msg(text) { $('t-msg').textContent = text || ''; }
  function status(id, text) { $(id).textContent = text || ''; }

  // A small sheet for questions and chat
  function sheet(html, buttons) {
    var box = $('sheet'), body = $('sheet-body');
    body.innerHTML = html;
    (buttons || []).forEach(function (b, k) {
      var el = document.createElement('button');
      el.className = 'btn ' + (b.cls || '');
      el.textContent = b.label;
      el.addEventListener('click', function () { closeSheet(); if (b.fn) b.fn(); });
      body.appendChild(el);
    });
    box.hidden = false;
    return body;
  }
  function closeSheet() { $('sheet').hidden = true; $('sheet-body').innerHTML = ''; }
  function confirmThen(text, yes) {
    sheet('<h2>Weet je het zeker?</h2><p>' + esc(text) + '</p>', [
      { label: 'Ja', cls: 'gold', fn: yes }, { label: 'Nee', cls: 'ghost' }
    ]);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---- Setup -----------------------------------------------------------------
  var setup = { level: null };
  function renderSetup() {
    var bal = M.balance(), list = $('level-list');
    list.innerHTML = '';
    M.LEVELS.forEach(function (l) {
      var b = document.createElement('button');
      b.className = 'level';
      b.setAttribute('aria-selected', setup.level === l.level ? 'true' : 'false');
      b.disabled = bal < l.min;
      b.innerHTML = '<span><b>Niveau ' + l.level + '</b><small>Blinds ' + M.fmt(l.sb) + ' / ' + M.fmt(l.bb) + '</small></span><small>' + M.fmt(l.min) + ' – ' + M.fmt(l.max) + '</small>';
      b.addEventListener('click', function () { setup.level = l.level; setup.buy = Math.min(l.max, Math.max(l.min, Math.floor(M.balance() / 100) * 100)); renderSetup(); });
      list.appendChild(b);
    });
    if (!setup.level) {
      var first = M.LEVELS.filter(function (l) { return bal >= l.min; })[0];
      setup.level = first ? first.level : 1;
    }
    var L = M.LEVELS[setup.level - 1];
    var affordable = bal >= L.min;
    if (!affordable) { setup.level = 1; L = M.LEVELS[0]; }
    if (!setup.buy || setup.buy < L.min || setup.buy > L.max) setup.buy = Math.min(L.max, Math.max(L.min, Math.floor(bal / 100) * 100));
    var range = $('buy-in');
    range.min = L.min; range.max = Math.min(L.max, Math.max(L.min, bal)); range.step = 100;
    if (L.min > range.max) range.max = L.min;
    range.value = Math.min(Math.max(setup.buy, +range.min), +range.max);
    setup.buy = +range.value;
    $('buy-out').textContent = M.fmt(setup.buy) + ' fiches';
    $('bots-out').textContent = $('bots').value;
    $('btn-deal').disabled = !affordable || setup.buy > bal;
    $('btn-deal').textContent = affordable ? 'Aanschuiven' : 'Je hebt meer fiches nodig';
  }
  document.addEventListener('input', function (e) {
    if (e.target.id === 'buy-in') { setup.buy = +e.target.value; renderSetup(); }
    if (e.target.id === 'bots') renderSetup();
    if (e.target.id === 'raise-range') { raise.to = +e.target.value; updateRaiseOut(); }
  });
  $('buy-min').addEventListener('click', function () { setup.buy = M.LEVELS[setup.level - 1].min; renderSetup(); });
  $('buy-max').addEventListener('click', function () { setup.buy = Math.min(M.LEVELS[setup.level - 1].max, M.balance()); renderSetup(); });
  $('btn-deal').addEventListener('click', function () {
    var L = M.LEVELS[setup.level - 1], buy = setup.buy;
    if (!M.take(buy)) { msg('Je bank is te laag voor deze instap.'); return; }
    startSolo(L, buy, +$('bots').value);
  });

  // ---- Solo table ------------------------------------------------------------
  var BOT_STYLES = ['voorzichtig', 'gemiddeld', 'agressief'];
  function soloOptions(L) {
    var p = P.get();
    return {
      level: L, speed: p.speed, turnTimer: p.turnTimer, takeover: 0,
      onChange: function (i, view) { if (i === 0 && game && game.kind === 'solo') { renderTable(view); saveSolo(); } },
      onCashOut: function (i, amount) {
        if (i !== 0) return;
        if (amount > 0) M.give(amount);
      },
      onLog: function (text) { if (game && game.kind === 'solo') msg(text); },
      onSound: function (k) { sound(k); },
      onTurn: function (i) { if (i === 0) buzz(40); }
    };
  }
  function startSolo(L, buy, bots) {
    var seats = [{ id: 'jij', name: 'Jij', kind: 'human', stack: buy, persona: 0 }], k, persona = 1, opts;
    for (k = 0; k < bots; k++) {
      var stack = Math.round((L.min + (L.max - L.min) * (0.25 + 0.6 * Math.random())) / 10) * 10;
      stack = Math.max(L.min, Math.min(L.max, stack));
      seats.push({ id: 'bot' + k, name: ART.name(persona), kind: 'bot', style: BOT_STYLES[k % 3], stack: stack, persona: persona });
      persona++;
    }
    opts = soloOptions(L); opts.seats = seats;
    if ($('blinds-up').checked) { opts.blindEvery = 10; opts.nextLevel = nextLevel; }
    opts.speed = P.get().speed;
    game = { kind: 'solo', level: L, table: null, leaving: false };
    game.table = makeSoloTable(opts);
    game.blindEvery = opts.blindEvery || 0;
    show('table');
    game.table.startHand();
    saveSolo();
  }
  function nextLevel(l) { return M.LEVELS[Math.min(M.LEVELS.length - 1, l.level)]; }
  function makeSoloTable(opts) {
    var t = TB.create(opts);
    t.autoNext = true;
    return t;
  }
  function saveSolo() { if (game && game.kind === 'solo' && game.table) { var s = game.table.snapshot(); s.blindEvery = game.blindEvery || 0; store.set(SAVE_SOLO, s); } }
  function resumeSolo() {
    var snap = store.get(SAVE_SOLO);
    if (!snap) return;
    var L = snap.level, opts = soloOptions(L);
    opts.seats = snap.seats;
    if (snap.blindEvery) { opts.blindEvery = snap.blindEvery; opts.nextLevel = nextLevel; }
    game = { kind: 'solo', level: L, table: null, leaving: false };
    game.table = makeSoloTable(opts);
    game.table.restore(snap);
    show('table');
    saveSolo();
  }
  // Leave at once: your stack goes back to the bank, the table stops, and you are at the menu.
  // What you already put into this hand's pot stays there.
  function leaveSolo() {
    if (!game || game.kind !== 'solo') return show('menu');
    game.table.leaveNow(0);
    exitSolo();
  }
  function exitSolo() {
    if (game && game.table) { game.table.stop(); game.table.autoNext = false; }
    store.del(SAVE_SOLO);
    game = null;
    show('menu');
  }
  // Out of fiches at the table: offer to buy in again, or leave.
  function outOfChips(view) {
    if (!game || game.kind !== 'solo') return;
    var L = game.level, bal = M.balance();
    game.table.autoNext = false;
    game.outShown = true;
    var canBuy = bal >= L.min;
    sheet('<h2>Je fiches zijn op</h2><p>Je kunt weer aanschuiven met minstens ' + M.fmt(L.min) + ' fiches. Je bank heeft nu ' + M.fmt(bal) + '.</p>',
      [{ label: 'Opnieuw inkopen (' + M.fmt(Math.min(L.max, bal)) + ')', cls: 'gold', fn: function () {
          var amount = Math.min(L.max, M.balance());
          if (!M.take(amount)) return;
          game.table.seats[0].stack = amount;
          game.table.autoNext = true;
          game.outShown = false;
          game.table.startHand();
        }, disabled: !canBuy },
       { label: 'Naar het menu', cls: 'ghost', fn: exitSolo }]);
    if (!canBuy) $('sheet-body').querySelector('.gold').disabled = true;
  }

  // ---- Table rendering -------------------------------------------------------
  // view: the table view (table.js), or a guest's combined view.
  var lastBoard = 0, lastDone = true;
  function renderTable(v) {
    var n = v.seats.length, you = v.you === null || v.you === undefined ? 0 : v.you;
    var newStreet = v.board.length > lastBoard, newHand = !v.done && lastDone;
    lastBoard = v.board.length; lastDone = v.done;
    var dealBoard = newStreet && P.fx('fxDeal'), dealHole = newHand && P.fx('fxDeal');
    $('t-level').textContent = 'Niveau ' + v.level.level + ' · ' + M.fmt(v.level.sb) + '/' + M.fmt(v.level.bb);
    $('t-pot').textContent = 'Pot ' + M.fmt(v.pot);
    $('t-chat').hidden = !game || game.kind === 'solo';
    // Board
    var board = '';
    for (var b = 0; b < 5; b++) board += v.board[b] !== undefined ? '<span class="' + (dealBoard && b >= v.board.length - 3 ? 'deal' : '') + '">' + ART.card(v.board[b]) + '</span>' : '<span class="slot"></span>';
    $('board').innerHTML = board;
    // Seats, you at the bottom, the others around the felt
    var seats = '';
    v.seats.forEach(function (s, i) {
      if (s.kind === 'empty' || (s.out && !v.done && !s.cards.length && s.stack === 0)) return;
      var ang = (90 + ((i - you + n) % n) * 360 / n) * Math.PI / 180;
      var left = 50 + 42 * Math.cos(ang), top = 50 + 40 * Math.sin(ang);
      var cls = 'seat' + (s.turn ? ' turn' : '') + (s.folded ? ' folded' : '') + (s.out ? ' out' : '') + (i === you ? ' you' : '') + (v.winners && v.winners.indexOf(i) >= 0 && P.fx('fxWin') ? ' win' : '');
      var hole = '';
      if (!s.folded && s.cards && s.cards.length) hole = s.cards.map(function (c) { return '<span class="' + (dealHole ? 'deal' : '') + '">' + ART.card(c) + '</span>'; }).join('');
      var tag = s.allIn ? '<span class="tag">all-in</span>' : (s.folded ? '<span class="tag">gepast</span>' : (s.leaving ? '<span class="tag">weg</span>' : ''));
      seats += '<div class="' + cls + '" style="left:' + left.toFixed(1) + '%;top:' + top.toFixed(1) + '%">' +
        '<div class="hole">' + hole + '</div>' +
        ART.avatar(s.persona || 0) +
        (s.button ? '<span class="dealer" aria-label="Knop">D</span>' : '') +
        '<span class="nm">' + esc(s.name) + '</span>' +
        '<span class="st">' + M.fmt(s.stack) + '</span>' + tag +
        (s.bet > 0 ? '<span class="bet">' + M.fmt(s.bet) + '</span>' : '') +
        '</div>';
    });
    $('seats').innerHTML = seats;
    // Winners banner
    if (v.done && v.result && v.result.length) {
      $('seats').insertAdjacentHTML('beforeend', '<div class="winner-banner">' + esc(v.result.join(' · ')) + '</div>');
    }
    if (v.log && v.log.length) msg(v.log[v.log.length - 1]);
    renderOdds(v);
    renderActions(v);
    if (v.legal && !lastTurn) { sound('turn'); buzz(40); }
    lastTurn = !!v.legal;
    if (game && game.kind === 'solo' && game.table && v.seats[0].stack === 0 && (v.done || !game.table.hand) && !game.outShown) { game.outShown = true; outOfChips(v); }
  }

  function renderOdds(v) {
    var you = v.you, me = you === null || you === undefined ? null : v.seats[you];
    if (!P.get().odds) { $('odds').hidden = true; return; }
    $('odds').hidden = false;
    if (!me || !me.cards || !me.cards.length || me.cards[0] === null || me.folded) {
      $('odds-pct').textContent = '–'; $('odds-win').style.width = '0'; $('odds-tie').style.width = '0'; $('odds-lose').style.width = '0';
      $('odds-hand').textContent = me && me.folded ? 'Je hebt gepast' : 'Wacht op de kaarten';
      return;
    }
    var opp = v.seats.filter(function (s, i) { return i !== you && !s.out && !s.folded && s.kind !== 'empty'; }).length;
    var key = me.cards.join(',') + '|' + v.board.join(',') + '|' + opp;
    if (oddsCache.key !== key) {
      oddsCache.key = key;
      oddsCache.value = opp > 0 ? A.odds(me.cards, v.board, opp, 300) : { win: 1, tie: 0, lose: 0 };
    }
    var o = oddsCache.value, share = A.share(o);
    $('odds-pct').textContent = Math.round(share * 100) + '%';
    $('odds-win').style.width = (o.win * 100).toFixed(1) + '%';
    $('odds-tie').style.width = (o.tie * 100).toFixed(1) + '%';
    $('odds-lose').style.width = (o.lose * 100).toFixed(1) + '%';
    var text = 'Voor de flop: twee kaarten';
    if (v.board.length >= 3) { var ev = A.currentHand(me.cards, v.board); text = 'Nu: ' + E.describe(ev); }
    $('odds-hand').textContent = text;
  }

  // Buttons: only when it is your turn
  var raise = { to: 0, min: 0, max: 0 };
  function renderActions(v) {
    var L = v.legal;
    $('act-row').hidden = false;
    $('b-fold').disabled = !L;
    $('b-call').disabled = !L || (!L.canCheck && !L.canCall);
    $('b-raise').disabled = !L || !L.canRaise;
    $('b-call').innerHTML = L && !L.canCheck ? 'Meegaan<small>' + M.fmt(L.toCall) + '</small>' : 'Checken';
    if (!L) closeRaise();
    if (L && game) timerStart(v.deadline);
    else timerStop();
  }
  function openRaise(v) {
    var L = v.legal;
    raise.min = L.minTo; raise.max = L.maxTo; raise.to = L.minTo;
    var r = $('raise-range');
    r.min = raise.min; r.max = raise.max; r.step = 1; r.value = raise.to;
    $('raise-row').hidden = false;
    $('act-row').hidden = true;
    updateRaiseOut();
  }
  function closeRaise() { $('raise-row').hidden = true; $('act-row').hidden = false; }
  function updateRaiseOut() { $('raise-out').textContent = M.fmt(raise.to); $('raise-range').value = raise.to; }

  var timerRaf = 0, timerEnd = 0, timerLen = 0;
  function timerStart(deadline) {
    cancelAnimationFrame(timerRaf);
    if (!deadline) { $('timer').hidden = true; return; }
    $('timer').hidden = false;
    timerEnd = deadline; timerLen = Math.max(1, deadline - Date.now());
    (function tick() {
      var left = Math.max(0, timerEnd - Date.now()) / timerLen;
      $('timer-bar').style.transform = 'scaleX(' + left.toFixed(3) + ')';
      if (left > 0 && !$('s-table').hidden) timerRaf = requestAnimationFrame(tick);
      else $('timer').hidden = true;
    })();
  }
  function timerStop() { cancelAnimationFrame(timerRaf); $('timer').hidden = true; }

  // The table view, from solo table or the host, or built from the public table and my own packet (guest)
  function currentView() {
    if (!game) return null;
    if (game.kind === 'solo') return game.table.view(0);
    if (game.kind === 'host') return game.host.table.view(0);
    if (game.kind === 'guest') return guestView();
    return null;
  }
  function guestView() {
    var pub = game.pub, me = game.me;
    if (!pub) return null;
    var seats = pub.seats.map(function (s, i) {
      if (me && me.seat === i) return Object.assign({}, s, { cards: me.cards || [] });
      return s;
    });
    return Object.assign({}, pub, {
      seats: seats, you: me && me.seat !== null && me.seat !== undefined ? me.seat : null,
      legal: me && me.legal ? me.legal : null, deadline: me && me.deadline ? me.deadline : 0
    });
  }
  function refreshTable() { var v = currentView(); if (v) renderTable(v); }

  function send(action) {
    if (!game) return;
    if (game.kind === 'solo') {
      var before = game.table.fullSnapshot();
      var res = game.table.act(0, action);
      if (!res.ok) { msg(res.error); sound('error'); return; }
      game.undo = before;
      $('b-undo').hidden = !(before && P.get().undo);
      saveSolo();
    } else if (game.kind === 'host') {
      var r = game.host.act(action);
      if (r && !r.ok) msg(r.error);
    } else if (game.kind === 'guest') {
      game.guest.act(action);
    }
  }
  function confirmAction(action) {
    var needConfirm = (action.type === 'allin' || (action.type === 'raise' && action.to === (currentView() && currentView().legal && currentView().legal.maxTo))) && P.get().confirmAllIn;
    var foldWithCheck = action.type === 'fold' && currentView() && currentView().legal && currentView().legal.canCheck && P.get().confirmFold;
    if (needConfirm) return confirmThen('Alles op de tafel: all-in?', function () { send(action); });
    if (foldWithCheck) return confirmThen('Je kunt checken. Toch passen?', function () { send(action); });
    send(action);
  }
  $('b-fold').addEventListener('click', function () { confirmAction({ type: 'fold' }); });
  $('b-call').addEventListener('click', function () {
    var v = currentView(); if (!v || !v.legal) return;
    send(v.legal.canCheck ? { type: 'check' } : { type: 'call' });
  });
  $('b-undo').addEventListener('click', function () {
    if (!game || game.kind !== 'solo' || !game.undo) return;
    game.table.restoreFull(game.undo);
    game.undo = null;
    $('b-undo').hidden = true;
    saveSolo();
  });
  $('b-raise').addEventListener('click', function () { var v = currentView(); if (v && v.legal) openRaise(v); });
  $('raise-cancel').addEventListener('click', closeRaise);
  $('raise-ok').addEventListener('click', function () {
    var v = currentView(); if (!v || !v.legal) return;
    var to = raise.to;
    if (to >= v.legal.maxTo) return confirmAction({ type: 'allin' });
    send({ type: 'raise', to: to });
    closeRaise();
  });
  document.querySelectorAll('[data-quick]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = currentView(); if (!v || !v.legal) return;
      var L = v.legal, cur = v.current || 0, pot = v.pot;
      var q = b.dataset.quick, to = L.minTo;
      if (q === 'half') to = cur + Math.round(pot / 2);
      if (q === 'pot') to = cur + pot;
      if (q === 'allin') to = L.maxTo;
      raise.to = Math.max(L.minTo, Math.min(L.maxTo, to));
      updateRaiseOut();
    });
  });

  $('t-back').addEventListener('click', function () {
    if (!game) return show('menu');
    if (game.kind === 'solo') {
      if (game.table.hand && !game.table.hand.done) confirmThen('Je verlaat de tafel nu. Wat je al in de pot hebt gelegd, blijft liggen. De rest van je fiches gaat terug naar je bank.', leaveSolo);
      else leaveSolo();
    } else if (game.kind === 'host') {
      confirmThen('Het spel stopt voor iedereen. Doorgaan?', function () { closeTable(); });
    } else if (game.kind === 'guest') {
      confirmThen('Je verlaat de tafel. Je fiches gaan terug naar je bank als de ronde klaar is.', function () { game.guest.leave(); msg('Je verlaat de tafel na deze ronde.'); });
    }
  });

  // ---- Friends online: host ----------------------------------------------------
  function randomCode() {
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', out = '';
    var a = new Uint32Array(5); crypto.getRandomValues(a);
    for (var i = 0; i < 5; i++) out += chars[a[i] % chars.length];
    return out;
  }
  function joinUrl(code) {
    var base = location.href.split('?')[0].split('#')[0];
    return base + '?join=' + encodeURIComponent(code);
  }
  function renderOnline() {
    var sel = $('host-level');
    if (!sel.options.length) {
      M.LEVELS.forEach(function (l) { var o = document.createElement('option'); o.value = l.level; o.textContent = 'Niveau ' + l.level + ' (' + M.fmt(l.sb) + '/' + M.fmt(l.bb) + ')'; sel.appendChild(o); });
      sel.value = '1';
    }
    var j = new URLSearchParams(location.search).get('join');
    if (j) $('join-code').value = j.toUpperCase();
    var saved = store.get(SAVE_HOST);
    status('online-status', saved ? 'Je had een tafel open (code ' + saved.code + '). Open die weer om verder te spelen.' : '');
  }
  $('btn-host').addEventListener('click', function () {
    var name = ($('host-name').value || 'Host').trim().slice(0, 14) || 'Host';
    var L = M.LEVELS[+$('host-level').value - 1], buy = Math.floor(+$('host-buy').value);
    if (!(buy >= L.min && buy <= L.max)) return status('online-status', 'De instap moet tussen ' + M.fmt(L.min) + ' en ' + M.fmt(L.max) + ' liggen.');
    if (!M.take(buy)) return status('online-status', 'Je bank is te laag voor deze instap.');
    var code = randomCode();
    openAsHost(code, name, L, buy, false);
  });
  function openAsHost(code, name, L, buy, resume) {
    status('online-status', 'Tafel openen…');
    var db = NET.peer();
    db.openHost(code, { resume: resume }).then(function () {
      game = { kind: 'host', code: code, db: db, level: L };
      game.host = ON.host(db, {
        code: code, name: name, level: L, speed: P.get().speed, turnTimer: P.get().turnTimer, takeover: P.get().takeover,
        onView: function (view) { renderTable(view); saveHost(); },
        onSound: function (k) { sound(k); },
        onLog: function (text) { msg(text); },
        onCashOut: function (i, amount) { if (amount > 0) M.give(amount); }
      });
      if (resume && store.get(SAVE_HOST)) game.host.restore(store.get(SAVE_HOST).snap);
      else game.host.sitDown(buy);
      store.set(SAVE_HOST, { code: code, name: name, level: L, snap: game.host.snapshot() });
      show('table');
      showInvite(code);
      refreshTable();
    }).catch(function (e) { M.give(buy); status('online-status', e.message || 'Tafel openen mislukt.'); });
  }
  function saveHost() { if (game && game.kind === 'host') store.set(SAVE_HOST, { code: game.code, name: game.host.table.seats[0].name, level: game.level, snap: game.host.snapshot() }); }
  function showInvite(code) {
    var url = joinUrl(code);
    var qr = qrSvg(url, 6);
    sheet('<h2>Vrienden uitnodigen</h2><p>Tafelcode: <strong>' + esc(code) + '</strong></p><div class="qr-box">' + qr + '</div><p class="fine">Laat ze deze QR scannen, of stuur de link. Het spel is vanzelf open zolang je deze telefoon aan staat.</p>',
      [{ label: 'Deel link', cls: 'gold', fn: function () { shareText('Speel mee aan onze pokertafel: ' + code, url); } }, { label: 'Sluiten', cls: 'ghost' }]);
  }
  function closeTable() {
    if (!game) return show('menu');
    if (game.kind === 'host') { game.host.stop(); if (game.db && game.db.stop) { try { game.db.stop(); } catch (e) {} } store.del(SAVE_HOST); }
    if (game.kind === 'guest') { game.guest.stop(); if (game.db && game.db.stop) { try { game.db.stop(); } catch (e) {} } }
    game = null;
    show('menu');
  }

  // ---- Friends online: guest ---------------------------------------------------
  $('btn-join').addEventListener('click', function () {
    var name = ($('join-name').value || 'Jij').trim().slice(0, 14) || 'Jij';
    var code = ($('join-code').value || '').trim().toUpperCase();
    var buy = Math.floor(+$('join-buy').value);
    if (!code) return status('online-status', 'Vul de tafelcode in.');
    if (!M.LEVELS.some(function (l) { return buy >= l.min && buy <= l.max; })) return status('online-status', 'Kies een instap die bij een niveau past.');
    if (!M.take(buy)) return status('online-status', 'Je bank is te laag voor deze instap.');
    status('online-status', 'Verbinden…');
    var db = NET.peer();
    db.joinHost(code).then(function () {
      joinAsGuest(db, code, name, buy);
    }).catch(function (e) { M.give(buy); status('online-status', e.message || 'Verbinden mislukt.'); });
  });
  function joinAsGuest(db, code, name, buy) {
    game = { kind: 'guest', code: code, db: db, pub: null, me: null, buy: buy, cashed: false };
    game.guest = ON.guest(db, code, name, buy, function (kind, data) {
      if (!game || game.kind !== 'guest') return;
      if (kind === 'pub') { game.pub = data; refreshTable(); }
      if (kind === 'hands') {
        game.me = data;
        if (data.error) { M.give(buy); msg(data.error); return; }
        if (data.cashed && !game.cashed) { game.cashed = true; M.give(data.cashed); closeTable(); return; }
        refreshTable();
      }
      if (kind === 'chat') addChat(data);
      if (kind === 'sfx') sound(data);
    });
    show('table');
    msg('Je wacht tot de volgende ronde begint…');
  }

  // ---- Chat ----------------------------------------------------------------------
  var chatLines = [];
  var muted = {};
  function addChat(m) { if (muted[m.name]) return; chatLines.push(m); if (chatLines.length > 80) chatLines.shift(); if (!$('sheet').hidden && $('chat-log')) renderChat(); }
  function renderChat() { var el = $('chat-log'); if (!el) return; el.innerHTML = chatLines.map(function (m) { return '<div><b>' + esc(m.name) + ':</b> ' + esc(m.text) + '</div>'; }).join(''); el.scrollTop = el.scrollHeight; }
  function muteMenu() {
    var names = [];
    chatLines.forEach(function (m) { if (names.indexOf(m.name) < 0) names.push(m.name); });
    if (!names.length) return;
    var html = '<h2>Dempen</h2><p>Gedempte spelers zie je niet meer in de chat. Dit geldt alleen op dit toestel.</p>' + names.map(function (n) {
      return '<label class="toggle"><span>' + esc(n) + '</span><input type="checkbox" data-mute="' + esc(n) + '"' + (muted[n] ? ' checked' : '') + '></label>';
    }).join('');
    sheet(html, [{ label: 'Klaar', cls: 'gold' }]);
    document.querySelectorAll('[data-mute]').forEach(function (cb) { cb.addEventListener('change', function () { muted[cb.dataset.mute] = cb.checked; chatLines = chatLines.filter(function (m) { return !muted[m.name]; }); }); });
  }
  $('t-chat').addEventListener('click', function () {
    sheet('<h2>Chat</h2><div class="chat-log" id="chat-log"></div><input id="chat-in" maxlength="200" placeholder="Schrijf iets…" class="chat-in">',
      [{ label: 'Dempen', cls: 'ghost', fn: muteMenu }, { label: 'Stuur', cls: 'gold', fn: function () {
          var t = ($('chat-in') && $('chat-in').value || '').trim(); if (!t || !game) return;
          if (game.kind === 'host') game.host.chat(t); else if (game.kind === 'guest') game.guest.chat(t);
        } }, { label: 'Sluiten', cls: 'ghost' }]);
    renderChat();
  });

  // ---- Friends in the same room (QR, no internet) ----------------------------------
  var ring = null, roomGame = { linked: false };
  function ringDb() { if (!ring) ring = NET.ring({ kind: 'ring', storeKey: 'poker-ring-data', privateHands: true }); return ring; }
  function qrSvg(text, size) {
    try { var q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: size || 5, margin: 2, scalable: true }); }
    catch (e) { return '<p class="fine">Kan geen QR maken. Gebruik de code: ' + esc(text).slice(0, 40) + '…</p>'; }
  }
  $('room-host-scan').addEventListener('click', function () { scanCode(function (text) { finishRoom(text); }, 'Scan het antwoord van je vriend'); });
  $('room-host-next').addEventListener('click', function () { makeOffer(); });
  function makeOffer() {
    var db = ringDb();
    status('room-status', 'QR maken…');
    db.makeOffer().then(function (code) {
      $('room-host-qr').innerHTML = qrSvg(code, 4);
      status('room-status', 'Laat je vriend deze QR scannen, en scan daarna zijn antwoord.');
    }).catch(function (e) { status('room-status', e.message); });
  }
  function finishRoom(answer) {
    ringDb().finishOffer(answer).then(function () { roomLinked('Verbonden. Open de tafel als je wilt beginnen.'); })
      .catch(function (e) { status('room-status', e.message); });
  }
  $('room-join-scan').addEventListener('click', function () { scanCode(function (text) { useOffer(text); }, 'Scan de QR van je vriend'); });
  $('room-paste-go').addEventListener('click', function () { var t = $('room-paste').value.trim(); if (t) useOffer(t); });
  function useOffer(text) {
    ringDb().acceptOffer(text).then(function (answer) {
      $('room-join-qr').innerHTML = qrSvg(answer, 4);
      status('room-status', 'Laat je vriend deze antwoord-QR scannen.');
      roomLinked('Verbonden. Ga zitten als de tafel open is.');
    }).catch(function (e) { status('room-status', e.message); });
  }
  function roomLinked(text) {
    roomGame.linked = true;
    $('room-table-box').hidden = false;
    status('room-status', text);
  }
  $('room-open').addEventListener('click', function () {
    var name = ($('room-name').value || 'Host').trim().slice(0, 14) || 'Host';
    var buy = Math.floor(+$('room-buy').value);
    var L = M.LEVELS.filter(function (l) { return buy >= l.min && buy <= l.max; })[0];
    if (!L) return status('room-status', 'Kies een instap die bij een niveau past.');
    if (!M.take(buy)) return status('room-status', 'Je bank is te laag.');
    var db = ringDb();
    game = { kind: 'host', code: ROOM_CODE, db: db, level: L };
    game.host = ON.host(db, {
      code: ROOM_CODE, name: name, level: L, speed: P.get().speed, turnTimer: P.get().turnTimer, takeover: P.get().takeover,
      onView: function (view) { renderTable(view); },
      onLog: function (text) { msg(text); },
      onSound: function (k) { sound(k); },
      onCashOut: function (i, amount) { if (amount > 0) M.give(amount); }
    });
    game.host.sitDown(buy);
    $('room-code').textContent = ROOM_CODE;
    show('table');
    refreshTable();
  });
  $('room-sit').addEventListener('click', function () {
    var name = ($('room-name').value || 'Jij').trim().slice(0, 14) || 'Jij';
    var buy = Math.floor(+$('room-buy').value);
    if (!M.LEVELS.some(function (l) { return buy >= l.min && buy <= l.max; })) return status('room-status', 'Kies een instap die bij een niveau past.');
    if (!M.take(buy)) return status('room-status', 'Je bank is te laag.');
    joinAsGuest(ringDb(), ROOM_CODE, name, buy);
  });

  // Camera scanner for QR codes (jsQR, loaded when needed; a paste box is always there too)
  var scanState = null;
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve();
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = 'vendor/jsqr.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  function scanCode(done, hint) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status('room-status', 'Geen camera. Plak de code hieronder.'); return; }
    status('room-status', hint || 'Richt de camera op de QR');
    Promise.all([navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }), loadJsQR()]).then(function (r) {
      var video = $('scan-video'), canvas = $('scan-canvas'), cx = canvas.getContext('2d');
      video.srcObject = r[0]; video.play();
      $('scanner').hidden = false;
      scanState = { stream: r[0], on: true };
      (function frame() {
        if (!scanState || !scanState.on) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          cx.drawImage(video, 0, 0, canvas.width, canvas.height);
          var img = cx.getImageData(0, 0, canvas.width, canvas.height);
          var res = window.jsQR && window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (res && res.data) { stopScan(); done(res.data); return; }
        }
        requestAnimationFrame(frame);
      })();
    }).catch(function () { status('room-status', 'Camera niet beschikbaar. Plak de code hieronder.'); });
  }
  function stopScan() {
    if (scanState) { scanState.on = false; scanState.stream.getTracks().forEach(function (t) { t.stop(); }); scanState = null; }
    $('scanner').hidden = true;
  }
  $('scan-stop').addEventListener('click', stopScan);

  // ---- Fichetelling ----------------------------------------------------------------
  var count = { players: [], pot: 0, blinds: 0 };
  function loadCount() { count = store.get(SAVE_COUNT) || { players: [{ name: 'Speler 1', stack: 1000 }, { name: 'Speler 2', stack: 1000 }], pot: 0, blinds: 0 }; }
  function saveCount() { store.set(SAVE_COUNT, count); }
  function renderCount() {
    loadCount();
    var sel = $('count-blinds');
    if (!sel.options.length) M.LEVELS.forEach(function (l) { var o = document.createElement('option'); o.value = l.level - 1; o.textContent = M.fmt(l.sb) + ' / ' + M.fmt(l.bb); sel.appendChild(o); });
    sel.value = count.blinds;
    $('count-pot').textContent = M.fmt(count.pot);
    var box = $('count-players'); box.innerHTML = '';
    count.players.forEach(function (p, i) {
      var row = document.createElement('div'); row.className = 'player-row';
      row.innerHTML = '<input value="' + esc(p.name) + '" maxlength="14" aria-label="Naam" data-k="name" data-i="' + i + '">' +
        '<strong style="align-self:center">' + M.fmt(p.stack) + '</strong>' +
        '<div class="chips"><input type="number" min="0" step="10" placeholder="bedrag" data-amt="' + i + '">' +
        '<button class="btn small" data-act="in" data-i="' + i + '">Inleg</button>' +
        '<button class="btn small" data-act="win" data-i="' + i + '">Wint pot</button>' +
        '<button class="btn small" data-act="back" data-i="' + i + '">Terug</button>' +
        '<button class="btn small danger" data-act="del" data-i="' + i + '">×</button></div>';
      box.appendChild(row);
    });
  }
  $('count-add').addEventListener('click', function () { loadCount(); count.players.push({ name: 'Speler ' + (count.players.length + 1), stack: 1000 }); saveCount(); renderCount(); });
  $('count-reset').addEventListener('click', function () { confirmThen('Alle fiches en namen wissen?', function () { store.del(SAVE_COUNT); renderCount(); }); });
  $('count-blinds').addEventListener('change', function () { loadCount(); count.blinds = +this.value; saveCount(); });
  $('count-players').addEventListener('change', function (e) {
    loadCount();
    if (e.target.dataset.k === 'name') { count.players[+e.target.dataset.i].name = e.target.value.slice(0, 14); saveCount(); renderCount(); }
  });
  $('count-players').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    loadCount();
    var i = +b.dataset.i, p = count.players[i], amt = Math.floor(+document.querySelector('[data-amt="' + i + '"]').value || 0);
    if (b.dataset.act === 'in' && amt > 0 && p.stack >= amt) { p.stack -= amt; count.pot += amt; }
    if (b.dataset.act === 'back' && amt > 0 && count.pot >= amt) { count.pot -= amt; p.stack += amt; }
    if (b.dataset.act === 'win' && count.pot > 0) { p.stack += count.pot; count.pot = 0; }
    if (b.dataset.act === 'del') count.players.splice(i, 1);
    saveCount(); renderCount();
  });

  // ---- Settings ----------------------------------------------------------------------
  var TOGGLES = [
    ['sound', 'Geluid'], ['vibrate', 'Trillen'], ['wake', 'Scherm aan aan tafel'],
    ['gfx', 'Animaties aan'], ['fxDeal', 'Kaarten uitdelen'], ['fxChips', 'Fiches naar de pot'], ['fxWin', 'Winnaar oplichten'],
    ['confirmAllIn', 'Vragen bij all-in'], ['confirmFold', 'Vragen bij passen als je mag checken'],
    ['undo', 'Knop "Ongedaan maken" (solo)'], ['odds', 'Kanskaart naast je hand']
  ];
  function renderSettings() {
    var p = P.get(), box = $('settings-box');
    var html = '<div class="card-panel"><h3>Thema</h3><label class="field">Thema <select id="set-theme"><option value="system">Zoals het toestel</option><option value="dark">Donker</option><option value="light">Licht</option></select></label></div>';
    html += '<div class="card-panel"><h3>Tempo en tijd</h3>' +
      '<label class="field">Tempo computerspelers <select id="set-speed"><option value="rustig">Rustig</option><option value="normaal">Normaal</option><option value="snel">Snel</option></select></label>' +
      '<label class="field">Beurttimer voor jou <select id="set-timer"><option value="0">Geen</option><option value="15">15 seconden</option><option value="30">30 seconden</option><option value="60">60 seconden</option></select></label>' +
      '<label class="field">Computer neemt over na (vrienden weg) <select id="set-takeover"><option value="0">Nooit</option><option value="30">30 seconden</option><option value="45">45 seconden</option><option value="60">60 seconden</option></select></label></div>';
    html += '<div class="card-panel"><h3>Aan of uit</h3>' + TOGGLES.map(function (t) {
      return '<label class="toggle"><span>' + t[1] + '</span><input type="checkbox" data-set="' + t[0] + '"' + (p[t[0]] ? ' checked' : '') + '></label>';
    }).join('') + '</div>';
    html += '<div class="card-panel"><button class="btn" id="set-default">Standaardinstellingen</button><button class="btn danger" id="set-bank">Bank op 2.000 zetten</button><p class="fine">Speelgeld zonder waarde. Het spel heeft geen aankopen.</p></div>';
    box.innerHTML = html;
    $('set-theme').value = p.theme; $('set-speed').value = p.speed; $('set-timer').value = String(p.turnTimer); $('set-takeover').value = String(p.takeover);
  }
  $('settings-box').addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'set-theme') { P.set('theme', t.value); P.apply(); }
    if (t.id === 'set-speed') P.set('speed', t.value);
    if (t.id === 'set-timer') P.set('turnTimer', +t.value);
    if (t.id === 'set-takeover') P.set('takeover', +t.value);
    if (t.dataset && t.dataset.set) P.set(t.dataset.set, t.checked);
  });
  $('settings-box').addEventListener('click', function (e) {
    if (e.target.id === 'set-default') confirmThen('Alle instellingen terugzetten naar de standaard?', function () { P.setMany(P.defaults()); P.apply(); renderSettings(); });
    if (e.target.id === 'set-bank') confirmThen('Je bank op 2.000 fiches zetten?', function () { M.reset(); renderSettings(); });
  });

  // ---- Share and navigation --------------------------------------------------------
  function shareText(title, url) {
    var data = { title: 'Royal Flush Society', text: title, url: url || location.href.split('?')[0] };
    if (navigator.share) navigator.share(data).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(data.url).then(function () { alert('Link gekopieerd: ' + data.url); });
  }
  $('btn-share').addEventListener('click', function () { shareText('Speel Royal Flush Society, een pokerspel met speelgeld.'); });
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-go]');
    if (g) go(g.dataset.go);
  });
  $('btn-resume').addEventListener('click', function () { resumeSolo(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { M.tick(); refreshBank(); refreshTable(); }
  });
  setInterval(function () { M.tick(); if (!$('s-menu').hidden) refreshBank(); }, 5000);

  // ---- Start ---------------------------------------------------------------------------
  function start() {
    P.apply();
    if ('serviceWorker' in navigator) { try { navigator.serviceWorker.register('sw.js'); } catch (e) {} }
    M.tick();
    var join = new URLSearchParams(location.search).get('join');
    show('menu');
    if (join) { go('online'); $('join-code').value = join.toUpperCase(); }
  }
  start();
})();
