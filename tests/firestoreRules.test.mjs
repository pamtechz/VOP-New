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
      await assertFails(alice.doc('users/alice').set({ uid:'alice', role:'student' }));
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
      // These profiles deliberately retain stale tenant metadata. Neither a
      // missing membership document nor an inactive membership may authorize
      // tenant reads/writes.
      await adminDb.doc('users/stale-org-admin').set({
        uid:'stale-org-admin', role:'student', organizationId:'org-1', organizationRole:'admin',
      });
      await adminDb.doc('users/inactive-org-admin').set({
        uid:'inactive-org-admin', role:'student', organizationId:'org-1', organizationRole:'admin',
      });
      await adminDb.doc('organizations/org-1/members/inactive-org-admin').set({
        uid:'inactive-org-admin', organizationId:'org-1', role:'admin', active:false,
      });
      await adminDb.doc('organizations/org-1/settings/settings').set({
        organizationName:'Scoped Organization',
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
      await adminDb.doc('users/church-learner').set({
        uid:'church-learner', role:'student', organizationId:'',
        unionId:'union-1', conferenceId:'conf-1', districtId:'dist-1', churchId:'church-1',
      });
      await adminDb.doc('tenantSettings/church_admin:church-1/settings/settings').set({
        organizationName:'Church One Ministry', detailPages:{aboutUsMission:'Local mission'},
      });
      await adminDb.doc('tenantSettings/church_admin:church-2/settings/settings').set({
        organizationName:'Church Two Ministry',
      });
    });

    const superAdmin = environment.authenticatedContext('super-admin').firestore();
    const unionAdmin = environment.authenticatedContext('union-admin').firestore();
    const orgAdmin = environment.authenticatedContext('org-admin').firestore();
    const staleOrgAdmin = environment.authenticatedContext('stale-org-admin').firestore();
    const inactiveOrgAdmin = environment.authenticatedContext('inactive-org-admin').firestore();

    // Profile fields are routing metadata only. A live, active membership
    // document is required by Firestore authorization.
    for (const revoked of [staleOrgAdmin,inactiveOrgAdmin]) {
      await assertFails(revoked.doc('organizations/org-1').get());
      await assertFails(revoked.doc('organizations/org-1/settings/settings').get());
      await assertFails(revoked.doc('announcements/org-owned').update({title:'stale tenant bypass'}));
      await assertFails(revoked.doc('certificates/cert-org-1').get());
    }

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
    // Audit evidence and operational visibility overlays are server-authoritative.
    // Even privileged client SDK sessions cannot forge or erase the ledger.
    await assertFails(orgAdmin.doc('organizations/org-1/audit/forged-org-audit').set({action:'forged',actorUid:'org-admin'}));
    await assertFails(superAdmin.doc('organizations/org-1/audit/forged-super-audit').set({action:'forged',actorUid:'super-admin'}));
    await assertFails(orgAdmin.doc('organizations/org-1/auditVisibility/forged').set({hidden:true}));
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
    await assertSucceeds(unionAdmin.doc('system/settings').get());
    await assertFails(unionAdmin.doc('system/permissions').get());
    const churchLearner = environment.authenticatedContext('church-learner').firestore();
    await assertSucceeds(churchLearner.doc('system/settings').get());
    await assertSucceeds(churchLearner.doc('tenantSettings/church_admin:church-1/settings/settings').get());
    await assertFails(churchLearner.doc('tenantSettings/church_admin:church-2/settings/settings').get());
    await assertFails(churchLearner.doc('tenantSettings/church_admin:church-1/settings/settings').update({organizationName:'Learner cannot edit'}));

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

    // Canonical languages and translations are platform-owned regardless of
    // contributor role or private/shared flags.
    for(const collection of ['languages','translations']){
      await assertFails(orgAdmin.doc(`${collection}/org-owned`).update({title:'tenant bypass'}));
      await assertFails(orgEditor.doc(`${collection}/org-owned`).update({title:'peer bypass'}));
      await assertFails(unionAdmin.doc(`${collection}/hierarchy-owned`).update({title:'hierarchy bypass'}));
      await assertSucceeds(superAdmin.doc(`${collection}/hierarchy-foreign`).update({title:'platform update'}));
    }
    for (const collection of ['books','radioBroadcasts','playlists']) {
      await assertSucceeds(orgAdmin.doc(`${collection}/org-owned`).update({ title:'org update' }));
      await assertFails(orgEditor.doc(`${collection}/org-owned`).update({ title:'cross contributor update' }));
      await assertFails(orgEditor.doc(`${collection}/org-owned`).delete());
      await assertSucceeds(unionAdmin.doc(`${collection}/hierarchy-owned`).update({ title:'hierarchy update' }));
      await assertFails(foreignAdmin.doc(`${collection}/hierarchy-owned`).update({ title:'foreign hierarchy update' }));
      await assertFails(foreignAdmin.doc(`${collection}/hierarchy-owned`).delete());
      await assertSucceeds(superAdmin.doc(`${collection}/hierarchy-foreign`).update({ title:'platform update' }));
    }
    await environment.withSecurityRulesDisabled(async privileged=>{
      const database=privileged.firestore();
      await database.doc('books/stewarded').set({
        ownerUid:'org-admin',ownerOrganizationId:'org-1',organizationId:'',
        sharingScope:'shared',published:true,
      });
      await database.doc('organizations/org-1/languages/abc').set({
        code:'abc',name:'Organization language',organizationId:'org-1',ownerUid:'org-admin',
      });
      await database.doc('organizations/org-1/locales/abc/translations/common.save').set({
        key:'common.save',value:'Private text',ownerUid:'org-admin',
      });
    });
    await assertFails(orgAdmin.doc('books/stewarded').update({title:'cannot reclaim'}));
    await assertFails(unionAdmin.doc('books/stewarded').delete());
    await assertSucceeds(superAdmin.doc('books/stewarded').update({title:'platform steward'}));
    await assertFails(orgAdmin.doc('organizations/org-1/languages/abc').get());
    await assertFails(foreignAdmin.doc('organizations/org-1/languages/abc').get());
    await assertSucceeds(superAdmin.doc('organizations/org-1/languages/abc').get());
    await assertFails(orgAdmin.doc('organizations/org-1/languages/abc').update({name:'direct bypass'}));
    await assertFails(orgAdmin.doc('organizations/org-1/locales/abc/translations/common.save').get());
    await assertFails(foreignAdmin.doc('organizations/org-1/locales/abc/translations/common.save').get());
    await assertSucceeds(superAdmin.doc('organizations/org-1/locales/abc/translations/common.save').get());
    await assertFails(orgAdmin.doc('organizations/org-1/locales/abc/translations/common.save').update({value:'direct bypass'}));

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

    // Direct Firestore writes must not bypass the API's atomic platform
    // language adoption when a tenant publishes a shared guide.
    await assertFails(orgAdmin.doc('guides/direct-shared').set({
      id:'direct-shared',organizationId:'org-1',ownerOrganizationId:'org-1',
      ownerUid:'org-admin',sharingScope:'shared',published:true,
    }));
    await assertSucceeds(orgAdmin.doc('guides/local-draft').set({
      id:'local-draft',organizationId:'org-1',ownerOrganizationId:'org-1',
      ownerUid:'org-admin',sharingScope:'organization',published:false,
    }));
    await assertFails(orgAdmin.doc('guides/local-draft').update({
      sharingScope:'shared',published:true,
    }));
    await assertFails(orgEditor.doc('guides/forged-author').set({
      id:'forged-author',organizationId:'org-1',ownerOrganizationId:'org-1',
      ownerUid:'org-admin',sharingScope:'organization',published:false,
    }));
    await assertSucceeds(orgAdmin.doc('guides/local-draft/lessons/draft-1').set({
      id:'draft-1',organizationId:'org-1',ownerOrganizationId:'org-1',
      ownerUid:'org-admin',sharingScope:'organization',published:false,
    }));
    await assertFails(orgAdmin.doc('guides/local-draft/lessons/direct-shared').set({
      id:'direct-shared',organizationId:'org-1',ownerOrganizationId:'org-1',
      ownerUid:'org-admin',sharingScope:'shared',published:true,
    }));
    await assertSucceeds(orgAdmin.doc('guides/local-draft/lessons/draft-1').delete());
    await assertSucceeds(orgAdmin.doc('guides/local-draft').delete());
    await assertSucceeds(superAdmin.doc('guides/platform-shared').set({
      id:'platform-shared',organizationId:'org-1',ownerOrganizationId:'org-1',
      sharingScope:'shared',published:true,platformOwned:true,
    }));
    await assertFails(orgEditor.doc('radioBroadcasts/org-editor-created').update({
      sharingScope:'shared',published:true,
    }));
    await assertFails(unionAdmin.doc('playlists/union-playlist-created').update({
      sharingScope:'shared',published:true,
    }));
    await assertFails(unionAdmin.doc('playlists/direct-shared').set({
      id:'direct-shared',organizationId:'',ownerUid:'union-admin',
      ownerTenantId:'union_admin:union-1',sharingScope:'shared',published:true,
    }));

    // Hierarchy admins can read the global library, but ownership still controls
    // mutation.
    await assertFails(unionAdmin.doc('radioBroadcasts/hierarchy-foreign').get());
    await assertSucceeds(unionAdmin.doc('books/org-other').get());
    await assertFails(foreignAdmin.doc('books/org-other').get());
    await environment.withSecurityRulesDisabled(async privileged=>{
      const db=privileged.firestore();
      await db.doc('books/foreign-owner').set({
        ownerUid:'org-admin',ownerOrganizationId:'org-2',
        organizationId:'',sharingScope:'private',published:false,
      });
    });
    await assertFails(orgAdmin.doc('books/foreign-owner').get());
    await assertFails(orgAdmin.doc('books/foreign-owner').update({title:'wrong tenant'}));
    await assertFails(unionAdmin.doc('books/foreign-owner').get());
    await assertSucceeds(foreignAdmin.doc('books/foreign-owner').get());
  } finally {
    await environment.cleanup();
  }
});


