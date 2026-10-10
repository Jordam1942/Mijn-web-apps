/*
 * Uno: de computerspelers in drie stijlen. Ze kiezen alleen uit de zetten die de engine toestaat,
 * dus ze kunnen nooit een ongeldige kaart spelen. Geen schermcode.
 *
 * choose(state, p, stijl, rng, opts) geeft één zet terug, of null als p nu niets hoeft te doen.
 * opts.pakken: true als de computer iemand mag pakken die UNO vergeten is (alleen voor menselijke spelers).
 */
(function (root) {
  'use strict';

  var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.UnoEngine;

  var STYLES = ['rustig', 'normaal', 'agressief'];
  // Kans dat de computer een mens pakt die UNO vergeten is
  var PAKKEN = { rustig: 0.5, normaal: 0.8, agressief: 1 };

  // De kleur waar p de meeste kaarten van heeft (wild kiezen en kleurkeuze)
  function meestKleur(s, p) {
    var tel = [0, 0, 0, 0];
    s.hands[p].forEach(function (id) { var c = E.CARDS[id].color; if (c < 4) tel[c]++; });
    var best = 0;
    for (var c = 1; c < 4; c++) if (tel[c] > tel[best]) best = c;
    return best;
  }

  // Hoe graag de computer deze kaart nu legt, per stijl. Hoger is beter.
  function waarde(s, p, stijl, id, rng) {
    var c = E.CARDS[id], score, volgende = s.hands[E.nextSeat(s, p, 1)].length;
    var gelijk = s.hands[p].filter(function (x) { return E.CARDS[x].color === c.color; }).length;
    if (c.kind === 'num') score = 1 + gelijk * 0.1;
    else if (c.kind === 'wild') score = stijl === 'rustig' ? 0.2 : stijl === 'normaal' ? 0.8 : 1;
    else if (c.kind === 'wild4') score = stijl === 'rustig' ? 0.5 : stijl === 'normaal' ? 1.5 : 3;
    else if (c.kind === 'draw2') score = stijl === 'agressief' ? (volgende <= 2 ? 4 : 3) : stijl === 'normaal' ? 2 : 1.5;
    else if (c.kind === 'skip') score = stijl === 'rustig' ? 1.5 : stijl === 'normaal' ? 2 : 2.5;
    else score = stijl === 'rustig' ? 1.5 : 2; // keer om
    // Dure kaarten liever kwijt; een klein beetje toeval zodat het spel niet steeds hetzelfde is
    return score + E.points(id) / 25 + rng() * 0.3;
  }

  function choose(s, p, stijl, rng, opts) {
    var zetten = E.legalActions(s, p);
    function zoek(type) { return zetten.find(function (a) { return a.type === type; }); }

    if (zoek('chooseColor')) return { type: 'chooseColor', p: p, color: meestKleur(s, p) };
    if (zoek('uno')) return zoek('uno');
    if (zoek('accept')) return zoek('accept');
    if (opts && opts.pakken && zoek('catch') && rng() < PAKKEN[stijl]) return zoek('catch');
    if (p !== s.cur) return null;

    var spelen = zetten.filter(function (a) { return a.type === 'play'; });
    if (spelen.length) {
      var beste = spelen[0], beste_w = -1;
      spelen.forEach(function (a) {
        var w = waarde(s, p, stijl, a.card, rng);
        if (w > beste_w) { beste = a; beste_w = w; }
      });
      var zet = { type: 'play', p: p, card: beste.card };
      if (E.CARDS[beste.card].color === E.WILD) zet.color = meestKleur(s, p);
      return zet;
    }
    if (zoek('pass')) return zoek('pass');
    return zoek('draw') || null;
  }

  var api = { STYLES: STYLES, PAKKEN: PAKKEN, choose: choose, meestKleur: meestKleur };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UnoAI = api;
})(this);
