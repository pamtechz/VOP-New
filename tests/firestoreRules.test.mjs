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
      const record = alice.doc(path('valid'));
      await assertSucceeds(record.set(submission()));
      const snapshot = await assertSucceeds(record.get());
      assert.equal(snapshot.data()?.ownerUid, 'alice');
      await assertSucceeds(alice.collection('users/alice/progress').get());
      await assertSucceeds(alice.doc('users/alice').get());
    });

    await t.test('cross-user and unauthenticated reads, writes and lists fail', async () => {
      await assertFails(bob.doc(path('valid')).get());
      await assertFails(bob.collection('users/alice/progress').get());
      await assertFails(bob.doc(path('bob-write')).set(submission('bob')));
      await assertFails(anonymous.doc(path('valid')).get());
      await assertFails(anonymous.doc(path('anonymous-write')).set(submission()));
      await assertFails(anonymous.collection('users/alice/progress').get());
      await assertFails(alice.doc('users/bob').get());
      await assertSucceeds(bob.doc('users/bob').get());
    });

    await t.test('owner cannot overwrite or delete history or create privileged profile', async () => {
      await assertFails(alice.doc(path('valid')).set(submission()));
      await assertFails(alice.doc(path('valid')).update({ practiceScore: 100 }));
      await assertFails(alice.doc(path('valid')).delete());
      await assertFails(alice.doc('users/alice').set({ role: 'admin' }));
      await assertFails(alice.doc('users/alice/grades/official').set({ score: 100 }));
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
