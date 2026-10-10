/*
 * Roulette table: the board, the wheel, the bank (shared with Royal Flush Society) and the computer players.
 * The robot ("Bot speelt voor mij") places a bet for you on every spin until it is done or you stop it.
 */
(function () {
  'use strict';
  var E = window.Roulette, M = window.PokerMoney;
  var $ = function (id) { return document.getElementById('rl-' + id); };

  var CHIPS = [5, 10, 25, 100, 500, 1000];
  var CHIP_COLOR = { 5: '#a3202c', 10: '#1f4e8c', 25: '#2e7d4f', 100: '#1a1a1a', 500: '#6a3c8c', 1000: '#c9a227' };
  var SPIN_MS = 3200;
  var BOT_START = 2000;

  var st = {
    chip: 10,
    placed: {},          // key -> amount you have on it now
    undo: [],            // [{key, amount}] in the order you placed them
    last: null,          // the bets of the last spin, for "Vorige inzet"
    spinning: false,
    rot: 0,              // wheel angle in degrees (keeps growing, so it always turns the same way)
    history: [],
    auto: null           // the robot's job: {bet, left, startBal, limit}
  };

  // The three computer players. Their money is not from your bank: they only play at this table.
  var bots = [
    { name: 'Carla', stack: BOT_START, plan: 'rood', last: '' },
    { name: 'Bram', stack: BOT_START, plan: 'dozijn', last: '' },
    { name: 'Daan', stack: BOT_START, plan: 'nummer', last: '' }
  ];
  var botBets = [];      // [{bot, key, amount}] for the spin that is coming

  function fmt(n) { return M.fmt(n); }
  function total(obj) { return Object.keys(obj).reduce(function (s, k) { return s + obj[k]; }, 0); }
  function msg(text) { $('msg').textContent = text || ''; }

  // ---- wheel -------------------------------------------------------------
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function buildWheel() {
    var svg = $('wheel'), n = E.WHEEL.length, cx = 100, cy = 100, r = 96, i, html = '';
    function pt(deg, rad) { var a = deg * Math.PI / 180; return [cx + rad * Math.sin(a), cy - rad * Math.cos(a)]; }
    var group = '<circle cx="100" cy="100" r="99" fill="#5a3418"/><circle cx="100" cy="100" r="94" fill="#2a1a10" stroke="#c9a227" stroke-width="1.2"/><g id="rl-wheel-inner">';
    for (i = 0; i < n; i++) {
      var num = E.WHEEL[i], mid = i * 360 / n, a1 = mid - 360 / n / 2, a2 = mid + 360 / n / 2;
      var p1 = pt(a1, 92), p2 = pt(a2, 92), col = E.color(num);
      var fill = col === 'red' ? '#a3202c' : col === 'black' ? '#161616' : '#2e7d4f';
      group += '<path d="M' + cx + ',' + cy + ' L' + p1[0].toFixed(2) + ',' + p1[1].toFixed(2) + ' A92,92 0 0 1 ' + p2[0].toFixed(2) + ',' + p2[1].toFixed(2) + ' Z" fill="' + fill + '" stroke="#c9a227" stroke-width="0.5"/>';
      var t = pt(mid, 76);
      group += '<text x="' + t[0].toFixed(2) + '" y="' + t[1].toFixed(2) + '" transform="rotate(' + mid + ' ' + t[0].toFixed(2) + ' ' + t[1].toFixed(2) + ')" text-anchor="middle" dominant-baseline="middle" font-size="7" fill="#f4ecd9">' + num + '</text>';
    }
    group += '<circle cx="100" cy="100" r="30" fill="#3b2415" stroke="#c9a227" stroke-width="1.5"/><circle cx="100" cy="100" r="6" fill="#c9a227"/></g>';
    group += '<circle id="rl-ball" cx="100" cy="16" r="4" fill="#fbf8f1" stroke="#8a8a8a" stroke-width="0.6"/>';
    svg.innerHTML = group;
  }
  function turnWheelTo(n) {
    var idx = E.WHEEL.indexOf(n), per = 360 / E.WHEEL.length;
    var center = idx * per;                             // this slot's angle from the top
    var base = Math.ceil(st.rot / 360) * 360;           // next full turn
    st.rot = base + 5 * 360 + ((360 - center) % 360);   // five full turns, then stop with the number under the pointer
    var inner = document.getElementById('rl-wheel-inner');
    if (inner) { inner.style.transition = 'transform ' + (SPIN_MS / 1000) + 's cubic-bezier(.18,.72,.2,1)'; inner.style.transform = 'rotate(' + st.rot + 'deg)'; inner.style.transformOrigin = '100px 100px'; }
    spinBall();
  }
  // The ball goes round the rim the other way, slows down and drops into the pocket under the pointer
  function spinBall() {
    var ball = document.getElementById('rl-ball');
    if (!ball) return;
    var start = st.ball || 0, t0 = Date.now();
    var total = 1440 + ((start % 360) + 360) % 360;      // a few turns, then the ball ends at the top (angle 0)
    function frame() {
      var t = Math.min(1, (Date.now() - t0) / SPIN_MS), e = 1 - Math.pow(1 - t, 3);
      var a = start - total * e, rad = a * Math.PI / 180;
      ball.setAttribute('cx', (100 + 88 * Math.sin(rad)).toFixed(2));
      ball.setAttribute('cy', (100 - 88 * Math.cos(rad)).toFixed(2));
      if (t < 1) requestAnimationFrame(frame); else st.ball = 0;
    }
    frame();
  }

  // ---- board -------------------------------------------------------------
  function cell(key, text, cls, style) {
    var el = document.createElement('button');
    el.className = 'cell ' + (cls || '');
    el.setAttribute('data-key', key);
    el.innerHTML = '<span class="n">' + text + '</span><span class="amt"></span><span class="bot"></span>';
    if (style) el.style.gridColumn = style[0], el.style.gridRow = style[1];
    el.addEventListener('click', function () { placeChip(key); });
    return el;
  }
  function buildBoard() {
    var b = $('board'), i, r, k;
    b.innerHTML = '';
    b.appendChild(cell('n:0', '0', 'zero', ['1', '1 / span 3']));
    for (r = 0; r < 3; r++) {
      for (k = 0; k < 12; k++) {
        var num = 3 * (k + 1) - r;                       // rows top to bottom: 3,6,..  2,5,..  1,4,..
        var colour = E.color(num);
        b.appendChild(cell('n:' + num, String(num), colour, [String(k + 2), String(r + 1)]));
      }
      var colBet = { 0: 3, 1: 2, 2: 1 }[r];             // 2 to 1 column bet at the end of each row
      b.appendChild(cell('c:' + colBet, '2:1', 'col', ['14', String(r + 1)]));
    }
    var even = [['low', '1-18', '2 / span 2'], ['even', 'Even', '4 / span 2'], ['red', 'Rood', '6 / span 2', 'red'], ['black', 'Zwart', '8 / span 2', 'black'], ['odd', 'Oneven', '10 / span 2'], ['high', '19-36', '12 / span 2']];
    even.forEach(function (c) { b.appendChild(cell(c[0], c[1], c[3] || 'outside', [c[2], '4'])); });
    var dz = [['d:1', '1e dozijn', '2 / span 4'], ['d:2', '2e dozijn', '6 / span 4'], ['d:3', '3e dozijn', '10 / span 4']];
    dz.forEach(function (c) { b.appendChild(cell(c[0], c[1], 'outside', [c[2], '5'])); });
  }

  // ---- chips -------------------------------------------------------------
  function buildChips() {
    var box = $('chips');
    box.innerHTML = '';
    CHIPS.forEach(function (v) {
      var b = document.createElement('button');
      b.className = 'chip-pick';
      b.setAttribute('data-value', v);
      b.style.background = 'radial-gradient(circle at 35% 30%, #fff8 0 12%, ' + CHIP_COLOR[v] + ' 60%)';
      b.textContent = fmt(v);
      b.addEventListener('click', function () { st.chip = v; renderChips(); });
      box.appendChild(b);
    });
  }
  function renderChips() {
    Array.prototype.forEach.call($('chips').children, function (b) {
      b.classList.toggle('on', Number(b.getAttribute('data-value')) === st.chip);
    });
  }

  // ---- bets ----------------------------------------------------------------
  function placeAmount(key, amount) {
    if (st.spinning) return false;
    if (!M.take(amount)) { msg('Je bank is te laag voor deze inzet.'); return false; }
    st.placed[key] = (st.placed[key] || 0) + amount;
    st.undo.push({ key: key, amount: amount });
    return true;
  }
  function placeChip(key) {
    if (st.auto) return msg('De bot speelt nu. Stop de bot om zelf te zetten.');
    if (placeAmount(key, st.chip)) { msg(''); render(); }
  }
  function undoChip() {
    if (st.spinning || st.auto || !st.undo.length) return;
    var last = st.undo.pop();
    st.placed[last.key] -= last.amount;
    if (st.placed[last.key] <= 0) delete st.placed[last.key];
    M.give(last.amount);
    render();
  }
  function clearBets() {
    if (st.spinning || st.auto) return;
    var sum = total(st.placed);
    if (sum) M.give(sum);
    st.placed = {}; st.undo = [];
    msg(''); render();
  }
  function repeatBets() {
    if (st.spinning || st.auto) return;
    if (!st.last) return msg('Er is nog geen vorige inzet.');
    var keys = Object.keys(st.last), want = total(st.last);
    if (total(st.placed)) clearBets();
    if (!M.take(want)) return msg('Je bank is te laag om de vorige inzet te herhalen.');
    keys.forEach(function (k) { st.placed[k] = st.last[k]; st.undo.push({ key: k, amount: st.last[k] }); });
    msg(''); render();
  }

  // ---- computer players ----------------------------------------------------
  function botPlaceAll() {
    botBets = [];
    bots.forEach(function (b) {
      if (b.stack < 10) { b.stack = BOT_START; b.last = 'Nieuwe fiches gekocht'; }
      var key, amount;
      if (b.plan === 'rood') { key = Math.random() < 0.5 ? 'red' : 'black'; amount = 50; }
      else if (b.plan === 'dozijn') { key = 'd:' + (1 + Math.floor(Math.random() * 3)); amount = 50; }
      else { key = 'n:' + Math.floor(Math.random() * 37); amount = 10; }
      amount = Math.min(amount, b.stack);
      b.stack -= amount;
      botBets.push({ bot: b, key: key, amount: amount });
      b.last = E.label(key) + ' ' + amount;
    });
  }
  function botSettleAll(n) {
    botBets.forEach(function (x) {
      var win = E.wins(x.key, n);
      x.bot.stack += win ? x.amount + x.amount * E.odds(x.key) : 0;
      x.bot.last = E.label(x.key) + ' ' + (win ? '+' + x.amount * E.odds(x.key) : '-' + x.amount);
    });
    botBets = [];
  }

  // ---- spin ----------------------------------------------------------------
  function spin() {
    if (st.spinning) return;
    if (!total(st.placed)) return msg('Zet eerst een fiche op het bord.');
    st.spinning = true;
    setButtons();
    botPlaceAll();
    st.last = Object.assign({}, st.placed);
    var n = E.spin();
    turnWheelTo(n);
    msg('');
    setTimeout(function () { finishSpin(n); }, SPIN_MS + 150);
  }
  function finishSpin(n) {
    var result = E.settle(st.placed, n);
    if (result.back) M.give(result.back);
    st.history.unshift(n);
    st.history = st.history.slice(0, 12);
    botSettleAll(n);
    var parts = [n === 0 ? 'Nul' : E.color(n) === 'red' ? 'Rood ' + n : 'Zwart ' + n];
    if (result.staked) parts.push(result.net > 0 ? 'Je wint ' + fmt(result.net) + '.' : result.net === 0 ? 'Je speelt gelijk.' : 'Je verliest ' + fmt(-result.net) + '.');
    $('result').textContent = parts.join(' · ');
    $('result').className = 'rl-result ' + (result.net > 0 ? 'win' : result.net < 0 ? 'lose' : '');
    st.placed = {}; st.undo = [];
    st.spinning = false;
    render();
    if (st.auto) autoNext();
  }

  // ---- the robot -----------------------------------------------------------
  function autoStart() {
    if (st.spinning || st.auto) return;
    var bank = M.balance();
    st.auto = { bet: $('auto-bet').value, left: Number($('auto-spins').value), startBal: bank, limit: Math.round(bank * 0.2) };
    $('auto-start').disabled = true; $('auto-stop').disabled = false;
    msg('De bot speelt voor je.');
    autoNext();
  }
  function autoStop(reason) {
    if (!st.auto) return;
    st.auto = null;
    $('auto-start').disabled = false; $('auto-stop').disabled = true;
    msg(reason || 'De bot is gestopt.');
    render();
  }
  function autoNext() {
    var a = st.auto;
    if (!a) return;
    if (a.left <= 0) return autoStop('De bot is klaar met ' + $('auto-spins').value + ' draaien.');
    if (M.balance() < st.chip) return autoStop('Je bank is te laag voor de volgende inzet.');
    if (a.startBal - M.balance() >= a.limit) return autoStop('De bot stopt: je bent 20% van je bank kwijt.');
    a.left--;
    st.placed = {}; st.undo = [];
    if (!placeAmount(a.bet, st.chip)) return autoStop('Je bank is te laag voor de volgende inzet.');
    render();
    setTimeout(spin, 900);
  }

  // ---- screen ----------------------------------------------------------------
  function setButtons() {
    var busy = st.spinning || !!st.auto;
    ['rl-btn-undo', 'rl-btn-clear', 'rl-btn-repeat', 'rl-btn-spin'].forEach(function (id) { document.getElementById(id).disabled = busy; });
    $('btn-auto-toggle').setAttribute('aria-pressed', st.auto ? 'true' : 'false');
    $('btn-auto-toggle').classList.toggle('on', !!st.auto);
    $('btn-auto-toggle').title = st.auto ? 'Stop de bot' : 'Bot speelt voor mij';
  }
  function renderBoard() {
    var botSums = {};
    botBets.forEach(function (x) { botSums[x.key] = (botSums[x.key] || 0) + x.amount; });
    Array.prototype.forEach.call($('board').children, function (c) {
      var k = c.getAttribute('data-key');
      var mine = st.placed[k] || 0, theirs = botSums[k] || 0;
      c.querySelector('.amt').textContent = mine ? fmt(mine) : '';
      c.querySelector('.bot').textContent = theirs ? 'Bot ' + fmt(theirs) : '';
      c.classList.toggle('has-bet', !!mine);
    });
  }
  function renderBots() {
    $('bots').innerHTML = bots.map(function (b) {
      return '<span class="rl-bot" title="' + (b.last || '') + '"><b>' + b.name + '</b> ' + fmt(b.stack) + '</span>';
    }).join('');
  }
  function renderHistory() {
    $('history').innerHTML = st.history.map(function (n) {
      return '<span class="h ' + E.color(n) + '">' + n + '</span>';
    }).join('');
  }
  function render() {
    $('bank').textContent = fmt(M.balance()) + ' fiches';
    var mine = total(st.placed);
    $('btn-spin').textContent = mine ? 'Draai · ' + fmt(mine) : 'Draai het rad';
    renderBoard(); renderBots(); renderHistory(); renderChips(); setButtons();
  }

  // ---- start -----------------------------------------------------------------
  buildWheel();
  buildBoard();
  buildChips();
  $('btn-spin').addEventListener('click', spin);
  $('btn-undo').addEventListener('click', undoChip);
  $('btn-clear').addEventListener('click', clearBets);
  $('btn-repeat').addEventListener('click', repeatBets);
  $('btn-auto-toggle').addEventListener('click', function () {
    if (st.auto) return autoStop('De bot is gestopt.');
    $('auto-panel').hidden = !$('auto-panel').hidden;
  });
  $('auto-start').addEventListener('click', autoStart);
  $('auto-stop').addEventListener('click', function () { autoStop('Je hebt de bot gestopt.'); });
  render();
})();
