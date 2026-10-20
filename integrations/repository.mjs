import { createHash } from 'node:crypto';

const key = value => createHash('sha256').update(value).digest('hex');
const hashId = value => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid document ID');
  return value;
};

// Server Admin SDK only. This namespace MUST deny all direct client reads/writes
// in deployed rules. Authentication is the responsibility of the future API layer.
// This module never accesses existing users/{uid} trading or expense arrays.
export function createRepository(db) {
  function tenant(uid) {
    if (typeof uid !== 'string' || !uid || uid.length > 128) throw new Error('Invalid UID');
    return db.collection('integrationPrivate').doc(key(uid));
  }
  return {
    async atomicUpsert(uid, id, revision, fill) {
      const ref = tenant(uid).collection('fills').doc(hashId(id));
      hashId(revision);
      return db.runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) {
          tx.create(ref, {revision, fill, status:'unreconciled'});
          return 'created';
        }
        if (snapshot.data().revision === revision) return 'duplicate';
        const change = ref.collection('corrections').doc(revision);
        const existing = await tx.get(change);
        if (!existing.exists) tx.create(change, {revision, fill, status:'needs_review'});
        // Preserve the original until the reconciliation process approves a change.
        return 'correction_needs_review';
      });
    },
    async saveDraft(uid, draft) {
      const ref = tenant(uid).collection('invoiceDrafts').doc(hashId(draft.id));
      return db.runTransaction(async tx => {
        if ((await tx.get(ref)).exists) return 'duplicate';
        tx.create(ref, draft);
        return 'created';
      });
    }
  };
}
