const test = require('node:test');
const assert = require('node:assert/strict');
const sync = require('./sync.cjs');

const KEY = 'k'.repeat(40);
function memStore(devices = {}) {
  const fills = new Map(), touched = [];
  return {
    fills, touched,
    getDevice: async h => devices[h] || null,
    writeFills: async (uid, items) => { let n = 0; for (const it of items) { const p = `users/${uid}/syncFills/${it.docId}`; if (!fills.has(p)) { fills.set(p, it.fill); n++; } } return n; },
    touchDevice: async (h, info) => touched.push({ h, info }),
  };
}
const good = (o = {}) => ({ id: 'F1', orderId: 'O1', account: 'BX50K-123', symbol: 'MNQZ5', side: 'Buy', qty: 2, price: 21000.25, time: '2026-11-03T15:30:01Z', commission: -1.24, ...o });
const req = (body, key = KEY) => ({ method: 'POST', headers: { authorization: 'Bearer ' + key }, body });

test('rejects missing, unknown and revoked keys', async () => {
  const s = memStore({ [sync.hashKey('r'.repeat(40))]: { uid: 'u1', revoked: true } });
  assert.equal((await sync.handleIngest({ method: 'POST', headers: {}, body: {} }, s)).status, 401);
  assert.equal((await sync.handleIngest(req({ source: 'atas', fills: [] }), s)).status, 401);
  assert.equal((await sync.handleIngest(req({ source: 'atas', fills: [] }, 'r'.repeat(40)), s)).status, 401);
  assert.equal((await sync.handleIngest({ method: 'GET', headers: {}, body: {} }, s)).status, 405);
});

test('stores valid fills under the key owner, once', async () => {
  const s = memStore({ [sync.hashKey(KEY)]: { uid: 'alice' } });
  const r1 = await sync.handleIngest(req({ source: 'atas', fills: [good(), good(), good({ id: 'F2', side: 'sell' })] }), s);
  assert.equal(r1.status, 200);
  assert.deepEqual([r1.body.accepted, r1.body.stored], [2, 2]);
  const r2 = await sync.handleIngest(req({ source: 'atas', fills: [good()] }), s);
  assert.equal(r2.body.stored, 0, 'resent fill is not stored twice');
  const f = s.fills.get('users/alice/syncFills/atas_BX50K-123_F1');
  assert.equal(f.side, 'buy'); assert.equal(f.commission, 1.24); assert.equal(f.time, Date.parse('2026-11-03T15:30:01Z'));
  assert.equal(s.touched.length, 2);
});

test('validates every field and reports rejects by index', async () => {
  const s = memStore({ [sync.hashKey(KEY)]: { uid: 'alice' } });
  const bad = [good({ id: '' }), good({ side: 'x' }), good({ qty: 0 }), good({ price: -1 }), good({ time: 'nope' }), good({ symbol: '' }), good({ account: '' }), 'str'];
  const r = await sync.handleIngest(req({ source: 'atas', fills: bad }), s);
  assert.equal(r.body.accepted, 0);
  assert.deepEqual(r.body.rejected.map(x => x.reason), ['id', 'side', 'qty', 'price', 'time', 'symbol', 'account', 'not_object']);
});

test('limits source, size and doc ids', async () => {
  const s = memStore({ [sync.hashKey(KEY)]: { uid: 'alice' } });
  assert.equal((await sync.handleIngest(req({ source: 'evil', fills: [] }), s)).status, 400);
  assert.equal((await sync.handleIngest(req({ source: 'atas', fills: Array(501).fill(good()) }), s)).status, 413);
  const n = sync.normalizeFill(good({ id: '../../x/y', account: 'a/b' }), 'atas');
  assert.ok(!n.docId.includes('/'));
  assert.equal(sync.keyFromHeader('Bearer short'), null);
});
