'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const I = require('./ibkr.cjs');
const { seal } = require('./gmail.cjs');

const STATEMENT = `<FlexQueryResponse queryName="fayna" type="AF"><FlexStatements count="1">
<FlexStatement accountId="U1234567" fromDate="20261001" toDate="20261105">
<Trades>
<Trade accountId="U1234567" assetCategory="FUT" symbol="MESZ6" buySell="BUY" quantity="2" tradePrice="6012.25" dateTime="20261104;093512" ibCommission="-1.24" ibExecID="0001f4e8.6729.01.01" ibOrderID="111" exchange="CME" levelOfDetail="EXECUTION" />
<Trade accountId="U1234567" assetCategory="FUT" symbol="MESZ6" buySell="SELL" quantity="-2" tradePrice="6020.50" dateTime="2026-11-04;10:02:40" ibCommission="-1.24" ibExecID="0001f4e8.6730.01.01" levelOfDetail="EXECUTION" />
<Trade accountId="U1234567" symbol="MESZ6" buySell="BUY" quantity="2" tradePrice="6012.25" dateTime="20261104;093512" levelOfDetail="ORDER" />
<Trade accountId="U1234567" symbol="AAPL" buySell="BUY (Ca.)" quantity="10" tradePrice="190" dateTime="20261104;093512" ibExecID="x" />
<Trade accountId="U1234567" assetCategory="STK" symbol="AT&amp;T" buySell="SELL" quantity="-5" tradePrice="17.1" dateTime="20261105;153000" ibExecID="0002.1" />
</Trades></FlexStatement></FlexStatements></FlexQueryResponse>`;

test('parses executions, skips rollups and cancellations, converts New York time to UTC', () => {
  const r = I.parseStatement(STATEMENT, 'America/New_York');
  assert.equal(r.fills.length, 3);
  const [a, b, c] = r.fills.map(x => x.fill);
  assert.equal(a.side, 'buy'); assert.equal(a.qty, 2); assert.equal(a.price, 6012.25); assert.equal(a.commission, 1.24);
  assert.equal(new Date(a.time).toISOString(), '2026-11-04T14:35:12.000Z'); /* EST = UTC-5 after DST ended Nov 1 */
  assert.equal(b.side, 'sell'); assert.equal(b.qty, 2);
  assert.equal(c.symbol, 'AT&T');
  assert.equal(a.source, 'ibkr'); assert.match(r.fills[0].docId, /^ibkr_U1234567_/);
  assert.deepEqual(r.accounts, ['U1234567']);
});

test('summer time offset', () => {
  assert.equal(new Date(I.zonedToUtc(I.parseLocal('20260715;093000'), 'America/New_York')).toISOString(), '2026-07-15T13:30:00.000Z');
});

function deps(responses) {
  const mem = new Map(), written = [], urls = [];
  return { mem, written, urls, d: {
    cfg: { tokenKey: 'k'.repeat(40) }, now: 1_800_000_000_000,
    verifyIdToken: async t => { if (t !== 'good') throw new Error('x'); return { uid: 'u1' }; },
    store: { get: async u => mem.get(u) || null, set: async (u, v) => mem.set(u, v), update: async (u, v) => mem.set(u, { ...(mem.get(u) || {}), ...v }), del: async u => mem.delete(u) },
    fillStore: { writeFills: async (uid, items) => { written.push(...items); return items.length; } },
    fetch: async url => { urls.push(url); const body = responses.shift(); return { text: async () => body }; },
    sleep: async () => {},
  } };
}
const req = (action, extra = {}) => ({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { action, ...extra } });
const OK = '<FlexStatementResponse><Status>Success</Status><ReferenceCode>9988</ReferenceCode></FlexStatementResponse>';
const WAIT = '<FlexStatementResponse><Status>Warn</Status><ErrorCode>1019</ErrorCode><ErrorMessage>Statement generation in progress</ErrorMessage></FlexStatementResponse>';

test('connect stores the token encrypted, retries while IBKR generates, writes fills', async () => {
  const x = deps([OK, WAIT, STATEMENT]);
  const r = await I.handleIbkr(req('connect', { token: '123456789012345678901234', queryId: '987654' }), x.d);
  assert.equal(r.status, 200); assert.equal(r.body.connected, true); assert.equal(r.body.result.stored, 3);
  assert.ok(!JSON.stringify(x.mem.get('u1')).includes('123456789012345678901234'));
  assert.match(x.urls[0], /SendRequest\?t=123456789012345678901234&q=987654&v=3/);
  assert.match(x.urls[2], /GetStatement\?t=.*&q=9988/);
});

test('bad token is reported in Hebrew and nothing is stored', async () => {
  const x = deps(['<FlexStatementResponse><Status>Fail</Status><ErrorCode>1015</ErrorCode><ErrorMessage>Token is invalid.</ErrorMessage></FlexStatementResponse>']);
  const r = await I.handleIbkr(req('connect', { token: '123456789012345678901234', queryId: '987654' }), x.d);
  assert.equal(r.status, 400); assert.match(r.body.message, /קוד הגישה/); assert.equal(x.mem.size, 0);
});

test('sync is throttled and needs a connection; auth required', async () => {
  const x = deps([]);
  assert.equal((await I.handleIbkr({ method: 'POST', headers: {}, body: { action: 'sync' } }, x.d)).status, 401);
  assert.equal((await I.handleIbkr(req('sync'), x.d)).status, 404);
  x.mem.set('u1', { box: seal('1234567890123', x.d.cfg.tokenKey), queryId: '1', lastSync: x.d.now - 30e3 });
  assert.equal((await I.handleIbkr(req('sync'), x.d)).body.skipped, 'recent');
  assert.equal((await I.handleIbkr(req('status'), x.d)).body.connected, true);
  assert.equal((await I.handleIbkr(req('disconnect'), x.d)).body.connected, false);
});
