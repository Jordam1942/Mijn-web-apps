/*
 * Uno: de officiële regels als zuivere functies op één gewone state-stuk.
 * Dezelfde code draait op de telefoon van de host en in de tests (Node).
 * Hier staat geen schermcode.
 *
 * Kaarten zijn getallen 0..107 (zie CARDS). Kleuren: 0 rood, 1 geel, 2 groen, 3 blauw, 4 wild (geen kleur).
 * Soorten: 'num' (waarde 0-9), 'skip', 'reverse', 'draw2', 'wild', 'wild4'.
 * Het laatste element van state.discard is de bovenkaart. Handen en de trekstapel zijn gewone arrays.
 * Elke zet is een actie {type, p, ...}. legalActions(state, p) geeft de zetten die p nu mag doen,
 * apply(state, actie) geeft de volgende staat terug. Een ongeldige zet gooit een fout.
 */
(function (root) {
  'use strict';

  var COLORS = ['rood', 'geel', 'groen', 'blauw'];
  var WILD = 4;
  var START_HAND = 7;
  var TARGET = 500;
  var PENALTY = 2;

  function buildDeck() {
    var cards = [];
    function add(color, kind, value) { cards.push({ id: cards.length, color: color, kind: kind, value: value }); }
    for (var c = 0; c < 4; c++) {
      add(c, 'num', 0);
      for (var v = 1; v <= 9; v++) { add(c, 'num', v); add(c, 'num', v); }
      for (var k = 0; k < 2; k++) { add(c, 'skip', 0); add(c, 'reverse', 0); add(c, 'draw2', 0); }
    }
    for (var i = 0; i < 4; i++) { add(WILD, 'wild', 0); add(WILD, 'wild4', 0); }
    return cards;
  }
  var CARDS = buildDeck();

  // Willekeurige getallen tussen 0 en 1: de generator van de browser, of die van Node in de tests.
  function defaultRng() {
    var api = root.crypto || require('crypto').webcrypto;
    var buf = new Uint32Array(1);
    return function () { api.getRandomValues(buf); return buf[0] / 4294967296; };
  }

  function shuffle(list, rng) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }

  function topId(s) { return s.discard[s.discard.length - 1]; }
  // Volgende zetel vanaf 'from', met de richting van de tafel.
  function nextSeat(s, from, steps) { return (((from + s.dir * steps) % s.n) + s.n) % s.n; }
  // Strafpunten voor de kaarten die een speler nog heeft als een ander uitgaat.
  function points(id) {
    var c = CARDS[id];
    if (c.kind === 'num') return c.value;
    return c.kind === 'wild' || c.kind === 'wild4' ? 50 : 20;
  }
  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  function canPlay(s, p, id) {
    var c = CARDS[id];
    if (c.kind === 'wild') return true;
    if (c.kind === 'wild4') {
      // Wild Draw Four mag alleen als je geen kaart van de actieve kleur hebt
      return !s.hands[p].some(function (x) { return CARDS[x].color === s.color; });
    }
    if (c.color === s.color) return true;
    var top = CARDS[topId(s)];
    return c.kind === 'num' ? top.kind === 'num' && top.value === c.value : top.kind === c.kind;
  }

  // Trekken uit de stapel. Is de stapel leeg, dan wordt de aflegstapel (behalve de bovenkaart) opnieuw geschud.
  function refill(s, rng) {
    if (s.draw.length) return;
    var top = s.discard.pop();
    s.draw = shuffle(s.discard, rng);
    s.discard = [top];
  }
  function draw(s, p, k, rng) {
    var got = [];
    for (var i = 0; i < k; i++) {
      refill(s, rng);
      if (!s.draw.length) break;
      var id = s.draw.pop();
      s.hands[p].push(id);
      got.push(id);
    }
    return got;
  }

  // Een nieuwe ronde. deal (alleen voor tests) bepaalt de handen en de bovenkaart.
  function startRound(s, rng, deal) {
    var top, pile, i, p, r;
    var used = {};
    if (deal) {
      deal.hands.forEach(function (h) { h.forEach(function (id) { used[id] = true; }); });
      used[deal.top] = true;
    }
    var rest = [];
    for (i = 0; i < CARDS.length; i++) if (!used[i]) rest.push(i);
    shuffle(rest, rng);
    pile = rest;
    if (deal) {
      s.hands = deal.hands.map(function (h) { return h.slice(); });
      top = deal.top;
    } else {
      s.hands = [];
      for (p = 0; p < s.n; p++) s.hands.push([]);
      for (r = 0; r < START_HAND; r++) for (p = 0; p < s.n; p++) s.hands[p].push(pile.pop());
      top = pile.pop();
      // Een Wild Draw Four als eerste kaart gaat terug in de stapel en er wordt opnieuw getrokken
      while (CARDS[top].kind === 'wild4') { pile.unshift(top); shuffle(pile, rng); top = pile.pop(); }
    }
    s.draw = pile;
    s.discard = [top];
    s.drawn = null; s.pending = null; s.unoWindow = null; s.needColor = null;
    s.dir = 1;
    s.round += 1;

    // De speler links van de deler begint. Een startkaart werkt als bij een gewone zet.
    var first = (s.dealer + 1) % s.n, c = CARDS[top];
    s.cur = first;
    if (c.color === WILD) { s.color = null; s.needColor = first; }
    else s.color = c.color;
    if (c.kind === 'skip') s.cur = nextSeat(s, first, 1);
    else if (c.kind === 'reverse') { s.dir = -1; s.cur = nextSeat(s, first, 1); }
    else if (c.kind === 'draw2') { draw(s, first, 2, rng); s.cur = nextSeat(s, first, 1); }
  }

  function newGame(opts) {
    opts = opts || {};
    var n = opts.players;
    if (!(n >= 2 && n <= 8)) throw new Error('Uno speel je met 2 tot 8 spelers');
    var s = {
      n: n, dir: 1, cur: 0, dealer: n - 1, round: 0,
      hands: [], draw: [], discard: [], color: null, needColor: null,
      pending: null, drawn: null, unoWindow: null,
      scores: [], target: TARGET, over: false, winner: null, lastRound: null,
      oefenen: !!opts.oefenen
    };
    for (var p = 0; p < n; p++) s.scores.push(0);
    startRound(s, opts.rng || defaultRng(), opts.deal);
    return s;
  }

  function legalActions(s, p) {
    var out = [];
    if (s.over) return out;
    if (s.needColor !== null) {
      if (p === s.needColor) COLORS.forEach(function (name, c) { out.push({ type: 'chooseColor', p: p, color: c }); });
      return out;
    }
    // UNO-venster: de speler met één kaart mag UNO roepen, de anderen mogen hem pakken tot de volgende zet
    var w = s.unoWindow;
    if (w && !w.called) out.push(p === w.p ? { type: 'uno', p: p } : { type: 'catch', p: p, target: w.p });
    if (s.pending) {
      if (p === s.pending.target) out.push({ type: 'accept', p: p }, { type: 'challenge', p: p });
      return out;
    }
    if (p !== s.cur) return out;
    if (s.drawn) {
      if (s.drawn.p !== p) return out;
      if (canPlay(s, p, s.drawn.card)) out.push({ type: 'play', p: p, card: s.drawn.card });
      out.push({ type: 'pass', p: p });
      return out;
    }
    var plays = s.hands[p].filter(function (id) { return canPlay(s, p, id); });
    if (!plays.length) out.push({ type: 'draw', p: p });
    plays.forEach(function (id) { out.push({ type: 'play', p: p, card: id }); });
    return out;
  }

  function matches(a, b) {
    if (a.type !== b.type || a.p !== b.p) return false;
    if (a.card !== undefined && a.card !== b.card) return false;
    if (a.target !== undefined && a.target !== b.target) return false;
    if (a.type === 'chooseColor' && a.color !== b.color) return false;
    return true;
  }

  function endRound(s, winner, rng) {
    var sum = 0;
    s.hands.forEach(function (hand, p) { if (p !== winner) hand.forEach(function (id) { sum += points(id); }); });
    s.scores[winner] += sum;
    s.lastRound = { winner: winner, points: sum };
    s.pending = null; s.drawn = null; s.unoWindow = null; s.needColor = null;
    var best = Math.max.apply(null, s.scores);
    if (best >= s.target) {
      s.over = true;
      s.winner = s.scores.indexOf(best);
      return;
    }
    s.dealer = (s.dealer + 1) % s.n;
    startRound(s, rng);
  }

  function apply(state, action, rng) {
    rng = rng || defaultRng();
    var legal = legalActions(state, action.p).some(function (a) { return matches(a, action); });
    if (!legal) throw new Error('Deze zet mag nu niet: ' + action.type);
    var s = clone(state);
    var p = action.p, c, before, prevHand, pend, hadMatch, got, t;

    if (action.type === 'uno') { s.unoWindow.called = true; return s; }
    if (action.type === 'catch') {
      // Te laat met UNO roepen: de speler pakt 2 kaarten en de beurt verandert niet
      draw(s, action.target, PENALTY, rng);
      s.unoWindow = null;
      return s;
    }
    s.unoWindow = null;

    if (action.type === 'chooseColor') { s.color = action.color; s.needColor = null; return s; }
    if (action.type === 'accept') {
      draw(s, p, 4, rng);
      s.pending = null;
      s.cur = nextSeat(s, p, 1);
      return s;
    }
    if (action.type === 'challenge') {
      pend = s.pending;
      s.pending = null;
      // Had de speler een kaart van de vorige kleur, dan speelde hij Wild Draw Four ten onrechte
      hadMatch = pend.prevHand.some(function (id) { return CARDS[id].color === pend.prevColor; });
      if (hadMatch) { draw(s, pend.by, 4, rng); s.cur = p; }
      else { draw(s, p, 6, rng); s.cur = nextSeat(s, p, 1); }
      return s;
    }
    if (action.type === 'pass') {
      s.drawn = null;
      s.cur = nextSeat(s, p, 1);
      return s;
    }
    if (action.type === 'draw') {
      got = draw(s, p, 1, rng);
      if (got.length) s.drawn = { p: p, card: got[0] };
      else s.cur = nextSeat(s, p, 1);
      return s;
    }

    // play
    c = CARDS[action.card];
    before = s.color;
    prevHand = s.hands[p].slice();
    s.hands[p].splice(s.hands[p].indexOf(action.card), 1);
    s.drawn = null;
    s.discard.push(action.card);
    if (c.color === WILD) {
      if (!(action.color >= 0 && action.color < COLORS.length)) throw new Error('Kies een kleur');
      s.color = action.color;
    } else {
      s.color = c.color;
    }
    if (s.hands[p].length === 0) { endRound(s, p, rng); return s; }
    if (s.hands[p].length === 1) s.unoWindow = { p: p, called: false };

    switch (c.kind) {
      case 'num':
      case 'wild':
        s.cur = nextSeat(s, p, 1);
        break;
      case 'skip':
        s.cur = nextSeat(s, p, 2);
        break;
      case 'reverse':
        // Bij twee spelers werkt omkeren als overslaan
        if (s.n === 2) { s.cur = nextSeat(s, p, 2); }
        else { s.dir = -s.dir; s.cur = nextSeat(s, p, 1); }
        break;
      case 'draw2':
        t = nextSeat(s, p, 1);
        draw(s, t, 2, rng);
        s.cur = nextSeat(s, p, 2);
        break;
      case 'wild4':
        s.pending = { by: p, target: nextSeat(s, p, 1), prevColor: before, prevHand: prevHand };
        s.cur = s.pending.target;
        break;
    }
    return s;
  }

  // Wat één speler van de staat mag zien: alleen de eigen hand, geen trekstapel en geen verborgen kaarten.
  // Oefenen: de host (oefenHost) ziet alle handen, zodat hij naast een vriend kan helpen.
  function viewFor(state, viewer, opts) {
    var v = clone(state);
    var seeAll = !!(opts && opts.oefenen && opts.oefenHost === viewer);
    v.hands = v.hands.map(function (hand, p) {
      return p === viewer || seeAll ? hand : hand.map(function () { return null; });
    });
    v.drawCount = v.draw.length;
    v.draw = [];
    if (v.pending) v.pending.prevHand = null;
    if (v.drawn && v.drawn.p !== viewer && !seeAll) v.drawn.card = null;
    return v;
  }

  // Telt een afgelopen potje mee voor de ranglijst? Oefenpotjes tellen nooit mee.
  function telt(s) { return !!s.over && !s.oefenen; }

  // Ranglijst op gewonnen potjes, zonder punten. Gelijke stand krijgt dezelfde plek.
  // gewonnen: {naam: aantal}. Geeft [{naam, gewonnen, plek}] terug, van boven naar beneden.
  function ranglijst(gewonnen) {
    var rijen = Object.keys(gewonnen).map(function (naam) { return { naam: naam, gewonnen: gewonnen[naam] }; });
    rijen.sort(function (a, b) { return b.gewonnen - a.gewonnen || (a.naam < b.naam ? -1 : a.naam > b.naam ? 1 : 0); });
    var plek = 0, vorige = null;
    rijen.forEach(function (r, i) {
      if (r.gewonnen !== vorige) plek = i + 1;
      r.plek = plek;
      vorige = r.gewonnen;
    });
    return rijen;
  }

  var api = {
    telt: telt, ranglijst: ranglijst,
    COLORS: COLORS, WILD: WILD, CARDS: CARDS, TARGET: TARGET, PENALTY: PENALTY,
    newGame: newGame, legalActions: legalActions, apply: apply, viewFor: viewFor,
    points: points, canPlay: canPlay, topId: topId, nextSeat: nextSeat
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UnoEngine = api;
})(this);