test('nested hierarchy fields remain authorized by Firestore rules', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator must be running');
  const environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
  try {
    await environment.withSecurityRulesDisabled(async adminContext => {
      const db = adminContext.firestore();
      await db.doc('users/union-admin').set({
        uid:'union-admin', role:'union_admin', adminNodeId:'union-1', adminNodeType:'union', organizationId:'',
      });
      await db.doc('organizations/nested-org').set({
        id:'nested-org', name:'Nested Organization', hierarchy:{ unionId:'union-1' },
      });
      await db.doc('conferences/nested-conf').set({
        id:'nested-conf', name:'Nested Conference', hierarchy:{ unionId:'union-1' },
      });
      await db.doc('districts/nested-dist').set({
        id:'nested-dist', name:'Nested District', hierarchy:{ unionId:'union-1', conferenceId:'nested-conf' },
      });
      await db.doc('churches/nested-church').set({
        id:'nested-church', name:'Nested Church', hierarchy:{ unionId:'union-1', conferenceId:'nested-conf', districtId:'nested-dist', churchId:'nested-church' },
      });
      await db.doc('users/nested-user').set({
        uid:'nested-user', role:'student', organizationId:'nested-org',
        hierarchy:{ unionId:'union-1' },
      });
      await db.doc('certificates/nested-cert').set({
        candidateId:'nested-user', organizationId:'nested-org',
        hierarchy:{ unionId:'union-1' }, certificateNumber:'NESTED-1',
      });
    });

    const unionAdmin = environment.authenticatedContext('union-admin').firestore();
    await assertSucceeds(unionAdmin.doc('organizations/nested-org').get());
    await assertSucceeds(unionAdmin.doc('conferences/nested-conf').get());
    await assertSucceeds(unionAdmin.doc('districts/nested-dist').get());
    await assertSucceeds(unionAdmin.doc('churches/nested-church').get());
    await assertSucceeds(unionAdmin.doc('users/nested-user').get());
    await assertSucceeds(unionAdmin.doc('certificates/nested-cert').get());
    await assertFails(unionAdmin.doc('organizations/foreign-nested').get());
  } finally {
    await environment.cleanup();
  }
});


