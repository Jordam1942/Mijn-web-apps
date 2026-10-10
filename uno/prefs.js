/*
 * Instellingen van de Uno-app: geluid, animaties (elk apart), tempo van de computer,
 * oefenmodus en het versienummer. Alleen op dit toestel opgeslagen.
 */
(function (root) {
  'use strict';
  var KEY = 'uno-prefs-v1';
  var VERSIE = '1.0.0';
  var DEFAULTS = {
    sound: true,              // geluid
    gfx: true,                // animaties (hoofdschakelaar)
    speed: 'normaal',         // tempo van de computer: rustig | normaal | snel
    oefenen: false            // oefenmodus: de host ziet alle handen (alleen tegen de computer)
  };
  var TEMPO_MS = { rustig: 1400, normaal: 850, snel: 380 };

  function read() {
    try { var o = JSON.parse(localStorage.getItem(KEY)); return o && typeof o === 'object' ? o : null; } catch (e) { return null; }
  }
  var api = {
    VERSIE: VERSIE,
    get: function () {
      var o = read() || {}, r = {};
      Object.keys(DEFAULTS).forEach(function (k) { r[k] = o[k] === undefined ? DEFAULTS[k] : o[k]; });
      return r;
    },
    set: function (k, v) {
      var o = api.get();
      o[k] = v;
      try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
    },
    // Animatie aan? Hoofdschakelaar én de 'minder beweging'-instelling van het toestel.
    fx: function () {
      if (!api.get().gfx) return false;
      try { if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch (e) {}
      return true;
    },
    // Wachttijd tussen twee zetten van de computer, in milliseconden
    tempo: function () { return TEMPO_MS[api.get().speed] || TEMPO_MS.normaal; }
  };
  root.UnoPrefs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
