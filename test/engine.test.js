'use strict';
const assert = require('assert');
const E = require('../public/engine.js');
const { Game } = E;

let passed = 0;
const waits = [];
function t(name, fn) {
  const ok = () => { passed++; console.log('ok   ' + name); };
  const bad = e => { console.log('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; };
  try { const r = fn(); if (r && r.then) waits.push(r.then(ok, bad)); else ok(); } catch (e) { bad(e); }
}

function table(n, humans) {
  const g = new Game('TEST', { fast: true });
  for (let i = 0; i < humans; i++) g.addHuman('P' + (i + 1), 't' + i);
  g.size = n;
  return g;
}

t('deck has 52 cards, 2 is highest', () => {
  const d = E.newDeck();
  assert.strictEqual(d.length, 52);
  assert.strictEqual(new Set(d).size, 52);
  assert.strictEqual(E.rankLabel(15), '2');
  assert.ok(E.rankOf('S15') > E.rankOf('S14'));
});

t('titles by finishing position', () => {
  assert.deepStrictEqual(E.titlesFor(3), ['president', 'citizen', 'asshole']);
  assert.deepStrictEqual(E.titlesFor(4), ['president', 'citizen', 'citizen', 'asshole']);
  assert.deepStrictEqual(E.titlesFor(5), ['president', 'citizen', 'citizen', 'citizen', 'asshole']);
  assert.deepStrictEqual(E.titlesFor(6), ['president', 'vp', 'citizen', 'citizen', 'va', 'asshole']);
  assert.deepStrictEqual(E.titlesFor(7),['president', 'vp', 'citizen', 'citizen', 'citizen', 'va', 'asshole']);
  assert.deepStrictEqual(E.titlesFor(8), ['president', 'vp', 'citizen', 'citizen', 'citizen', 'citizen', 'va', 'asshole']);
});

t('play rules: one rank, same count, strictly higher', () => {
  assert.strictEqual(E.playError(['S5'], null), null);
  assert.strictEqual(E.playError(['S5', 'H5'], null), null);
  assert.ok(E.playError(['S5', 'H6'], null));
  assert.ok(E.playError([], null));
  assert.strictEqual(E.playError(['S9'], { count: 1, rank: 8 }), null);
  assert.ok(E.playError(['S8'], { count: 1, rank: 8 }));            // equal does not beat
  assert.ok(E.playError(['S9', 'H9'], { count: 1, rank: 8 }));      // wrong count
  assert.strictEqual(E.playError(['S15'], { count: 1, rank: 14 }), null);   // 2 beats ace
  assert.strictEqual(E.playError(['H15'], { count: 1, rank: 15 }), null);   // a 2 can go on a 2
  assert.strictEqual(E.playError(['H15', 'D15'], { count: 2, rank: 15 }), null);
  assert.ok(E.playError(['H15'], { count: 2, rank: 15 }), 'a single 2 does not beat a pair of 2s');
  assert.ok(E.playError(['H14'], { count: 1, rank: 15 }), 'nothing but a 2 beats a 2');
});

t('lobby: names, host, size, start needs 3', () => {
  const g = table(3, 0);
  assert.ok(g.addHuman('', 'x').err);
  const a = g.addHuman('Sam', 'a'), b = g.addHuman('sam', 'b');
  assert.strictEqual(g.hostId, a.pid);
  assert.notStrictEqual(g.byId(b.pid).name.toLowerCase(), 'sam');
  g.size = 3;
  g.act(a.pid, { type: 'size', size: 2 });
  assert.strictEqual(g.size, 3);
  assert.ok(g.act(b.pid, { type: 'start' }).err);   // not the host
});

t('deal: every card dealt once, 3 of clubs leads first', () => {
  for (const n of [3, 4, 5, 6, 7, 8]) {
    const g = table(n, 1);
    g.act(1, { type: 'start' });
    const all = [].concat(...g.players.map(p => p.hand));
    assert.strictEqual(all.length, 52);
    assert.strictEqual(new Set(all).size, 52);
    assert.ok(g.players[g.turnIdx].hand.includes('C3'), 'C3 holder leads');
    g.destroy();
  }
});

t('a 2 does not win the trick by itself: others can pass or put another 2 on top', () => {
  const g = table(3, 3);
  g.act(1, { type: 'start' });
  const i0 = g.turnIdx, a = g.players[i0], b = g.players[(i0 + 1) % 3], c = g.players[(i0 + 2) % 3];
  a.hand = ['S15', 'C4']; b.hand = ['H15', 'C6']; c.hand = ['C7', 'C8'];
  assert.ok(g.act(a.id, { type: 'play', cards: ['S15'] }).ok);
  assert.strictEqual(g.phase, 'playing', 'the trick is still open after a 2');
  assert.strictEqual(g.players[g.turnIdx].id, b.id);
  assert.ok(g.act(b.id, { type: 'play', cards: ['H15'] }).ok, 'a 2 on a 2');
  assert.strictEqual(g.phase, 'playing');
  assert.ok(g.act(c.id, { type: 'play', cards: ['C8'] }).err, 'nothing beats a 2 except another 2');
  assert.ok(g.act(c.id, { type: 'pass' }).ok);
  assert.strictEqual(g.players[g.turnIdx].id, a.id, 'back round to the first 2');
  assert.ok(g.act(a.id, { type: 'pass' }).ok);
  assert.strictEqual(g.phase, 'trickdone');
  assert.strictEqual(g.trickWinner, b.id, 'won only because everyone else passed');
  g.afterTrick();
  assert.strictEqual(g.players[g.turnIdx].id, b.id);
  g.destroy();
});

t('a lone 2 that nobody beats wins once everyone passes', () => {
  const g = table(3, 3);
  g.act(1, { type: 'start' });
  const i0 = g.turnIdx, a = g.players[i0], b = g.players[(i0 + 1) % 3], c = g.players[(i0 + 2) % 3];
  a.hand = ['S15', 'C4']; b.hand = ['C6', 'C9']; c.hand = ['C7', 'C8'];
  g.act(a.id, { type: 'play', cards: ['S15'] });
  g.act(b.id, { type: 'pass' }); g.act(c.id, { type: 'pass' });
  assert.strictEqual(g.phase, 'trickdone');
  assert.strictEqual(g.trickWinner, a.id);
  g.destroy();
});

t('six players: vice titles swap 2 cards, President and Asshole swap 3', () => {
  const g = table(6, 6);
  g.act(1, { type: 'start' });
  const P = g.players.slice();
  g.prevOrder = P.map(p => p.id);
  g.titles = {}; E.titlesFor(6).forEach((tt, i) => { g.titles[P[i].id] = tt; });
  g.phase = 'roundover';
  g.act(1, { type: 'next' });
  assert.strictEqual(g.phase, 'exchange');
  assert.strictEqual(g.pending.length, 2);
  assert.strictEqual(g.pending[0].k, 3);
  assert.strictEqual(g.pending[1].k, 2);
  const va = P[4], vp = P[1];
  const best1 = E.sortHand(va.hand).slice(-1);
  assert.ok(g.act(va.id, { type: 'give', cards: best1 }).err, 'one card is not enough from the Vice Asshole');
  assert.ok(g.act(va.id, { type: 'give', cards: E.sortHand(va.hand).slice(-2) }).ok);
  assert.ok(g.act(vp.id, { type: 'give', cards: E.sortHand(vp.hand).slice(0, 2) }).ok);
  assert.strictEqual(g.phase, 'exchange', 'the President and Asshole have not finished');
  const pres = P[0], ass = P[5];
  assert.ok(g.act(ass.id, { type: 'give', cards: E.sortHand(ass.hand).slice(-2) }).err, '3 cards from the Asshole');
  g.act(ass.id, { type: 'give', cards: E.sortHand(ass.hand).slice(-3) });
  g.act(pres.id, { type: 'give', cards: E.sortHand(pres.hand).slice(0, 3) });
  assert.strictEqual(g.phase, 'xdone');
  g.destroy();
});

t('five players: no vice titles, just President and Asshole swapping 2', () => {
  const g = table(5, 5);
  g.act(1, { type: 'start' });
  const P = g.players.slice();
  g.prevOrder = P.map(p => p.id);
  g.titles = {}; E.titlesFor(5).forEach((tt, i) => { g.titles[P[i].id] = tt; });
  g.phase = 'roundover';
  g.act(1, { type: 'next' });
  assert.strictEqual(g.pending.length, 1);
  assert.strictEqual(g.pending[0].k, 2);
  assert.ok(!Object.values(g.titles).some(x => x === 'vp' || x === 'va'));
  g.destroy();
});

t('passing: everyone else passes, the last player to play wins the trick', () => {
  const g = table(3, 3);
  g.act(1, { type: 'start' });
  const i0 = g.turnIdx, a = g.players[i0], b = g.players[(i0 + 1) % 3], c = g.players[(i0 + 2) % 3];
  a.hand = ['C4', 'C9']; b.hand = ['C5', 'C6']; c.hand = ['C7', 'C8'];
  assert.ok(g.act(a.id, { type: 'pass' }).err, 'cannot pass when leading');
  g.act(a.id, { type: 'play', cards: ['C4'] });
  assert.ok(g.act(b.id, { type: 'play', cards: ['C5'] }).err === undefined);
  assert.ok(g.act(c.id, { type: 'play', cards: ['C7'] }).ok);
  assert.ok(g.act(a.id, { type: 'play', cards: ['C9'] }).ok);
  g.act(b.id, { type: 'pass' }); g.act(c.id, { type: 'pass' });
  assert.strictEqual(g.phase, 'trickdone');
  assert.strictEqual(g.trickWinner, a.id);
  g.destroy();
});

t('illegal plays are refused', () => {
  const g = table(3, 3);
  g.act(1, { type: 'start' });
  const i0 = g.turnIdx, a = g.players[i0], b = g.players[(i0 + 1) % 3];
  a.hand = ['C4', 'D4', 'C9']; b.hand = ['C3', 'C5', 'D5'];
  assert.ok(g.act(b.id, { type: 'play', cards: ['C5'] }).err, 'not your turn');
  assert.ok(g.act(a.id, { type: 'play', cards: ['C4', 'C9'] }).err, 'mixed ranks');
  assert.ok(g.act(a.id, { type: 'play', cards: ['S12'] }).err, 'not held');
  g.act(a.id, { type: 'play', cards: ['C4', 'D4'] });
  assert.ok(g.act(b.id, { type: 'play', cards: ['C5'] }).err, 'wrong count');
  assert.ok(g.act(b.id, { type: 'play', cards: ['C3', 'C5'] }).err, 'mixed');
  assert.ok(g.act(b.id, { type: 'play', cards: ['C5', 'D5'] }).ok);
  g.destroy();
});

t('going out sets the order; last card holder is the Asshole; titles and tallies', () => {
  const g = table(4, 4);
  g.act(1, { type: 'start' });
  const i0 = g.turnIdx, P = [0, 1, 2, 3].map(k => g.players[(i0 + k) % 4]);
  P[0].hand = ['C3']; P[1].hand = ['C4']; P[2].hand = ['C5']; P[3].hand = ['C6', 'C7'];
  g.act(P[0].id, { type: 'play', cards: ['C3'] });
  g.act(P[1].id, { type: 'play', cards: ['C4'] });
  g.act(P[2].id, { type: 'play', cards: ['C5'] });
  g.act(P[3].id, { type: 'play', cards: ['C6'] });   // P0..P2 are out, P3 keeps one card
  assert.strictEqual(g.phase, 'trickdone');
  g.afterTrick();
  assert.strictEqual(g.phase, 'roundover');
  assert.deepStrictEqual(g.prevOrder, [P[0].id, P[1].id, P[2].id, P[3].id]);
  assert.strictEqual(g.titles[P[0].id], 'president');
  assert.strictEqual(g.titles[P[1].id], 'citizen');
  assert.strictEqual(g.titles[P[2].id], 'citizen');
  assert.strictEqual(g.titles[P[3].id], 'asshole');
  assert.strictEqual(P[3].tally.asshole, 1);
  g.destroy();
});

t('next round: Asshole hands over best cards, President hands cards back, Asshole leads', () => {
  const g = table(4, 4);
  g.act(1, { type: 'start' });
  const P = g.players.slice();
  g.prevOrder = P.map(p => p.id);
  g.titles = {}; E.titlesFor(4).forEach((tt, i) => { g.titles[P[i].id] = tt; });
  g.phase = 'roundover';
  g.act(1, { type: 'next' });
  assert.strictEqual(g.phase, 'exchange');
  assert.strictEqual(g.pending.length, 1);            // 4 players: only the President and Asshole swap
  const pres = P[0], asshole = P[3];
  assert.strictEqual(pres.hand.length, 13);           // nothing moves until both sides have chosen
  assert.strictEqual(asshole.hand.length, 13);
  const aSorted = E.sortHand(asshole.hand), pSorted = E.sortHand(pres.hand);
  const top2 = aSorted.slice(-2), low2 = pSorted.slice(0, 2);
  // cheating is refused: the Asshole must give its best, the President only its lowest
  assert.ok(g.act(asshole.id, { type: 'give', cards: [aSorted[0], aSorted[1]] }).err, 'asshole holding back its best');
  assert.ok(g.act(asshole.id, { type: 'give', cards: [top2[0]] }).err, 'must give 2');
  assert.ok(g.act(asshole.id, { type: 'give', cards: [top2[0], 'X1'] }).err, 'must hold them');
  assert.ok(g.act(pres.id, { type: 'give', cards: pSorted.slice(-2) }).err, 'president giving high cards');
  assert.ok(g.act(P[1].id, { type: 'give', cards: [P[1].hand[0], P[1].hand[1]] }).err, 'a citizen has nothing to give');
  assert.ok(g.act(asshole.id, { type: 'give', cards: top2 }).ok);
  assert.strictEqual(g.phase, 'exchange', 'still waiting on the President');
  let sa = g.snapshot(asshole.id).xchg.mine, sp = g.snapshot(pres.id).xchg.mine, sc = g.snapshot(P[1].id).xchg;
  assert.strictEqual(sa.submitted, true); assert.strictEqual(sa.got, null);
  assert.strictEqual(sp.submitted, false); assert.strictEqual(sp.side, 'hi'); assert.strictEqual(sp.mode, 'worst');
  assert.strictEqual(sc.mine, null, 'citizens only see that a swap is happening');
  assert.strictEqual(sc.pairs.length, 1);
  assert.strictEqual(JSON.stringify(sc).includes(top2[0]), false, 'no card faces leak to citizens');
  assert.ok(g.act(asshole.id, { type: 'give', cards: top2 }).err, 'only once');
  assert.ok(g.act(pres.id, { type: 'give', cards: low2 }).ok);
  assert.strictEqual(g.phase, 'xdone');
  assert.strictEqual(pres.hand.length, 13);
  assert.strictEqual(asshole.hand.length, 13);
  assert.ok(top2.every(c => pres.hand.includes(c)) && low2.every(c => asshole.hand.includes(c)));
  sp = g.snapshot(pres.id).xchg.mine; sa = g.snapshot(asshole.id).xchg.mine;
  assert.deepStrictEqual(sp.gave, low2); assert.deepStrictEqual(sp.got, top2);
  assert.deepStrictEqual(sa.gave, top2); assert.deepStrictEqual(sa.got, low2);
  g.act(P[1].id, { type: 'go' });
  assert.strictEqual(g.phase, 'playing');
  assert.strictEqual(g.players[g.turnIdx].id, asshole.id);
  const all = [].concat(...g.players.map(p => p.hand));
  assert.strictEqual(new Set(all).size, 52);
  g.destroy();
});

t('starting roles: host picks, one person per title, bots fill the rest', () => {
  const g = table(7, 3);
  const [h, b, c] = [1, 2, 3];
  assert.ok(g.act(h, { type: 'setrole', pid: b, role: 'asshole' }).err, 'roles mode is off');
  g.act(h, { type: 'roles', on: true });
  assert.ok(g.act(b, { type: 'roles', on: false }).err, 'host only');
  g.act(h, { type: 'setrole', pid: h, role: 'president' });
  g.act(h, { type: 'setrole', pid: b, role: 'asshole' });
  g.act(h, { type: 'setrole', pid: c, role: 'asshole' });    // moves the title
  assert.strictEqual(g.byId(b).role, null);
  assert.strictEqual(g.byId(c).role, 'asshole');
  assert.ok(g.act(h, { type: 'setrole', pid: b, role: 'king' }).err);
  g.act(h, { type: 'setrole', pid: b, role: 'va' });
  assert.ok(g.act(h, { type: 'start' }).ok, 'a bot takes Vice President');
  assert.strictEqual(g.phase, 'exchange');
  const pid = id => g.byId(id);
  assert.strictEqual(g.titles[h], 'president');
  assert.strictEqual(g.titles[b], 'va');
  assert.strictEqual(g.titles[c], 'asshole');
  assert.strictEqual(Object.values(g.titles).filter(x => x === 'vp').length, 1);
  assert.ok(pid(g.prevOrder.find(id => g.titles[id] === 'vp')).bot);
  // the bot Vice President handed down at once, but the human Vice Asshole and the human President/Asshole pair still choose
  assert.strictEqual(g.pending.filter(x => !x.done).length, 2);
  assert.strictEqual(g.exchangeWaiting().length, 3);
  g.destroy();
});

t('starting roles: refuses when titles cannot be filled', () => {
  const g = table(4, 4);                              // four humans, none bots
  g.act(1, { type: 'roles', on: true });
  g.act(1, { type: 'setrole', pid: 1, role: 'president' });
  assert.ok(g.act(1, { type: 'start' }).err, 'titles left and no bots to take them');
  assert.ok(g.act(1, { type: 'setrole', pid: 2, role: 'vp' }).ok);
  assert.ok(g.act(1, { type: 'start' }).err, 'vice titles do not exist below 6 players');
  g.act(1, { type: 'setrole', pid: 2, role: 'citizen' });
  g.act(1, { type: 'setrole', pid: 4, role: 'asshole' });
  assert.ok(g.act(1, { type: 'start' }).ok);
  assert.deepStrictEqual(g.snapshot(1).rolesNeed, ['president', 'asshole']);
  g.destroy();
});

t('a player who goes out and wins the trick: the next seat leads', () => {
  const g = table(4, 4);
  g.act(1, { type: 'start' });
  const i0 = g.turnIdx, P = [0, 1, 2, 3].map(k => g.players[(i0 + k) % 4]);
  P[0].hand = ['C9']; P[1].hand = ['C4', 'C5']; P[2].hand = ['C6', 'C7']; P[3].hand = ['C8', 'D8'];
  g.act(P[0].id, { type: 'play', cards: ['C9'] });    // P0 is out and nobody beats a 9 except by passing
  g.act(P[1].id, { type: 'pass' }); g.act(P[2].id, { type: 'pass' }); g.act(P[3].id, { type: 'pass' });
  assert.strictEqual(g.phase, 'trickdone');
  g.afterTrick();
  assert.strictEqual(g.players[g.turnIdx].id, P[1].id, 'next seat after the finisher leads');
  g.destroy();
});

t('trick records who led it', () => {
  const g = table(3, 3);
  g.act(1, { type: 'start' });
  const a = g.players[g.turnIdx];
  a.hand = ['C4', 'C9'];
  g.act(a.id, { type: 'play', cards: ['C4'] });
  assert.strictEqual(g.snapshot(1).trick.lead, a.id);
  g.destroy();
});

t('hand-down rule: highest cards up, lowest cards down, ties in any suit', () => {
  const hand = ['C3', 'D3', 'C5', 'H9', 'S9', 'C14', 'S15'];
  assert.strictEqual(E.exchangeError(hand, ['C14', 'S15'], 2, 'best'), null);
  assert.ok(E.exchangeError(hand, ['H9', 'S15'], 2, 'best'));
  assert.strictEqual(E.exchangeError(hand, ['C3', 'D3'], 2, 'worst'), null);
  assert.strictEqual(E.exchangeError(hand, ['D3', 'C5'], 2, 'worst') !== null, true);
  assert.strictEqual(E.exchangeError(hand, ['H9'], 1, 'best') !== null, true);
  assert.strictEqual(E.exchangeError(['C5', 'D5', 'H5', 'S9'], ['D5'], 1, 'worst'), null);   // equal ranks: any suit
});

t('away humans in the swap are handled automatically, then the table carries on', () => {
  const g = table(4, 4);
  g.fast = true;
  g.act(1, { type: 'start' });
  const P = g.players.slice();
  g.prevOrder = P.map(p => p.id);
  g.titles = {}; E.titlesFor(4).forEach((tt, i) => { g.titles[P[i].id] = tt; });
  g.phase = 'roundover';
  g.act(1, { type: 'next' });
  assert.strictEqual(g.phase, 'exchange');
  g.setConnected(P[0].id, false); g.setConnected(P[3].id, false);
  return new Promise(resolve => setTimeout(() => {
    assert.ok(['xdone', 'playing'].includes(g.phase) || g.phase === 'trickdone', 'phase ' + g.phase);
    g.destroy(); resolve();
  }, 150));
});

t('bot never makes an illegal move', () => {
  for (let k = 0; k < 4000; k++) {
    const hand = E.sortHand(E.shuffle(E.newDeck()).slice(0, 1 + Math.floor(Math.random() * 13)));
    const trick = Math.random() < 0.3 ? null : { count: 1 + Math.floor(Math.random() * 3), rank: 3 + Math.floor(Math.random() * 12) };
    for (const lvl of ['easy', 'medium', 'hard']) {
      const mv = E.Bot.play(hand, trick, lvl, { minOpp: 1 + Math.floor(Math.random() * 6) });
      if (mv === null) { assert.ok(trick, 'bots must lead'); continue; }
      mv.forEach(c => assert.ok(hand.includes(c)));
      assert.strictEqual(E.playError(mv, trick), null);
    }
  }
});

function simulate(n, rounds, level, withRoles) {
  return new Promise((resolve, reject) => {
    const g = new Game('SIM', { fast: true });
    g.addHuman('Host', 'h'); g.size = n; g.botLevel = level;
    if (withRoles) { g.act(1, { type: 'roles', on: true }); g.act(1, { type: 'setrole', pid: 1, role: 'asshole' }); }
    let done = false, guard = setTimeout(() => { g.destroy(); reject(new Error('stalled in phase ' + g.phase)); }, 20000);
    g.onChange = () => {
      if (done) return;
      // the lone human is played for by the schedule once marked disconnected
      if (g.phase === 'roundover') {
        const order = g.prevOrder;
        try {
          assert.strictEqual(new Set(order).size, n);
          assert.strictEqual(order.length, n);
          assert.strictEqual(g.players.filter(p => p.hand.length).length, 1);
        } catch (e) { done = true; clearTimeout(guard); return reject(e); }
        if (g.round >= rounds) { done = true; clearTimeout(guard); g.act(1, { type: 'finish' }); g.destroy(); return resolve(g); }
        setTimeout(() => g.act(1, { type: 'next' }), 0);
      }
    };
    g.act(1, { type: 'start' });
    g.setConnected(1, false);   // away: the table plays for them
  });
}

t('simulated games finish for 3 to 8 players at every bot level', async () => {});
(async () => {
  await Promise.all(waits);
  for (const n of [3, 4, 5, 6, 7, 8]) {
    for (const lvl of ['easy', 'medium', 'hard']) {
      try {
        const g = await simulate(n, 6, lvl, n % 2 === 0);
        const total = g.players.reduce((s, p) => s + p.tally.rounds, 0);
        assert.strictEqual(total, n * 6);
        assert.strictEqual(g.phase, 'gameover');
        assert.ok(g.verdict().asshole.length >= 1);
        passed++; console.log('ok   sim ' + n + 'p ' + lvl + ' (6 rounds' + (n % 2 === 0 ? ', roles' : '') + ')');
      } catch (e) { console.log('FAIL sim ' + n + 'p ' + lvl + '\n' + e.stack); process.exitCode = 1; }
    }
  }
  console.log(passed + ' passed' + (process.exitCode ? ', with failures' : ''));
  process.exit(process.exitCode || 0);
})();
