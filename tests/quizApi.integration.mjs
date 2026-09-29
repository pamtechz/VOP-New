import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer } from 'vite';

test('quiz API: private bank stays with author or Super Admin across organizations', async t => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator required; never run against production.');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Auth emulator required; never run against production.');
  if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_PROJECT_ID !== 'demo-vop-security-rules') {
    throw new Error('Refusing to test on a non-demo Firebase project.');
  }
  process.env.FIREBASE_ADMIN_PROJECT_ID = 'demo-vop-security-rules';
  const app = getApps()[0] || initializeApp({ projectId:'demo-vop-security-rules' });
  const db = getFirestore(app);
  const vite = await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try {
    const { default: handler } = await vite.ssrLoadModule('/api/quizzes.ts');
    async function identity(name, orgId, role = 'editor') {
      const response = await fetch('http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST +
        '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:name+'@vop-test.invalid',password:'local-emulator-only',returnSecureToken:true}),
      });
      const user = await response.json();
      assert.equal(response.status,200,JSON.stringify(user));
      await db.doc('users/'+user.localId).set({
        uid:user.localId,role:role==='super_admin'?'super_admin':'student',
        organizationId:role==='super_admin'?'':orgId,
        organizationRole:role==='super_admin'?'':role,
      });
      if (role !== 'super_admin') {
        await db.doc('organizations/'+orgId+'/members/'+user.localId).set({
          uid:user.localId,organizationId:orgId,role,active:true,
        });
      }
      return {uid:user.localId,token:user.idToken};
    }
    async function call(user,body) {
      let status=200,output;
      await handler({
        method:'POST',headers:user?{authorization:'Bearer '+user.token}:{},body,
      },{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
      });
      assert.ok(output && typeof output==='object','API should return JSON');
      return {status,...output};
    }
    await db.doc('organizations/org-quiz-a').set({id:'org-quiz-a',status:'active'});
    await db.doc('organizations/org-quiz-b').set({id:'org-quiz-b',status:'active'});
    const author=await identity('quiz-author','org-quiz-a','owner');
    const peer=await identity('quiz-peer','org-quiz-a','editor');
    const outsider=await identity('quiz-outsider','org-quiz-b','editor');
    const superAdmin=await identity('quiz-super','', 'super_admin');
    await db.doc('guides/guide-quiz-a').set({
      id:'guide-quiz-a',organizationId:'org-quiz-a',
      language:'en',published:true,archived:false,sharingScope:'organization',
      ownerUid:author.uid,
    });
    await db.doc('guides/guide-quiz-a/lessons/lesson-quiz-a').set({
      id:'lesson-quiz-a',guideId:'guide-quiz-a',organizationId:'org-quiz-a',
      type:'Lesson',language:'en',published:true,archived:false,
    });
    const payload={
      attachmentType:'lesson',guideId:'guide-quiz-a',lessonId:'lesson-quiz-a',
      language:'en',title:'Confidential answers',published:true,sharingScope:'organization',
      questions:[{question:'Question A',options:['Wrong','Right'],correctOptionIndex:1,explanation:'Teacher-only explanation'}],
    };
    const created=await call(author,{action:'upsert',organizationId:'org-quiz-a',data:payload});
    assert.equal(created.status,200,JSON.stringify(created));
    const id=created.item.id;
    assert.equal(created.item.questions[0].correctOptionIndex,1);
    const learnerAssessment=(await db.doc('guides/guide-quiz-a/lessons/quiz-'+id).get()).data();
    assert.equal(learnerAssessment?.questions[0].correctOptionIndex,undefined);
    assert.equal(learnerAssessment?.questions[0].explanation,undefined);

    await t.test('author and Super Admin can manage the bank',async()=>{
      for (const user of [author,superAdmin]) {
        const got=await call(user,{action:'get',id,...(user===author?{organizationId:'org-quiz-a'}:{})});
        assert.equal(got.status,200,JSON.stringify(got));
        assert.equal(got.item.questions[0].correctOptionIndex,1);
        assert.equal(got.item.canEdit,true);
      }
    });
    await t.test('same-organization co-editor sees no private answers through get or list',async()=>{
      const got=await call(peer,{action:'get',id,organizationId:'org-quiz-a'});
      assert.equal(got.status,200,JSON.stringify(got));
      assert.equal(got.item.canEdit,false);
      assert.deepEqual(got.item.questions,[{key:id+'-q1',question:'Question A',options:['Wrong','Right']}]);
      assert.equal(JSON.stringify(got).includes('correctOptionIndex'),false);
      assert.equal(JSON.stringify(got).includes('Teacher-only'),false);
      const listed=await call(peer,{action:'list',organizationId:'org-quiz-a'});
      assert.equal(listed.status,200,JSON.stringify(listed));
      const item=listed.items.find(item=>item.id===id);
      assert.ok(item);
      assert.equal(item.canEdit,false);
      assert.equal(JSON.stringify(item).includes('correctOptionIndex'),false);
    });
    await t.test('foreign organization cannot read a private quiz or author it',async()=>{
      const got=await call(outsider,{action:'get',id,organizationId:'org-quiz-b'});
      assert.equal(got.status,403,JSON.stringify(got));
      const listed=await call(outsider,{action:'list',organizationId:'org-quiz-b'});
      assert.equal(listed.status,200,JSON.stringify(listed));
      assert.equal(listed.items.some(item=>item.id===id),false);
      const overwrite=await call(outsider,{action:'upsert',organizationId:'org-quiz-b',id,data:payload});
      assert.notEqual(overwrite.status,200);
    });
  } finally {
    await vite.close();
    if (getApps().includes(app)) await deleteApp(app);
  }
});
