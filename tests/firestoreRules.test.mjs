import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

// ONLY the local Firebase Emulator Suite may run this test. Never use real
// voiceofprophecy credentials, Firestore endpoints, or production project IDs.
const projectId = 'demo-vop-security-rules';
const rules = readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), 'firestore.rules'), 'utf8');
const timestamp = () => firebase.firestore.FieldValue.serverTimestamp();
const submission = (ownerUid = 'alice') => ({
  ownerUid,
  language: 'en',
  lessonId: 'lesson-01',
  revision: 'a'.repeat(64),
  answers: [0, 1, 0, 1, 0],
  practiceScore: 60,
  status: 'practice_unverified',
  submittedAt: timestamp(),
});

// Sequential subtests keep emulator state deterministic; each assertion uses a
// unique ID and all SDK clients are cleaned up even if a rule check fails.
test('Firestore rules enforce authenticated ownership and append-only unverified practice', async t => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator must be running');
  const environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
  try {
    await environment.clearFirestore();
    const alice = environment.authenticatedContext('alice').firestore();
    const bob = environment.authenticatedContext('bob').firestore();
    const anonymous = environment.unauthenticatedContext().firestore();
    const path = id => `users/alice/progress/${id}`;

    await t.test('valid owner submission, own reads and own progress list work', async () => {
      const record = alice.doc(path('alice'));
      await assertSucceeds(record.set(submission()));
      const snapshot = await assertSucceeds(record.get());
      assert.equal(snapshot.data()?.ownerUid, 'alice');
      await assertSucceeds(alice.collection('users/alice/progress').get());
      await assertSucceeds(alice.doc('users/alice').get());
    });

    await t.test('cross-user and unauthenticated reads, writes and lists fail', async () => {
      await assertFails(bob.doc(path('alice')).get());
      await assertFails(bob.collection('users/alice/progress').get());
      await assertFails(bob.doc(path('bob-write')).set(submission('bob')));
      await assertFails(anonymous.doc(path('valid')).get());
      await assertFails(anonymous.doc(path('anonymous-write')).set(submission()));
      await assertFails(anonymous.collection('users/alice/progress').get());
      await assertFails(alice.doc('users/bob').get());
      await assertSucceeds(bob.doc('users/bob').get());
    });

    await t.test('owner cannot overwrite or delete history or create privileged profile', async () => {
      await assertFails(alice.doc(path('alice')).set(submission()));
      await assertFails(alice.doc(path('alice')).update({ practiceScore: 100 }));
      await assertFails(alice.doc(path('alice')).delete());
      await assertFails(alice.doc('users/alice').set({ role: 'admin' }));
      await assertFails(alice.doc('users/alice/grades/official').set({ score: 100 }));
      await assertFails(alice.doc(path('not-alice')).set(submission()));
      await assertFails(alice.doc('certificates/cert-1').set({ uid: 'alice' }));
    });

    await t.test('reject mismatched UID, verified status, extra fields, invalid quiz and marks', async () => {
      const bad = [
        { ownerUid: 'bob' },
        { status: 'verified' },
        { isAdmin: true },
        { practiceScore: 101 },
        { practiceScore: -1 },
        { practiceScore: '100' },
        { answers: [0, 1] },
        { answers: [0, 1, 0, 1, 6] },
        { answers: [0, 1, '0', 1, 0] },
        { revision: 'not-a-hash' },
        { language: '../other' },
        { lessonId: '../../admin' },
        { submittedAt: new Date() },
      ];
      for (const [index, change] of bad.entries()) {
        await assertFails(alice.doc(path(`invalid-${index}`)).set({ ...submission(), ...change }));
      }
      const missing = submission();
      delete missing.revision;
      await assertFails(alice.doc(path('missing-field')).set(missing));
    });
  } finally {
    await environment.cleanup();
  }
});


