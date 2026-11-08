'use strict';
/* Grow (formerly Meshulam) — card billing for Fayna subscriptions.
 *
 * Flow (merchant-managed recurring, so the 14-day trial and plan changes stay in our hands):
 *   1. checkout: createPaymentProcess on a token page (saveCardToken=1). The customer enters the
 *      card on Grow's hosted page; nothing card-related ever touches Fayna. cField1 = uid,
 *      cField2 = checkout id.
 *   2. Grow posts a server-to-server callback to growNotify. We never trust its body: the
 *      process is re-read from Grow (getPaymentProcessInfo) and must match the checkout record.
 *      The card token is stored encrypted (billingTokens/{uid}, server-only) and the trial starts.
 *   3. billingRenewals (hourly) charges due subscriptions with createTransactionWithToken.
 *      transactionUniqueIdentifier is derived from uid + period, so a retried run can never
 *      charge the same period twice (Grow rejects a repeated identifier).
 *   4. A failed charge keeps access for a 1-day grace and retries up to 3 times, then the account
 *      falls back to the free plan. Data is never deleted.
 *   5. Cancellation stops renewals at once; access continues until the paid period / trial ends.
 *
 * Everything here is inert until FAYNA_BILLING_LIVE=true and the Grow secrets exist.
 * Field names follow developers.grow.business (Light API, server 1.0). Before going live, run one
 * sandbox purchase end to end — some response shapes are documented only by example.
 */
const { createHash } = require('node:crypto');

const HOSTS = { sandbox: 'https://sandbox.meshulam.co.il', production: 'https://secure.meshulam.co.il' };
const PATH = '/api/light/server/1.0/';
const DAY = 86400000;
const MAX_ATTEMPTS = 3;
const PAID = new Set(['2']);          /* data.statusCode: 2 = paid */
const TOKEN_OK = new Set(['2', '11']); /* 11 = suspended (card verified, token saved, nothing settled) */

class GrowError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

function config(env) {
  const e = env || {};
  const mode = e.GROW_ENV === 'production' ? 'production' : 'sandbox';
  return {
    live: e.FAYNA_BILLING_LIVE === 'true',
    mode, base: HOSTS[mode] + PATH,
    userId: e.GROW_USER_ID || '', pageCode: e.GROW_PAGE_CODE || '',
    notifyKey: e.GROW_NOTIFY_KEY || '', tokenKey: e.BILLING_TOKEN_KEY || '',
    appUrl: e.FAYNA_APP_URL || 'https://dorfeina123-hash.github.io/fayna-trading/',
    notifyUrl: e.GROW_NOTIFY_URL || '',
    checkoutSumIls: Number(e.GROW_TOKEN_SUM || 1),
  };
}
function ready(cfg) { return !!(cfg.live && cfg.userId && cfg.pageCode && cfg.notifyKey && cfg.tokenKey && cfg.notifyUrl); }

/* Grow takes multipart/form-data and answers { status: "1"|0, err, data } */
async function call(fetcher, cfg, method, fields) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') fd.append(k, String(v)); });
  const r = await fetcher(cfg.base + method, { method: 'POST', body: fd, signal: AbortSignal.timeout(20000) });
  let j; try { j = await r.json(); } catch (e) { throw new GrowError('bad_response', `grow ${method}: ${r.status}`); }
  if (String(j?.status) !== '1') throw new GrowError('grow_' + (j?.err?.id || 'error'), j?.err?.message || 'grow error');
  return j.data || {};
}

