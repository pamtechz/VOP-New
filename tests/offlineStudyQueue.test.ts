import test from 'node:test';
import assert from 'node:assert/strict';
import { validCompletion, queueCompletion, pendingForUser, dropCompletion, readPendingCompletions, syncPendingLessonCompletions } from '../src/services/offlineStudyQueue.ts';

test('offline completion queue deduplicates and cannot invent official progress', async () => {
  const data = new Map<string,string>();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem:key => data.get(key) ?? null,
    setItem:(key,value) => { data.set(key,String(value)); },
  } as Storage;
  try {
    const alice = { uid:'learner-alice',guideId:'guide-one',lessonId:'lesson-one',language:'bem',queuedAt:123 };
    const bob = { ...alice,uid:'learner-bob',queuedAt:124 };
    assert.equal(validCompletion(alice),true);
    assert.equal(validCompletion({...alice,guideId:'../../secrets'}),false);
    assert.equal(validCompletion({...alice,language:'javascript:alert(1)'}),false);
    assert.equal(queueCompletion(alice),true);
    assert.equal(queueCompletion({...alice,queuedAt:125}),true);
    assert.equal(queueCompletion(bob),true);
    assert.equal(readPendingCompletions().length,2);
    assert.equal(pendingForUser('learner-alice').length,1);
    assert.equal(pendingForUser('learner-bob').length,1);
    // No account in a non-browser test runner: no network traffic or credits.
    assert.deepEqual(await syncPendingLessonCompletions(), {synced:0,remaining:0,rejected:0});
    assert.equal(dropCompletion(alice),true);
    assert.equal(pendingForUser('learner-alice').length,0);
    assert.equal(pendingForUser('learner-bob').length,1);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});
