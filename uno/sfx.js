/*
 * Geluiden die in de browser gemaakt worden (geen geluidsbestanden): kaart leggen, pakken,
 * UNO-roep, de bel bij je beurt en een fanfare bij winst. Telefoons staan geluid pas toe na
 * een tik, dus het geluid wordt bij elke tik opnieuw wakker gemaakt.
 */
(function (root) {
  'use strict';

  var ctx = null;
  function ensure() {
    try {
      if (!ctx) { var C = root.AudioContext || root.webkitAudioContext; if (!C) return null; ctx = new C(); }
      if (ctx.state !== 'running' && ctx.resume) ctx.resume();
    } catch (e) { return null; }
    return ctx;
  }
  try { ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) { root.addEventListener(ev, ensure, { passive: true }); }); } catch (e) {}

  // Eén toon die uitfadet. Start na 'at' seconden.
  function toon(freq, duur, at, type, vol) {
    var c = ensure();
    if (!c || !root.UnoPrefs || !root.UnoPrefs.get().sound) return;
    var t = c.currentTime + (at || 0), osc = c.createOscillator(), g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t); osc.stop(t + duur + 0.02);
  }

  var api = {
    leg: function () { toon(520, 0.08, 0, 'triangle', 0.2); toon(380, 0.09, 0.03, 'triangle', 0.15); },
    pak: function () { toon(300, 0.06, 0, 'square', 0.06); toon(250, 0.07, 0.05, 'square', 0.05); },
    uno: function () { toon(660, 0.12, 0, 'sine', 0.2); toon(880, 0.18, 0.12, 'sine', 0.2); },
    beurt: function () { toon(988, 0.25, 0, 'sine', 0.12); },
    winst: function () { [523, 659, 784, 1047].forEach(function (f, i) { toon(f, 0.22, i * 0.12, 'triangle', 0.18); }); },
    slaat: function () { toon(180, 0.12, 0, 'sawtooth', 0.05); }
  };
  root.UnoSfx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
