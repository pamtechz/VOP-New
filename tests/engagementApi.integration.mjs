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
    const evaluator2 = await identity('evaluatorB', 'org-A', { organizationRole: 'admin' });
    const outsider = await identity('studentOther', 'org-B');
    await db.doc('organizations/org-A').set({ id: 'org-A', status: 'active' });
    await db.doc('organizations/org-B').set({ id: 'org-B', status: 'active' });
    await db.doc('organizations/org-A/members/' + evaluator2.uid).set({
      uid:evaluator2.uid,role:'admin',organizationId:'org-A',active:true,
    });
    await db.doc('mentorAssignments/' + learner.uid).set({ mentorId: mentor.uid });
    await db.doc('masterGuideRequirements/req-1').set({
      title: 'Personal devotion', organizationId: 'org-A', status: 'published',
    });

    await t.test('self-service portfolio is private and does not permit learner self-signoff', async () => {
      assert.equal((await api(learner, { action: 'portfolioGet' })).status, 200);
      assert.equal((await api(outsider, { action: 'portfolioGet', learnerId: learner.uid })).status, 403);
      assert.equal((await api(mentor, { action: 'portfolioGet', learnerId: peer.uid })).status, 403,
        'A mentor must not inspect an unassigned learner portfolio in the same organization.');
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
      assert.notEqual((await api(mentor, {
        action: 'portfolioSignoff', learnerId: learner.uid, requirementId: 'req-1', decision: 'approved',
      })).status, 200, 'Approved requirements may not be approved again.');
      const reviewQueue = await api(mentor, {action:'portfolioReviewQueue'});
      assert.equal(reviewQueue.status,200,JSON.stringify(reviewQueue));
      assert.ok(!reviewQueue.learners.some(item=>item.uid===learner.uid),
        'A fully approved requirement must leave the pending review queue.');
      assert.notEqual((await api(learner, {action:'portfolioReviewQueue'})).status,200);
      const shared = await api(learner, { action: 'portfolioShare' });
      assert.equal(shared.status, 200);
      const publicView = await api(null, { action: 'portfolioVerify', token: shared.token });
      assert.equal(publicView.status, 200);
      assert.equal(publicView.portfolio.approvedCount, 1);
      assert.equal(publicView.portfolio.activityCount, 1);
      assert.ok(!('evidence' in publicView.portfolio), 'Private evidence must not leak through a public link.');
      assert.ok(!('signoffs' in publicView.portfolio), 'Private evaluator details must not leak.');
    });


    await t.test('requested evidence changes create a new revision and require every configured signature', async () => {
      await db.doc('masterGuideRequirements/req-2').set({
        title:'Community service evidence',organizationId:'org-A',status:'published',requiredSignatures:2,
      });
      const submitted=await api(learner,{
        action:'portfolioSaveActivity',requirementId:'req-2',title:'Community service',status:'submitted',
      });
      assert.equal(submitted.status,200,JSON.stringify(submitted));
      assert.equal(submitted.activity.revision,1);
      assert.equal(submitted.activity.requiredSignatures,2);

      const incomplete=await api(learner,{
        action:'portfolioEvidence',requirementId:'req-2',title:'Initial evidence',
        url:'https://example.org/initial-evidence',note:'First submission',
      });
      assert.equal(incomplete.status,200,JSON.stringify(incomplete));
      assert.equal(incomplete.evidence.revision,1);

      const requested=await api(mentor,{
        action:'portfolioSignoff',learnerId:learner.uid,requirementId:'req-2',
        decision:'changes_requested',notes:'Add the signed service log before approval.',
      });
      assert.equal(requested.status,200,JSON.stringify(requested));
      assert.equal(requested.signoff.revision,1);
      assert.equal(requested.signoff.decision,'changes_requested');
      assert.equal((await api(mentor,{
        action:'portfolioSignoff',learnerId:learner.uid,requirementId:'req-2',
        decision:'approved',
      })).status,400,'A revision with requested changes cannot be approved until the learner resubmits.');

      const learnerView=await api(learner,{action:'portfolioGet'});
      assert.ok(learnerView.portfolio.signoffs.some(item=>
        item.requirementId==='req-2'&&item.decision==='changes_requested'&&
        String(item.notes||'').includes('signed service log')));
      assert.equal((await api(outsider,{action:'portfolioGet',learnerId:learner.uid})).status,403);

      const revisionEvidence=await api(learner,{
        action:'portfolioEvidence',requirementId:'req-2',title:'Signed service log',
        url:'https://example.org/signed-service-log',note:'Requested evidence added.',
      });
      assert.equal(revisionEvidence.status,200,JSON.stringify(revisionEvidence));
      assert.equal(revisionEvidence.evidence.revision,2);
      const resubmitted=await api(learner,{
        action:'portfolioSaveActivity',requirementId:'req-2',title:'Community service',status:'submitted',
      });
      assert.equal(resubmitted.status,200,JSON.stringify(resubmitted));
      assert.equal(resubmitted.activity.revision,2);

      const firstApproval=await api(mentor,{
        action:'portfolioSignoff',learnerId:learner.uid,requirementId:'req-2',
        decision:'approved',notes:'Mentor signature',
      });
      assert.equal(firstApproval.status,200,JSON.stringify(firstApproval));
      assert.equal(firstApproval.complete,false);
      assert.equal(firstApproval.approvals,1);
      assert.equal(firstApproval.requiredSignatures,2);
      const queueAfterOne=await api(mentor,{action:'portfolioReviewQueue'});
      assert.ok(queueAfterOne.learners.some(item=>item.uid===learner.uid),
        'One of two required signatures must not complete the review.');

      assert.equal((await api(outsider,{
        action:'portfolioSignoff',learnerId:learner.uid,requirementId:'req-2',decision:'approved',
      })).status,403);
      const secondApproval=await api(evaluator2,{
        action:'portfolioSignoff',learnerId:learner.uid,requirementId:'req-2',
        decision:'approved',notes:'Administrative signature',
      });
      assert.equal(secondApproval.status,200,JSON.stringify(secondApproval));
      assert.equal(secondApproval.complete,true);
      assert.equal(secondApproval.approvals,2);
      assert.equal((await api(mentor,{
        action:'portfolioSignoff',learnerId:learner.uid,requirementId:'req-2',decision:'approved',
      })).status,400);

      const queueComplete=await api(mentor,{action:'portfolioReviewQueue'});
      assert.ok(!queueComplete.learners.some(item=>item.uid===learner.uid));
      const stored=(await db.doc('masterGuidePortfolios/'+learner.uid).get()).data();
      const revisionTwoApprovals=stored.signoffs.filter(item=>
        item.requirementId==='req-2'&&item.revision===2&&item.decision==='approved');
      assert.equal(new Set(revisionTwoApprovals.map(item=>item.evaluatorId)).size,2);
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
      assert.equal(second.reviewed.length, 1, 'Reviewed memory cards remain available instead of disappearing.');
      assert.equal(second.all.length, 1, 'The complete memory deck remains revisitable after review.');
      assert.equal(second.summary.reviewed, 1);
      assert.equal(second.reviewed[0].id, 'gen-1');
      assert.equal(second.reviewed.length, 1, 'Reviewed Scripture must remain available instead of disappearing.');
      assert.equal(second.all.length, 1);
      assert.equal(second.summary.reviewed, 1);
      assert.equal(second.summary.scheduled, 1);
      assert.equal(second.reviewed[0].id, 'gen-1');
      assert.equal(second.reviewed[0].status, 'reviewed');
      const scheduledDueAt=review.state.dueAt;
      const practice=await api(learner,{
        action:'memoryReview',deckId:'deck-A',verseId:'gen-1',rating:5,practice:true,
      });
      assert.equal(practice.status,200);
      assert.equal(practice.practice,true);
      assert.equal(practice.pointsAwarded,0,'Revisiting a reviewed verse must not farm engagement points.');
      assert.equal(practice.state.dueAt,scheduledDueAt,'Practice revisit must not disturb the spaced-repetition schedule.');
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

      await db.doc('users/' + peer.uid + '/settings/personal').set({
        privacy:{profileVisibility:'private'},
      },{merge:true});
      const privateOverview=await api(learner,{action:'duelOverview'});
      assert.ok(!privateOverview.opponents.some(item=>item.uid===peer.uid),
        'Private profiles must not appear in peer opponent discovery.');
      assert.equal((await api(learner,{action:'duelCreate',opponentId:peer.uid})).status,403);
      const privateStandings=await api(learner,{action:'duelLeaderboard'});
      assert.ok(!privateStandings.leaderboard.some(item=>item.displayName==='studentB'),
        'Private profiles must not appear in organization leaderboards.');
      await db.doc('users/' + peer.uid + '/settings/personal').set({
        privacy:{profileVisibility:'organization'},
      },{merge:true});
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
      const ratingBefore = (await db.doc('users/' + learner.uid).get()).data().scriptureDuelRating;
      const expiredMatch = await api(learner, {action:'duelCreate',opponentId:peer.uid});
      assert.equal(expiredMatch.status,200,JSON.stringify(expiredMatch));
      const firstQuestion = expiredMatch.questions[0];
      assert.equal((await api(learner, {action:'duelAnswer',matchId:expiredMatch.matchId,
        questionId:firstQuestion.id,answer:firstQuestion.options[0]})).status,200);
      await db.doc('scriptureDuels/' + expiredMatch.matchId).update({expiresAt:new Date(Date.now()-60000).toISOString()});
      const expiredResult = await api(learner, {action:'duelFinish',matchId:expiredMatch.matchId});
      assert.equal(expiredResult.status,200,JSON.stringify(expiredResult));
      assert.equal(expiredResult.ranked,false,'Unanswered expired duels are never ranked.');
      assert.equal(expiredResult.winner,'unranked');
      assert.equal((await db.doc('users/' + learner.uid).get()).data().scriptureDuelRating,ratingBefore);
      assert.equal((await db.doc('scriptureDuels/' + expiredMatch.matchId).get()).data().status,'expired');
      assert.equal((await api(learner, {action:'duelAvailability',enabled:true})).status,200);
      const standings=await api(learner,{action:'duelLeaderboard'});
      assert.equal(standings.status,200,JSON.stringify(standings));
      assert.ok(standings.leaderboard.some(item=>item.displayName==='studentA'));
      assert.ok(standings.leaderboard.some(item=>item.displayName==='studentB'));
      const foreignStandings=await api(outsider,{action:'duelLeaderboard'});
      assert.ok(!foreignStandings.leaderboard.some(item=>item.displayName==='studentA'));
      assert.ok(standings.leaderboard.every(item=>!('uid' in item) && Number.isFinite(item.rating)));
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

    await t.test('hierarchy-owned ministry content reaches descendants without leaking to foreign tenants', async () => {
      await db.doc('organizations/org-A').set({unionId:'union-A'},{merge:true});
      await db.doc('organizations/org-B').set({unionId:'union-B'},{merge:true});
      const base = {status:'published',scope:'hierarchy',organizationId:'',
        ownerTenantId:'union_admin:union-A',sharingScope:'organization',ownerUid:'union-author'};
      await db.doc('masterGuideRequirements/hierarchy-req').set({...base,title:'Union leadership service'});
      await db.doc('scriptureMemoryDecks/hierarchy-deck').set({...base,title:'Union memory',
        verses:[{id:'verse-a',reference:'Psalm 119:11',text:'Thy word have I hid in mine heart.'}]});
      await db.doc('scriptureDuelQuestions/hierarchy-question').set({...base,title:'Scripture recall',
        question:'Where is Psalm 119?',options:['Psalms','Daniel'],answer:'Psalms'});

      const own = await api(learner,{action:'portfolioGet'});
      const foreign = await api(outsider,{action:'portfolioGet'});
      assert.ok(own.requirements.some(req=>req.id==='hierarchy-req'));
      assert.ok(!foreign.requirements.some(req=>req.id==='hierarchy-req'));
      assert.equal((await api(learner,{action:'portfolioSaveActivity',requirementId:'hierarchy-req',
        status:'submitted'})).status,200);
      assert.equal((await api(outsider,{action:'portfolioSaveActivity',requirementId:'hierarchy-req',
        status:'submitted'})).status,400);

      const ownDecks = await api(learner,{action:'memoryDecks'});
      const foreignDecks = await api(outsider,{action:'memoryDecks'});
      assert.ok(ownDecks.decks.some(deck=>deck.id==='hierarchy-deck'));
      assert.ok(!foreignDecks.decks.some(deck=>deck.id==='hierarchy-deck'));
      assert.equal((await api(learner,{action:'memoryDue',deckId:'hierarchy-deck'})).status,200);
      assert.notEqual((await api(outsider,{action:'memoryDue',deckId:'hierarchy-deck'})).status,200);
      assert.ok((await api(learner,{action:'duelQuestions'})).questions.some(question=>question.id==='hierarchy-question'));
      assert.ok(!(await api(outsider,{action:'duelQuestions'})).questions.some(question=>question.id==='hierarchy-question'));
    });
  } finally {
    await vite.close();
    await deleteApp(app);
  }
});
