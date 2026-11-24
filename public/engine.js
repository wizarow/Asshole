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
  // From 6 players the Vice President and Vice Asshole join in.
  var VICE_FROM = 6;
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
      // a 2 is the highest card but it does not end the trick: another 2 can still go on top of it
      if (r <= trick.rank && !(r === TWO && trick.rank === TWO)) return 'Play higher than ' + rankLabel(trick.rank);
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
      var opts = ranks.filter(function (r) { return (r > trick.rank || (r === TWO && trick.rank === TWO)) && g[r].length >= trick.count; });
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
    // What a President or Vice President hands down: their k lowest cards.
    give: function (hand, k) { return sortHand(hand).slice(0, k); },
    // What an Asshole or Vice Asshole hands up: their k best cards.
    best: function (hand, k) { return sortHand(hand).slice(-k); }
  };

  // null when `cards` are a legal hand-down. The Asshole side has to give the k highest cards it holds,
  // the President side may only give its k lowest (ties in rank can go in any suit).
  function exchangeError(hand, cards, k, mode) {
    if (!Array.isArray(cards) || cards.length !== k) return 'Pick ' + k + (k === 1 ? ' card' : ' cards') + ' to give';
    var seen = {}, i;
    for (i = 0; i < cards.length; i++) {
      if (typeof cards[i] !== 'string' || seen[cards[i]] || hand.indexOf(cards[i]) < 0) return 'You do not hold that card';
      seen[cards[i]] = 1;
    }
    var dir = mode === 'best' ? function (a, b) { return b - a; } : function (a, b) { return a - b; };
    var want = hand.map(rankOf).sort(dir).slice(0, k), got = cards.map(rankOf).sort(dir);
    for (i = 0; i < k; i++) {
      if (want[i] !== got[i]) {
        return mode === 'best'
          ? 'You have to give your ' + (k === 1 ? 'highest card' : k + ' highest cards')
          : 'You can only give your ' + (k === 1 ? 'lowest card' : k + ' lowest cards');
      }
    }
    return null;
  }

  function Game(code, opts) {
    opts = opts || {};
    this.code = code;
    this.fast = !!opts.fast;
    this.players = [];
    this.size = 5;
    this.phase = 'lobby';       // lobby | exchange | xdone | playing | trickdone | roundover | gameover
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
    this.pending = [];          // this round's card swaps: { hi, lo, k, hiGive, loGive, done }
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
      case 'go': {
        if (this.phase !== 'xdone') return { ok: true };   // someone else already carried on
        clearTimeout(this.ttimer);
        this.beginPlay();
        return { ok: true };
      }
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
      if (this.phase === 'exchange') { this.autoBotSides(); this.settleExchange(); }
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
      // Asshole and President swap 3 cards and the vices swap 2 once there are vice titles (6+ players);
      // with 4 or 5 players it is just the President and Asshole swapping 2, with 3 players 1
      var order = this.prevOrder, k1 = n >= VICE_FROM ? 3 : (n >= 4 ? 2 : 1);
      var pairs = [{ hi: order[0], lo: order[n - 1], k: k1 }];
      if (n >= VICE_FROM) pairs.push({ hi: order[1], lo: order[n - 2], k: 2 });
      pairs.forEach(function (pr) { pr.hiGive = null; pr.loGive = null; pr.done = false; });
      this.pending = pairs;
      this.phase = 'exchange';
      this.autoBotSides();
      this.settleExchange();
      this.emit();
      return;
    }
    this.beginPlay();
  };

  // Bots hand over their cards at once: the lowest titles their best, the highest titles their worst.
  Game.prototype.autoBotSides = function () {
    var self = this;
    this.pending.forEach(function (pr) {
      if (pr.done) return;
      var hi = self.byId(pr.hi), lo = self.byId(pr.lo);
      if (hi.bot && !pr.hiGive) pr.hiGive = Bot.give(hi.hand, pr.k);
      if (lo.bot && !pr.loGive) pr.loGive = Bot.best(lo.hand, pr.k);
      self.swapIfReady(pr);
    });
  };

  Game.prototype.swapIfReady = function (pr) {
    if (pr.done || !pr.hiGive || !pr.loGive) return;
    var hi = this.byId(pr.hi), lo = this.byId(pr.lo), a = pr.hiGive, b = pr.loGive;
    hi.hand = sortHand(hi.hand.filter(function (c) { return a.indexOf(c) < 0; }).concat(b));
    lo.hand = sortHand(lo.hand.filter(function (c) { return b.indexOf(c) < 0; }).concat(a));
    pr.done = true;
    this.pushChat(null, '', hi.name + ' (' + TITLE[this.titles[hi.id]] + ') and ' + lo.name + ' (' + TITLE[this.titles[lo.id]] + ') swapped ' + pr.k + (pr.k === 1 ? ' card' : ' cards'), true);
  };

  // Once every swap is done the table pauses on the result so each side can see what they gave and got.
  Game.prototype.settleExchange = function () {
    if (this.phase !== 'exchange' || !this.pending.every(function (x) { return x.done; })) return;
    this.phase = 'xdone';
    var self = this;
    clearTimeout(this.ttimer);
    this.ttimer = setTimeout(function () { if (self.phase === 'xdone') self.beginPlay(); }, this.fast ? 1 : 10000);
  };

  Game.prototype.exchangeWaiting = function () {
    var w = [], self = this;
    this.pending.forEach(function (pr) {
      if (pr.done) return;
      var hi = self.byId(pr.hi), lo = self.byId(pr.lo);
      if (!hi.bot && !pr.hiGive) w.push({ pr: pr, side: 'hi', p: hi });
      if (!lo.bot && !pr.loGive) w.push({ pr: pr, side: 'lo', p: lo });
    });
    return w;
  };

  // A human who is away (or ran out of time) is handed the legal choice automatically.
  Game.prototype.autoExchange = function (everyone) {
    var self = this;
    this.exchangeWaiting().forEach(function (x) {
      if (!everyone && x.p.connected) return;
      x.pr[x.side + 'Give'] = x.side === 'hi' ? Bot.give(x.p.hand, x.pr.k) : Bot.best(x.p.hand, x.pr.k);
      self.swapIfReady(x.pr);
    });
    this.settleExchange();
    this.emit();
  };

  Game.prototype.beginPlay = function () {
    var n = this.n, idx = 0, i;
    if (this.prevOrder) idx = this.idxOf(this.prevOrder[n - 1]);       // the Asshole leads
    else for (i = 0; i < n; i++) if (this.players[i].hand.indexOf('C3') >= 0) idx = i;   // first round: the 3 of clubs
    this.turnIdx = idx;
    this.phase = 'playing';
    this.emit();
  };

  // A President (or VP) picks their lowest cards to hand down, an Asshole (or VA) their best to hand up.
  Game.prototype.doGive = function (p, cards) {
    if (this.phase !== 'exchange') return { err: 'Not now' };
    var w = this.exchangeWaiting().filter(function (x) { return x.p.id === p.id; })[0];
    if (!w) return { err: 'Not now' };
    var bad = exchangeError(p.hand, cards, w.pr.k, w.side === 'hi' ? 'worst' : 'best');
    if (bad) return { err: bad };
    w.pr[w.side + 'Give'] = cards.slice();
    this.swapIfReady(w.pr);
    this.settleExchange();
    this.emit();
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
    var next = this.nextActive(this.turnIdx, null);   // a 2 does not win the trick: only everyone else passing does
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
    var cur = null, key = null, exAway = false;
    if (this.phase === 'playing') {
      cur = this.players[this.turnIdx];
      key = ['p', this.round, this.turnIdx, this.trick ? this.trick.plays.length : 0, this.passed.length, cur.id, cur.bot ? 1 : 0, cur.connected ? 1 : 0, this.timerSec].join('|');
    } else if (this.phase === 'exchange') {
      var waiting = this.exchangeWaiting();
      if (waiting.length) {
        cur = waiting[0].p;
        exAway = waiting.some(function (x) { return !x.p.connected; });
        key = ['x', this.round, waiting.map(function (x) { return x.p.id + (x.p.connected ? 'c' : 'd'); }).join(','), this.timerSec].join('|');
      }
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
    else if (!cur.connected || exAway) delay = this.fast ? 1 : (this.autoMs || 25000);
    else if (this.timerSec) { delay = this.timerSec * 1000 * this.timerScale; timed = true; }
    else return;
    if (timed) this.turnEnd = Date.now() + delay;
    var self = this, exchanging = this.phase === 'exchange';
    this.timer = setTimeout(function () {
      self.timer = null; self.schedKey = null;
      if (exchanging) {
        if (self.phase !== 'exchange') return;
        if (timed) self.pushChat(null, '', 'Time’s up: the card swap was done automatically', true);
        self.autoExchange(timed);
        return;
      }
      if (timed && !cur.bot) self.pushChat(null, '', 'Time’s up for ' + cur.name + ': played automatically', true);
      self.botAct(cur.id);
    }, delay);
  };

  Game.prototype.botAct = function (pid) {
    var cur = this.byId(pid);
    if (!cur) return;
    var level = cur.bot ? this.botLevel : 'medium';   // a human who ran out of time (or is away) is played for at Medium
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
    // the card swap, seen from this player: what they must give, and (once both sides are in) what they gave and got
    var xchg = null;
    if (this.phase === 'exchange' || this.phase === 'xdone') {
      var mine = null;
      this.pending.forEach(function (pr) {
        var side = pr.hi === pid ? 'hi' : pr.lo === pid ? 'lo' : null;
        if (!side) return;
        var my = side === 'hi' ? pr.hiGive : pr.loGive, other = side === 'hi' ? pr.loGive : pr.hiGive;
        mine = { side: side, k: pr.k, other: side === 'hi' ? pr.lo : pr.hi, mode: side === 'hi' ? 'worst' : 'best',
          submitted: !!my, gave: my || null, got: pr.done ? other : null, done: pr.done };
      });
      xchg = {
        done: this.phase === 'xdone', mine: mine,
        pairs: this.pending.map(function (pr) { return { hi: pr.hi, lo: pr.lo, k: pr.k, hiDone: !!pr.hiGive, loDone: !!pr.loGive, done: pr.done }; })
      };
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
      hand: me && inGame ? me.hand : [], xchg: xchg,
      verdict: this.phase === 'gameover' ? this.verdict() : null,
      timerSec: this.timerSec, botLevel: this.botLevel, seq: this.seq,
      turnLeft: this.turnEnd && (this.phase === 'playing' || this.phase === 'exchange') ? Math.max(0, this.turnEnd - Date.now()) : null,
      chat: this.chat.slice(-50)
    };
    return s;
  };

  return {
    Game: Game, Bot: Bot, SUITS: SUITS, SUIT_NAME: SUIT_NAME, SUIT_SYM: SUIT_SYM, TITLE: TITLE, TWO: TWO,
    suitOf: suitOf, rankOf: rankOf, rankLabel: rankLabel, cardLabel: cardLabel, sortHand: sortHand, playError: playError, exchangeError: exchangeError,
    titlesFor: titlesFor, VICE_FROM: VICE_FROM, newDeck: newDeck, shuffle: shuffle, cleanName: cleanName, groups: groups
  };
});
