import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function adminDb() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) throw new Error('Server Firebase credentials are required.');
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getFirestore();
}

const APPLY = process.argv.includes('--apply');
const collections = ['guides', 'quizzes', 'announcements', 'books', 'radioBroadcasts', 'radioPlaylists', 'candidates', 'certificates', 'graduationRequests', 'learningPaths', 'bibleTopics', 'seasons'];

function scopeFor(collection, data) {
  const org = String(data.organizationId || '').trim();
  if (!org) return 'shared';
  if (collection === 'radioBroadcasts') return 'shared';
  return data.sharingScope === 'shared' ? 'shared' : data.sharingScope === 'private' ? 'private' : 'organization';
}

async function migrateRoot(db, collection) {
  const snapshot = await db.collection(collection).get();
  let changed = 0;
  let skipped = 0;
  let batch = db.batch();
  let operations = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const org = String(data.organizationId || '').trim();
    const next = {
      ownerOrganizationId: String(data.ownerOrganizationId || org).trim(),
      ownerUid: String(data.ownerUid || '').trim(),
      canonical: data.canonical !== false,
      sharingScope: scopeFor(collection, data),
    };
    if (!next.ownerOrganizationId) delete next.ownerOrganizationId;
    if (!next.ownerUid) delete next.ownerUid;

    const needs = data.sharingScope !== next.sharingScope
      || data.canonical !== next.canonical
      || String(data.ownerOrganizationId || '') !== String(next.ownerOrganizationId || '')
      || String(data.ownerUid || '') !== String(next.ownerUid || '');

    if (!needs) { skipped++; continue; }
    changed++;
    if (APPLY) {
      batch.set(doc.ref, { ...next, migratedAt: FieldValue.serverTimestamp() }, { merge: true });
      operations++;
      if (operations === 450) {
        await batch.commit();
        batch = db.batch();
        operations = 0;
      }
    }
  }

  if (APPLY && operations) await batch.commit();
  return { collection, total: snapshot.size, changed, skipped };
}

async function migrateGuideLessons(db) {
  const guides = await db.collection('guides').get();
  let total = 0, changed = 0, batch = db.batch(), operations = 0;
  for (const guide of guides.docs) {
    const gd = guide.data() || {};
    const org = String(gd.organizationId || '').trim();
    const sharingScope = gd.sharingScope === 'shared' ? 'shared' : (org ? 'organization' : 'shared');
    const lessons = await guide.ref.collection('lessons').get();
    for (const lesson of lessons.docs) {
      total++;
      const data = lesson.data() || {};
      const ownerOrg = String(data.ownerOrganizationId || gd.ownerOrganizationId || org).trim();
      const next = {
        organizationId: data.organizationId || gd.organizationId || '',
        ownerOrganizationId: ownerOrg,
        ownerUid: String(data.ownerUid || gd.ownerUid || '').trim(),
        canonical: data.canonical !== false,
        sharingScope: data.sharingScope === 'shared' ? 'shared' : sharingScope,
      };
      if (!next.ownerOrganizationId) delete next.ownerOrganizationId;
      if (!next.ownerUid) delete next.ownerUid;
      const needs = String(data.ownerOrganizationId || '') !== String(next.ownerOrganizationId || '')
        || String(data.ownerUid || '') !== String(next.ownerUid || '')
        || data.sharingScope !== next.sharingScope
        || data.canonical !== next.canonical
        || String(data.organizationId || '') !== String(next.organizationId || '');
      if (!needs) continue;
      changed++;
      if (APPLY) {
        batch.set(lesson.ref, { ...next, migratedAt: FieldValue.serverTimestamp() }, { merge: true });
        operations++;
        if (operations === 450) { await batch.commit(); batch = db.batch(); operations = 0; }
      }
    }
  }
  if (APPLY && operations) await batch.commit();
  return { collection: 'guides/lessons', total, changed };
}

async function main() {
  const db = adminDb();
  console.log(APPLY ? 'Applying tenant-content metadata migration.' : 'DRY RUN — no data will be changed. Use --apply to write.');
  const results = [];
  for (const collection of collections) results.push(await migrateRoot(db, collection));
  results.push(await migrateGuideLessons(db));
  console.table(results);
  console.log(APPLY ? 'Migration complete.' : 'Dry run complete.');
}

main().catch(error => { console.error(error); process.exit(1); });