/* Grow refuses special characters; it requires a two-word name and an Israeli mobile number */
const plain = (s, max) => String(s ?? '').replace(/[<>"'`\\{}[\]|;$%^*=]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
function payer(input) {
  const fullName = plain(input?.fullName, 60);
  const phone = String(input?.phone ?? '').replace(/[\s-]/g, '').replace(/^\+972/, '0');
  const email = /^[^\s@]{1,64}@[^\s@]{1,190}$/.test(String(input?.email || '')) ? String(input.email) : '';
  if (fullName.split(' ').filter(w => w.length >= 2).length < 2) throw new GrowError('payer_name', 'יש להזין שם פרטי ושם משפחה');
  if (!/^05\d{8}$/.test(phone)) throw new GrowError('payer_phone', 'יש להזין מספר נייד ישראלי תקין');
  return { fullName, phone, email };
}

function checkoutFields(cfg, { uid, checkoutId, plan, planLabel, who }) {
  const back = cfg.appUrl.replace(/[?#].*$/, '');
  return {
    pageCode: cfg.pageCode, userId: cfg.userId, chargeType: 1,
    sum: cfg.checkoutSumIls.toFixed(2), saveCardToken: 1,
    description: plain(`Fayna Trading - ${planLabel} - 14 day trial`, 120),
    successUrl: `${back}?billing=success`, cancelUrl: `${back}?billing=cancel`,
    notifyUrl: `${cfg.notifyUrl}?k=${encodeURIComponent(cfg.notifyKey)}`,
    'pageField[fullName]': who.fullName, 'pageField[phone]': who.phone, 'pageField[email]': who.email,
    cField1: uid, cField2: checkoutId, cField3: plan,
  };
}

/* Callback body: express may hand it over nested ({data:{…}}) or flat ({'data[x]':…}) */
function parseNotify(body) {
  const b = body && typeof body === 'object' ? body : {};
  const pick = (k) => {
    if (b.data && typeof b.data === 'object' && b.data[k] !== undefined) return b.data[k];
    return b[`data[${k}]`];
  };
  const cf = n => {
    const nested = b.data?.customFields?.[n];
    return nested !== undefined ? nested : (b[`data[customFields][${n}]`] ?? b[n]);
  };
  return {
    status: String(b.status ?? ''),
    processId: String(pick('processId') ?? ''), processToken: String(pick('processToken') ?? ''),
    transactionId: String(pick('transactionId') ?? ''), statusCode: String(pick('statusCode') ?? ''),
    uid: String(cf('cField1') ?? ''), checkoutId: String(cf('cField2') ?? ''),
  };
}

/* getPaymentProcessInfo answers with the process and its transactions; accept the common shapes */
function processFacts(data) {
  const tx = Array.isArray(data?.transactions) ? data.transactions[0] : (data?.transaction || data || {});
  const custom = tx.customFields || data?.customFields || {};
  return {
    statusCode: String(tx.statusCode ?? data?.statusCode ?? ''),
    cardToken: String(tx.cardToken ?? data?.cardToken ?? ''),
    transactionId: String(tx.transactionId ?? data?.transactionId ?? ''),
    cardSuffix: String(tx.cardSuffix ?? data?.cardSuffix ?? '').slice(-4),
    cardBrand: String(tx.cardBrand ?? data?.cardBrand ?? '').slice(0, 20),
    uid: String(custom.cField1 ?? ''), checkoutId: String(custom.cField2 ?? ''),
  };
}

/* ── subscription state (pure) ── */
function addMonth(ms) {
  const d = new Date(ms), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}
/* card saved → trial with full access; the chosen plan is charged when the trial ends */
function startTrial(plan, now, version) {
  return {
    provider: 'grow', plan: 'unlimited', billingPlan: plan, status: 'trialing', policyVersion: version,
    trialStartedAt: now, trialEndsAt: now + 14 * DAY, nextChargeAt: now + 14 * DAY,
    autoRenew: true, attempts: 0, period: 0,
  };
}
function due(sub, now) {
  return !!sub && sub.provider === 'grow' && sub.autoRenew === true && ['trialing', 'active'].includes(sub.status)
    && Number.isSafeInteger(sub.nextChargeAt) && sub.nextChargeAt <= now;
}
function afterCharge(sub, now, ok) {
  if (ok) {
    const start = sub.status === 'trialing' ? Math.max(now, sub.trialEndsAt || now) : Math.max(sub.currentPeriodEnd || now, sub.periodStartedAt || 0);
    const end = addMonth(start);
    return { ...sub, plan: sub.billingPlan, status: 'active', periodStartedAt: start, currentPeriodEnd: end, nextChargeAt: end, attempts: 0, pastDue: false, period: (sub.period || 0) + 1, lastChargeAt: now };
  }
  const attempts = (sub.attempts || 0) + 1;
  if (attempts >= MAX_ATTEMPTS) return { ...sub, status: 'expired', autoRenew: false, attempts, pastDue: false, endedAt: now, endedReason: 'payment_failed' };
  /* grace: keep access one more day and retry tomorrow */
  return { ...sub, plan: sub.billingPlan, status: 'active', currentPeriodEnd: now + DAY, nextChargeAt: now + DAY, attempts, pastDue: true };
}
function cancel(sub, now) {
  if (!sub || sub.provider !== 'grow') return sub;
  if (sub.status === 'trialing') return { ...sub, autoRenew: false, cancelledAt: now };
  if (sub.status === 'active') return { ...sub, autoRenew: false, status: 'cancel_at_period_end', cancelledAt: now };
  return sub;
}

/* numeric, stable per uid + period: Grow rejects a repeated transactionUniqueIdentifier */
function chargeId(uid, period) {
  const h = createHash('sha256').update(`${uid}:${period}`).digest();
  return (h.readUIntBE(0, 6) % 9e14 + 1e14).toString();
}
function chargeFields(cfg, { uid, sub, token, quote, who, planLabel }) {
  return {
    userId: cfg.userId, cardToken: token, paymentType: 2, paymentNum: 1,
    sum: (quote.settlementMinor / 100).toFixed(2),
    description: plain(`Fayna Trading - ${planLabel} - monthly`, 120),
    'pageField[fullName]': who.fullName, 'pageField[phone]': who.phone, 'pageField[email]': who.email,
    cField1: uid, cField2: `renewal-${(sub.period || 0) + 1}`,
    transactionUniqueIdentifier: chargeId(uid, (sub.period || 0) + 1),
  };
}

module.exports = {
  GrowError, HOSTS, MAX_ATTEMPTS, PAID, TOKEN_OK, config, ready, call, payer, checkoutFields, parseNotify, processFacts,
  addMonth, startTrial, due, afterCharge, cancel, chargeId, chargeFields,
};