test('localization applications, collaborators and review votes are API-only',async()=>{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore emulator required.');
  const environment=await initializeTestEnvironment({
    projectId,firestore:{rules,host:'127.0.0.1',port:8080},
  });
  try{
    await environment.withSecurityRulesDisabled(async privileged=>{
      const db=privileged.firestore();
      await db.doc('users/localizer').set({uid:'localizer',role:'student',organizationId:'org-1'});
      await db.doc('localizationApplications/localizer').set({uid:'localizer',status:'pending'});
      await db.doc('localizationCollaborators/localizer').set({uid:'localizer',status:'active',roles:['translator']});
      await db.doc('translations/bem/proposals/proposal-a').set({proposerUid:'localizer',status:'pending'});
      await db.doc('translations/bem/proposals/proposal-a/recommendations/reviewer-a').set({decision:'recommend'});
    });
    const user=environment.authenticatedContext('localizer').firestore();
    for(const path of [
      'localizationApplications/localizer',
      'localizationCollaborators/localizer',
      'translations/bem/proposals/proposal-a',
      'translations/bem/proposals/proposal-a/recommendations/reviewer-a',
    ]){
      await assertFails(user.doc(path).get());
      await assertFails(user.doc(path).set({forged:true},{merge:true}));
    }
  }finally{await environment.cleanup();}
});

