/*
 * Een potje tegen de computer: wie zit waar, welke stijl elke computer speelt, de bewaarde
 * stand op dit toestel, en de ranglijst. Geen schermcode, zodat het in Node getest kan worden.
 *
 * Seat 0 is altijd de speler op dit toestel. De computer speelt de andere zetels.
 * Een potje wordt op dit toestel bewaard, zodat je het kunt hervatten na het sluiten van de app.
 * De kaarten van de computer worden alleen op dit toestel bewaard, nergens anders.
 */
(function (root) {
  'use strict';

  var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.UnoEngine;
  var AI = (typeof module !== 'undefined' && module.exports) ? require('./ai.js') : root.UnoAI;

  var KEY_SPEL = 'uno-spel-v1';
  var KEY_RANG = 'uno-ranglijst-v1';

  function opslag() {
    try { return root.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null); } catch (e) { return null; }
  }
  function lees(sleutel) {
    var o = opslag();
    try { return o ? JSON.parse(o.getItem(sleutel)) : null; } catch (e) { return null; }
  }
  function schrijf(sleutel, waarde) {
    var o = opslag();
    try { if (o) o.setItem(sleutel, JSON.stringify(waarde)); } catch (e) {}
  }

  // Nieuw potje. opts: zetels (per zetel: {naam, persona, stijl}; zetel 0 is de speler op dit toestel),
  // of players en namen; oefenen (bool); rng (optioneel)
  function nieuw(opts) {
    var zetels = opts.zetels;
    if (!zetels) {
      zetels = [];
      for (var p = 0; p < opts.players; p++) {
        zetels.push({ naam: (opts.namen || [])[p] || (p === 0 ? 'Jij' : 'Computer ' + p), stijl: p === 0 ? null : AI.STYLES[p % AI.STYLES.length] });
      }
    }
    var oefenen = !!opts.oefenen;
    return { zetels: zetels, oefenen: oefenen, staat: E.newGame({ players: zetels.length, rng: opts.rng, oefenen: oefenen }), geteld: false };
  }

  // Is het nu de beurt van een computer, of moet een computer iets doen (UNO-roep, kleur, accepteren)?
  // Geeft de zet terug die de computer kiest, of null.
  function computerZet(spel, rng) {
    rng = rng || Math.random;   // keuzes van de computer, geen geheimen
    var s = spel.staat;
    // Eerst UNO-roepen en zetten buiten de beurt, dan de speler aan de beurt
    for (var p = 1; p < s.n; p++) {
      var a = AI.choose(s, p, spel.zetels[p].stijl, rng, { pakken: pakkenMag(spel, p) });
      if (a && a.type === 'uno') return a;
    }
    for (var q = 1; q < s.n; q++) {
      var b = AI.choose(s, q, spel.zetels[q].stijl, rng, { pakken: pakkenMag(spel, q) });
      if (b && !['play', 'draw', 'pass'].includes(b.type)) return b;
    }
    if (s.cur !== 0 && !s.over) {
      var c = AI.choose(s, s.cur, spel.zetels[s.cur].stijl, rng, { pakken: false });
      if (c) return c;
    }
    return null;
  }
  // Een computer pakt alleen een mens die UNO vergeten is
  function pakkenMag(spel, computerZetel) {
    var w = spel.staat.unoWindow;
    return !!w && w.p === 0 && !w.called && computerZetel !== 0;
  }

  // Zet van de speler op dit toestel (seat 0) of van een computer. Geeft het nieuwe potje terug.
  function doe(spel, zet, rng) {
    var nieuwe = Object.assign({}, spel);
    nieuwe.staat = E.apply(spel.staat, zet, rng);
    return nieuwe;
  }

  // Het potje is af: telt het mee voor de ranglijst? Eén keer, en nooit bij een oefenpotje.
  function telAf(spel) {
    if (spel.geteld || !E.telt(spel.staat)) return spel;
    var rang = lees(KEY_RANG) || { gewonnen: {} };
    var naam = spel.zetels[spel.staat.winner].naam;
    rang.gewonnen[naam] = (rang.gewonnen[naam] || 0) + 1;
    schrijf(KEY_RANG, rang);
    var kopie = JSON.parse(JSON.stringify(spel));
    kopie.geteld = true;
    return kopie;
  }

  function ranglijst() { return E.ranglijst((lees(KEY_RANG) || { gewonnen: {} }).gewonnen); }

  function bewaar(spel) { schrijf(KEY_SPEL, { versie: 1, spel: spel }); }
  function laad() {
    var o = lees(KEY_SPEL);
    if (!o || o.versie !== 1 || !o.spel || !o.spel.staat) return null;
    return o.spel.staat.over ? null : o.spel;
  }
  function wis() { var o = opslag(); try { if (o) o.removeItem(KEY_SPEL); } catch (e) {} }

  var api = {
    nieuw: nieuw, computerZet: computerZet, doe: doe, telAf: telAf,
    ranglijst: ranglijst, bewaar: bewaar, laad: laad, wis: wis
  };
  root.UnoSpel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
