import test from 'node:test';
import assert from 'node:assert/strict';
import { validCompletion, validResume, queueCompletion, queueResume, pendingForUser, pendingResumesForUser, dropCompletion, readPendingCompletions, readPendingResumes, syncPendingLessonCompletions, syncPendingLessonResumes } from '../src/services/offlineStudyQueue.ts';

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
    const resume={...alice,pageIndex:1};
    assert.equal(validResume(resume),true);
    assert.equal(validResume({...resume,pageIndex:-1}),false);
    assert.equal(queueResume(resume),true);
    assert.equal(queueResume({...resume,pageIndex:3,queuedAt:126}),true);
    assert.equal(readPendingResumes().length,1,'Only the latest page for a lesson is retained.');
    assert.equal(pendingResumesForUser('learner-alice')[0]?.pageIndex,3);
    assert.equal(queueResume({...resume,uid:'learner-bob',pageIndex:2}),true);
    assert.equal(readPendingResumes().length,2,'Resume state stays namespaced to each account.');
    // No account in a non-browser test runner: no network traffic or credits.
    assert.deepEqual(await syncPendingLessonCompletions(), {synced:0,remaining:0,rejected:0});
    assert.deepEqual(await syncPendingLessonResumes(), {synced:0,remaining:0,rejected:0});
    assert.equal(dropCompletion(alice),true);
    assert.equal(pendingForUser('learner-alice').length,0);
    assert.equal(pendingForUser('learner-bob').length,1);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});
