import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer } from 'vite';

test('study progress: server grades and guide paths stay within authorized tenants', async t => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator required; never run against production.');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Auth emulator required; never run against production.');
  if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_PROJECT_ID !== 'demo-vop-security-rules') {
    throw new Error('Refusing to test on a non-demo Firebase project.');
  }
  process.env.FIREBASE_ADMIN_PROJECT_ID='demo-vop-security-rules';
  const app=getApps()[0] || initializeApp({projectId:'demo-vop-security-rules'});
  const db=getFirestore(app);
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try {
    const {default:study}=await vite.ssrLoadModule('/api/study/progress.ts');
    const orgA='org-study-a',orgB='org-study-b',guideId='guide-study-a',quizId='quiz-study-a',testId='quiz-'+quizId;
    for(const org of [orgA,orgB]){
      await db.doc('organizations/'+org).set({id:org,status:'active'});
      await db.doc('organizations/'+org+'/settings/settings').set({quizPassThreshold:80});
    }
    async function identity(name,org) {
      const resp=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
        '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({email:name+'@vop-test.invalid',password:'local-emulator-only',returnSecureToken:true}),
        });
      const data=await resp.json();
      assert.equal(resp.status,200,JSON.stringify(data));
      await db.doc('users/'+data.localId).set({uid:data.localId,role:'student',organizationId:org,progress:{}});
      await db.doc('organizations/'+org+'/members/'+data.localId).set({
        uid:data.localId,organizationId:org,role:'learner',active:true,
      });
      return {uid:data.localId,token:data.idToken};
    }
    const learner=await identity('study-own',orgA);
    const outsider=await identity('study-foreign',orgB);
    const retakeLearner=await identity('study-retake',orgA);
    const cooldownLearner=await identity('study-cooldown',orgA);
    const passedRetakeLearner=await identity('study-passed-retake',orgA);
    async function api(user,body){
      let status=200,output;
      await study({method:'POST',headers:{authorization:'Bearer '+user.token},body},{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
      });
      assert.ok(output && typeof output==='object','Study API must return JSON');
      return {status,...output};
    }
    async function startQuiz(user){
      return api(user,{action:'startQuiz',language:'en',guideId,lessonId:testId});
    }
    async function submitStarted(user,answers){
      const started=await startQuiz(user);
      if(started.status!==200)return started;
      return api(user,{
        action:'submitQuiz',language:'en',guideId,lessonId:testId,
        sessionId:started.sessionId,answers,
      });
    }
    await db.doc('guides/'+guideId).set({
      id:guideId,organizationId:orgA,language:'en',
      published:true,archived:false,sharingScope:'organization',
    });
    const publicQuestions=[{key:quizId+'-q1',question:'What is the answer?',options:['Wrong','Right']}];
    await db.doc('guides/'+guideId+'/lessons/'+testId).set({
      id:testId,guideId,organizationId:orgA,language:'en',
      type:'Test',sourceQuizId:quizId,answerVisibility:'public_redacted',
      sharingScope:'organization',questions:publicQuestions,published:true,archived:false,
      assessmentKind:'practice',assessmentInstructions:'Read every question before submitting.',
      assessmentTimeLimitMinutes:0,assessmentPassThreshold:0,
      assessmentMaxAttempts:0,assessmentRetakeCooldownMinutes:0,
      assessmentFeedbackMode:'score_only',
    });
    await db.doc('quizzes/'+quizId).set({
      id:quizId,guideId,organizationId:orgA,language:'en',
      assessmentPath:'guides/'+guideId+'/lessons/'+testId,
      published:true,archived:false,questions:[
        {...publicQuestions[0],correctOptionIndex:1,answer:false,explanation:'Server-only rationale'},
      ],
    });
    const studyLessonId='lesson-study-a';
    await db.doc('guides/'+guideId+'/lessons/'+studyLessonId).set({
      id:studyLessonId,guideId,organizationId:orgA,language:'en',
      type:'Lesson',sharingScope:'organization',published:true,archived:false,
      contentPages:[
        {pageNumber:1,title:'One',content:'First page'},
        {pageNumber:2,title:'Two',content:'Second page'},
      ],
    });

    await t.test('assessment policy inherits the platform pass mark when the organization has no settings document',async()=>{
      await db.doc('system/settings').set({quizPassThreshold:77,quizMaxAttempts:0,quizRetakeCooldownMinutes:0},{merge:true});
      await db.doc('organizations/'+orgA+'/settings/settings').delete();
      const started=await startQuiz(learner);
      assert.equal(started.status,200,JSON.stringify(started));
      assert.equal(started.assessmentPolicy.threshold,77);
      await db.doc('organizations/'+orgA+'/settings/settings').set({quizPassThreshold:80});
    });

    await t.test('a learner is graded from a private bank with an organization-bound score',async()=>{
      const response=await submitStarted(learner,{0:1});
      assert.equal(response.status,200,JSON.stringify(response));
      assert.equal(response.score,100);
      assert.equal(response.passed,true);
      assert.equal(response.scoreKey,orgA+':en:'+guideId+':'+testId);
      const profile=(await db.doc('users/'+learner.uid).get()).data();
      assert.equal(profile.progress.guideScores[response.scoreKey],100);
    });

    await t.test('a foreign member cannot grade against another organization private guide',async()=>{
      const response=await submitStarted(outsider,{0:1});
      assert.equal(response.status,403,JSON.stringify(response));
      assert.equal((await db.doc('users/'+outsider.uid).get()).data()?.progress?.guideScores,undefined);
    });

    await t.test('failed assessments follow the configured attempt limit and waiting period',async()=>{
      await db.doc('organizations/'+orgA+'/settings/settings').set({
        quizPassThreshold:80,quizMaxAttempts:2,quizRetakeCooldownMinutes:0,
      },{merge:true});
      const first=await submitStarted(retakeLearner,{0:0});
      assert.equal(first.status,200,JSON.stringify(first));
      assert.equal(first.passed,false);
      assert.equal(first.retakePolicy.attemptsUsed,1);
      assert.equal(first.retakePolicy.remainingAttempts,1);
      const second=await submitStarted(retakeLearner,{0:1});
      assert.equal(second.status,200,JSON.stringify(second));
      assert.equal(second.passed,true);
      assert.equal(second.retakePolicy.attemptsUsed,2);
      assert.equal(second.retakePolicy.remainingAttempts,0);
      const blocked=await submitStarted(retakeLearner,{0:0});
      assert.equal(blocked.status,409,JSON.stringify(blocked));
      assert.equal(blocked.code,'ASSESSMENT_ATTEMPT_LIMIT');
      assert.match(String(blocked.error||''),/attempt limit/i);
      assert.equal((await db.collection('users/'+retakeLearner.uid+'/assessmentAttempts').get()).size,2);

      await db.doc('organizations/'+orgA+'/settings/settings').set({
        quizPassThreshold:80,quizMaxAttempts:3,quizRetakeCooldownMinutes:30,
      },{merge:true});
      const cooldownFirst=await submitStarted(cooldownLearner,{0:0});
      assert.equal(cooldownFirst.status,200,JSON.stringify(cooldownFirst));
      assert.equal(cooldownFirst.passed,false);
      assert.ok(Date.parse(cooldownFirst.retakePolicy.retryAt)>Date.now());
      const cooldownBlocked=await submitStarted(cooldownLearner,{0:1});
      assert.equal(cooldownBlocked.status,409,JSON.stringify(cooldownBlocked));
      assert.equal(cooldownBlocked.code,'ASSESSMENT_RETAKE_COOLDOWN');
      assert.match(String(cooldownBlocked.error||''),/available after/i);
      await db.doc('organizations/'+orgA+'/settings/settings').set({
        quizPassThreshold:80,quizMaxAttempts:0,quizRetakeCooldownMinutes:0,
      },{merge:true});
    });

    await t.test('passed and failed quizzes remain retakeable when no attempt limit is configured',async()=>{
      await db.doc('organizations/'+orgA+'/settings/settings').set({
        quizPassThreshold:80,quizMaxAttempts:0,quizRetakeCooldownMinutes:0,
      },{merge:true});
      const passed=await submitStarted(passedRetakeLearner,{0:1});
      assert.equal(passed.status,200,JSON.stringify(passed));
      assert.equal(passed.passed,true);
      assert.equal(passed.retakePolicy.attemptsUsed,1);
      assert.equal(passed.retakePolicy.maxAttempts,null);
      assert.equal(passed.retakePolicy.remainingAttempts,null);
      assert.equal(passed.retakePolicy.retryAt,null);

      const failedRetake=await submitStarted(passedRetakeLearner,{0:0});
      assert.equal(failedRetake.status,200,JSON.stringify(failedRetake));
      assert.equal(failedRetake.passed,false);
      assert.equal(failedRetake.retakePolicy.attemptsUsed,2);
      assert.equal(failedRetake.retakePolicy.remainingAttempts,null);

      const third=await submitStarted(passedRetakeLearner,{0:1});
      assert.equal(third.status,200,JSON.stringify(third));
      assert.equal(third.retakePolicy.attemptsUsed,3);
      assert.equal((await db.collection('users/'+passedRetakeLearner.uid+'/assessmentAttempts').get()).size,3);
    });

    await t.test('submission requires a server-started single-use attempt session',async()=>{
      const direct=await api(learner,{
        action:'submitQuiz',language:'en',guideId,lessonId:testId,answers:{0:1},
      });
      assert.equal(direct.status,409,JSON.stringify(direct));
      assert.match(String(direct.error||''),/start|instructions/i);

      const started=await startQuiz(learner);
      assert.equal(started.status,200,JSON.stringify(started));
      const accepted=await api(learner,{
        action:'submitQuiz',language:'en',guideId,lessonId:testId,sessionId:started.sessionId,answers:{0:1},
      });
      assert.equal(accepted.status,200,JSON.stringify(accepted));
      const replay=await api(learner,{
        action:'submitQuiz',language:'en',guideId,lessonId:testId,sessionId:started.sessionId,answers:{0:1},
      });
      assert.equal(replay.status,409,JSON.stringify(replay));
      assert.match(String(replay.error||''),/already|valid/i);
    });

    await t.test('per-assessment policy overrides organization defaults and hidden feedback does not leak score',async()=>{
      await db.doc('guides/'+guideId+'/lessons/'+testId).update({
        assessmentPassThreshold:75,
        assessmentMaxAttempts:4,
        assessmentRetakeCooldownMinutes:0,
        assessmentTimeLimitMinutes:10,
        assessmentFeedbackMode:'none',
      });
      const started=await startQuiz(learner);
      assert.equal(started.status,200,JSON.stringify(started));
      assert.equal(started.assessmentPolicy.threshold,75);
      assert.equal(started.assessmentPolicy.maxAttempts,4);
      assert.equal(started.assessmentPolicy.timeLimitMinutes,10);
      assert.equal(started.assessmentPolicy.feedbackMode,'none');
      assert.ok(Date.parse(started.expiresAt)>Date.now());
      const submitted=await api(learner,{
        action:'submitQuiz',language:'en',guideId,lessonId:testId,sessionId:started.sessionId,answers:{0:1},
      });
      assert.equal(submitted.status,200,JSON.stringify(submitted));
      assert.equal(submitted.score,null);
      assert.equal(submitted.passed,null);
      assert.equal(submitted.feedbackMode,'none');
      const profile=(await db.doc('users/'+learner.uid).get()).data();
      assert.equal(profile.progress.guideScores[orgA+':en:'+guideId+':'+testId],100);
      await db.doc('guides/'+guideId+'/lessons/'+testId).update({
        assessmentPassThreshold:0,assessmentMaxAttempts:0,
        assessmentRetakeCooldownMinutes:0,assessmentTimeLimitMinutes:0,
        assessmentFeedbackMode:'score_only',
      });
    });

    await t.test('expired timed attempt is rejected by the server',async()=>{
      await db.doc('guides/'+guideId+'/lessons/'+testId).update({assessmentTimeLimitMinutes:5});
      const started=await startQuiz(learner);
      assert.equal(started.status,200,JSON.stringify(started));
      await db.doc('users/'+learner.uid+'/assessmentSessions/'+started.sessionId).update({
        expiresAt:new Date(Date.now()-60_000).toISOString(),
      });
      const expired=await api(learner,{
        action:'submitQuiz',language:'en',guideId,lessonId:testId,sessionId:started.sessionId,answers:{0:1},
      });
      assert.equal(expired.status,409,JSON.stringify(expired));
      assert.match(String(expired.error||''),/time limit|expired/i);
      await db.doc('guides/'+guideId+'/lessons/'+testId).update({assessmentTimeLimitMinutes:0});
    });

    await t.test('resume positions use the published lesson page count, not client claims',async()=>{
      const forged=await api(learner,{
        action:'saveLessonResume',language:'en',guideId,lessonId:studyLessonId,
        pageIndex:99,pageCount:1000,
      });
      assert.equal(forged.status,400,JSON.stringify(forged));
      const saved=await api(learner,{
        action:'saveLessonResume',language:'en',guideId,lessonId:studyLessonId,
        pageIndex:1,pageCount:1000,
      });
      assert.equal(saved.status,200,JSON.stringify(saved));
      const profile=(await db.doc('users/'+learner.uid).get()).data();
      assert.equal(profile.progress.lessonResume['en:'+guideId+':'+studyLessonId].pageIndex,1);
    });

    await t.test('a guessed guide ID never falls back to a legacy assessment',async()=>{
      // A historical Discover lesson may coincidentally carry this guideId.
      // It must not be accepted as proof of ownership of an unknown guide.
      await db.doc('curricula/discover/languages/en').set({published:true});
      await db.doc('curricula/discover/languages/en/lessons/legacy-study').set({
        type:'Lesson',guideId:'guessed-guide',published:true,
        contentPages:[{content:'Legacy public lesson'}],
      });
      const response=await api(learner,{
        action:'completeLesson',language:'en',guideId:'guessed-guide',lessonId:'legacy-study',
      });
      assert.equal(response.status,404,JSON.stringify(response));
      const actualLegacy=await api(learner,{
        action:'completeLesson',language:'en',guideId:'discover',lessonId:'legacy-study',
      });
      assert.equal(actualLegacy.status,200,JSON.stringify(actualLegacy));
    });

    await t.test('inactive members cannot submit new results',async()=>{
      await db.doc('organizations/'+orgA+'/members/'+learner.uid).update({active:false});
      const response=await submitStarted(learner,{0:1});
      assert.equal(response.status,403,JSON.stringify(response));
      await db.doc('organizations/'+orgA+'/members/'+learner.uid).update({active:true});
    });

    await t.test('quiz-bank path mismatch fails without changing an existing mark',async()=>{
      await db.doc('quizzes/'+quizId).update({assessmentPath:'guides/another/lessons/quiz-'+quizId});
      const started=await startQuiz(learner);
      assert.equal(started.status,200,JSON.stringify(started));
      const response=await api(learner,{
        action:'submitQuiz',language:'en',guideId,lessonId:testId,sessionId:started.sessionId,answers:{0:0},
      });
      assert.equal(response.status,409,JSON.stringify(response));
      const profile=(await db.doc('users/'+learner.uid).get()).data();
      assert.equal(profile.progress.guideScores[orgA+':en:'+guideId+':'+testId],100);
    });
  } finally {
    await vite.close();
    if(getApps().includes(app)) await deleteApp(app);
  }
});
