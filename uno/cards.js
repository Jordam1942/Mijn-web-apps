/*
 * Uno-kaarten getekend in de app zelf (geen plaatjes). Elke kaart heeft een kleur
 * (rood, geel, groen, blauw of een wild-vlak) en een symbool in het midden.
 * UnoCards.html(id) geeft de HTML van een kaart terug; id is het kaartnummer uit de engine.
 */
(function (root) {
  'use strict';

  var KLEUR = ['rood', 'geel', 'groen', 'blauw'];
  var SYMBOOL = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: '', wild4: '+4' };
  var NAAM = { skip: 'Sla over', reverse: 'Keer om', draw2: 'Pak 2', wild: 'Kleurkeuze', wild4: 'Pak 4' };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // Een kaart als HTML. kaart: {color, kind, value} uit de engine.
  // opts: verborgen (achterkant), klasse (extra CSS-klasse), attr (extra attributen, begint met een spatie)
  function html(kaart, opts) {
    opts = opts || {};
    var extra = opts.klasse ? ' ' + opts.klasse : '', attr = opts.attr || '';
    if (opts.verborgen || kaart === null || kaart === undefined) return '<div class="card back' + extra + '" aria-hidden="true"' + attr + '><span>UNO</span></div>';
    var kleur = kaart.color === 4 ? 'wild' : KLEUR[kaart.color];
    var label = kaart.kind === 'num' ? String(kaart.value) : NAAM[kaart.kind];
    var hoek = kaart.kind === 'num' ? String(kaart.value) : SYMBOOL[kaart.kind] || 'W';
    var midden = kaart.kind === 'wild' || kaart.kind === 'wild4'
      ? '<span class="vlak"><i></i><i></i><i></i><i></i></span>'
      : '<span class="mid">' + esc(hoek) + '</span>';
    return '<div class="card ' + kleur + ' k-' + kaart.kind + extra + '" role="img" aria-label="' + esc(kleur + ' ' + label) + '"' + attr + '>' +
      '<span class="hoek">' + esc(hoek) + '</span>' + midden + '<span class="hoek onder">' + esc(hoek) + '</span></div>';
  }

  // Uitleg bij een kaart, voor de handleiding en het kaartenoverzicht.
  function uitleg(kaart) {
    if (kaart.kind === 'num') return KLEUR[kaart.color] + ' ' + kaart.value + ': leg op dezelfde kleur of hetzelfde getal.';
    if (kaart.kind === 'skip') return 'Sla de volgende speler over.';
    if (kaart.kind === 'reverse') return 'Keer de richting om. Met twee spelers: de volgende speler slaat over.';
    if (kaart.kind === 'draw2') return 'De volgende speler pakt 2 kaarten en slaat zijn beurt over.';
    if (kaart.kind === 'wild') return 'Leg hem op elke kaart en kies de kleur.';
    return 'Leg hem op elke kaart en kies de kleur. De volgende speler pakt 4 kaarten en slaat zijn beurt over.';
  }

  var api = { html: html, uitleg: uitleg, KLEUR: KLEUR, NAAM: NAAM };
  root.UnoCards = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
