const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('./grow.cjs');
const DAY = 86400000;

const live = { FAYNA_BILLING_LIVE: 'true', GROW_USER_ID: 'u1', GROW_PAGE_CODE: 'p1', GROW_NOTIFY_KEY: 'k1', BILLING_TOKEN_KEY: 'x', GROW_NOTIFY_URL: 'https://example.test/growNotify' };

test('config is inert unless switched on with every secret', () => {
  assert.equal(g.ready(g.config({})), false);
  assert.equal(g.ready(g.config({ ...live, FAYNA_BILLING_LIVE: 'false' })), false);
  assert.equal(g.ready(g.config({ ...live, GROW_PAGE_CODE: '' })), false);
  assert.equal(g.ready(g.config(live)), true);
  assert.match(g.config(live).base, /^https:\/\/sandbox\.meshulam/);
  assert.match(g.config({ ...live, GROW_ENV: 'production' }).base, /^https:\/\/secure\.meshulam/);
});

test('payer details follow Grow rules', () => {
  assert.deepEqual(g.payer({ fullName: ' דור  פיינה ', phone: '+972-50-123-4567', email: 'a@b.co' }), { fullName: 'דור פיינה', phone: '0501234567', email: 'a@b.co' });
  assert.throws(() => g.payer({ fullName: 'דור', phone: '0501234567' }), { code: 'payer_name' });
  assert.throws(() => g.payer({ fullName: 'דור פיינה', phone: '031234567' }), { code: 'payer_phone' });
  assert.equal(g.payer({ fullName: 'Dor Fayna', phone: '0521234567', email: 'bad' }).email, '');
});

test('checkout saves a token, carries uid/checkout id and the secret notify url', () => {
  const cfg = g.config(live);
  const f = g.checkoutFields(cfg, { uid: 'U', checkoutId: 'C', plan: 'single', planLabel: 'Fayna One', who: { fullName: 'Dor Fayna', phone: '0501234567', email: '' } });
  assert.equal(f.saveCardToken, 1); assert.equal(f.cField1, 'U'); assert.equal(f.cField2, 'C');
  assert.equal(f.notifyUrl, 'https://example.test/growNotify?k=k1');
  assert.match(f.successUrl, /\?billing=success$/);
  assert.equal(f.sum, '1.00');
});

test('callback parsing accepts nested and flat form bodies', () => {
  const nested = g.parseNotify({ status: '1', data: { processId: '7', processToken: 't', statusCode: '2', customFields: { cField1: 'U', cField2: 'C' } } });
  const flat = g.parseNotify({ status: '1', 'data[processId]': '7', 'data[processToken]': 't', 'data[statusCode]': '2', 'data[customFields][cField1]': 'U', 'data[customFields][cField2]': 'C' });
  assert.deepEqual(nested, flat);
  assert.equal(flat.uid, 'U'); assert.equal(flat.checkoutId, 'C');
});

test('process facts read the token from the documented shapes', () => {
  assert.equal(g.processFacts({ cardToken: 'T', statusCode: '11', cardSuffix: '1234' }).cardToken, 'T');
  assert.equal(g.processFacts({ transactions: [{ cardToken: 'T2', statusCode: '2', customFields: { cField1: 'U' } }] }).uid, 'U');
});

test('month arithmetic clamps to the last day', () => {
  assert.equal(new Date(g.addMonth(Date.UTC(2026, 0, 31))).toISOString().slice(0, 10), '2026-02-28');
  assert.equal(new Date(g.addMonth(Date.UTC(2026, 10, 8))).toISOString().slice(0, 10), '2026-12-08');
});

test('trial → first charge → renewal → failures → expiry', () => {
  const t0 = Date.UTC(2026, 10, 8);
  let s = g.startTrial('single', t0, 'v');
  assert.equal(s.trialEndsAt, t0 + 14 * DAY); assert.equal(g.due(s, t0 + DAY), false); assert.equal(g.due(s, t0 + 14 * DAY), true);
  s = g.afterCharge(s, t0 + 14 * DAY, true);
  assert.equal(s.status, 'active'); assert.equal(s.plan, 'single'); assert.equal(s.period, 1);
  assert.equal(s.currentPeriodEnd, g.addMonth(t0 + 14 * DAY));
  const end1 = s.currentPeriodEnd;
  s = g.afterCharge(s, end1 + 1000, true);
  assert.equal(s.periodStartedAt, end1); assert.equal(s.period, 2);
  let f = g.afterCharge(s, s.currentPeriodEnd, false);
  assert.equal(f.pastDue, true); assert.equal(f.status, 'active'); assert.equal(f.attempts, 1);
  f = g.afterCharge(f, f.nextChargeAt, false); f = g.afterCharge(f, f.nextChargeAt, false);
  assert.equal(f.status, 'expired'); assert.equal(f.autoRenew, false); assert.equal(g.due(f, Date.now() + 99 * DAY), false);
});

test('cancellation stops renewals and keeps the paid period', () => {
  const t0 = Date.UTC(2026, 10, 8);
  const trial = g.cancel(g.startTrial('unlimited', t0, 'v'), t0 + DAY);
  assert.equal(trial.status, 'trialing'); assert.equal(g.due(trial, t0 + 20 * DAY), false);
  const paid = g.cancel(g.afterCharge(g.startTrial('single', t0, 'v'), t0 + 14 * DAY, true), t0 + 15 * DAY);
  assert.equal(paid.status, 'cancel_at_period_end'); assert.equal(g.due(paid, paid.currentPeriodEnd), false);
});

test('charge ids are stable per period and differ between periods and users', () => {
  assert.equal(g.chargeId('U', 1), g.chargeId('U', 1));
  assert.notEqual(g.chargeId('U', 1), g.chargeId('U', 2));
  assert.notEqual(g.chargeId('U', 1), g.chargeId('V', 1));
  assert.match(g.chargeId('U', 1), /^\d{15}$/);
});

test('Grow errors surface as GrowError, success returns data', async () => {
  const cfg = g.config(live);
  const ok = await g.call(async (url, init) => { assert.match(url, /createPaymentProcess$/); assert.ok(init.body instanceof FormData); assert.equal(init.body.get('userId'), 'u1'); assert.equal(init.body.get('a'), '1'); return { status: 200, json: async () => ({ status: '1', err: '', data: { url: 'https://pay' } }) }; }, cfg, 'createPaymentProcess', { a: 1 });
  assert.equal(ok.url, 'https://pay');
  await assert.rejects(g.call(async () => ({ status: 200, json: async () => ({ status: 0, err: { id: 701, message: 'bad userId' }, data: '' }) }), cfg, 'x', {}), { code: 'grow_701' });
});