test('personal settings allow UI locale and study language but remain user-private', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator must be running');
  const environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
  try {
    await environment.withSecurityRulesDisabled(async adminContext => {
      const db = adminContext.firestore();
      await db.doc('users/student-settings').set({ uid:'student-settings', role:'student', organizationId:'org-1' });
      await db.doc('users/other-settings').set({ uid:'other-settings', role:'student', organizationId:'org-1' });
    });

    const student = environment.authenticatedContext('student-settings').firestore();
    const other = environment.authenticatedContext('other-settings').firestore();

    await assertSucceeds(student.doc('users/student-settings/settings/personal').set({
      uiLocale:'en',
      studyLanguage:'bem',
      theme:'light',
      updatedAt: new Date(),
    }));
    await assertSucceeds(student.doc('users/student-settings/settings/personal').update({ studyLanguage:'nya' }));
    await assertFails(other.doc('users/student-settings/settings/personal').get());
    await assertFails(other.doc('users/student-settings/settings/personal').set({ uiLocale:'fr' }));
    await assertFails(student.doc('users/student-settings/settings/personal').update({ role:'super_admin' }));
  } finally {
    await environment.cleanup();
  }
});

test('assessment bank answer keys stay private; generated assessments require server writes', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator must be running');
  const environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
  try {
    await environment.withSecurityRulesDisabled(async privileged => {
      const db = privileged.firestore();
      await db.doc('users/quiz-learner').set({uid:'quiz-learner',role:'student',organizationId:'school-a',organizationRole:'learner'});
      await db.doc('users/quiz-author').set({uid:'quiz-author',role:'student',organizationId:'school-a',organizationRole:'admin'});
      await db.doc('users/quiz-outsider').set({uid:'quiz-outsider',role:'student',organizationId:'school-b',organizationRole:'learner'});
      await db.doc('organizations/school-a').set({id:'school-a',status:'active'});
      await db.doc('organizations/school-b').set({id:'school-b',status:'active'});
      await db.doc('organizations/school-a/members/quiz-learner').set({uid:'quiz-learner',role:'learner',organizationId:'school-a',active:true});
      await db.doc('organizations/school-a/members/quiz-author').set({uid:'quiz-author',role:'admin',organizationId:'school-a',active:true});
      await db.doc('organizations/school-b/members/quiz-outsider').set({uid:'quiz-outsider',role:'learner',organizationId:'school-b',active:true});
      await db.doc('guides/guide-secure').set({id:'guide-secure',organizationId:'school-a',sharingScope:'organization',published:true});
      await db.doc('quizzes/quiz-secure').set({
        id:'quiz-secure',ownerUid:'quiz-author',ownerTenantId:'school-a',
        ownerOrganizationId:'school-a',organizationId:'school-a',sharingScope:'shared',published:true,
        questions:[{key:'q1',question:'Secret?',options:['A','B'],correctOptionIndex:1}],
      });
      await db.doc('guides/guide-secure/lessons/quiz-quiz-secure').set({
        id:'quiz-quiz-secure',type:'Test',sourceQuizId:'quiz-secure',
        answerVisibility:'public_redacted',organizationId:'school-a',ownerOrganizationId:'school-a',
        ownerUid:'quiz-author',published:true,sharingScope:'organization',
        questions:[{key:'q1',question:'Secret?',options:['A','B']}],
      });
    });
    const learner = environment.authenticatedContext('quiz-learner').firestore();
    const author = environment.authenticatedContext('quiz-author').firestore();
    const outsider = environment.authenticatedContext('quiz-outsider').firestore();
    await assertFails(learner.doc('quizzes/quiz-secure').get());
    await assertFails(outsider.doc('quizzes/quiz-secure').get());
    await assertSucceeds(author.doc('quizzes/quiz-secure').get());
    const assessment = await assertSucceeds(learner.doc('guides/guide-secure/lessons/quiz-quiz-secure').get());
    assert.equal(assessment.data().questions[0].correctOptionIndex, undefined);
    await assertFails(author.doc('quizzes/quiz-secure').update({published:false}));
    await assertFails(author.doc('guides/guide-secure/lessons/quiz-quiz-secure').update({title:'Tampered'}));
    await assertFails(author.doc('guides/guide-secure/lessons/quiz-attacker').set({
      sourceQuizId:'quiz-secure',organizationId:'school-a',ownerOrganizationId:'school-a',
      ownerUid:'quiz-author',type:'Test',
    }));
  } finally {
    await environment.cleanup();
  }
});


