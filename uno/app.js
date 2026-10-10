/*
 * Het scherm van de Uno-app: startscherm, tafel, vensters en de beurten van de computer.
 * De spelregels zitten in engine.js, de computer in ai.js, het potje in spel.js.
 */
(function () {
  'use strict';

  var E = UnoEngine, $ = function (id) { return document.getElementById(id); };
  var PROFIEL = 'uno-profiel-v1', FOTO = 'uno-foto-v1';
  var KLEUREN = UnoCards.KLEUR;
  var spel = null;          // het potje dat nu gespeeld wordt
  var token = 0;            // verhoogt bij elke zet; een wachtende computerzet die niet meer past, wordt overgeslagen
  var kijkPlek = null;      // in de oefenmodus: wiens kaarten je meekijkt
  var laatsteBovenkaart = null;
  var melding = { tekst: '', fout: false };

  // ---------- profiel en foto ----------
  function profiel() { try { return JSON.parse(localStorage.getItem(PROFIEL)) || {}; } catch (e) { return {}; } }
  function bewaarProfiel(p) { try { localStorage.setItem(PROFIEL, JSON.stringify(p)); } catch (e) {} }
  function foto() { try { return localStorage.getItem(FOTO); } catch (e) { return null; } }
  function naamEigen() { return (profiel().naam || '').trim() || 'Jij'; }
  function persoonEigen() { var p = profiel(); return p.persona === undefined ? UnoArt.YOU : p.persona; }
  function portret(zetel) {
    if (zetel.eigen && foto()) return '<img class="avatar" src="' + foto() + '" alt="">';
    return UnoArt.avatar(zetel.persona);
  }

  // ---------- kaartnamen en meldingen ----------
  function kaartNaam(id) {
    var c = E.CARDS[id];
    if (c.kind === 'num') return KLEUREN[c.color] + ' ' + c.value;
    if (c.kind === 'wild') return 'Kleurkeuze';
    if (c.kind === 'wild4') return 'Pak 4';
    return KLEUREN[c.color] + ' ' + UnoCards.NAAM[c.kind];
  }
  // Wat er net gebeurde, in gewone zinnen
  function beschrijf(zet, voor) {
    var naam = spel.zetels[zet.p].naam;
    if (zet.type === 'play') {
      var kleur = E.CARDS[zet.card].color === E.WILD ? ', kiest ' + KLEUREN[zet.color] : '';
      return naam + ' legt ' + kaartNaam(zet.card) + kleur + '.';
    }
    if (zet.type === 'draw') return naam + ' pakt een kaart.';
    if (zet.type === 'pass') return naam + ' past.';
    if (zet.type === 'uno') return naam + ' roept UNO!';
    if (zet.type === 'catch') return spel.zetels[zet.target].naam + ' vergat UNO. Hij pakt 2 kaarten.';
    if (zet.type === 'accept') return naam + ' pakt 4 kaarten.';
    if (zet.type === 'challenge') return naam + ' vecht aan.';
    if (zet.type === 'chooseColor') return naam + ' kiest ' + KLEUREN[zet.color] + '.';
    return '';
  }
  function zet(tekst, fout) { melding = { tekst: tekst || '', fout: !!fout }; }

  // ---------- geluid, animatie en opslag ----------
  function geluid(z) {
    if (z.type === 'play') UnoSfx.leg();
    else if (z.type === 'draw' || z.type === 'accept') UnoSfx.pak();
    else if (z.type === 'uno') UnoSfx.uno();
    else if (z.type === 'catch' || z.type === 'challenge') UnoSfx.slaat();
  }
  function pasFx() { document.body.classList.toggle('fx', UnoPrefs.fx()); }

  // ---------- schermen ----------
  function toon(id) {
    ['home', 'tafel'].forEach(function (s) { $(s).hidden = s !== id; });
    document.querySelectorAll('.sheet').forEach(function (s) { s.hidden = true; });
  }
  function sheet(id) { document.querySelectorAll('.sheet').forEach(function (s) { s.hidden = s.id !== id; }); }
  function sluitSheet() { document.querySelectorAll('.sheet').forEach(function (s) { s.hidden = true; }); }

  function toonHome() {
    toon('home');
    $('btn-doorgaan').hidden = !UnoSpel.laad();
    var rang = UnoSpel.ranglijst();
    $('rang').innerHTML = rang.map(function (r) {
      return '<li><span>' + r.plek + '. <b>' + esc(r.naam) + '</b></span><span>' + r.gewonnen + ' gewonnen</span></li>';
    }).join('');
    $('rang-leeg').hidden = rang.length > 0;
  }
  function toonTafel() { toon('tafel'); $('badge-oefenen').hidden = !(spel && spel.oefenen); }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- het potje starten en hervatten ----------
  function startPotje(n, oefenen) {
    var eigen = persoonEigen();
    var kandidaten = [];
    for (var i = 0; i < UnoArt.personaCount(); i++) if (i !== UnoArt.YOU && i !== eigen) kandidaten.push(i);
    kandidaten.sort(function () { return Math.random() - 0.5; });
    var zetels = [{ naam: naamEigen(), persona: eigen, stijl: null, eigen: true }];
    for (var p = 1; p < n; p++) {
      zetels.push({ naam: UnoArt.name(kandidaten[p - 1]), persona: kandidaten[p - 1], stijl: UnoAI.STYLES[(p - 1) % UnoAI.STYLES.length] });
    }
    spel = UnoSpel.nieuw({ zetels: zetels, oefenen: oefenen });
    kijkPlek = null; laatsteBovenkaart = null; zet('');
    UnoSpel.bewaar(spel);
    toonTafel();
    verversen();
    vervolg();
  }
  function hervat() {
    spel = UnoSpel.laad();
    if (!spel) { toonHome(); return; }
    kijkPlek = null; laatsteBovenkaart = null; zet('');
    toonTafel();
    verversen();
    vervolg();
  }

  // ---------- zetten ----------
  function doenZet(z) {
    token++;
    var voor = spel.staat;
    spel = UnoSpel.doe(spel, z);
    geluid(z);
    zet(beschrijf(z, voor));
    if (spel.staat.round !== voor.round && !spel.staat.over) {
      var l = spel.staat.lastRound;
      zet(spel.zetels[l.winner].naam + ' is uitgegaan en krijgt ' + l.points + ' punten. Nieuwe ronde.');
      UnoSfx.beurt();
    } else if (spel.staat.cur === 0 && !spel.staat.over) {
      UnoSfx.beurt();
    }
    UnoSpel.bewaar(spel);
    verversen();
    vervolg();
  }

  // Laat de computers spelen tot het aan jou is. Elke zet wacht even, zodat je kunt volgen.
  function vervolg() {
    var s = spel.staat;
    if (s.over) { eindePotje(); return; }
    var kies = UnoSpel.computerZet(spel);
    if (!kies) {
      if (s.needColor === 0) openKleur(function (c) { doenZet({ type: 'chooseColor', p: 0, color: c }); });
      return;
    }
    // Een computer pakt pas na een korte wacht, zodat jij eerst UNO kunt roepen
    var wacht = kies.type === 'catch' ? 1800 : UnoPrefs.tempo();
    var mijn = token;
    setTimeout(function () {
      if (mijn !== token || !spel) return;
      var nu = UnoSpel.computerZet(spel);
      if (nu) doenZet(nu);
    }, wacht);
  }

  function eindePotje() {
    spel = UnoSpel.telAf(spel);
    UnoSpel.wis();
    var w = spel.staat.winner, naam = spel.zetels[w].naam;
    if (w === 0) UnoSfx.winst();
    $('uitslag-titel').textContent = w === 0 ? 'Je hebt gewonnen!' : naam + ' wint het potje';
    $('uitslag-tekst').textContent = spel.oefenen
      ? 'Dit was een oefenpotje. Het telt niet mee voor de ranglijst.'
      : 'Het potje telt mee voor de ranglijst.';
    $('uitslag-rang').innerHTML = UnoSpel.ranglijst().map(function (r) {
      return '<li><span>' + r.plek + '. <b>' + esc(r.naam) + '</b></span><span>' + r.gewonnen + ' gewonnen</span></li>';
    }).join('');
    sheet('sheet-uitslag');
  }

  // ---------- weergave ----------
  function verversen() {
    if (!spel) return;
    var s = spel.staat, mijn = 0;
    var v = E.viewFor(s, mijn, { oefenen: spel.oefenen, oefenHost: mijn });
    var legaal = E.legalActions(s, mijn);
    var kan = function (type) { return legaal.some(function (a) { return a.type === type; }); };
    var speelbaar = legaal.filter(function (a) { return a.type === 'play'; }).map(function (a) { return a.card; });
    var uno = legaal.find(function (a) { return a.type === 'uno'; });
    var wacht = s.pending && s.pending.target === mijn;

    // tegenstanders
    $('tegen').innerHTML = spel.zetels.map(function (z, p) {
      if (p === mijn) return '';
      var aan = s.cur === p || (s.pending && s.pending.target === p);
      var roept = s.unoWindow && s.unoWindow.p === p && !s.unoWindow.called;
      return '<button class="speler' + (aan ? ' aan' : '') + '" data-plek="' + p + '" aria-label="' + esc(z.naam) + '">' +
        portret(z) + '<span class="naam">' + esc(z.naam) + '</span>' +
        '<span class="aantal">' + s.hands[p].length + ' kaarten · ' + s.scores[p] + ' pt</span>' +
        (roept ? '<span class="uno-tag">UNO!</span>' : '') + '</button>';
    }).join('');

    // kijk mee (oefenmodus): de kaarten van één tegenstander
    var kijk = $('kijk');
    if (spel.oefenen) {
      if (kijkPlek === null || kijkPlek === mijn) kijkPlek = s.cur !== mijn ? s.cur : 1;
      kijk.hidden = false;
      kijk.innerHTML = '<span>' + esc(spel.zetels[kijkPlek].naam) + ':</span>' +
        v.hands[kijkPlek].map(function (id) { return UnoCards.html(E.CARDS[id]); }).join('');
    } else {
      kijk.hidden = true;
    }

    // midden: stapel, aflegstapel en kleur
    $('stapel-aantal').textContent = v.drawCount + ' kaarten';
    $('stapel').disabled = !kan('draw');
    $('stapel').classList.toggle('kan-pakken', kan('draw'));
    var top = s.discard[s.discard.length - 1];
    var nieuw = top !== laatsteBovenkaart;
    laatsteBovenkaart = top;
    $('aflegstapel').innerHTML = UnoCards.html(E.CARDS[top], { klasse: nieuw ? 'nieuw' : '' });
    var bol = $('kleurbol');
    bol.className = 'kleurbol' + (s.color !== null && s.color !== undefined && s.color < 4 ? ' ' + KLEUREN[s.color] : '');

    // de eigen hand
    var hand = v.hands[mijn].slice().sort(function (a, b) {
      var A = E.CARDS[a], B = E.CARDS[b];
      return A.color - B.color || (A.kind < B.kind ? -1 : A.kind > B.kind ? 1 : 0) || A.value - B.value;
    });
    $('hand').innerHTML = hand.map(function (id) {
      var kan1 = speelbaar.indexOf(id) >= 0;
      return UnoCards.html(E.CARDS[id], { klasse: kan1 ? 'speelbaar' : 'niet', attr: ' data-kaart="' + id + '" data-speel="' + (kan1 ? 1 : 0) + '"' });
    }).join('');

    // knoppen
    $('btn-pas').hidden = !kan('pass');
    $('btn-accepteer').hidden = !kan('accept');
    $('btn-aanvechten').hidden = !kan('challenge');
    $('btn-uno').hidden = !uno;
    $('btn-uno').classList.toggle('klaar', !!uno);

    // melding
    var tekst = melding.tekst, fout = melding.fout;
    if (s.needColor === mijn) tekst = 'Kies een kleur.';
    else if (wacht) tekst = (tekst ? tekst + ' ' : '') + 'Pak 4 kaarten, of vecht de Pak 4 aan.';
    else if (s.drawn && s.drawn.p === mijn) tekst = (tekst ? tekst + ' ' : '') + 'Past de kaart niet? Dan pas je.';
    else if (s.cur === mijn && !s.over) tekst = (tekst ? tekst + ' ' : '') + 'Jij bent aan de beurt.';
    else if (!s.over && !tekst) tekst = spel.zetels[s.cur].naam + ' is aan de beurt.';
    if (uno) tekst = 'Je hebt één kaart. Roep UNO voordat iemand anders speelt!';
    $('melding').textContent = tekst;
    $('melding').classList.toggle('fout', fout);

    if (s.needColor === mijn && $('sheet-kleur').hidden) openKleur(function (c) { doenZet({ type: 'chooseColor', p: mijn, color: c }); });
  }

  // ---------- kleur kiezen ----------
  var kleurKeuze = null;
  function openKleur(terug) { kleurKeuze = terug; sheet('sheet-kleur'); }

  // ---------- kaart spelen ----------
  function klikKaart(id, speelbaar) {
    if (!speelbaar) { zet('Die kaart mag nu niet.', true); verversen(); return; }
    if (E.CARDS[id].color === E.WILD) {
      openKleur(function (c) { doenZet({ type: 'play', p: 0, card: id, color: c }); });
    } else {
      doenZet({ type: 'play', p: 0, card: id });
    }
  }
  function legaal(type) { return E.legalActions(spel.staat, 0).find(function (a) { return a.type === type; }); }

  // ---------- instellingen en profiel ----------
  function vulInstellingen() {
    var p = UnoPrefs.get();
    $('set-geluid').checked = p.sound;
    $('set-animaties').checked = p.gfx;
    $('set-oefenen').checked = p.oefenen;
    $('set-tempo').value = p.speed;
    $('versie').textContent = UnoPrefs.VERSIE;
  }

  var PERSONEN = UnoArt.PRESETS;
  var gekozenPersoon = null, gekozenFoto = undefined;
  function vulProfiel() {
    var p = profiel();
    $('profiel-naam').value = p.naam || '';
    gekozenPersoon = persoonEigen();
    gekozenFoto = foto();
    toonProfielKeuze();
  }
  function toonProfielKeuze() {
    $('personages').innerHTML = PERSONEN.map(function (i) {
      return '<button class="' + (i === gekozenPersoon && !gekozenFoto ? 'on' : '') + '" data-persoon="' + i + '" aria-label="' + esc(UnoArt.name(i)) + '">' + UnoArt.avatar(i) + '</button>';
    }).join('');
    $('profiel-voor').innerHTML = gekozenFoto ? '<img src="' + gekozenFoto + '" alt="">' : UnoArt.avatar(gekozenPersoon);
  }
  function verkleinFoto(bestand) {
    var lezer = new FileReader();
    lezer.onload = function () {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = 96; c.height = 96;
        var m = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, 96, 96);
        gekozenFoto = c.toDataURL('image/jpeg', 0.8);
        toonProfielKeuze();
      };
      img.src = lezer.result;
    };
    lezer.readAsDataURL(bestand);
  }

  // ---------- knoppen koppelen ----------
  function koppel() {
    $('btn-nieuw').addEventListener('click', function () {
      var knoppen = '';
      for (var n = 2; n <= 8; n++) knoppen += '<button data-n="' + n + '"' + (n === 4 ? ' class="on"' : '') + '>' + n + '</button>';
      $('aantallen').innerHTML = knoppen;
      $('nieuw-oefenen').checked = UnoPrefs.get().oefenen;
      sheet('sheet-nieuw');
    });
    $('aantallen').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      document.querySelectorAll('#aantallen button').forEach(function (x) { x.classList.toggle('on', x === b); });
    });
    $('nieuw-start').addEventListener('click', function () {
      var on = document.querySelector('#aantallen button.on');
      var n = on ? +on.dataset.n : 4;
      UnoPrefs.set('oefenen', $('nieuw-oefenen').checked);
      startPotje(n, $('nieuw-oefenen').checked);
    });
    $('btn-doorgaan').addEventListener('click', hervat);
    $('btn-menu').addEventListener('click', function () { if (spel) UnoSpel.bewaar(spel); toonHome(); });
    $('btn-zet-instellingen').addEventListener('click', function () { vulInstellingen(); sheet('sheet-instellingen'); });
    $('btn-instellingen').addEventListener('click', function () { vulInstellingen(); sheet('sheet-instellingen'); });
    $('btn-profiel').addEventListener('click', function () { vulProfiel(); sheet('sheet-profiel'); });
    $('uitslag-menu').addEventListener('click', function () { spel = null; toonHome(); });
    $('uitslag-opnieuw').addEventListener('click', function () { startPotje(spel ? spel.zetels.length : 4, UnoPrefs.get().oefenen); });

    document.querySelectorAll('[data-sluit]').forEach(function (b) { b.addEventListener('click', sluitSheet); });
    document.querySelectorAll('.sheet').forEach(function (s) { s.addEventListener('click', function (e) { if (e.target === s && s.id !== 'sheet-kleur') sluitSheet(); }); });

    // kleur
    document.querySelectorAll('#sheet-kleur [data-kleur]').forEach(function (b) {
      b.addEventListener('click', function () {
        sluitSheet();
        var terug = kleurKeuze; kleurKeuze = null;
        if (terug) terug(+b.dataset.kleur);
      });
    });

    // tafel
    $('tegen').addEventListener('click', function (e) {
      var b = e.target.closest('[data-plek]'); if (!b) return;
      kijkPlek = +b.dataset.plek; verversen();
    });
    $('stapel').addEventListener('click', function () { var a = legaal('draw'); if (a) doenZet(a); });
    $('hand').addEventListener('click', function (e) {
      var k = e.target.closest('[data-kaart]'); if (!k) return;
      klikKaart(+k.dataset.kaart, k.dataset.speel === '1');
    });
    $('btn-pas').addEventListener('click', function () { var a = legaal('pass'); if (a) doenZet(a); });
    $('btn-accepteer').addEventListener('click', function () { var a = legaal('accept'); if (a) doenZet(a); });
    $('btn-aanvechten').addEventListener('click', function () { var a = legaal('challenge'); if (a) doenZet(a); });
    $('btn-uno').addEventListener('click', function () { var a = legaal('uno'); if (a) doenZet(a); });

    // instellingen
    $('set-geluid').addEventListener('change', function (e) { UnoPrefs.set('sound', e.target.checked); });
    $('set-animaties').addEventListener('change', function (e) { UnoPrefs.set('gfx', e.target.checked); pasFx(); });
    $('set-oefenen').addEventListener('change', function (e) {
      UnoPrefs.set('oefenen', e.target.checked);
      if (spel && !spel.staat.over) { spel.oefenen = e.target.checked; UnoSpel.bewaar(spel); toonTafel(); verversen(); }
    });
    $('set-tempo').addEventListener('change', function (e) { UnoPrefs.set('speed', e.target.value); });

    // profiel
    $('personages').addEventListener('click', function (e) {
      var b = e.target.closest('[data-persoon]'); if (!b) return;
      gekozenPersoon = +b.dataset.persoon; gekozenFoto = null; toonProfielKeuze();
    });
    $('profiel-foto').addEventListener('change', function (e) { if (e.target.files[0]) verkleinFoto(e.target.files[0]); });
    $('profiel-foto-weg').addEventListener('click', function () { gekozenFoto = null; toonProfielKeuze(); });
    $('profiel-opslaan').addEventListener('click', function () {
      bewaarProfiel({ naam: $('profiel-naam').value.trim(), persona: gekozenPersoon });
      try {
        if (gekozenFoto) localStorage.setItem(FOTO, gekozenFoto); else localStorage.removeItem(FOTO);
      } catch (e) {}
      sluitSheet();
      toonHome();
    });
  }

  // ---------- start ----------
  function start() {
    koppel();
    pasFx();
    try { window.addEventListener('pageshow', function () { pasFx(); }); } catch (e) {}
    try {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && spel && !spel.staat.over) verversen();
      });
    } catch (e) {}
    toonHome();
  }
  start();
})();
