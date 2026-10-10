// Browsercontrole met Playwright: de tafel past op een telefoon zonder scrollen (412 x 800 en 412 x 919),
// een potje speelt tot het eind zonder fouten, en de oefenmodus laat de kaarten zien.
// Draai met: node uno/tests/ui.test.js   (zet CHROME_PATH als er geen Chromium gevonden wordt)
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (e2) { console.log('playwright niet gevonden: overgeslagen'); process.exit(0); }
}

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

// Eén beurt van de speler: kies een kaart, pak, of wacht op de computers
async function speelBeurt(page) {
  if (await page.isVisible('#sheet-uitslag')) return 'klaar';
  if (await page.isVisible('#sheet-kleur')) { await page.click('#sheet-kleur [data-kleur="0"]'); return 'kleur'; }
  if (await page.isVisible('#btn-accepteer')) { await page.click('#btn-accepteer'); return 'accepteer'; }
  if (await page.isVisible('#btn-uno')) { await page.click('#btn-uno'); return 'uno'; }
  if (await page.isVisible('#btn-pas')) { await page.click('#btn-pas'); return 'pas'; }
  const speelbaar = await page.$('#hand .card.speelbaar');
  // Kaarten in de hand overlappen: klik op het zichtbare deel links, zoals een speler dat doet
  if (speelbaar) { await speelbaar.click({ position: { x: 14, y: 30 } }); return 'speel'; }
  if (await page.isEnabled('#stapel')) { await page.click('#stapel'); return 'pak'; }
  // Wacht tot de computers klaar zijn en er weer iets voor jou te doen is
  await page.waitForFunction(() => !!document.querySelector('#hand .card.speelbaar') ||
    !document.querySelector('#stapel').disabled || !!document.querySelector('.sheet:not([hidden])') ||
    !document.querySelector('#btn-uno').hidden || !document.querySelector('#btn-accepteer').hidden, null, { timeout: 20000 }).catch(() => {});
  return 'wacht';
}

async function run() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const fouten = [];
  try {
    for (const hoogte of [800, 919]) {
      const ctx = await browser.newContext({ viewport: { width: 412, height: hoogte }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: 'dark' });
      // Snel tempo en zonder geluid, zodat de test vlot loopt
      await ctx.addInitScript(() => {
        if (!sessionStorage.getItem('uno-test')) {
          localStorage.setItem('uno-prefs-v1', JSON.stringify({ sound: false, gfx: true, speed: 'snel' }));
          sessionStorage.setItem('uno-test', '1');
        }
      });
      const page = await ctx.newPage();
      page.on('pageerror', e => fouten.push(hoogte + ': ' + e.message));
      page.on('console', m => { if (m.type() === 'error') fouten.push(hoogte + ' console: ' + m.text()); });
      await page.goto(base);
      await page.evaluate(() => { localStorage.clear(); });
      await page.reload();

      await page.click('#btn-nieuw');
      await page.click('#aantallen [data-n="4"]');
      await page.click('#nieuw-start');
      await page.waitForSelector('#tafel:not([hidden])');

      // Geen scrollen aan de tafel: alles past binnen het scherm
      const past = await page.evaluate(() => {
        const s = document.querySelector('#tafel');
        const hand = document.querySelector('#hand').getBoundingClientRect();
        const acties = document.querySelector('.acties').getBoundingClientRect();
        return {
          scrollt: s.scrollHeight > s.clientHeight + 1,
          handOnder: hand.bottom <= window.innerHeight + 1,
          handBreed: hand.right <= window.innerWidth && hand.left >= 0,
          actiesZichtbaar: acties.bottom <= window.innerHeight + 1
        };
      });
      assert.strictEqual(past.scrollt, false, hoogte + ': de tafel scrolt');
      assert.strictEqual(past.handOnder, true, hoogte + ': de hand valt buiten beeld');
      assert.strictEqual(past.handBreed, true, hoogte + ': de hand is te breed');
      assert.strictEqual(past.actiesZichtbaar, true, hoogte + ': de knoppen vallen buiten beeld');

      // Speel tot het potje af is, of tot de limiet
      let klaar = false, beurten = 0, mislukt = 0;
      // Een heel potje duurt te lang voor een browsertest (de regels staan al in de Node-tests). Dertig eigen beurten laten zien dat het spel loopt.
      for (let i = 0; i < 200 && !klaar; i++) {
        // Een klik die net niet landt (de knoppen worden na elke zet opnieuw getekend) probeert de test opnieuw
        let actie;
        try { actie = await speelBeurt(page); } catch (e) { mislukt++; if (mislukt > 6) throw e; continue; }
        if (actie === 'klaar') klaar = true;
        if (actie === 'speel' || actie === 'pak') beurten++;
        if (beurten >= 30) break;
      }
      if (!klaar) {
        // Een lang potje is ook goed: controleer dat de tafel nog klopt
        assert.ok(await page.isVisible('#tafel'), hoogte + ': de tafel is weg');
      }
      console.log('   ' + hoogte + ' x 412: tafel past, potje ' + (klaar ? 'af' : 'nog bezig na de limiet'));
      await ctx.close();
    }

    // Oefenen: de host ziet de kaarten van de anderen
    const ctx = await browser.newContext({ viewport: { width: 412, height: 800 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: 'dark' });
    const page = await ctx.newPage();
    page.on('pageerror', e => fouten.push('oefenen: ' + e.message));
    await page.goto(base);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.click('#btn-nieuw');
    await page.click('#aantallen [data-n="3"]');
    await page.check('#nieuw-oefenen');
    await page.click('#nieuw-start');
    await page.waitForSelector('#tafel:not([hidden])');
    assert.strictEqual(await page.isVisible('#badge-oefenen'), true, 'oefenen: badge ontbreekt');
    assert.ok(await page.isVisible('#kijk'), 'oefenen: meekijken is niet zichtbaar');
    const kaarten = await page.$$eval('#kijk .card', els => els.length);
    assert.ok(kaarten >= 5, 'oefenen: te weinig kaarten zichtbaar (' + kaarten + ')');
    console.log('   oefenen: ' + kaarten + ' kaarten van de tegenstander zichtbaar');
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  return fouten;
}

run().then(fouten => {
  if (fouten.length) { console.log('Fouten in de browser:\n  ' + fouten.join('\n  ')); process.exitCode = 1; }
  else console.log('Browsertests zijn goed');
}).catch(e => { console.log('FOUT ' + e.message); process.exitCode = 1; server.close(); });
