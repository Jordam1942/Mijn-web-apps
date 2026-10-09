// Browser checks with Playwright: the table fits a phone without scrolling (412 x 800 and 412 x 860,
// eight players), the app plays without errors, and a saved table comes back as it was.
// Run with: node poker/tests/ui.test.js   (needs playwright; set CHROME_PATH to a Chromium if it is not found)
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (e2) { console.log('playwright niet gevonden: overgeslagen'); process.exit(0); } }

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  fs.readFile(p, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(data); });
});

async function run() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [];
  try {
    for (const h of [800, 860]) {
      const ctx = await browser.newContext({ viewport: { width: 412, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: 'dark' });
      await ctx.addInitScript(() => { localStorage.setItem('poker-age-ok', '1'); localStorage.setItem('poker-prefs-v1', JSON.stringify({ speed: 'snel', turnTimer: 0, takeover: 0 })); });
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base, { waitUntil: 'load' });
      await page.click('[data-go="setup"]');
      await page.evaluate(() => { const r = document.getElementById('bots'); r.value = 7; r.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.click('#btn-deal');
      await page.waitForTimeout(600);
      const atStart = await page.evaluate(() => document.querySelectorAll('#s-table .seat').length);
      assert.strictEqual(atStart, 8, 'acht spelers verwacht aan het begin');
      for (let k = 0; k < 30; k++) {
        await page.waitForTimeout(200);
        if (await page.evaluate(() => !document.getElementById('b-call').disabled)) await page.click('#b-call');
      }
      const fit = await page.evaluate(() => {
        const bad = [];
        document.querySelectorAll('#s-table .seat, #s-table .act, #s-table .odds, #s-table .topbar, #s-table .felt, #s-table .msg').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.left < -1 || r.top < -1) bad.push(el.className);
        });
        const doc = document.documentElement;
        return { bad, seats: document.querySelectorAll('#s-table .seat').length, scrolls: doc.scrollHeight > innerHeight + 1 || document.body.scrollHeight > innerHeight + 1 };
      });
      assert.deepStrictEqual(fit.bad, [], 'elementen buiten het scherm bij ' + h);
      assert.strictEqual(fit.scrolls, false, 'de pagina scrolt bij ' + h);
      await ctx.close();
      console.log('ok  acht spelers passen op 412 x ' + h + ' zonder scrollen');
    }

    // Save and resume
    const ctx = await browser.newContext({ viewport: { width: 412, height: 800 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { localStorage.setItem('poker-age-ok', '1'); localStorage.setItem('poker-prefs-v1', JSON.stringify({ speed: 'rustig', turnTimer: 0 })); });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base, { waitUntil: 'load' });
    await page.click('[data-go="setup"]');
    await page.click('#btn-deal');
    await page.waitForTimeout(1500);
    const potBefore = await page.textContent('#t-pot');
    const snap = JSON.parse(await page.evaluate(() => localStorage.getItem('poker-saved-solo')));
    assert.ok(!('deck' in (snap.hand || {})), 'het stapel kaarten is opgeslagen');
    assert.ok(snap.hand.players.every((p, i) => i === 0 || p.cards.length === 0), 'kaarten van de computer zijn opgeslagen');
    await page.reload({ waitUntil: 'load' });
    await page.click('#btn-resume');
    await page.waitForTimeout(500);
    assert.strictEqual(await page.textContent('#t-pot'), potBefore, 'de pot is anders na het hervatten');
    await ctx.close();
    console.log('ok  opgeslagen tafel komt terug, zonder verborgen kaarten');

    // Every game sound is audible and does not clip (rendered offline, so no speakers are needed)
    const page2 = await (await browser.newContext()).newPage();
    page2.on('pageerror', e => errors.push(e.message));
    await page2.goto(base, { waitUntil: 'load' });
    const sounds = await page2.evaluate(async () => {
      const out = {};
      for (const kind of window.PokerSfx.names) {
        const c = new OfflineAudioContext(1, 44100 * 2.5, 44100);
        window.PokerSfx.schedule(c, kind, 0);
        const buf = await c.startRendering();
        const d = buf.getChannelData(0);
        let peak = 0, sum = 0;
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; }
        out[kind] = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(5) };
      }
      return out;
    });
    for (const [kind, s] of Object.entries(sounds)) {
      assert.ok(s.rms > 0.0005, 'geluid "' + kind + '" is stil');
      assert.ok(s.peak <= 1.0, 'geluid "' + kind + '" vervormt');
    }
    console.log('ok  alle geluiden hoorbaar en niet vervormd: ' + Object.keys(sounds).join(', '));
    assert.deepStrictEqual(errors, [], 'fouten in de pagina');
    console.log('ok  geen fouten in de pagina');
  } finally {
    await browser.close();
    server.close();
  }
}

run().then(() => console.log('\nUI-tests geslaagd.')).catch(e => { console.error('FAIL ' + e.message); process.exit(1); });