test('events respect organization visibility and notifications remain recipient-private', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator must be running');
  const environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
  try {
    await environment.withSecurityRulesDisabled(async adminContext => {
      const db = adminContext.firestore();
      await db.doc('organizations/org-events').set({id:'org-events',name:'Events Church',status:'active'});
      await db.doc('organizations/org-foreign').set({id:'org-foreign',name:'Foreign Church',status:'active'});
      await db.doc('users/event-admin').set({uid:'event-admin',role:'student',organizationId:'org-events',organizationRole:'admin'});
      await db.doc('users/member-a').set({uid:'member-a',role:'student',organizationId:'org-events'});
      await db.doc('users/member-b').set({uid:'member-b',role:'student',organizationId:'org-foreign'});
      await db.doc('organizations/org-events/members/event-admin').set({uid:'event-admin',organizationId:'org-events',role:'admin',active:true});
      await db.doc('organizations/org-events/members/member-a').set({uid:'member-a',organizationId:'org-events',role:'learner',active:true});
      await db.doc('organizations/org-foreign/members/member-b').set({uid:'member-b',organizationId:'org-foreign',role:'learner',active:true});
      await db.doc('events/private-event').set({
        id:'private-event',title:'Members Programme',description:'Private',organizationId:'org-events',ownerOrganizationId:'org-events',
        ownerUid:'event-admin',sharingScope:'organization',published:true,startAt:'2026-10-01T08:00:00.000Z',
      });
      await db.doc('events/public-event').set({
        id:'public-event',title:'Public Rally',description:'Public',organizationId:'org-events',ownerOrganizationId:'org-events',
        ownerUid:'event-admin',sharingScope:'shared',published:true,startAt:'2026-10-02T08:00:00.000Z',
      });
      await db.doc('notifications/note-a').set({
        recipientId:'member-a',userId:'member-a',organizationId:'org-events',title:'Reminder',body:'Programme tomorrow',read:false,
      });
    });

    const admin = environment.authenticatedContext('event-admin').firestore();
    const memberA = environment.authenticatedContext('member-a').firestore();
    const memberB = environment.authenticatedContext('member-b').firestore();
    const anonymous = environment.unauthenticatedContext().firestore();

    await assertSucceeds(memberA.doc('events/private-event').get());
    await assertFails(memberB.doc('events/private-event').get());
    await assertSucceeds(memberB.doc('events/public-event').get());
    await assertSucceeds(anonymous.doc('events/public-event').get());
    await assertFails(anonymous.doc('events/private-event').get());

    await assertSucceeds(admin.doc('events/private-event').update({title:'Updated Members Programme'}));
    await assertFails(memberA.doc('events/private-event').update({title:'Learner edit'}));

    await assertSucceeds(memberA.doc('notifications/note-a').get());
    await assertFails(memberB.doc('notifications/note-a').get());
    await assertFails(anonymous.doc('notifications/note-a').get());
    await assertFails(memberA.doc('notifications/note-a').update({read:true}));
    await assertFails(memberA.doc('notificationDeliveries/delivery-a').get());
    await assertFails(admin.doc('notificationDeliveries/delivery-a').get());
    await assertFails(memberA.doc('notificationDeliveries/delivery-a').set({state:'sent'}));
  } finally {
    await environment.cleanup();
  }
});


