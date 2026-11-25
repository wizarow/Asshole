'use strict';
// Starts the real server on a spare port and checks compression, caching and the room API end to end.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3150 + Math.floor(Math.random() * 200);
const BASE = 'http://127.0.0.1:' + PORT;
let passed = 0;
async function t(name, fn) { try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; } }
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), AH_FAST: '1' }), stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/health'); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }

  await t('page is served brotli, gzip or plain by what the browser accepts, and decodes to the real file', async () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    for (const [enc, want] of [['br', 'br'], ['gzip', 'gzip'], ['gzip, deflate, br', 'br'], ['identity', null]]) {
      const r = await fetch(BASE + '/', { headers: { 'Accept-Encoding': enc } });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.headers.get('content-encoding'), want, 'encoding for ' + enc);
      assert.match(r.headers.get('vary') || '', /Accept-Encoding/i);
      assert.strictEqual(await r.text(), html, 'body for ' + enc);
    }
  });

  await t('engine.js is compressed too and is javascript', async () => {
    const r = await fetch(BASE + '/engine.js', { headers: { 'Accept-Encoding': 'br' } });
    assert.strictEqual(r.headers.get('content-encoding'), 'br');
    assert.match(r.headers.get('content-type'), /javascript/);
    assert.match(await r.text(), /AEngine/);
  });

  await t('compressed size is a fraction of the raw size', async () => {
    const raw = fs.statSync(path.join(__dirname, '..', 'public', 'index.html')).size;
    const zlib = require('zlib');
    const br = zlib.brotliCompressSync(fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'))).length;
    assert.ok(br < raw * 0.4, 'brotli ' + br + ' vs ' + raw);
  });

  await t('repeat visits revalidate with the ETag and get a 304', async () => {
    const a = await fetch(BASE + '/');
    const etag = a.headers.get('etag');
    assert.ok(etag);
    assert.strictEqual(a.headers.get('cache-control'), 'no-cache');
    const b = await fetch(BASE + '/', { headers: { 'If-None-Match': etag } });
    assert.strictEqual(b.status, 304);
  });

  await t('unknown files are 404 and the API still answers', async () => {
    assert.strictEqual((await fetch(BASE + '/server.js')).status, 404);
    assert.strictEqual((await fetch(BASE + '/../package.json')).status, 404);
    const h = await (await fetch(BASE + '/health')).json();
    assert.strictEqual(h.ok, true);
  });

  await t('room flow: create, join, start with bots, state, act, rejoin, leave', async () => {
    const c = await post('/api/create', { name: 'Ann' });
    assert.ok(c.code && c.token);
    const j = await post('/api/join', { code: c.code, name: 'Bo' });
    assert.ok(j.token);
    assert.ok((await post('/api/join', { code: 'ZZZZ', name: 'X' })).err);
    assert.ok((await post('/api/act', { code: c.code, token: j.token, a: { type: 'start' } })).err, 'only the host starts');
    const s = await post('/api/act', { code: c.code, token: c.token, a: { type: 'start' } });
    assert.ok(s.ok && s.s.phase === 'playing');
    await new Promise(r => setTimeout(r, 400));
    const st = await (await fetch(BASE + '/api/state?code=' + c.code + '&token=' + c.token)).json();
    assert.ok(st.s && st.s.hand.length > 0);
    assert.ok(!JSON.stringify(st.s).includes(j.token), 'no tokens in state');
    assert.ok((await post('/api/rejoin', { code: c.code, token: c.token })).pid);
    assert.strictEqual((await fetch(BASE + '/api/state?code=' + c.code + '&token=nope')).status, 404);
    const lv = await post('/api/act', { code: c.code, token: j.token, a: { type: 'leave' } });
    assert.ok(lv.ok);
  });

  await t('live stream sends a first snapshot and a heartbeat-friendly header set', async () => {
    const c = await post('/api/create', { name: 'Cy' });
    const ctl = new AbortController();
    const r = await fetch(BASE + '/api/stream?code=' + c.code + '&token=' + c.token, { signal: ctl.signal });
    assert.match(r.headers.get('content-type'), /event-stream/);
    assert.ok(!r.headers.get('content-encoding'), 'the stream is never compressed');
    const reader = r.body.getReader();
    let text = '';
    while (!/data: \{/.test(text)) { const { value } = await reader.read(); text += Buffer.from(value).toString(); }
    assert.match(text, /"phase":"lobby"/);
    ctl.abort();
  });

  srv.kill();
  console.log(passed + ' passed' + (process.exitCode ? ', with failures' : ''));
  process.exit(process.exitCode || 0);
})();
