// The expert against four Extreme computers: chips won per hand over N hands (seat rotates).
// Run with: node poker/tools/expert-bench.js 1000   (about 5 minutes for 1000 hands)
const E = require('../engine.js');
const A = require('../ai.js');
const N = +process.argv[2] || 200, PLAYERS = 4;
function seeded(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const r = seeded(7);
const rint = n => Math.floor(r() * n);
const net = [0,0,0,0];
let total = 0;
for (let g = 0; g < N; g++) {
  // seat 0 = expert, the rest = Extreme computers. Rotate the seat of the expert so position is fair.
  const players = [];
  for (let s = 0; s < PLAYERS; s++) players.push({ id: s, name: 's' + s, stack: 2000 });
  const expertSeat = g % PLAYERS;
  let h = E.newHand({ players, dealer: g % PLAYERS, sb: 5, bb: 10, rnd: rint });
  let guard = 0;
  while (!h.done && guard++ < 500) {
    const i = h.current;
    const d = i === expertSeat ? A.expert(h, i, r) : A.decide(h, i, 'gemiddeld', r, 'extreme');
    const res = E.act(h, i, d);
    if (!res.ok) E.act(h, i, { type: 'fold' });
  }
  // profit of each seat in this hand: stack now minus the stack at the start
  const after = h.players.map(p => p.stack);
  // record expert result (relative to 2000 start)
  total += after[expertSeat] - 2000;
  net[0] += after[expertSeat] - 2000;
  for (let s = 0; s < PLAYERS; s++) if (s !== expertSeat) net[1] += after[s] - 2000;
}
console.log('hands', N, 'expert chips won', total, 'per hand', (total / N).toFixed(1), 'bots total', net[1]);