test('courses obey tenant reads, API-only writes and private instructor note isolation',async()=>{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore emulator required.');
  const environment=await initializeTestEnvironment({
    projectId,firestore:{rules,host:'127.0.0.1',port:8080},
  });
  try{
    await environment.withSecurityRulesDisabled(async adminContext=>{
      const db=adminContext.firestore();
      await db.doc('organizations/programs-org-a').set({id:'programs-org-a',status:'active'});
      await db.doc('organizations/programs-org-b').set({id:'programs-org-b',status:'active'});
      for(const [id,organizationId,role] of [
        ['programs-owner','programs-org-a','owner'],
        ['programs-student','programs-org-a','learner'],
        ['programs-outsider','programs-org-b','learner'],
      ]){
        await db.doc('users/'+id).set({uid:id,organizationId,organizationRole:role,role:'student'});
        await db.doc('organizations/'+organizationId+'/members/'+id).set({
          uid:id,organizationId,role,active:true,
        });
      }
      await db.doc('users/programs-super').set({uid:'programs-super',role:'super_admin'});
      await db.doc('programs/course-org-a').set({
        id:'course-org-a',title:'Private course',organizationId:'programs-org-a',
        ownerOrganizationId:'programs-org-a',ownerUid:'programs-owner',
        sharingScope:'organization',published:true,archived:false,
        guideIds:['guide-programs-a'],entryMode:'sections',
      });
      await db.doc('programs/course-shared').set({
        id:'course-shared',title:'Shared course',organizationId:'programs-org-a',
        sharingScope:'shared',published:true,archived:false,
        guideIds:['guide-programs-a'],entryMode:'lessons',
      });
      await db.doc('programs/course-draft').set({
        id:'course-draft',title:'Draft course',organizationId:'programs-org-a',
        sharingScope:'shared',published:false,archived:false,guideIds:[],
      });
      await db.doc('guides/guide-programs-a').set({
        id:'guide-programs-a',organizationId:'programs-org-a',sharingScope:'organization',
        published:true,
      });
      await db.doc('guides/guide-programs-a/lessons/lesson-programs-a').set({
        id:'lesson-programs-a',title:'Safe public lesson',organizationId:'programs-org-a',
        published:true,sharingScope:'organization',
      });
      await db.doc('guides/guide-programs-a/lessons/lesson-programs-a/private/instructorNotes').set({
        text:'PRIVATE INSTRUCTOR ONLY',
      });
    });
    const owner=environment.authenticatedContext('programs-owner').firestore();
    const learner=environment.authenticatedContext('programs-student').firestore();
    const outsider=environment.authenticatedContext('programs-outsider').firestore();
    const superAdmin=environment.authenticatedContext('programs-super').firestore();
    const anonymous=environment.unauthenticatedContext().firestore();
    await assertSucceeds(learner.doc('programs/course-org-a').get());
    await assertFails(outsider.doc('programs/course-org-a').get());
    await assertFails(anonymous.doc('programs/course-org-a').get());
    await assertSucceeds(outsider.doc('programs/course-shared').get());
    await assertSucceeds(anonymous.doc('programs/course-shared').get());
    await assertFails(outsider.doc('programs/course-draft').get());
    await assertSucceeds(superAdmin.doc('programs/course-draft').get());
    await assertFails(owner.doc('programs/course-org-a').update({title:'Unverified change'}));
    await assertFails(superAdmin.doc('programs/course-org-a').update({title:'Direct edit'}));
    await assertFails(owner.doc('programs/forged').set({published:true}));
    const notes='guides/guide-programs-a/lessons/lesson-programs-a/private/instructorNotes';
    await assertSucceeds(learner.doc('guides/guide-programs-a/lessons/lesson-programs-a').get());
    for(const client of [owner,learner,outsider,superAdmin,anonymous]){
      await assertFails(client.doc(notes).get());
      await assertFails(client.doc(notes).set({text:'Tampered'}));
      await assertFails(client.collection('guides/guide-programs-a/lessons/lesson-programs-a/private').get());
    }
  }finally{
    await environment.cleanup();
  }
});


