(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Ranks run 3 (low) up to Ace (14) and 2 (15, the highest). A card is a suit letter plus its rank: 'S15' is the 2 of spades.
  var SUITS = ['C', 'D', 'H', 'S'];
  var SUIT_NAME = { S: 'Spades', H: 'Hearts', C: 'Clubs', D: 'Diamonds' };
  var SUIT_SYM = { S: '♠', H: '♥', C: '♣', D: '♦' };
  var TWO = 15;
  var BOT_NAMES = ['Duke', 'Baron', 'Clerk', 'Intern', 'Boss', 'Chief', 'Temp', 'Manager', 'Auditor', 'Deputy'];
  var TITLE = { president: 'President', vp: 'Vice President', citizen: 'Citizen', va: 'Vice Asshole', asshole: 'Asshole' };

  function rnd(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function newDeck() {
    var d = [];
    SUITS.forEach(function (s) { for (var r = 3; r <= 15; r++) d.push(s + r); });
    return d;
  }
  function suitOf(c) { return c[0]; }
  function rankOf(c) { return +c.slice(1); }
  function rankLabel(r) { return r === 15 ? '2' : r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : String(r); }
  function cardLabel(c) { return rankLabel(rankOf(c)) + SUIT_SYM[suitOf(c)]; }
  function sortHand(h) {
    return h.slice().sort(function (a, b) { return rankOf(a) - rankOf(b) || SUITS.indexOf(suitOf(a)) - SUITS.indexOf(suitOf(b)); });
  }
  function cleanName(name) {
    return Array.from(String(name || '').replace(/\s+/g, ' ').trim()).slice(0, 16).join('');
  }

  // Titles by finishing position. Up to 6 players: President, Citizens, Asshole.
  // From 7 players the Vice President and Vice Asshole join in.
  var VICE_FROM = 7;
  function titlesFor(n) {
    var t = [];
    for (var i = 0; i < n; i++) {
      if (i === 0) t.push('president');
      else if (i === n - 1) t.push('asshole');
      else if (n >= VICE_FROM && i === 1) t.push('vp');
      else if (n >= VICE_FROM && i === n - 2) t.push('va');
      else t.push('citizen');
    }
    return t;
  }

  // null when the cards are a legal play on this trick, else the reason they are not.
  // trick: null (leading) or { count, rank }.
  function playError(cards, trick) {
    if (!cards || !cards.length) return 'Pick a card first';
    var r = rankOf(cards[0]);
    for (var i = 1; i < cards.length; i++) if (rankOf(cards[i]) !== r) return 'Play cards of one rank';
    if (trick) {
      if (cards.length !== trick.count) return 'Play ' + trick.count + (trick.count === 1 ? ' card' : ' cards');
      if (r <= trick.rank) return 'Play higher than ' + rankLabel(trick.rank);
    }
    return null;
  }

  function groups(hand) {
    var g = {};
    hand.forEach(function (c) { (g[rankOf(c)] = g[rankOf(c)] || []).push(c); });
    return g;
  }

  // ---- Bots ----
  var Bot = {
    // Plays the lowest set that beats the trick, saves 2s, and passes when the only way to beat it would waste a 2.
    // Returns an array of cards, or null to pass. level: easy | medium | hard. ctx: { minOpp }.
    play: function (hand, trick, level, ctx) {
      ctx = ctx || {};
      var g = groups(hand), ranks = Object.keys(g).map(Number).sort(function (a, b) { return a - b; });
      var nonTwo = hand.filter(function (c) { return rankOf(c) !== TWO; }).length;
      var minOpp = ctx.minOpp == null ? 99 : ctx.minOpp;
      var i;
      if (!trick) {
        if (ranks.length === 1) return g[ranks[0]].slice();
        // Hard: when someone is nearly out, lead strong to keep control instead of feeding them
        if (level === 'hard' && minOpp <= 2) {
          var strong = ranks.filter(function (r) { return r !== TWO; });
          if (strong.length) return g[strong[strong.length - 1]].slice();
        }
        // lead the lowest rank, as a whole set (a lone 2 is never led while anything else is left)
        for (i = 0; i < ranks.length; i++) if (ranks[i] !== TWO || ranks.length === 1) return g[ranks[i]].slice();
        return g[ranks[0]].slice();
      }
      var opts = ranks.filter(function (r) { return r > trick.rank && g[r].length >= trick.count; });
      if (!opts.length) return null;
      if (level === 'easy' && Math.random() < 0.3) return null;
      var best = null, bs = 1e9;
      opts.forEach(function (r) {
        var s = r + (g[r].length - trick.count) * 1.5;   // prefer not to break up a bigger set
        if (s < bs) { bs = s; best = r; }
      });
      if (level !== 'easy' && best === TWO && nonTwo >= 4 && minOpp > 2) return null;   // keep the 2 for later
      if (level === 'hard' && best >= 13 && nonTwo >= 5 && minOpp > 3 && trick.count === 1 && Math.random() < 0.5) return null;
      return g[best].slice(0, trick.count);
    },
    // The k cards a President or Vice President hands down: the lowest ones, keeping pairs together where it can.
    give: function (hand, k) {
      var g = groups(hand);
      var arr = sortHand(hand).sort(function (a, b) {
        var sa = rankOf(a) + (g[rankOf(a)].length > 1 ? 0.4 : 0), sb = rankOf(b) + (g[rankOf(b)].length > 1 ? 0.4 : 0);
        return sa - sb;
      });
      return arr.slice(0, k);
    }
  };

  function Game(code, opts) {
    opts = opts || {};
    this.code = code;
    this.fast = !!opts.fast;
    this.players = [];
    this.size = 5;
    this.phase = 'lobby';       // lobby | exchange | playing | trickdone | roundover | gameover
    this.hostId = null;
    this.nextId = 1;
    this.n = 0;
    this.round = 0;
    this.turnIdx = 0;
    this.trick = null;          // { count, rank, plays: [{ pid, cards }] }
    this.passed = [];
    this.lastPid = null;
    this.trickWinner = null;
    this.trickEndRound = false;
    this.finishOrder = [];
    this.prevOrder = null;
    this.titles = {};
    this.history = [];
    this.pending = [];          // card hand-downs still waiting on a human
    this.rolesMode = false;     // host picks the starting titles (to carry on a game after everyone dropped)
    this.timer = null;
    this.ttimer = null;
    this.schedKey = null;
    this.timerSec = 0;          // turn timer: 0 = off, else 30/45/60/120
    this.botLevel = 'medium';
    this.seq = 0;
    this.timerScale = 1;
    this.turnEnd = null;
    this.chat = [];
    this.chatSeq = 0;
    this.closed = false;
    this.touched = Date.now();
    this.onChange = function () {};
    this.onKick = function () {};
  }

  Game.prototype.humans = function () { return this.players.filter(function (p) { return !p.bot; }); };
  Game.prototype.byId = function (id) { return this.players.filter(function (p) { return p.id === id; })[0]; };
  Game.prototype.byToken = function (t) { return t ? this.players.filter(function (p) { return p.token === t; })[0] : undefined; };
  Game.prototype.idxOf = function (id) { for (var i = 0; i < this.players.length; i++) if (this.players[i].id === id) return i; return -1; };

  Game.prototype.uniqueName = function (name, exceptId) {
    var base = cleanName(name), n = base, k = 2, self = this;
    var taken = function (x) {
      return self.players.some(function (p) { return p.id !== exceptId && p.name.toLowerCase() === x.toLowerCase(); });
    };
    while (taken(n)) { n = base.slice(0, 14) + ' ' + k; k++; }
    return n;
  };

  function newTally() { return { president: 0, vp: 0, citizen: 0, va: 0, asshole: 0, rounds: 0 }; }

  Game.prototype.addHuman = function (name, token) {
    if (this.phase !== 'lobby') return { err: 'That game has already started' };
    if (this.humans().length >= 8) return { err: 'Table is full' };
    if (!cleanName(name)) return { err: 'Enter your name' };
    var p = { id: this.nextId++, name: this.uniqueName(name), bot: false, token: token || null, connected: true, hand: [], tally: newTally() };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    if (this.humans().length > this.size) this.size = this.humans().length;
    this.emit();
    return { ok: true, pid: p.id };
  };

  Game.prototype.setConnected = function (pid, v) {
    var p = this.byId(pid);
    if (!p || p.bot || p.connected === v) return;
    p.connected = v;
    this.emit();
  };

  Game.prototype.emit = function () {
    this.touched = Date.now();
    this.seq++;
    this.schedule();
    this.onChange();
  };

  Game.prototype.reassignHost = function () {
    var h = this.humans().filter(function (p) { return p.connected; })[0] || this.humans()[0];
    this.hostId = h ? h.id : null;
    if (!h) this.closed = true;
  };

  Game.prototype.pushChat = function (pid, name, text, sys) {
    this.chat.push({ id: ++this.chatSeq, pid: pid, name: name, text: text, sys: !!sys });
    if (this.chat.length > 80) this.chat.splice(0, this.chat.length - 80);
  };

  Game.prototype.act = function (pid, a) {
    var p = this.byId(pid);
    if (!p || !a) return { err: 'Not in this room' };
    var isHost = pid === this.hostId;
    switch (a.type) {
      case 'rename': {
        if (!cleanName(a.name)) return { err: 'Enter a name' };
        p.name = this.uniqueName(a.name, pid);
        this.emit();
        return { ok: true };
      }
      case 'size': {
        if (!isHost || this.phase !== 'lobby') return { err: 'Only the host can do that' };
        var want = parseInt(a.size, 10);
        if (isNaN(want)) return { err: 'Bad size' };
        this.size = Math.max(3, this.humans().length, Math.min(8, want));
        this.emit();
        return { ok: true };
      }
      case 'timer': {
        if (!isHost) return { err: 'Only the host can do that' };
        var ts = parseInt(a.sec, 10);
        if ([0, 30, 45, 60, 120].indexOf(ts) < 0) return { err: 'Bad timer' };
        this.timerSec = ts;
        this.emit();
        return { ok: true };
      }
      case 'level': {
        if (!isHost) return { err: 'Only the host can do that' };
        if (['easy', 'medium', 'hard'].indexOf(a.level) < 0) return { err: 'Bad level' };
        this.botLevel = a.level;
        this.emit();
        return { ok: true };
      }
      case 'chat': {
        var text = String(a.text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        if (!text) return { err: 'Type a message first' };
        var now = Date.now();
        if (p.lastChat && now - p.lastChat < 350) return { err: 'Slow down' };
        p.lastChat = now;
        this.pushChat(p.id, p.name, text, false);
        this.emit();
        return { ok: true };
      }
      case 'kick': {
        if (!isHost) return { err: 'Only the host can do that' };
        var t = this.byId(a.pid);
        if (!t || t.bot || t.id === pid) return { err: 'Cannot remove that player' };
        this.removeHuman(t, true);
        return { ok: true };
      }
      case 'leave': {
        this.removeHuman(p, false);
        return { ok: true };
      }
      case 'start': {
        if (!isHost || this.phase !== 'lobby') return { err: 'Only the host can start' };
        if (Math.max(this.size, this.humans().length) < 3) return { err: 'Need at least 3 players. Add a bot.' };
        var re = this.rolesMode ? this.rolesProblem() : null;
        if (re) return { err: re };
        this.begin();
        return { ok: true };
      }
      case 'roles': {
        if (!isHost || this.phase !== 'lobby') return { err: 'Only the host can do that' };
        this.rolesMode = !!a.on;
        if (!this.rolesMode) this.players.forEach(function (x) { x.role = null; });
        this.emit();
        return { ok: true };
      }
      case 'setrole': {
        if (!isHost || this.phase !== 'lobby' || !this.rolesMode) return { err: 'Only the host can do that' };
        var tp = this.byId(a.pid);
        if (!tp || tp.bot) return { err: 'Pick a player' };
        var role = a.role || null;
        if (role !== null && ['president', 'vp', 'citizen', 'va', 'asshole'].indexOf(role) < 0) return { err: 'Bad title' };
        if (role === 'citizen') role = null;
        // President, VP, Vice Asshole and Asshole each belong to one person
        if (role) this.players.forEach(function (x) { if (x.role === role) x.role = null; });
        tp.role = role;
        this.emit();
        return { ok: true };
      }
      case 'play': return this.doPlay(p, a.cards);
      case 'pass': return this.doPass(p);
      case 'give': return this.doGive(p, a.cards);
      case 'next': {
        if (this.phase !== 'roundover') return { ok: true };   // someone else already dealt
        this.startRound();
        return { ok: true };
      }
      case 'finish': {
        if (!isHost || this.phase !== 'roundover') return { err: 'Only the host can do that' };
        this.phase = 'gameover';
        this.emit();
        return { ok: true };
      }
      case 'again': {
        if (!isHost || this.phase !== 'gameover') return { err: 'Only the host can do that' };
        this.players = this.players.filter(function (x) { return !x.bot; });
        this.players.forEach(function (x) { x.hand = []; x.tally = newTally(); x.role = null; });
        this.rolesMode = false;
        this.history = []; this.titles = {}; this.prevOrder = null; this.finishOrder = [];
        this.trick = null; this.passed = []; this.pending = []; this.round = 0;
        this.schedKey = null; this.turnEnd = null;
        this.phase = 'lobby';
        this.emit();
        return { ok: true };
      }
    }
    return { err: 'Unknown action' };
  };

  Game.prototype.removeHuman = function (t, kicked) {
    var token = t.token;
    if (this.phase === 'lobby') {
      this.players = this.players.filter(function (x) { return x.id !== t.id; });
    } else {
      t.bot = true; t.token = null; t.connected = true;
    }
    if (this.hostId === t.id) this.reassignHost();
    this.onKick(t.id, token, kicked);
    if (!this.humans().length) this.closed = true;
    this.emit();
  };

  Game.prototype.begin = function () {
    var humans = this.humans();
    var n = Math.max(this.size, humans.length);
    var used = {};
    humans.forEach(function (p) { used[p.name.toLowerCase()] = 1; });
    var pool = shuffle(BOT_NAMES.slice()).filter(function (x) { return !used[x.toLowerCase()]; });
    var bots = [];
    for (var i = 0; i < n - humans.length; i++) {
      bots.push({ id: this.nextId++, name: pool[i] || ('Bot ' + (i + 1)), bot: true, token: null, connected: true, hand: [], tally: newTally() });
    }
    this.players = shuffle(humans.concat(bots));
    this.n = n;
    this.round = 0;
    this.history = [];
    this.titles = {};
    this.prevOrder = null;
    if (this.rolesMode) this.seedRoles();
    this.startRound();
  };

  // The titles that must be held for the card hand-downs to work: all four from 7 players up, else President and Asshole.
  Game.prototype.neededRoles = function () {
    var n = Math.max(this.size, this.humans().length);
    return n >= VICE_FROM ? ['president', 'vp', 'va', 'asshole'] : ['president', 'asshole'];
  };

  // null when the chosen titles can start a game; bots take any title nobody picked
  Game.prototype.rolesProblem = function () {
    var n = Math.max(this.size, this.humans().length), need = this.neededRoles(), humans = this.humans();
    var held = humans.filter(function (p) { return p.role; });
    if (n < VICE_FROM && held.some(function (p) { return p.role === 'vp' || p.role === 'va'; })) return 'The vice titles only apply from ' + VICE_FROM + ' players';
    var open = need.filter(function (r) { return !held.some(function (p) { return p.role === r; }); });
    if (open.length > n - humans.length) return 'Give out every title first (bots can take the ones left)';
    return null;
  };

  // Turns the picked titles into last round's finishing order, so round one starts with the hand-downs.
  Game.prototype.seedRoles = function () {
    var need = this.neededRoles(), self = this;
    var role = {};
    this.players.forEach(function (p) { if (!p.bot && p.role && need.indexOf(p.role) >= 0) role[p.role] = p; });
    var free = shuffle(this.players.filter(function (p) { return p.bot; }));
    need.forEach(function (r) { if (!role[r]) role[r] = free.pop(); });
    var used = {};
    need.forEach(function (r) { used[role[r].id] = 1; });
    var mid = shuffle(this.players.filter(function (p) { return !used[p.id]; })).map(function (p) { return p.id; });
    var order = [role.president.id];
    if (need.length === 4) order.push(role.vp.id);
    order = order.concat(mid);
    if (need.length === 4) order.push(role.va.id);
    order.push(role.asshole.id);
    var titles = titlesFor(this.n);
    this.prevOrder = order;
    order.forEach(function (pid, i) { self.titles[pid] = titles[i]; });
    this.players.forEach(function (p) { p.role = null; });
  };

  Game.prototype.startRound = function () {
    var n = this.n, d = shuffle(newDeck());
    this.players.forEach(function (p) { p.hand = []; });
    for (var k = 0; k < d.length; k++) this.players[k % n].hand.push(d[k]);
    this.players.forEach(function (p) { p.hand = sortHand(p.hand); });
    this.round++;
    this.trick = null; this.passed = []; this.lastPid = null; this.trickWinner = null; this.trickEndRound = false;
    this.finishOrder = []; this.pending = [];
    var self = this;
    if (this.prevOrder) {
      var order = this.prevOrder, k1 = n >= 4 ? 2 : 1;
      var pairs = [{ hi: order[0], lo: order[n - 1], k: k1 }];
      if (n >= VICE_FROM) pairs.push({ hi: order[1], lo: order[n - 2], k: 1 });
      pairs.forEach(function (pr) {
        var hi = self.byId(pr.hi), lo = self.byId(pr.lo);
        var best = sortHand(lo.hand).slice(-pr.k);   // the lowest title hands over its best cards, no choice
        lo.hand = lo.hand.filter(function (c) { return best.indexOf(c) < 0; });
        hi.hand = sortHand(hi.hand.concat(best));
        self.pushChat(null, '', lo.name + ' (' + TITLE[self.titles[lo.id]] + ') had to give ' + hi.name + ' ' + best.map(cardLabel).join(' '), true);
        pr.done = false;
        if (hi.bot) self.giveBack(hi, lo, pr, Bot.give(hi.hand, pr.k));
        else self.pending.push(pr);
      });
      if (this.pending.length) {
        this.phase = 'exchange';
        this.emit();
        return;
      }
    }
    this.beginPlay();
  };

  Game.prototype.giveBack = function (hi, lo, pr, cards) {
    hi.hand = hi.hand.filter(function (c) { return cards.indexOf(c) < 0; });
    lo.hand = sortHand(lo.hand.concat(cards));
    pr.done = true;
    this.pushChat(null, '', hi.name + ' (' + TITLE[this.titles[hi.id]] + ') handed ' + cards.length + (cards.length === 1 ? ' card' : ' cards') + ' down to ' + lo.name, true);
  };

  Game.prototype.beginPlay = function () {
    var n = this.n, idx = 0, i;
    if (this.prevOrder) idx = this.idxOf(this.prevOrder[n - 1]);       // the Asshole leads
    else for (i = 0; i < n; i++) if (this.players[i].hand.indexOf('C3') >= 0) idx = i;   // first round: the 3 of clubs
    this.turnIdx = idx;
    this.phase = 'playing';
    this.emit();
  };

  Game.prototype.doGive = function (p, cards) {
    if (this.phase !== 'exchange') return { err: 'Not now' };
    var pr = this.pending.filter(function (x) { return x.hi === p.id && !x.done; })[0];
    if (!pr) return { err: 'Not now' };
    if (!Array.isArray(cards) || cards.length !== pr.k) return { err: 'Pick ' + pr.k + (pr.k === 1 ? ' card' : ' cards') + ' to give' };
    var seen = {};
    for (var i = 0; i < cards.length; i++) {
      if (typeof cards[i] !== 'string' || seen[cards[i]] || p.hand.indexOf(cards[i]) < 0) return { err: 'You do not hold that card' };
      seen[cards[i]] = 1;
    }
    this.giveBack(p, this.byId(pr.lo), pr, cards);
    if (this.pending.every(function (x) { return x.done; })) this.beginPlay();
    else this.emit();
    return { ok: true };
  };

  // next seat (after `from`) that still holds cards and has not passed this lap
  Game.prototype.nextActive = function (from, skipPid) {
    for (var i = 1; i < this.n; i++) {
      var idx = (from + i) % this.n, pl = this.players[idx];
      if (pl.hand.length && this.passed.indexOf(pl.id) < 0 && pl.id !== skipPid) return idx;
    }
    return -1;
  };
  Game.prototype.nextWithCards = function (from) {
    for (var i = 1; i <= this.n; i++) {
      var idx = (from + i) % this.n;
      if (this.players[idx].hand.length) return idx;
    }
    return from;
  };

  Game.prototype.doPlay = function (p, cards) {
    if (this.phase !== 'playing' || this.players[this.turnIdx].id !== p.id) return { err: 'Not your turn' };
    if (!Array.isArray(cards) || !cards.length) return { err: 'Pick a card first' };
    var seen = {};
    for (var i = 0; i < cards.length; i++) {
      if (typeof cards[i] !== 'string' || seen[cards[i]] || p.hand.indexOf(cards[i]) < 0) return { err: 'You do not hold that card' };
      seen[cards[i]] = 1;
    }
    var bad = playError(cards, this.trick);
    if (bad) return { err: bad };
    p.hand = p.hand.filter(function (c) { return cards.indexOf(c) < 0; });
    var rank = rankOf(cards[0]);
    if (!this.trick) this.trick = { count: cards.length, rank: rank, plays: [], lead: p.id };
    this.trick.rank = rank;
    this.trick.plays.push({ pid: p.id, cards: sortHand(cards) });
    if (this.trick.plays.length > 6) this.trick.plays.shift();
    this.lastPid = p.id;
    this.passed = [];
    if (!p.hand.length) {
      this.finishOrder.push(p.id);
      var t = titlesFor(this.n)[this.finishOrder.length - 1];
      this.pushChat(null, '', p.name + ' is out: ' + (this.finishOrder.length === this.n ? 'last' : TITLE[t]), true);
    }
    var remaining = this.players.filter(function (x) { return x.hand.length > 0; });
    if (remaining.length <= 1) {
      if (remaining.length === 1) this.finishOrder.push(remaining[0].id);
      return this.holdTrick(p.id, true);
    }
    var next = rank === TWO ? -1 : this.nextActive(this.turnIdx, null);
    if (next < 0) return this.holdTrick(p.id, false);
    this.turnIdx = next;
    this.emit();
    return { ok: true };
  };

  Game.prototype.doPass = function (p) {
    if (this.phase !== 'playing' || this.players[this.turnIdx].id !== p.id) return { err: 'Not your turn' };
    if (!this.trick) return { err: 'You have to lead' };
    this.passed.push(p.id);
    var next = this.nextActive(this.turnIdx, this.lastPid);
    if (next < 0) return this.holdTrick(this.lastPid, false);
    this.turnIdx = next;
    this.emit();
    return { ok: true };
  };

  // The trick is over: show it for a moment, then the winner leads (or the round ends).
  Game.prototype.holdTrick = function (winnerPid, roundOver) {
    this.phase = 'trickdone';
    this.trickWinner = winnerPid;
    this.trickEndRound = roundOver;
    this.emit();
    var self = this;
    clearTimeout(this.ttimer);
    this.ttimer = setTimeout(function () { self.afterTrick(); }, this.fast ? 1 : (roundOver ? 2600 : 1500));
    return { ok: true };
  };

  Game.prototype.afterTrick = function () {
    if (this.phase !== 'trickdone') return;
    if (this.trickEndRound) { this.endRound(); return; }
    var wi = this.idxOf(this.trickWinner);
    this.turnIdx = this.players[wi].hand.length ? wi : this.nextWithCards(wi);
    this.trick = null; this.passed = []; this.trickWinner = null; this.lastPid = null;
    this.phase = 'playing';
    this.emit();
  };

  Game.prototype.endRound = function () {
    var self = this, titles = titlesFor(this.n);
    this.titles = {};
    this.finishOrder.forEach(function (pid, i) {
      var p = self.byId(pid);
      self.titles[pid] = titles[i];
      p.tally[titles[i] === 'citizen' ? 'citizen' : titles[i]]++;
      p.tally.rounds++;
    });
    this.history.push({ round: this.round, order: this.finishOrder.slice(), titles: titles.slice() });
    if (this.history.length > 30) this.history.shift();
    this.prevOrder = this.finishOrder.slice();
    this.trick = null; this.passed = []; this.trickWinner = null; this.lastPid = null; this.trickEndRound = false;
    this.phase = 'roundover';
    this.emit();
  };

  // Arms one timer per turn (or per hand-down). Chat, renames etc. call emit() too, so the timer is only
  // re-armed when the thing being waited on changes.
  Game.prototype.schedule = function () {
    var cur = null, key = null;
    if (this.phase === 'playing') {
      cur = this.players[this.turnIdx];
      key = ['p', this.round, this.turnIdx, this.trick ? this.trick.plays.length : 0, this.passed.length, cur.id, cur.bot ? 1 : 0, cur.connected ? 1 : 0, this.timerSec].join('|');
    } else if (this.phase === 'exchange') {
      var pr = this.pending.filter(function (x) { return !x.done; })[0];
      cur = pr ? this.byId(pr.hi) : null;
      if (cur) key = ['x', this.round, cur.id, cur.connected ? 1 : 0, this.timerSec].join('|');
    }
    if (!cur) {
      clearTimeout(this.timer); this.timer = null; this.schedKey = null; this.turnEnd = null;
      return;
    }
    if (key === this.schedKey && this.timer) return;
    clearTimeout(this.timer); this.timer = null;
    this.schedKey = key; this.turnEnd = null;
    var delay, timed = false;
    if (cur.bot) delay = this.fast ? 1 : 700 + rnd(600);
    else if (!cur.connected) delay = this.fast ? 1 : (this.autoMs || 25000);
    else if (this.timerSec) { delay = this.timerSec * 1000 * this.timerScale; timed = true; }
    else return;
    if (timed) this.turnEnd = Date.now() + delay;
    var self = this;
    this.timer = setTimeout(function () {
      self.timer = null; self.schedKey = null;
      if (timed && !cur.bot) self.pushChat(null, '', 'Time’s up for ' + cur.name + ': played automatically', true);
      self.botAct(cur.id);
    }, delay);
  };

  Game.prototype.botAct = function (pid) {
    var cur = this.byId(pid);
    if (!cur) return;
    var level = cur.bot ? this.botLevel : 'medium';   // a human who ran out of time (or is away) is played for at Medium
    if (this.phase === 'exchange') {
      var pr = this.pending.filter(function (x) { return x.hi === pid && !x.done; })[0];
      if (pr) this.doGive(cur, Bot.give(cur.hand, pr.k));
      return;
    }
    if (this.phase !== 'playing' || this.players[this.turnIdx].id !== pid) return;
    var minOpp = 99;
    this.players.forEach(function (x) { if (x.id !== pid && x.hand.length && x.hand.length < minOpp) minOpp = x.hand.length; });
    var mv = Bot.play(cur.hand, this.trick, level, { minOpp: minOpp });
    if (mv) this.doPlay(cur, mv); else this.doPass(cur);
  };

  Game.prototype.destroy = function () {
    clearTimeout(this.timer); clearTimeout(this.ttimer);
  };

  // The night's verdict: most Asshole rounds is the Asshole of the night (fewest Presidencies breaks a tie).
  Game.prototype.verdict = function () {
    var ps = this.players.filter(function (p) { return p.tally.rounds > 0; });
    if (!ps.length) return { asshole: [], president: [] };
    var maxA = Math.max.apply(null, ps.map(function (p) { return p.tally.asshole; }));
    var cand = ps.filter(function (p) { return p.tally.asshole === maxA; });
    var minP = Math.min.apply(null, cand.map(function (p) { return p.tally.president; }));
    var maxP = Math.max.apply(null, ps.map(function (p) { return p.tally.president; }));
    return {
      asshole: cand.filter(function (p) { return p.tally.president === minP; }).map(function (p) { return p.id; }),
      president: ps.filter(function (p) { return p.tally.president === maxP; }).map(function (p) { return p.id; })
    };
  };

  Game.prototype.snapshot = function (pid) {
    var me = this.byId(pid);
    var inGame = this.phase !== 'lobby';
    var humans = this.humans();
    var n = inGame ? this.n : Math.max(this.size, humans.length);
    var self = this;
    var turn = this.phase === 'playing' && this.players[this.turnIdx] ? this.players[this.turnIdx].id : null;
    var give = null;
    if (me && this.phase === 'exchange') {
      var pr = this.pending.filter(function (x) { return x.hi === pid && !x.done; })[0];
      if (pr) give = { k: pr.k, to: pr.lo };
    }
    var s = {
      code: this.code, phase: this.phase, me: pid, host: this.hostId,
      size: this.size, n: n, round: this.round,
      botCount: inGame ? this.players.filter(function (p) { return p.bot; }).length : n - humans.length,
      players: this.players.map(function (p) {
        var fo = self.finishOrder.indexOf(p.id);
        return {
          id: p.id, name: p.name, bot: p.bot, connected: p.connected, cards: p.hand.length,
          title: self.titles[p.id] || null, out: fo >= 0 ? fo + 1 : null,
          passed: self.passed.indexOf(p.id) >= 0, tally: p.tally, role: p.role || null
        };
      }),
      rolesMode: this.rolesMode, rolesNeed: this.neededRoles(),
      turn: turn, trick: this.trick ? { count: this.trick.count, rank: this.trick.rank, plays: this.trick.plays, lead: this.trick.lead } : null,
      lastPid: this.lastPid, trickWinner: this.trickWinner, roundEnds: this.trickEndRound,
      order: this.phase === 'roundover' || this.phase === 'gameover' ? this.prevOrder : null,
      history: this.history.slice(-8),
      hand: me && inGame ? me.hand : [], give: give,
      pending: this.phase === 'exchange' ? this.pending.filter(function (x) { return !x.done; }).map(function (x) { return { hi: x.hi, lo: x.lo, k: x.k }; }) : [],
      verdict: this.phase === 'gameover' ? this.verdict() : null,
      timerSec: this.timerSec, botLevel: this.botLevel, seq: this.seq,
      turnLeft: this.turnEnd && (this.phase === 'playing' || this.phase === 'exchange') ? Math.max(0, this.turnEnd - Date.now()) : null,
      chat: this.chat.slice(-50)
    };
    return s;
  };

  return {
    Game: Game, Bot: Bot, SUITS: SUITS, SUIT_NAME: SUIT_NAME, SUIT_SYM: SUIT_SYM, TITLE: TITLE, TWO: TWO,
    suitOf: suitOf, rankOf: rankOf, rankLabel: rankLabel, cardLabel: cardLabel, sortHand: sortHand, playError: playError,
    titlesFor: titlesFor, VICE_FROM: VICE_FROM, newDeck: newDeck, shuffle: shuffle, cleanName: cleanName, groups: groups
  };
});
