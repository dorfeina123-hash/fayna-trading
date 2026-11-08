const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const tv = require('./tradovate.cjs');
const { seal, open } = require('./gmail.cjs');

const KEY = randomBytes(32).toString('base64');
const env = { TRADOVATE_CLIENT_ID: 'cid', TRADOVATE_CLIENT_SECRET: 'sec', SYNC_TOKEN_KEY: KEY };
const T0 = Date.UTC(2026, 10, 8, 15);

function memStore() {
  const m = new Map();
  return { m, async get(u) { return m.get(u) || null; }, async set(u, v) { m.set(u, { ...v }); }, async update(u, v) { m.set(u, { ...(m.get(u) || {}), ...v }); }, async remove(u) { m.delete(u); }, async all() { return [...m].map(([uid, v]) => ({ uid, ...v })); } };
}
function fillStore() { const rows = new Map(); return { rows, async writeFills(uid, items) { let n = 0; items.forEach(i => { if (!rows.has(i.docId)) { rows.set(i.docId, i.fill); n++; } }); return n; } }; }
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
function fakeApi(calls, opts = {}) {
  return async (url, init) => {
    calls.push(url);
    if (url.endsWith('/auth/oauthtoken')) { assert.match(init.headers.Authorization, /^Basic /); assert.match(init.body, /grant_type=authorization_code/); return json({ access_token: 'AT', expires_in: 4800 }); }
    if (url.includes('renewAccessToken')) return opts.renewFails ? json({}, 401) : json({ accessToken: 'AT2', expirationTime: new Date(T0 + 80 * 60e3).toISOString() });
    if (url.endsWith('/v1/fill/list')) return json([
      { id: 11, orderId: 5, contractId: 9, timestamp: new Date(T0 - 60e3).toISOString(), action: 'Buy', qty: 2, price: 21000.25, active: true },
      { id: 12, orderId: 6, contractId: 9, timestamp: new Date(T0 - 30e3).toISOString(), action: 'Sell', qty: 2, price: 21010.5, active: true },
    ]);
    if (url.includes('/v1/order/items')) return json([{ id: 5, accountId: 77 }, { id: 6, accountId: 77 }]);
    if (url.includes('/v1/contract/items')) return json([{ id: 9, name: 'MNQZ6' }]);
    if (url.includes('/v1/fillFee/items')) return json([{ id: 11, commission: 0.5, exchangeFee: 0.37 }]);
    if (url.endsWith('/v1/account/list')) return json([{ id: 77, name: 'APEX-1234-01' }]);
    return json({}, 404);
  };
}

test('unconfigured server shows nothing and stores nothing', async () => {
  const out = await tv.handleAction({ method: 'POST', headers: {}, body: { action: 'status' } }, { cfg: tv.config({}), now: T0 });
  assert.deepEqual(out.body, { configured: false });
});

test('state is bound to the user, signed and short-lived', () => {
  const s = tv.signState('user-1', KEY, T0);
  assert.equal(tv.readState(s, KEY, T0 + 60e3), 'user-1');
  assert.equal(tv.readState(s, KEY, T0 + 11 * 60e3), null);
  assert.equal(tv.readState(s.replace(/.$/, c => (c === 'A' ? 'B' : 'A')), KEY, T0), null);
  assert.equal(tv.readState(s, randomBytes(32).toString('base64'), T0), null);
  const url = new URL(tv.authorizeUrl(tv.config(env), s));
  assert.equal(url.origin + url.pathname, 'https://trader.tradovate.com/oauth');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), s);
});

test('callback exchanges the code, stores an encrypted token and pulls fills', async () => {
  const calls = [], store = memStore(), fills = fillStore();
  const deps = { cfg: tv.config(env), fetch: fakeApi(calls), store, fillStore: fills, now: T0 };
  const back = await tv.handleCallback({ code: 'C', state: tv.signState('u1', KEY, T0) }, deps);
  assert.match(back, /\?tradovate=connected$/);
  const link = store.m.get('u1');
  assert.ok(!JSON.stringify(link).includes('"AT"'));
  assert.equal(JSON.parse(open(link.box, KEY)).token, 'AT');
  assert.equal(fills.rows.size, 2);
  const buy = fills.rows.get('tradovate_APEX-1234-01_11');
  assert.deepEqual({ side: buy.side, qty: buy.qty, symbol: buy.symbol, commission: buy.commission, source: buy.source }, { side: 'buy', qty: 2, symbol: 'MNQZ6', commission: 0.87, source: 'tradovate' });
  assert.deepEqual(link.accounts, ['APEX-1234-01']);
  assert.match(await tv.handleCallback({ code: 'C', state: 'bad' }, deps), /failed$/);
});

test('sync is idempotent, renews close-to-expiry tokens and asks to reconnect when lapsed', async () => {
  const store = memStore(), fills = fillStore(), calls = [];
  await store.set('u1', { box: seal(JSON.stringify({ token: 'AT', expiresAt: T0 + 10 * 60e3 }), KEY) });
  const deps = { cfg: tv.config(env), fetch: fakeApi(calls), store, fillStore: fills, now: T0 };
  const r1 = await tv.syncUser('u1', await store.get('u1'), deps, T0);
  assert.equal(r1.stored, 2);
  assert.ok(calls.some(u => u.includes('renewAccessToken')));
  assert.equal(JSON.parse(open(store.m.get('u1').box, KEY)).token, 'AT2');
  const r2 = await tv.syncUser('u1', await store.get('u1'), deps, T0 + 5 * 60e3);
  assert.equal(r2.stored, 0); assert.equal(r2.found, 2);

  await store.set('u2', { box: seal(JSON.stringify({ token: 'old', expiresAt: T0 - 1 }), KEY) });
  const lapsed = { ...deps, fetch: fakeApi([], { renewFails: true }) };
  await assert.rejects(tv.syncUser('u2', await store.get('u2'), lapsed, T0), { code: 'reauth' });
  assert.equal(store.m.get('u2').needsReauth, true);
});

test('actions require a signed-in user and respect the rate limit', async () => {
  const store = memStore();
  const deps = { cfg: tv.config(env), now: T0, store, verifyIdToken: async t => { if (t !== 'good') throw new Error('x'); return { uid: 'u1' }; } };
  assert.equal((await tv.handleAction({ method: 'POST', headers: {}, body: { action: 'status' } }, deps)).status, 401);
  const st = await tv.handleAction({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { action: 'status' } }, deps);
  assert.deepEqual(st.body, { configured: true, connected: false });
  const start = await tv.handleAction({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { action: 'start' } }, deps);
  assert.equal(tv.readState(new URL(start.body.url).searchParams.get('state'), KEY, T0), 'u1');
  await store.set('u1', { box: 'x', lastSync: T0 - 30e3 });
  const sync = await tv.handleAction({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { action: 'sync' } }, deps);
  assert.equal(sync.body.skipped, 'recent');
});