test('private learning evidence, attempts and certificates stay isolated across tenants', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator must be running');
  const environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
  try {
    await environment.withSecurityRulesDisabled(async adminContext => {
      const adminDb=adminContext.firestore();
      await adminDb.doc('users/private-a').set({uid:'private-a',role:'student',organizationId:'private-org-a',organizationRole:'learner'});
      await adminDb.doc('users/private-b').set({uid:'private-b',role:'student',organizationId:'private-org-b',organizationRole:'learner'});
      await adminDb.doc('organizations/private-org-a').set({id:'private-org-a',status:'active'});
      await adminDb.doc('organizations/private-org-b').set({id:'private-org-b',status:'active'});
      await adminDb.doc('organizations/private-org-a/members/private-a').set({uid:'private-a',organizationId:'private-org-a',role:'learner',active:true});
      await adminDb.doc('organizations/private-org-b/members/private-b').set({uid:'private-b',organizationId:'private-org-b',role:'learner',active:true});
      await adminDb.doc('users/private-a/assessmentAttempts/attempt-a').set({
        candidateId:'private-a',userId:'private-a',organizationId:'private-org-a',
        guideId:'guide-a',lessonId:'test-a',language:'en',score:85,passed:true,
      });
      await adminDb.doc('masterGuidePortfolios/private-a').set({
        learnerId:'private-a',organizationId:'private-org-a',
        evidence:[{id:'evidence-a',requirementId:'req-a',url:'https://example.org/private'}],
        signoffs:[{id:'approval-a',requirementId:'req-a',decision:'approved',evaluatorId:'mentor-a'}],
      });
      await adminDb.doc('certificates/private-cert-a').set({
        candidateId:'private-a',organizationId:'private-org-a',
        certificateNumber:'PRIVATE-CERT-A',status:'Certified',
      });
    });
    const learnerA=environment.authenticatedContext('private-a').firestore();
    const learnerB=environment.authenticatedContext('private-b').firestore();
    await assertFails(learnerA.doc('users/private-a/assessmentAttempts/attempt-a').get(),
      'Verified attempt detail is server-only even for the learner.');
    await assertFails(learnerB.doc('users/private-a/assessmentAttempts/attempt-a').get());
    await assertFails(learnerB.doc('users/private-a/assessmentAttempts/attempt-a').update({score:100}));
    await assertFails(learnerB.doc('users/private-a/assessmentAttempts/attempt-a').delete());

    await assertFails(learnerA.doc('masterGuidePortfolios/private-a').get(),
      'Portfolio evidence/signatures are API-only private records.');
    await assertFails(learnerB.doc('masterGuidePortfolios/private-a').get());
    await assertFails(learnerB.doc('masterGuidePortfolios/private-a').update({status:'approved'}));

    await assertSucceeds(learnerA.doc('certificates/private-cert-a').get());
    await assertFails(learnerB.doc('certificates/private-cert-a').get());
    await assertFails(learnerB.doc('certificates/private-cert-a').update({status:'Certified'}));
  } finally {
    await environment.cleanup();
  }
});