test('hierarchy tenant scope cannot cross organizations', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator must be running');
  const environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
  try {
    await environment.withSecurityRulesDisabled(async adminContext => {
      const adminDb = adminContext.firestore();
      await adminDb.doc('users/super-admin').set({ uid:'super-admin', role:'super_admin', organizationId:'' });
      await adminDb.doc('system/permissions').set({ version:1, matrix:{}});
      await adminDb.doc('users/union-admin').set({
        uid: 'union-admin',
        role: 'union_admin',
        adminNodeId: 'union-1',
        adminNodeType: 'union',
        organizationId: '',
      });
      await adminDb.doc('organizations/org-1').set({
        id: 'org-1', name: 'Scoped Organization', status: 'active', unionId: 'union-1',
      });
      await adminDb.doc('organizations/org-2').set({
        id: 'org-2', name: 'Foreign Organization', status: 'active', unionId: 'union-2',
      });
      await adminDb.doc('organizations/org-1/members/org-admin').set({
        uid:'org-admin', organizationId:'org-1', role:'admin', active:true,
      });
      await adminDb.doc('users/org-admin').set({
        uid:'org-admin', role:'student', organizationId:'org-1', organizationRole:'admin',
      });
      await adminDb.doc('announcements/org-owned').set({
        ownerUid:'org-admin', ownerOrganizationId:'org-1', organizationId:'org-1',
        sharingScope:'private', published:false, title:'Owned',
      });
      await adminDb.doc('announcements/org-foreign').set({
        ownerUid:'other-user', ownerOrganizationId:'org-1', organizationId:'org-1',
        sharingScope:'private', published:false, title:'Foreign',
      });
      await adminDb.doc('organizations/org-1/members/union-admin').set({
        uid: 'union-admin', organizationId: 'org-1', role: 'admin', active: true,
      });
      await adminDb.doc('candidates/candidate-1').set({
        uid: 'candidate-1', organizationId: 'org-1', displayName: 'Scoped Learner',
      });
      await adminDb.doc('candidates/candidate-2').set({
        uid: 'candidate-2', organizationId: 'org-2', displayName: 'Foreign Learner',
      });
      await adminDb.doc('radioBroadcasts/radio-owned').set({
        ownerUid: 'union-admin',
        ownerTenantId: 'union_admin:union-1',
        organizationId: '',
        sharingScope: 'private',
        published: false,
      });
      await adminDb.doc('radioBroadcasts/radio-foreign').set({
        ownerUid: 'other-user',
        ownerTenantId: 'union_admin:union-2',
        organizationId: '',
        sharingScope: 'private',
        published: false,
      });
      await adminDb.doc('certificates/cert-org-1').set({
        candidateId:'candidate-1', organizationId:'org-1', unionId:'union-1', certificateNumber:'CERT-ORG-1',
      });
      await adminDb.doc('certificates/cert-org-2').set({
        candidateId:'candidate-2', organizationId:'org-2', unionId:'union-2', certificateNumber:'CERT-ORG-2',
      });
      await adminDb.doc('tenantSettings/union_admin:union-1/settings/settings').set({ organizationName: 'Scoped Organization Admin' });
      await adminDb.doc('system/settings').set({ appName: 'Platform VOP' });
      await adminDb.doc('unions/union-1').set({
        id:'union-1', name:'Union One', code:'U1',
      });
      await adminDb.doc('unions/union-2').set({
        id:'union-2', name:'Union Two', code:'U2',
      });
      await adminDb.doc('conferences/conf-1').set({
        id:'conf-1', unionId:'union-1', name:'Conference One',
      });
      await adminDb.doc('conferences/conf-2').set({
        id:'conf-2', unionId:'union-2', name:'Conference Two',
      });
      await adminDb.doc('districts/dist-1').set({
        id:'dist-1', unionId:'union-1', conferenceId:'conf-1', name:'District One',
      });
      await adminDb.doc('districts/dist-2').set({
        id:'dist-2', unionId:'union-2', conferenceId:'conf-2', name:'District Two',
      });
      await adminDb.doc('churches/church-1').set({
        id:'church-1', unionId:'union-1', conferenceId:'conf-1', districtId:'dist-1', name:'Church One',
      });
      await adminDb.doc('churches/church-2').set({
        id:'church-2', unionId:'union-2', conferenceId:'conf-2', districtId:'dist-2', name:'Church Two',
      });
      await adminDb.doc('users/conference-admin').set({
        uid:'conference-admin', role:'conference_admin', adminNodeId:'conf-1', adminNodeType:'conference', organizationId:'',
      });
      await adminDb.doc('users/district-admin').set({
        uid:'district-admin', role:'district_admin', adminNodeId:'dist-1', adminNodeType:'district', organizationId:'',
      });
      await adminDb.doc('users/church-admin').set({
        uid:'church-admin', role:'church_admin', adminNodeId:'church-1', adminNodeType:'church', organizationId:'',
      });
    });

    const superAdmin = environment.authenticatedContext('super-admin').firestore();
    const unionAdmin = environment.authenticatedContext('union-admin').firestore();
    const orgAdmin = environment.authenticatedContext('org-admin').firestore();
    await assertSucceeds(unionAdmin.doc('organizations/org-1').get());
    await assertFails(unionAdmin.doc('organizations/org-2').get());
    await assertSucceeds(unionAdmin.doc('organizations/org-1/members/union-admin').get());
    await assertFails(unionAdmin.doc('organizations/org-2/members/union-admin').get());
    await assertSucceeds(unionAdmin.doc('candidates/candidate-1').get());
    await assertFails(unionAdmin.doc('candidates/candidate-2').get());
    await assertSucceeds(unionAdmin.doc('radioBroadcasts/radio-owned').update({ published: true }));
    await assertFails(unionAdmin.doc('radioBroadcasts/radio-foreign').update({ published: true }));
    await assertSucceeds(orgAdmin.doc('announcements/org-owned').update({ title:'Updated Owned' }));
    await assertFails(orgAdmin.doc('announcements/org-foreign').update({ title:'Blocked Foreign' }));
    await assertFails(orgAdmin.doc('announcements/org-foreign').delete());
    await assertSucceeds(orgAdmin.doc('certificates/cert-org-1').get());
    await assertFails(orgAdmin.doc('certificates/cert-org-2').get());
    await assertSucceeds(unionAdmin.doc('certificates/cert-org-1').get());
    await assertFails(unionAdmin.doc('certificates/cert-org-2').get());
    await assertSucceeds(environment.authenticatedContext('candidate-1').firestore().doc('certificates/cert-org-1').get());
    await assertFails(environment.authenticatedContext('candidate-1').firestore().doc('certificates/cert-org-2').get());
    await assertSucceeds(superAdmin.doc('certificates/cert-org-2').get());
    await assertSucceeds(unionAdmin.doc('tenantSettings/union_admin:union-1/settings/settings').get());
    await assertSucceeds(unionAdmin.doc('tenantSettings/union_admin:union-1/settings/settings').update({ organizationName: 'Updated Scoped Tenant' }));
    await assertFails(unionAdmin.doc('tenantSettings/union_admin:union-2/settings/settings').get());
    await assertFails(unionAdmin.doc('tenantSettings/union_admin:union-2/settings/settings').set({ organizationName: 'Foreign' }));
    await assertFails(unionAdmin.doc('system/settings').get());
    await assertFails(unionAdmin.doc('system/permissions').get());

    // Each hierarchy administrator can update its own hierarchy profile and
    // descendants, while cross-scope records remain inaccessible.
    await assertSucceeds(unionAdmin.doc('unions/union-1').update({ name:'Updated Union One' }));
    await assertFails(unionAdmin.doc('unions/union-2').get());
    await assertSucceeds(unionAdmin.doc('conferences/conf-1').update({ name:'Updated Conference One' }));
    await assertFails(unionAdmin.doc('conferences/conf-2').update({ name:'Blocked' }));
    await assertSucceeds(unionAdmin.doc('districts/dist-1').update({ name:'Updated District One' }));
    await assertFails(unionAdmin.doc('districts/dist-2').update({ name:'Blocked' }));
    await assertSucceeds(unionAdmin.doc('churches/church-1').update({ name:'Updated Church One' }));
    await assertFails(unionAdmin.doc('churches/church-2').update({ name:'Blocked' }));

    const conferenceAdmin = environment.authenticatedContext('conference-admin').firestore();
    await assertSucceeds(conferenceAdmin.doc('conferences/conf-1').update({ name:'Conference Owner Edit' }));
    await assertFails(conferenceAdmin.doc('conferences/conf-2').get());
    await assertSucceeds(conferenceAdmin.doc('districts/dist-1').update({ name:'Conference District Edit' }));
    await assertFails(conferenceAdmin.doc('districts/dist-2').update({ name:'Blocked' }));
    await assertSucceeds(conferenceAdmin.doc('churches/church-1').update({ name:'Conference Church Edit' }));
    await assertFails(conferenceAdmin.doc('churches/church-2').update({ name:'Blocked' }));

    const districtAdmin = environment.authenticatedContext('district-admin').firestore();
    await assertSucceeds(districtAdmin.doc('districts/dist-1').update({ name:'District Owner Edit' }));
    await assertFails(districtAdmin.doc('districts/dist-2').get());
    await assertSucceeds(districtAdmin.doc('churches/church-1').update({ name:'District Church Edit' }));
    await assertFails(districtAdmin.doc('churches/church-2').update({ name:'Blocked' }));

    const churchAdmin = environment.authenticatedContext('church-admin').firestore();
    await assertSucceeds(churchAdmin.doc('churches/church-1').update({ name:'Church Owner Edit' }));
    await assertFails(churchAdmin.doc('churches/church-2').get());

    await assertSucceeds(superAdmin.doc('system/permissions').get());
  } finally {
    await environment.cleanup();
  }
});


