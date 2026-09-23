import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function db() {
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
const LEGACY_TENANT_PREFIXES = ['legacy-union-', 'legacy-conference-', 'legacy-district-', 'legacy-church-'];

const NODE_TYPES = [
  { collection: 'unions', type: 'union', idField: 'unionId' },
  { collection: 'conferences', type: 'conference', idField: 'conferenceId' },
  { collection: 'districts', type: 'district', idField: 'districtId' },
  { collection: 'churches', type: 'church', idField: 'churchId' },
];

function tenantId(type, id) {
  return `legacy-${type}-${id}`;
}

function nameFor(type, data, id) {
  return String(data.name || data.title || id).trim() || id;
}

function hierarchyTenantIds(data) {
  const ids = [];
  if (data.unionId) ids.push(tenantId('union', String(data.unionId)));
  if (data.conferenceId) ids.push(tenantId('conference', String(data.conferenceId)));
  if (data.districtId) ids.push(tenantId('district', String(data.districtId)));
  if (data.churchId) ids.push(tenantId('church', String(data.churchId)));
  return [...new Set(ids)];
}

function mostSpecificTenantId(data) {
  return hierarchyTenantIds(data).at(-1) || '';
}

async function commitBatches(db, writes) {
  if (!APPLY || !writes.length) return;
  let batch = db.batch();
  let count = 0;
  for (const write of writes) {
    write(batch);
    count++;
    if (count === 450) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }
  if (count) await batch.commit();
}

async function main() {
  const firestore = db();
  console.log(APPLY ? 'Applying legacy hierarchy tenant migration.' : 'DRY RUN — no data will be changed. Use --apply to write.');

  const nodeMaps = { union: new Map(), conference: new Map(), district: new Map(), church: new Map() };
  const organizationWrites = [];
  let tenantCount = 0;

  for (const spec of NODE_TYPES) {
    const snapshot = await firestore.collection(spec.collection).get();
    for (const doc of snapshot.docs) {
      const data = doc.data() || {};
      const organizationId = tenantId(spec.type, doc.id);
      nodeMaps[spec.type].set(doc.id, { id: doc.id, ...data });
      organizationWrites.push(batch => batch.set(firestore.doc(`organizations/${organizationId}`), {
        id: organizationId,
        name: nameFor(spec.type, data, doc.id),
        slug: organizationId,
        status: 'active',
        tenantKind: 'legacy-hierarchy',
        legacyNodeType: spec.type,
        legacyNodeId: doc.id,
        plan: '',
        quotas: {},
        features: {},
        migratedFrom: spec.collection,
        migratedAt: FieldValue.serverTimestamp(),
      }, { merge: true }));
      tenantCount++;
    }
  }
  await commitBatches(firestore, organizationWrites);

  const users = await firestore.collection('users').get();
  const userWrites = [];
  let userChanged = 0;
  let membershipWrites = 0;

  for (const doc of users.docs) {
    const data = doc.data() || {};
    const role = String(data.role || '');
    const legacyAdminType = role === 'union_admin' ? 'union' : role === 'conference_admin' ? 'conference' : role === 'district_admin' ? 'district' : role === 'church_admin' ? 'church' : '';
    const adminNodeId = String(data.adminNodeId || '').trim();

    let ids = [];
    let activeId = String(data.organizationId || '').trim();

    if (legacyAdminType && adminNodeId) {
      ids = [tenantId(legacyAdminType, adminNodeId)];
      activeId = activeId || ids[0];
    } else {
      ids = hierarchyTenantIds(data);
      activeId = activeId || mostSpecificTenantId(data);
    }

    if (!ids.length) continue;

    const existingIds = Array.isArray(data.organizationIds)
      ? data.organizationIds.map(value => String(value || '').trim()).filter(Boolean)
      : [];
    ids = [...new Set([...existingIds, ...ids])];

    const existingMemberships = Array.isArray(data.organizationMemberships) ? data.organizationMemberships : [];
    const roleForMembership = String(data.organizationRole || (role === 'student' ? 'learner' : 'viewer'));
    const membershipMap = new Map(
      existingMemberships
        .filter(item => item && typeof item === 'object' && String(item.organizationId || '').trim())
        .map(item => [String(item.organizationId), { ...item }]),
    );

    for (const organizationId of ids) {
      if (!membershipMap.has(organizationId)) {
        membershipMap.set(organizationId, {
          organizationId,
          role: legacyAdminType && organizationId === activeId ? 'owner' : roleForMembership,
          active: true,
          migratedFromHierarchy: true,
        });
      }
      userWrites.push(batch => batch.set(firestore.doc(`organizations/${organizationId}/members/${doc.id}`), {
        uid: doc.id,
        organizationId,
        role: membershipMap.get(organizationId).role || roleForMembership,
        active: membershipMap.get(organizationId).active !== false,
        migratedFromHierarchy: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }));
      membershipWrites++;
    }

    const next = {
      organizationId: activeId,
      organizationIds: ids,
      organizationMemberships: [...membershipMap.values()],
      updatedAt: FieldValue.serverTimestamp(),
    };
    const changed = String(data.organizationId || '') !== activeId
      || JSON.stringify(existingIds.sort()) !== JSON.stringify(ids.slice().sort())
      || existingMemberships.length !== next.organizationMemberships.length;
    if (changed) {
      userWrites.push(batch => batch.set(doc.ref, next, { merge: true }));
      userChanged++;
    }
  }
  await commitBatches(firestore, userWrites);

  console.log(JSON.stringify({
    tenantsDiscovered: tenantCount,
    usersNeedingTenantMigration: userChanged,
    membershipsPrepared: membershipWrites,
    mode: APPLY ? 'apply' : 'dry-run',
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