test('financial records are server-authoritative even for authenticated administrators', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator must be running');
  const environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
  try {
    await environment.withSecurityRulesDisabled(async adminContext => {
      const db=adminContext.firestore();
      await db.doc('users/payment-super').set({uid:'payment-super',role:'super_admin',organizationId:''});
      await db.doc('users/payment-user').set({uid:'payment-user',role:'student',organizationId:'payment-org'});
      await db.doc('paymentTransactions/payment-1').set({payerUid:'payment-user',status:'paid',organizationId:'payment-org'});
      await db.doc('paymentReceipts/payment-1').set({payerUid:'payment-user',paymentId:'payment-1'});
      await db.doc('payableItems/item-1').set({active:true,scope:'organization',organizationId:'payment-org'});
      await db.doc('paymentProviderConfigs/lenco').set({enabled:true});
      await db.doc('paymentWebhookEvents/event-1').set({provider:'lenco'});
      await db.doc('paymentRefunds/refund-1').set({paymentId:'payment-1',status:'completed'});
      await db.doc('paymentFulfilments/payment-1').set({status:'fulfilled'});
      await db.doc('passkeyCredentials/passkey-test').set({uid:'payment-user',credentialId:'credential'});
      await db.doc('passkeyChallenges/challenge-test').set({purpose:'authentication',expiresAt:'2026-10-05T21:00:00Z'});
      await db.doc('authRateLimits/passkey-test').set({count:1,expiresAt:'2026-10-05T21:00:00Z'});
      await db.doc('operationsBackupRuns/2026-10-05').set({status:'completed'});
      await db.doc('operationalAlerts/firestore-backup-stale').set({lastNotifiedAt:'2026-10-05T00:00:00Z'});
      await db.doc('system/operations').set({lastMaintenanceAt:'2026-10-05T00:00:00Z'});
    });
    const learner=environment.authenticatedContext('payment-user').firestore();
    const admin=environment.authenticatedContext('payment-super').firestore();
    for(const db of [learner,admin]){
      await assertFails(db.doc('paymentTransactions/payment-1').get());
      await assertFails(db.doc('paymentTransactions/payment-1').set({status:'paid'}));
      await assertFails(db.doc('paymentReceipts/payment-1').get());
      await assertFails(db.doc('payableItems/item-1').get());
      await assertFails(db.doc('paymentProviderConfigs/lenco').get());
      await assertFails(db.doc('paymentWebhookEvents/event-1').get());
      await assertFails(db.doc('paymentRefunds/refund-1').get());
      await assertFails(db.doc('paymentRefunds/refund-1').set({status:'completed'}));
      await assertFails(db.doc('paymentFulfilments/payment-1').get());
      await assertFails(db.doc('passkeyCredentials/passkey-test').get());
      await assertFails(db.doc('passkeyChallenges/challenge-test').get());
      await assertFails(db.doc('passkeyChallenges/challenge-test').set({purpose:'forged'}));
      await assertFails(db.doc('authRateLimits/passkey-test').get());
      await assertFails(db.doc('authRateLimits/passkey-test').set({count:0}));
      await assertFails(db.doc('operationsBackupRuns/2026-10-05').get());
      await assertFails(db.doc('operationsBackupRuns/2026-10-05').set({status:'forged'}));
      await assertFails(db.doc('operationalAlerts/firestore-backup-stale').get());
      await assertFails(db.doc('system/operations').get());
    }
  } finally {
    await environment.cleanup();
  }
});