test('global resource ownership is isolated across organization and hierarchy contributors', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator must be running');
  const environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
  try {
    await environment.withSecurityRulesDisabled(async adminContext => {
      const db = adminContext.firestore();
      await db.doc('users/super-admin').set({ uid:'super-admin', role:'super_admin', organizationId:'' });
      await db.doc('users/org-admin').set({ uid:'org-admin', role:'student', organizationId:'org-1', organizationRole:'admin' });
      await db.doc('users/org-editor').set({ uid:'org-editor', role:'student', organizationId:'org-1', organizationRole:'editor' });
      await db.doc('users/union-admin').set({ uid:'union-admin', role:'union_admin', adminNodeId:'union-1', adminNodeType:'union', organizationId:'' });
      await db.doc('users/foreign-admin').set({ uid:'foreign-admin', role:'union_admin', adminNodeId:'union-2', adminNodeType:'union', organizationId:'' });
      await db.doc('organizations/org-1').set({ id:'org-1', unionId:'union-1', status:'active' });
      await db.doc('organizations/org-2').set({ id:'org-2', unionId:'union-2', status:'active' });
      await db.doc('organizations/org-1/members/org-admin').set({ uid:'org-admin', organizationId:'org-1', role:'admin', active:true });
      await db.doc('organizations/org-1/members/org-editor').set({ uid:'org-editor', organizationId:'org-1', role:'editor', active:true });
      const collections = ['languages','translations','books','radioBroadcasts','playlists'];
      for (const collection of collections) {
        await db.doc(`${collection}/org-owned`).set({
          ownerUid:'org-admin', ownerOrganizationId:'org-1', ownerTenantId:'',
          organizationId:'', sharingScope:'private', enabled:true, published:false,
        });
        await db.doc(`${collection}/org-other`).set({
          ownerUid:'org-editor', ownerOrganizationId:'org-1', ownerTenantId:'',
          organizationId:'', sharingScope:'private', enabled:true, published:false,
        });
        await db.doc(`${collection}/hierarchy-owned`).set({
          ownerUid:'union-admin', ownerOrganizationId:'', ownerTenantId:'union_admin:union-1',
          organizationId:'', sharingScope:'private', enabled:true, published:false,
        });
        await db.doc(`${collection}/hierarchy-foreign`).set({
          ownerUid:'foreign-admin', ownerOrganizationId:'', ownerTenantId:'union_admin:union-2',
          organizationId:'', sharingScope:'private', enabled:true, published:false,
        });
      }
    });

    const orgAdmin = environment.authenticatedContext('org-admin').firestore();
    const orgEditor = environment.authenticatedContext('org-editor').firestore();
    const unionAdmin = environment.authenticatedContext('union-admin').firestore();
    const foreignAdmin = environment.authenticatedContext('foreign-admin').firestore();
    const superAdmin = environment.authenticatedContext('super-admin').firestore();

    for (const collection of ['languages','translations','books','radioBroadcasts','playlists']) {
      await assertSucceeds(orgAdmin.doc(`${collection}/org-owned`).update({ title:'org update' }));
      await assertFails(orgEditor.doc(`${collection}/org-owned`).update({ title:'cross contributor update' }));
      await assertFails(orgEditor.doc(`${collection}/org-owned`).delete());
      await assertSucceeds(unionAdmin.doc(`${collection}/hierarchy-owned`).update({ title:'hierarchy update' }));
      await assertFails(foreignAdmin.doc(`${collection}/hierarchy-owned`).update({ title:'foreign hierarchy update' }));
      await assertFails(foreignAdmin.doc(`${collection}/hierarchy-owned`).delete());
      await assertSucceeds(superAdmin.doc(`${collection}/hierarchy-foreign`).update({ title:'platform update' }));
    }

    // Organization contributors may create their own global contribution.
    await assertSucceeds(orgEditor.doc('radioBroadcasts/org-editor-created').set({
      ownerUid:'org-editor', ownerOrganizationId:'org-1', organizationId:'',
      sharingScope:'private', published:false,
    }));
    // Hierarchy contributors may create their own global contribution, including
    // playlists (the same ownership contract as other global collections).
    await assertSucceeds(unionAdmin.doc('radioBroadcasts/union-created').set({
      ownerUid:'union-admin', ownerTenantId:'union_admin:union-1', organizationId:'',
      sharingScope:'private', published:false,
    }));
    await assertSucceeds(unionAdmin.doc('playlists/union-playlist-created').set({
      ownerUid:'union-admin', ownerTenantId:'union_admin:union-1', organizationId:'',
      sharingScope:'private', published:false,
    }));

    // Hierarchy admins can read the global library, but ownership still controls
    // mutation.
    await assertSucceeds(unionAdmin.doc('radioBroadcasts/hierarchy-foreign').get());
    await assertSucceeds(unionAdmin.doc('books/org-other').get());
  } finally {
    await environment.cleanup();
  }
});
