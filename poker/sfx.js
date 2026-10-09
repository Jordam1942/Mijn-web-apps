/*
 * Game sounds for the table, made in the browser (no sound files): chips, cards, a knock for
 * checking, a swish for folding, a bell for your turn, and a fanfare for a win.
 * Phones only allow sound after a tap, and pause it in the background, so the sound system is
 * woken up on every tap and when you come back to the app.
 */
(function (root) {
  'use strict';

  var ctx = null, noiseBuf = null;
  function ensure() {
    try {
      if (!ctx) { var C = root.AudioContext || root.webkitAudioContext; if (!C) return null; ctx = new C(); }
      if (ctx.state !== 'running' && ctx.resume) ctx.resume();
    } catch (e) { return null; }
    return ctx;
  }
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) { try { root.addEventListener(ev, ensure, { passive: true }); } catch (e) {} });
  try { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') ensure(); }); } catch (e) {}

  // Short white noise, used for the 'click' and 'swish' parts.
  function noise(c) {
    if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
      noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  // A short tone that fades out.
  function tone(c, out, f, t, dur, peak, type) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.02);
  }
  // A burst of filtered noise. sweep: optional end frequency for the filter.
  function burst(c, out, t, dur, peak, filter, f, sweep) {
    var s = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noise(c);
    flt.type = filter; flt.frequency.setValueAtTime(f, t); flt.Q.value = 0.9;
    if (sweep) flt.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(flt); flt.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
  }

  // Sounds, each written as a function (c, out, t) so tests can render them offline.
  var S = {
    // n chips stacked: each one a little 'tik' with a ring
    chips: function (c, out, t, n) {
      for (var k = 0; k < n; k++) {
        var tk = t + k * (0.045 + Math.random() * 0.02);
        burst(c, out, tk, 0.03, 0.55, 'bandpass', 3200 + Math.random() * 800, null);
        tone(c, out, 2400 + Math.random() * 700, tk, 0.09, 0.05, 'sine');
      }
    },
    // a card slid across the felt
    card: function (c, out, t) { burst(c, out, t, 0.16, 0.42, 'bandpass', 900, 2400); },
    // knock on the table: checking
    check: function (c, out, t) {
      tone(c, out, 190, t, 0.09, 0.42, 'sine');
      burst(c, out, t, 0.03, 0.25, 'highpass', 1800, null);
    },
    // a soft swish: folding
    fold: function (c, out, t) { burst(c, out, t, 0.28, 0.3, 'lowpass', 1600, 300); },
    // call: two chips pushed to the pot
    call: function (c, out, t) { S.chips(c, out, t, 2); },
    // raise: a bigger stack of chips
    raise: function (c, out, t) { S.chips(c, out, t, 5); },
    // all-in: a cascade of chips and a low thump
    allin: function (c, out, t) { S.chips(c, out, t, 7); tone(c, out, 90, t, 0.4, 0.55, 'sine'); },
    // your turn: a soft bell
    turn: function (c, out, t) { tone(c, out, 880, t, 0.9, 0.22, 'sine'); tone(c, out, 1320, t, 0.9, 0.07, 'sine'); },
    // a hand is won: a short fanfare and the chips slide to the winner
    win: function (c, out, t) {
      [523, 659, 784, 1047].forEach(function (f, k) { tone(c, out, f, t + k * 0.13, 0.5, 0.2, 'triangle'); });
      S.chips(c, out, t + 0.5, 8);
    },
    // a new hand: cards dealt
    deal: function (c, out, t) { for (var k = 0; k < 4; k++) S.card(c, out, t + k * 0.09); },
    // something is not allowed
    error: function (c, out, t) { tone(c, out, 150, t, 0.2, 0.18, 'triangle'); }
  };
  // What each game event sounds like
  var EVENT = { fold: 'fold', check: 'check', call: 'call', raise: 'raise', allin: 'allin', deal: 'deal', street: 'card', win: 'win', turn: 'turn', error: 'error' };

  function schedule(c, kind, t) {
    var out = c.createGain(); out.gain.value = 0.8; out.connect(c.destination);
    var fn = S[EVENT[kind] || kind];
    if (fn) fn(c, out, t === undefined ? c.currentTime : t);
  }

  root.PokerSfx = {
    unlock: ensure,
    // Plays an event: 'fold', 'check', 'call', 'raise', 'allin', 'deal', 'street', 'win', 'turn', 'error'.
    play: function (kind) {
      try { if (root.PokerPrefs && !root.PokerPrefs.get().sound) return; } catch (e) {}
      var c = ensure(); if (!c) return;
      schedule(c, kind, c.currentTime + 0.01);
    },
    // For tests: schedule a sound into any AudioContext (for example an OfflineAudioContext).
    schedule: schedule,
    names: Object.keys(EVENT)
  };
})(this);
