import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer } from 'vite';

test('engagement API: authenticated learner, mentor, memory and duel workflows', async t => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator is required; never run against production.');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Auth emulator is required; never run against production.');
  if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_PROJECT_ID !== 'demo-vop-security-rules') {
    throw new Error('Refusing to run against a non-demo Firebase project.');
  }
  process.env.FIREBASE_ADMIN_PROJECT_ID = 'demo-vop-security-rules';

  const app = getApps()[0] || initializeApp({ projectId: 'demo-vop-security-rules' });
  const db = getFirestore(app);
  const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { default: handler } = await vite.ssrLoadModule('/api/engagement.ts');
    assert.equal(typeof handler, 'function');

    async function identity(name, organizationId, extra = {}) {
      const response = await fetch('http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST +
        '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: name + '@vop-test.invalid', password: 'isolated-test-password', returnSecureToken: true }),
      });
      const data = await response.json();
      assert.equal(response.status, 200, JSON.stringify(data));
      await db.doc('users/' + data.localId).set({
        uid: data.localId, displayName: name, role: 'student', organizationId, ...extra,
      });
      return { uid: data.localId, token: data.idToken };
    }

    async function api(user, body) {
      let status = 200;
      let output;
      const response = {
        status(code) { status = code; return this; },
        json(data) { output = data; return this; },
      };
      await handler({
        method: 'POST', headers: user ? { authorization: 'Bearer ' + user.token } : {}, body,
      }, response);
      assert.ok(output && typeof output === 'object', 'API must return JSON.');
      return { status, ...output };
    }

    const learner = await identity('studentA', 'org-A');
    const peer = await identity('studentB', 'org-A', { scriptureDuelOptIn: true });
    const mentor = await identity('mentorA', 'org-A', { organizationRole: 'mentor' });
    const outsider = await identity('studentOther', 'org-B');
    await db.doc('organizations/org-A').set({ id: 'org-A', status: 'active' });
    await db.doc('organizations/org-B').set({ id: 'org-B', status: 'active' });
    await db.doc('mentorAssignments/' + learner.uid).set({ mentorId: mentor.uid });
    await db.doc('masterGuideRequirements/req-1').set({
      title: 'Personal devotion', organizationId: 'org-A', status: 'published',
    });

    await t.test('self-service portfolio is private and does not permit learner self-signoff', async () => {
      assert.equal((await api(learner, { action: 'portfolioGet' })).status, 200);
      assert.equal((await api(outsider, { action: 'portfolioGet', learnerId: learner.uid })).status, 403);
      const forbidden = await api(learner, {
        action: 'portfolioSaveActivity', requirementId: 'req-1', status: 'verified',
      });
      assert.notEqual(forbidden.status, 200);
      assert.notEqual((await api(learner, {
        action: 'portfolioSaveActivity', requirementId: 'invented-requirement', status: 'submitted',
      })).status, 200, 'Unpublished/invented requirements must not receive credit.');
      assert.notEqual((await api(mentor, {
        action: 'portfolioSignoff', learnerId: learner.uid, requirementId: 'req-1',
      })).status, 200, 'An evaluator cannot sign off without an activity submission.');
      const activity = await api(learner, {
        action: 'portfolioSaveActivity', requirementId: 'req-1', status: 'submitted',
      });
      assert.equal(activity.status, 200);
      assert.notEqual((await api(learner, {
        action: 'portfolioEvidence', requirementId: 'nonexistent',
        title: 'Fake', url: 'https://example.org/evidence',
      })).status, 200, 'Unknown requirements cannot collect portfolio evidence.');
      const evidence = await api(learner, {
        action: 'portfolioEvidence', requirementId: 'req-1',
        title: 'Devotional work', url: 'https://example.org/evidence', note: 'Private learner note.',
      });
      assert.equal(evidence.status, 200);
      assert.equal((await api(learner, {
        action: 'portfolioSignoff', requirementId: 'req-1', decision: 'approved',
      })).status, 403);
      assert.equal((await api(outsider, {
        action: 'portfolioSignoff', learnerId: learner.uid, requirementId: 'req-1', decision: 'approved',
      })).status, 403);
      const signoff = await api(mentor, {
        action: 'portfolioSignoff', learnerId: learner.uid, requirementId: 'req-1', decision: 'approved',
      });
      assert.equal(signoff.status, 200);
      const shared = await api(learner, { action: 'portfolioShare' });
      assert.equal(shared.status, 200);
      const publicView = await api(null, { action: 'portfolioVerify', token: shared.token });
      assert.equal(publicView.status, 200);
      assert.equal(publicView.portfolio.approvedCount, 1);
      assert.equal(publicView.portfolio.activityCount, 1);
      assert.ok(!('evidence' in publicView.portfolio), 'Private evidence must not leak through a public link.');
      assert.ok(!('signoffs' in publicView.portfolio), 'Private evaluator details must not leak.');
    });

    await db.doc('scriptureMemoryDecks/deck-A').set({
      title: 'Creation', organizationId: 'org-A', status: 'published',
      verses: [{ id: 'gen-1', text: 'In the beginning', reference: 'Genesis 1:1' }],
    });

    await t.test('spaced repetition persists only to the authenticated learner', async () => {
      assert.equal((await api(outsider, { action: 'memoryDue', deckId: 'deck-A' })).status, 400);
      const due = await api(learner, { action: 'memoryDue', deckId: 'deck-A' });
      assert.equal(due.status, 200);
      assert.equal(due.due.length, 1);
      const review = await api(learner, { action: 'memoryReview', deckId: 'deck-A', verseId: 'gen-1', rating: 4 });
      assert.equal(review.status, 200);
      assert.ok(review.state.intervalDays >= 1);
      assert.ok((await db.doc('users/' + learner.uid + '/scriptureMemoryState/deck-A:gen-1').get()).exists);
      assert.equal((await db.collection('users/' + outsider.uid + '/scriptureMemoryState').get()).size, 0);
      const second = await api(learner, { action: 'memoryDue', deckId: 'deck-A' });
      assert.equal(second.due.length, 0);
    });

    await t.test('duel discovery requires opt-in and cross-organization access is blocked', async () => {
      const before = await api(learner, { action: 'duelOverview' });
      assert.equal(before.status, 200);
      assert.ok(before.opponents.some(item => item.uid === peer.uid));
      assert.ok(!before.opponents.some(item => item.uid === mentor.uid));
      assert.equal((await api(learner, { action: 'duelCreate', opponentId: outsider.uid })).status, 403);
      assert.equal((await api(learner, { action: 'duelCreate', opponentId: mentor.uid })).status, 403);
      assert.equal((await api(peer, { action: 'duelAvailability', enabled: false })).status, 200);
      assert.ok(!(await api(learner, { action: 'duelOverview' })).opponents.some(item => item.uid === peer.uid));
      assert.equal((await api(learner, { action: 'duelCreate', opponentId: peer.uid })).status, 403);
      assert.equal((await api(peer, { action: 'duelAvailability', enabled: true })).status, 200);
    });

    for (const [id, answer] of [['q-1', 'Genesis'], ['q-2', 'Exodus'], ['q-3', 'Leviticus']]) {
      await db.doc('scriptureDuelQuestions/' + id).set({
        status: 'published', organizationId: 'org-A', question: 'Select ' + answer,
        options: [answer, 'Other'], answer,
      });
    }

    await t.test('server-authoritative duels: membership, answer idempotency and single finish', async () => {
      const created = await api(learner, { action: 'duelCreate', opponentId: peer.uid });
      assert.equal(created.status, 200, JSON.stringify(created));
      assert.equal(created.questions.length, 3);
      assert.ok(created.questions.every(item => !('answer' in item)));
      assert.ok((await db.collection('notifications').where('recipientId', '==', peer.uid).get()).size > 0);
      const matchId = created.matchId;
      assert.equal((await api(outsider, { action: 'duelJoin', matchId })).status, 403);
      const joined = await api(peer, { action: 'duelJoin', matchId });
      assert.equal(joined.status, 200);
      assert.ok(joined.questions.every(item => !('answer' in item)));
      assert.notEqual((await api(learner, { action: 'duelFinish', matchId })).status, 200);

      const answers = { 'q-1': 'Genesis', 'q-2': 'Exodus', 'q-3': 'Leviticus' };
      const first = await api(learner, { action: 'duelAnswer', matchId, questionId: 'q-1', answer: answers['q-1'] });
      assert.equal(first.status, 200);
      const duplicate = await api(learner, { action: 'duelAnswer', matchId, questionId: 'q-1', answer: answers['q-1'] });
      assert.equal(duplicate.duplicate, true);
      for (const id of ['q-2', 'q-3']) assert.equal((await api(learner, { action: 'duelAnswer', matchId, questionId: id, answer: answers[id] })).status, 200);
      for (const id of ['q-1', 'q-2', 'q-3']) assert.equal((await api(peer, { action: 'duelAnswer', matchId, questionId: id, answer: 'Other' })).status, 200);
      const finished = await api(learner, { action: 'duelFinish', matchId });
      assert.equal(finished.status, 200, JSON.stringify(finished));
      assert.equal(finished.scores[learner.uid], 3);
      assert.equal(finished.scores[peer.uid], 0);
      assert.notEqual((await api(peer, { action: 'duelFinish', matchId })).status, 200);
      assert.equal((await db.doc('scriptureDuelResults/' + matchId).get()).exists, true);
      assert.equal((await api(learner, { action: 'duelHistory' })).status, 200);
      assert.equal((await api(outsider, { action: 'duelHistory' })).results.length, 0);
    });


    await t.test('admin content creation respects contributor ownership and public versus private answers', async () => {
      const publisher = await identity('publisherA', 'org-A', {organizationRole:'admin'});
      const colleague = await identity('colleagueA', 'org-A', {organizationRole:'admin'});
      await db.doc('organizations/org-A/members/' + publisher.uid).set({
        uid:publisher.uid,role:'admin',organizationId:'org-A',active:true,
      });
      await db.doc('organizations/org-A/members/' + colleague.uid).set({
        uid:colleague.uid,role:'admin',organizationId:'org-A',active:true,
      });
      await db.doc('organizations/org-A/members/' + learner.uid).set({
        uid:learner.uid,role:'learner',organizationId:'org-A',active:true,
      });

      assert.notEqual((await api(learner, {action:'catalogList',kind:'duelQuestions',organizationId:'org-A'})).status,200,
        'A learner must not gain access to unpublished content through the administrative catalogue.');
      assert.notEqual((await api(publisher, {action:'catalogList',kind:'memoryDecks',organizationId:'org-B'})).status,200);

      const requirement = await api(publisher, {action:'catalogUpsert',kind:'requirements',organizationId:'org-A',
        data:{title:'Community outreach',description:'Plan an outreach',status:'published',sharingScope:'organization'}});
      assert.equal(requirement.status,200,JSON.stringify(requirement));
      const deck = await api(publisher, {action:'catalogUpsert',kind:'memoryDecks',organizationId:'org-A',
        data:{title:'Genesis memory',status:'published',sharingScope:'organization',
          verses:[{reference:'Genesis 1:2',text:'And the earth was without form, and void.'}]}});
      assert.equal(deck.status,200,JSON.stringify(deck));
      const duelQuestion = await api(publisher, {action:'catalogUpsert',kind:'duelQuestions',organizationId:'org-A',
        data:{title:'Genesis question',question:'Which book comes first?',options:['Genesis','Exodus'],
          answer:'Genesis',scriptureRef:'Genesis 1:1',status:'draft',sharingScope:'organization'}});
      assert.equal(duelQuestion.status,200,JSON.stringify(duelQuestion));

      const otherList = await api(colleague, {action:'catalogList',kind:'duelQuestions',organizationId:'org-A'});
      assert.equal(otherList.status,200,JSON.stringify(otherList));
      assert.equal(otherList.items.find(item=>item.id===duelQuestion.item.id)?.answer,undefined,
        'Even another contributor must not access a private answer key.');
      assert.notEqual((await api(colleague, {action:'catalogArchive',kind:'duelQuestions',
        organizationId:'org-A',id:duelQuestion.item.id})).status,200,
        'Another contributor may not archive the author\'s content.');
      const ownList = await api(publisher, {action:'catalogList',kind:'duelQuestions',organizationId:'org-A'});
      assert.equal(ownList.items.find(item=>item.id===duelQuestion.item.id)?.answer,'Genesis');
      const archived = await api(publisher, {action:'catalogArchive',kind:'duelQuestions',
        organizationId:'org-A',id:duelQuestion.item.id});
      assert.equal(archived.status,200,JSON.stringify(archived));

      const masterGuide = await api(learner, {action:'portfolioGet'});
      assert.ok(masterGuide.requirements.some(item=>item.id===requirement.item.id));
      const memory = await api(learner, {action:'memoryDue',deckId:deck.item.id});
      assert.equal(memory.status,200);
      assert.equal(memory.due.length,1);
    });
  } finally {
    await vite.close();
    await deleteApp(app);
  }
});
