import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\x00-\x1f]/.test(value);
function required(value, name) {
  if (!identifier(value)) throw new Error(`Invalid ${name}`);
  return value;
}
function decimal(value, name, positive = false) {
  if (typeof value !== 'string' || !/^-?\d{1,18}(\.\d{1,12})?$/.test(value) ||
      (positive && Number(value) <= 0)) throw new Error(`Invalid ${name}`);
  // Keep exact decimal text; financial calculations must not use JS float coercion.
  return value;
}

export function normalizeFill(input) {
  if (!input || input.schemaVersion !== 1 || input.provider !== 'atas') throw new Error('Unsupported schema');
  const side = new Map([['Buy', 'buy'], ['Sell', 'sell'], ['buy', 'buy'], ['sell', 'sell']]).get(input.side);
  if (!side) throw new Error('Invalid side');
  const occurredAt = input.occurredAt;
  // No silent timezone assumption. Unspecified ATAS timestamps stay in local outbox.
  if (typeof occurredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?Z$/.test(occurredAt) ||
      !Number.isFinite(Date.parse(occurredAt)) ||
      new Date(occurredAt).toISOString().slice(0, 19) !== occurredAt.slice(0, 19)) throw new Error('Verified UTC timestamp required');
  return {
    schemaVersion: 1, provider: 'atas',
    accountId: required(input.accountId, 'account'), route: required(input.route, 'route'),
    fillId: required(input.fillId, 'fill ID'), instrument: required(input.instrument, 'instrument'),
    orderId: input.orderId == null || input.orderId === '' ? null : required(input.orderId, 'order ID'),
    side, occurredAt, price: decimal(input.price, 'price'),
    quantity: decimal(input.quantity, 'quantity', true),
    commission: input.commission == null ? null : decimal(input.commission, 'commission'),
    commissionCurrency: input.commissionCurrency == null ? null : required(input.commissionCurrency, 'currency')
  };
}

// connection MUST come from a server-verified token lookup, never a request body.
// repository.atomicUpsert must transactionally compare revisions to avoid lost updates.
export async function ingestFills(connection, payload, repository) {
  if (!connection || connection.revoked || !identifier(connection.uid) || !identifier(connection.id))
    throw new Error('Unauthenticated connection');
  if (!Array.isArray(payload) || payload.length < 1 || payload.length > 100) throw new Error('Invalid batch');
  const fills = payload.map(normalizeFill);
  for (const fill of fills) {
    if (!connection.accounts?.some(a => a.accountId === fill.accountId && a.route === fill.route))
      throw new Error('Account is not paired');
  }
  const results = [];
  for (const fill of fills) {
    // Stable across reconnects/new devices; scoped by user in repository.
    const id = hash([fill.provider, fill.route, fill.accountId, fill.fillId]);
    const revision = hash(fill);
    results.push(await repository.atomicUpsert(connection.uid, id, revision, fill));
  }
  return results;
}

export function invoiceSearch({ senders, after }) {
  if (!Array.isArray(senders) || !senders.length || senders.length > 30 ||
      senders.some(s => typeof s !== 'string' || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(s)))
    throw new Error('Select exact supplier email addresses');
  if (typeof after !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(after) ||
      new Date(after).toISOString().slice(0, 10) !== after) throw new Error('Invalid start date');
  return `after:${after.replaceAll('-', '/')} {${senders.map(s => `from:${s}`).join(' ')}} {subject:invoice subject:receipt subject:חשבונית subject:קבלה}`;
}

export function invoiceDraft(uid, message, approvedSenders) {
  required(uid, 'user');
  required(message.id, 'message ID');
  const headers = message.payload?.headers || [];
  const header = name => headers.find(h => h.name.toLowerCase() === name)?.value || '';
  const from = header('from').trim();
  const sender = (from.match(/<([^<>]+)>$/)?.[1] || from).toLowerCase();
  if (!approvedSenders.map(s => s.toLowerCase()).includes(sender)) throw new Error('Unapproved sender');
  const attachments = [];
  const walk = part => {
    if (part.filename && part.body?.attachmentId) attachments.push({
      filename: String(part.filename).slice(0, 250), mimeType: part.mimeType,
      attachmentId: part.body.attachmentId
    });
    for (const child of part.parts || []) walk(child);
  };
  walk(message.payload || {});
  return {
    id: hash([uid, 'gmail', message.id]), provider: 'gmail', messageId: message.id,
    subject: header('subject').slice(0, 500), sender, attachments,
    status: 'needs_review', amount: null, currency: null, expenseDate: null,
    // A candidate is never a booked expense or journal trade.
    duplicateReviewRequired: true
  };
}
