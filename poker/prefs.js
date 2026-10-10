/*
 * Settings for the whole app: theme, sound, animations (each on its own),
 * pace, the turn timer and the takeover time. Kept on this phone only.
 */
(function (root) {
  'use strict';
  var KEY = 'poker-prefs-v1';
  var DEFAULTS = {
    theme: 'dark',            // the dark look is the only one
    sound: true,
    vibrate: true,
    wake: true,               // keep the screen on at a table
    gfx: true,                // animations on/off (master switch)
    fxDeal: true,             // cards dealt
    fxChips: true,            // chips to the pot
    fxWin: true,              // winner highlight
    speed: 'normaal',         // rustig | normaal | snel: pace of computer players
    difficulty: 'extreme',    // easy | normal | hard | extreme: how well the computer players play (Extreme is the strongest)
    dv: 2,                    // version of the defaults above: older saved 'normal' is moved to 'extreme' once
    turnTimer: 30,            // seconds per turn for you (0 = no timer)
    takeover: 45,             // seconds before the computer plays for someone who is away (0 = never)
    confirmAllIn: true,       // ask before all-in
    confirmFold: true,        // ask before folding when you could check
    botRebuy: false,          // computer players buy in again when they are out (off: they leave the table)
    undo: false,              // undo button (off by default)
    odds: true                // the chance graph next to your hand
  };
  function read() {
    try { var o = JSON.parse(localStorage.getItem(KEY)); return o && typeof o === 'object' ? o : null; } catch (e) { return null; }
  }
  var api = {
    get: function () {
      var o = read() || {}, r = {};
      Object.keys(DEFAULTS).forEach(function (k) { r[k] = o[k] === undefined ? DEFAULTS[k] : o[k]; });
      // Saved before Extreme became the default: move the old Normal default once
      if (o.dv !== 2 && o.difficulty === 'normal') r.difficulty = 'extreme';
      return r;
    },
    defaults: function () { return JSON.parse(JSON.stringify(DEFAULTS)); },
    // Is this animation on? Master switch, its own switch, and the phone's 'reduce motion' setting.
    fx: function (k) {
      var o = api.get();
      if (!o.gfx || !o[k]) return false;
      try { if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch (e) {}
      return true;
    },
    set: function (k, v) {
      var o = api.get();
      if (o[k] === v) return;
      o[k] = v;
      try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
    },
    setMany: function (obj) { Object.keys(DEFAULTS).forEach(function (k) { if (obj && obj[k] !== undefined) api.set(k, obj[k]); }); },
    apply: function () {
      var t = api.get().theme, r = document.documentElement;
      if (t === 'light' || t === 'dark') r.setAttribute('data-theme', t); else r.removeAttribute('data-theme');
    }
  };
  api.apply();
  root.PokerPrefs = api;
})(this);
