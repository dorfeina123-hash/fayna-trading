import { invoiceSearch, invoiceDraft } from './core.mjs';

// Server-only. getAccessToken must load this uid's encrypted OAuth credentials.
// No send, modify or delete endpoints; attachment bodies are not downloaded here.
export async function scanInvoiceCandidates({ uid, preferences, getAccessToken, saveDraft, fetchImpl = fetch }) {
  const q = invoiceSearch(preferences);
  const accessToken = await getAccessToken(uid);
  if (typeof accessToken !== 'string' || !accessToken) throw new Error('Gmail is not connected');
  async function read(path, query = {}) {
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`Gmail request failed (${response.status})`);
    return response.json();
  }
  // A bounded page. Caller persists nextPageToken only after the entire page succeeds.
  // Failed/repeated scans safely retry the same deterministic candidate IDs.
  const page = await read('messages', { q, maxResults: '25', ...(preferences.pageToken ? {pageToken: preferences.pageToken} : {}) });
  let count = 0;
  for (const item of page.messages || []) {
    if (!/^[a-zA-Z0-9_-]+$/.test(item.id)) throw new Error('Invalid Gmail message ID');
    const message = await read(`messages/${item.id}`, { format: 'full' });
    // full is necessary for MIME attachment metadata; do not persist body/snippet.
    const draft = invoiceDraft(uid, message, preferences.senders);
    await saveDraft(uid, draft); // create-if-absent; never reset approved/rejected drafts
    count++;
  }
  return { examined: count, nextPageToken: page.nextPageToken || null };
}
