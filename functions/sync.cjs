'use strict';
/* Live trade sync — the receiving end for platform add-ons (ATAS, Quantower).
 *
 * The add-on runs inside the trader's platform, which is already connected to
 * Rithmic / Tradovate, and posts each execution (fill) here. No broker password
 * ever reaches Fayna.
 *
 * Pairing: the web app creates a random key in the browser, stores only its
 * SHA-256 hash at syncDevices/{hash} (with the owner's uid), and shows the key
 * once. The add-on sends it as `Authorization: Bearer <key>`.
 *
 * Storage: users/{uid}/syncFills/{docId} — one document per execution, keyed by
 * source + account + fill id, so a fill sent twice (restart, two charts) is
 * stored once. The web app turns fills into journal trades.
 */
const { createHash } = require('node:crypto');

const MAX_FILLS = 500;
const SOURCES = new Set(['atas', 'quantower', 'ninjatrader', 'ibkr', 'tradovate', 'rithmic', 'test']);

const hashKey = key => createHash('sha256').update(String(key)).digest('hex');

function keyFromHeader(h) {
  const m = /^Bearer\s+([A-Za-z0-9_-]{32,128})$/.exec(String(h || '').trim());
  return m ? m[1] : null;
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const safeId = v => clean(v, 80).replace(/[^A-Za-z0-9._:-]/g, '_');

/* Returns { fill } or { error } for one raw execution from an add-on. */
function normalizeFill(raw, source) {
  if (!raw || typeof raw !== 'object') return { error: 'not_object' };
  const id = clean(raw.id, 80), account = clean(raw.account, 80), symbol = clean(raw.symbol, 40);
  const side = String(raw.side || '').toLowerCase();
  const qty = Number(raw.qty), price = Number(raw.price);
  const time = Date.parse(raw.time);
  if (!id) return { error: 'id' };
  if (!account) return { error: 'account' };
  if (!symbol) return { error: 'symbol' };
  if (side !== 'buy' && side !== 'sell') return { error: 'side' };
  if (!Number.isFinite(qty) || qty <= 0 || qty > 100000) return { error: 'qty' };
  if (!Number.isFinite(price) || price <= 0) return { error: 'price' };
  if (!Number.isFinite(time) || time < Date.UTC(2015, 0, 1) || time > Date.now() + 5 * 60e3) return { error: 'time' };
  const fill = { id, account, symbol, side, qty, price, time, source };
  const comm = Number(raw.commission);
  if (raw.commission != null && Number.isFinite(comm) && Math.abs(comm) < 100000) fill.commission = Math.abs(comm);
  const orderId = clean(raw.orderId, 80); if (orderId) fill.orderId = orderId;
  const exch = clean(raw.exchange, 20); if (exch) fill.exchange = exch;
  return { fill, docId: safeId(`${source}_${account}_${id}`) };
}

/* Pure request handling; `store` abstracts Firestore so it can be tested. */
async function handleIngest({ method, headers, body }, store, now = Date.now()) {
  if (method !== 'POST') return { status: 405, body: { error: 'method' } };
  const key = keyFromHeader(headers.authorization || headers.Authorization);
  if (!key) return { status: 401, body: { error: 'missing_key' } };
  const device = await store.getDevice(hashKey(key));
  if (!device || device.revoked === true || !device.uid) return { status: 401, body: { error: 'invalid_key' } };
  const source = String(body?.source || '').toLowerCase();
  if (!SOURCES.has(source)) return { status: 400, body: { error: 'source' } };
  const list = Array.isArray(body?.fills) ? body.fills : null;
  if (!list) return { status: 400, body: { error: 'fills' } };
  if (list.length > MAX_FILLS) return { status: 413, body: { error: 'too_many', max: MAX_FILLS } };
  const ok = [], rejected = [];
  const seen = new Set();
  list.forEach((raw, i) => {
    const r = normalizeFill(raw, source);
    if (r.error) rejected.push({ index: i, reason: r.error });
    else if (!seen.has(r.docId)) { seen.add(r.docId); ok.push(r); }
  });
  const written = ok.length ? await store.writeFills(device.uid, ok, now) : 0;
  await store.touchDevice(hashKey(key), { lastSeen: now, lastSource: source, lastCount: ok.length, version: clean(body?.version, 20) });
  return { status: 200, body: { accepted: ok.length, stored: written, rejected } };
}

/* Firestore-backed store. Fills are immutable: create-if-missing keeps the first copy. */
function firestoreStore(db, FieldValue) {
  return {
    async getDevice(hash) {
      const s = await db.doc(`syncDevices/${hash}`).get();
      return s.exists ? s.data() : null;
    },
    async writeFills(uid, items, now) {
      let stored = 0;
      for (let i = 0; i < items.length; i += 400) {
        const chunk = items.slice(i, i + 400);
        const refs = chunk.map(it => db.doc(`users/${uid}/syncFills/${it.docId}`));
        const snaps = await db.getAll(...refs);
        const batch = db.batch();
        snaps.forEach((s, j) => { if (!s.exists) { batch.create(refs[j], { ...chunk[j].fill, receivedAt: now }); stored++; } });
        await batch.commit();
      }
      return stored;
    },
    async touchDevice(hash, info) {
      await db.doc(`syncDevices/${hash}`).set({ ...info, fills: FieldValue.increment(info.lastCount || 0) }, { merge: true });
    },
  };
}

module.exports = { hashKey, keyFromHeader, normalizeFill, handleIngest, firestoreStore, MAX_FILLS };
