'use strict';
/* Gmail expenses — keeps a long-lived, read-only Gmail permission per user so the
 * journal can re-scan receipts on every login without a Google popup.
 *
 * The browser does the scanning; this server only:
 *   connect    — exchanges the one-time Google code for a refresh token, stores it
 *                encrypted (AES-256-GCM) at gmailTokens/{uid}, unreadable to clients
 *   token      — returns a fresh 1-hour access token for the signed-in user
 *   disconnect — revokes the permission at Google and deletes the stored token
 *   config     — the public OAuth client id the browser needs
 * Caller identity is always the Firebase ID token in the Authorization header.
 */
const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('node:crypto');

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const ACTIONS = new Set(['config', 'connect', 'token', 'disconnect']);

const keyOf = secret => createHash('sha256').update(String(secret)).digest();
function seal(text, secret) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return { enc: enc.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64') };
}
function open(box, secret) {
  const d = createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(box.iv, 'base64'));
  d.setAuthTag(Buffer.from(box.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(box.enc, 'base64')), d.final()]).toString('utf8');
}

async function google(fetchFn, url, form) {
  const r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
  let j = {}; try { j = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, body: j };
}

/* Pure handler; deps = { verifyIdToken, store, fetch, cfg: {clientId, clientSecret, tokenKey}, now } */
async function handleGmail({ method, headers, body }, deps) {
  if (method !== 'POST') return { status: 405, body: { error: 'method' } };
  const action = String(body?.action || '');
  if (!ACTIONS.has(action)) return { status: 400, body: { error: 'action' } };
  const { clientId, clientSecret, tokenKey } = deps.cfg || {};
  if (!clientId || !clientSecret || !tokenKey) return { status: 503, body: { error: 'not_configured' } };
  const m = /^Bearer\s+(.+)$/.exec(String(headers.authorization || headers.Authorization || ''));
  if (!m) return { status: 401, body: { error: 'unauthenticated' } };
  let uid;
  try { uid = (await deps.verifyIdToken(m[1])).uid; } catch (e) { return { status: 401, body: { error: 'unauthenticated' } }; }
  if (!uid) return { status: 401, body: { error: 'unauthenticated' } };

  if (action === 'config') return { status: 200, body: { clientId, scope: SCOPE, connected: !!(await deps.store.get(uid)) } };

  if (action === 'connect') {
    const code = String(body.code || '');
    if (!code || code.length > 2048) return { status: 400, body: { error: 'code' } };
    const r = await google(deps.fetch, 'https://oauth2.googleapis.com/token', {
      code, client_id: clientId, client_secret: clientSecret, redirect_uri: 'postmessage', grant_type: 'authorization_code',
    });
    if (!r.ok) return { status: 400, body: { error: 'exchange_failed', detail: r.body.error || r.status } };
    const scopes = String(r.body.scope || '').split(/\s+/);
    if (!scopes.includes(SCOPE)) return { status: 400, body: { error: 'scope_denied' } };
    let refresh = r.body.refresh_token;
    if (!refresh) {
      const prev = await deps.store.get(uid);
      if (!prev) return { status: 400, body: { error: 'no_refresh_token' } };
      refresh = open(prev, tokenKey);
    }
    await deps.store.set(uid, { ...seal(refresh, tokenKey), connectedAt: deps.now });
    return { status: 200, body: { connected: true, accessToken: r.body.access_token, expiresIn: Number(r.body.expires_in) || 3600 } };
  }

  const box = await deps.store.get(uid);
  if (!box) return { status: action === 'disconnect' ? 200 : 404, body: action === 'disconnect' ? { connected: false } : { error: 'not_connected' } };
  const refresh = open(box, tokenKey);

  if (action === 'disconnect') {
    try { await google(deps.fetch, 'https://oauth2.googleapis.com/revoke', { token: refresh }); } catch (e) {}
    await deps.store.del(uid);
    return { status: 200, body: { connected: false } };
  }

  /* token */
  const r = await google(deps.fetch, 'https://oauth2.googleapis.com/token', {
    client_id: clientId, client_secret: clientSecret, refresh_token: refresh, grant_type: 'refresh_token',
  });
  if (!r.ok) {
    if (r.body.error === 'invalid_grant') { await deps.store.del(uid); return { status: 410, body: { error: 'revoked' } }; }
    return { status: 502, body: { error: 'refresh_failed' } };
  }
  return { status: 200, body: { accessToken: r.body.access_token, expiresIn: Number(r.body.expires_in) || 3600 } };
}

function firestoreTokenStore(db) {
  const ref = uid => db.doc(`gmailTokens/${uid}`);
  return {
    async get(uid) { const s = await ref(uid).get(); return s.exists ? s.data() : null; },
    async set(uid, v) { await ref(uid).set(v); },
    async del(uid) { await ref(uid).delete(); },
  };
}

module.exports = { handleGmail, firestoreTokenStore, seal, open, SCOPE };
