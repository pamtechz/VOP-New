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
    async function api(user,body){
      let status=200,output;
      await study({method:'POST',headers:{authorization:'Bearer '+user.token},body},{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
      });
      assert.ok(output && typeof output==='object','Study API must return JSON');
      return {status,...output};
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
    });
    await db.doc('quizzes/'+quizId).set({
      id:quizId,guideId,organizationId:orgA,language:'en',
      assessmentPath:'guides/'+guideId+'/lessons/'+testId,
      published:true,archived:false,questions:[
        {...publicQuestions[0],correctOptionIndex:1,answer:false,explanation:'Server-only rationale'},
      ],
    });

    await t.test('a learner is graded from a private bank with an organization-bound score',async()=>{
      const response=await api(learner,{
        action:'submitQuiz',language:'en',guideId,lessonId:testId,answers:{0:1},
      });
      assert.equal(response.status,200,JSON.stringify(response));
      assert.equal(response.score,100);
      assert.equal(response.passed,true);
      assert.equal(response.scoreKey,orgA+':en:'+guideId+':'+testId);
      const profile=(await db.doc('users/'+learner.uid).get()).data();
      assert.equal(profile.progress.guideScores[response.scoreKey],100);
    });

    await t.test('a foreign member cannot grade against another organization private guide',async()=>{
      const response=await api(outsider,{
        action:'submitQuiz',language:'en',guideId,lessonId:testId,answers:{0:1},
      });
      assert.equal(response.status,403,JSON.stringify(response));
      assert.equal((await db.doc('users/'+outsider.uid).get()).data()?.progress?.guideScores,undefined);
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
      const response=await api(learner,{
        action:'submitQuiz',language:'en',guideId,lessonId:testId,answers:{0:1},
      });
      assert.equal(response.status,403,JSON.stringify(response));
      await db.doc('organizations/'+orgA+'/members/'+learner.uid).update({active:true});
    });

    await t.test('quiz-bank path mismatch fails without changing an existing mark',async()=>{
      await db.doc('quizzes/'+quizId).update({assessmentPath:'guides/another/lessons/quiz-'+quizId});
      const response=await api(learner,{
        action:'submitQuiz',language:'en',guideId,lessonId:testId,answers:{0:0},
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
