import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestFills, normalizeFill, invoiceSearch, invoiceDraft } from './core.mjs';
import { scanInvoiceCandidates } from './gmail.mjs';
import { createRepository } from './repository.mjs';

const fill = { schemaVersion: 1, provider: 'atas', route: 'test-route', accountId: 'demo-A',
  fillId: 'f1', orderId: 'o1', instrument: 'TEST', side: 'Buy', price: '123.456789123',
  quantity: '2', commission: null, occurredAt: '2026-10-05T08:00:00.0000000Z' };
const conn = uid => ({ uid, id: 'connection', accounts: [{accountId: 'demo-A', route: 'test-route'}] });
function memory() {
  const records = new Map();
  const reference = path => ({path,
    collection: name => reference(path ? `${path}/${name}` : name),
    doc: id => reference(`${path}/${id}`)});
  const db = {collection:name=>reference(name), async runTransaction(callback) {
    const pending = [];
    const result = await callback({
      get:async ref=>({exists:records.has(ref.path),data:()=>records.get(ref.path)}),
      create:(ref,data)=>pending.push([ref.path,structuredClone(data)])});
    for (const [path] of pending) assert.ok(!records.has(path));
    for (const [path,data] of pending) records.set(path,data);
    return result;
  }};
  return { records, ...createRepository(db) };
}
test('retains precision and unknown commission', () => {
  const result = normalizeFill(fill);
  assert.equal(result.price, fill.price); assert.equal(result.commission, null);
});
test('rejects ambiguous and impossible timestamps', () => {
  for (const occurredAt of [null, '2026-10-05T08:00:00', '2026-02-30T08:00:00Z'])
    assert.throws(() => normalizeFill({...fill, occurredAt}));
});
test('rejects invalid financial values and prototype keys', () => {
  for (const fields of [{quantity: '0'}, {quantity: '-1'}, {price: 'NaN'}, {price: 5}, {side: '__proto__'}])
    assert.throws(() => normalizeFill({...fill, ...fields}));
});
test('replay and reconnect do not duplicate fills', async () => {
  const repo = memory();
  assert.deepEqual(await ingestFills(conn('u1'), [fill], repo), ['created']);
  assert.deepEqual(await ingestFills({...conn('u1'), id:'new-device'}, [fill], repo), ['duplicate']);
  assert.equal(repo.records.size, 1);
});
test('same broker IDs are isolated across users', async () => {
  const repo = memory();
  await ingestFills(conn('u1'), [fill], repo); await ingestFills(conn('u2'), [fill], repo);
  assert.equal(repo.records.size, 2);
});
test('foreign account rejects entire batch before first write', async () => {
  const repo = memory();
  await assert.rejects(ingestFills(conn('u1'), [fill, {...fill, accountId:'foreign'}], repo));
  assert.equal(repo.records.size, 0);
});
test('revoked connection cannot ingest', async () => {
  await assert.rejects(ingestFills({...conn('u1'), revoked:true}, [fill], memory()));
});
test('correction does not overwrite original', async () => {
  const repo = memory(); await ingestFills(conn('u1'), [fill], repo);
  assert.deepEqual(await ingestFills(conn('u1'), [{...fill, commission:'2.50'}], repo), ['correction_needs_review']);
  assert.equal([...repo.records.values()][0].fill.commission, null);
  assert.equal(repo.records.size,2);
  await ingestFills(conn('u1'), [{...fill, commission:'2.50'}], repo);
  assert.equal(repo.records.size,2);
});
test('supplier query rejects search injection', () => {
  assert.throws(() => invoiceSearch({senders:['x@example.com OR in:anywhere'], after:'2026-01-01'}));
  assert.throws(() => invoiceSearch({senders:[], after:'2026-01-01'}));
  assert.throws(() => invoiceSearch({senders:['a@example.com'], after:'2026-02-30'}));
});
const message = { id:'m1', payload:{headers:[{name:'From',value:'Supplier <billing@example.com>'},
  {name:'Subject',value:'Invoice'}], parts:[{filename:'invoice.pdf',mimeType:'application/pdf',body:{attachmentId:'a1'}}]} };
test('Gmail creates unbooked draft with no invented amount', () => {
  const draft = invoiceDraft('u1',message,['billing@example.com']);
  assert.equal(draft.status,'needs_review'); assert.equal(draft.amount,null);
  assert.equal(draft.attachments.length,1);
  assert.equal(draft.id,invoiceDraft('u1',message,['billing@example.com']).id);
  assert.notEqual(draft.id,invoiceDraft('u2',message,['billing@example.com']).id);
});
test('Gmail rejects suppliers outside user selection', () => {
  assert.throws(() => invoiceDraft('u1',message,['another@example.com']));
});
test('rescanning cannot reset the state of reviewed invoice drafts', async () => {
  const repo = memory();
  const draft = invoiceDraft('u1',message,['billing@example.com']);
  await repo.saveDraft('u1',draft);
  [...repo.records.values()][0].status = 'rejected';
  assert.equal(await repo.saveDraft('u1',draft),'duplicate');
  assert.equal([...repo.records.values()][0].status,'rejected');
});
test('Gmail read requests use per-user token and bounded page', async () => {
  const calls = [], saved = [];
  const result = await scanInvoiceCandidates({uid:'u1',preferences:{senders:['billing@example.com'],after:'2026-01-01'},
    getAccessToken: async uid => {assert.equal(uid,'u1'); return 'synthetic-token';},
    saveDraft: async (uid,draft) => saved.push([uid,draft]),
    fetchImpl: async (url,options) => {
      calls.push(url); assert.equal(options.headers.Authorization,'Bearer synthetic-token');
      return {ok:true,json:async()=>calls.length===1?{messages:[{id:'m1'}],nextPageToken:'next'}:message};
    }});
  assert.equal(calls[0].searchParams.get('maxResults'),'25');
  assert.equal(result.nextPageToken,'next'); assert.equal(saved.length,1);
});
test('Gmail authentication failures never produce drafts', async () => {
  let writes = 0;
  await assert.rejects(scanInvoiceCandidates({uid:'u1',preferences:{senders:['billing@example.com'],after:'2026-01-01'},
    getAccessToken:async()=> 'synthetic',saveDraft:async()=>writes++,
    fetchImpl:async()=>({ok:false,status:401})}));
  assert.equal(writes,0);
});
