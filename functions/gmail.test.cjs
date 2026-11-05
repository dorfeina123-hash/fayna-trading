'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { handleGmail, seal, open, SCOPE } = require('./gmail.cjs');

function setup(googleReplies = []) {
  const mem = new Map(), calls = [];
  const deps = {
    cfg: { clientId: 'cid', clientSecret: 'sec', tokenKey: 'k'.repeat(40) },
    now: 1,
    verifyIdToken: async t => { if (t !== 'good') throw new Error('bad'); return { uid: 'u1' }; },
    store: { get: async u => mem.get(u) || null, set: async (u, v) => mem.set(u, v), del: async u => mem.delete(u) },
    fetch: async (url, init) => { calls.push({ url, body: String(init.body) }); const r = googleReplies.shift() || { ok: true, json: {} }; return { ok: r.ok, status: r.ok ? 200 : 400, json: async () => r.json }; },
  };
  return { deps, mem, calls };
}
const req = (action, extra = {}, auth = 'Bearer good') => ({ method: 'POST', headers: { authorization: auth }, body: { action, ...extra } });

test('seal/open round trip and tamper detection', () => {
  const b = seal('refresh-123', 'key');
  assert.equal(open(b, 'key'), 'refresh-123');
  assert.throws(() => open(b, 'other'));
});

test('requires a valid Firebase token and configuration', async () => {
  const { deps } = setup();
  assert.equal((await handleGmail(req('token', {}, ''), deps)).status, 401);
  assert.equal((await handleGmail(req('token', {}, 'Bearer bad'), deps)).status, 401);
  assert.equal((await handleGmail(req('nope'), deps)).status, 400);
  assert.equal((await handleGmail(req('token'), { ...deps, cfg: {} })).status, 503);
});

test('connect stores the refresh token encrypted, token refreshes it', async () => {
  const { deps, mem, calls } = setup([
    { ok: true, json: { access_token: 'a1', refresh_token: 'r1', scope: `openid ${SCOPE}`, expires_in: 3599 } },
    { ok: true, json: { access_token: 'a2', expires_in: 3599 } },
  ]);
  const c = await handleGmail(req('connect', { code: 'xyz' }), deps);
  assert.equal(c.status, 200); assert.equal(c.body.accessToken, 'a1');
  const saved = mem.get('u1');
  assert.ok(saved.enc && !JSON.stringify(saved).includes('r1'));
  assert.match(calls[0].body, /redirect_uri=postmessage/);
  const t = await handleGmail(req('token'), deps);
  assert.equal(t.body.accessToken, 'a2');
  assert.match(calls[1].body, /refresh_token=r1/);
});

test('connect without the Gmail scope is refused', async () => {
  const { deps, mem } = setup([{ ok: true, json: { access_token: 'a', refresh_token: 'r', scope: 'openid' } }]);
  assert.equal((await handleGmail(req('connect', { code: 'x' }), deps)).body.error, 'scope_denied');
  assert.equal(mem.size, 0);
});

test('revoked permission is cleaned up; disconnect revokes', async () => {
  const { deps, mem, calls } = setup([{ ok: false, json: { error: 'invalid_grant' } }]);
  mem.set('u1', seal('r9', deps.cfg.tokenKey));
  assert.equal((await handleGmail(req('token'), deps)).status, 410);
  assert.equal(mem.size, 0);
  mem.set('u1', seal('r9', deps.cfg.tokenKey));
  assert.equal((await handleGmail(req('disconnect'), deps)).body.connected, false);
  assert.match(calls.at(-1).url, /revoke/); assert.equal(mem.size, 0);
});
