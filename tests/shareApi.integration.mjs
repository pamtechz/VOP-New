import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer } from 'vite';

test('share enrollment: account onboarding is tenant-safe, role-preserving and idempotent', async () => {
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
    const {default:share}=await vite.ssrLoadModule('/api/share.ts');
    async function identity(name,profile={}) {
      const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
        '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({email:name+'@vop-test.invalid',password:'local-emulator-only',returnSecureToken:true}),
        });
      const data=await response.json();
      assert.equal(response.status,200,JSON.stringify(data));
      await db.doc('users/'+data.localId).set({uid:data.localId,role:'student',displayName:name,...profile});
      return {uid:data.localId,token:data.idToken};
    }
    async function api(user,body,headers={}) {
      let status=200,output;
      await share({method:'POST',headers:{
        authorization:'Bearer '+user.token,host:'vop.test','x-forwarded-proto':'https',...headers,
      },body},{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
      });
      assert.ok(output && typeof output==='object','Share API should return JSON');
      return {status,...output};
    }

    const orgA='org-share-a',orgB='org-share-b',guideId='guide-share-a',lessonId='lesson-share-a';
    await db.doc('organizations/'+orgA).set({id:orgA,status:'active'});
    await db.doc('organizations/'+orgB).set({id:orgB,status:'active'});
    await db.doc('guides/'+guideId).set({
      id:guideId,organizationId:orgA,title:'Shared VOP course',language:'en',
      published:true,archived:false,sharingScope:'organization',
    });
    await db.doc('guides/'+guideId+'/lessons/'+lessonId).set({
      id:lessonId,guideId,organizationId:orgA,type:'Lesson',published:true,archived:false,
      contentPages:[{pageNumber:1,content:'Study page'}],
    });

    const admin=await identity('share-admin',{organizationId:orgA,organizationRole:'admin'});
    await db.doc('organizations/'+orgA+'/members/'+admin.uid).set({
      uid:admin.uid,organizationId:orgA,role:'admin',active:true,
    });
    const learner=await identity('share-learner');
    const existingMentor=await identity('share-mentor',{organizationId:orgA,organizationRole:'mentor'});
    await db.doc('organizations/'+orgA+'/members/'+existingMentor.uid).set({
      uid:existingMentor.uid,organizationId:orgA,role:'mentor',active:true,
    });
    const foreign=await identity('share-foreign',{organizationId:orgB,organizationRole:'learner'});
    await db.doc('organizations/'+orgB+'/members/'+foreign.uid).set({
      uid:foreign.uid,organizationId:orgB,role:'learner',active:true,
    });

    const created=await api(admin,{
      action:'create',targetPath:'/?guide='+guideId+'&lesson='+lessonId,
      guideId,lessonId,label:'Enroll in Shared VOP course',sharingScope:'organization',
    });
    assert.equal(created.status,200,JSON.stringify(created));
    const code=created.item.code;

    const first=await api(learner,{action:'enroll',code});
    assert.equal(first.status,200,JSON.stringify(first));
    assert.equal(first.item.newlyEnrolled,true);
    const learnerProfile=(await db.doc('users/'+learner.uid).get()).data();
    assert.equal(learnerProfile.organizationId,orgA);
    assert.equal(learnerProfile.organizationRole,'learner');
    assert.equal((await db.doc('organizations/'+orgA+'/members/'+learner.uid).get()).data().active,true);
    const enrollmentId=orgA+'_'+learner.uid+'_'+guideId;
    const enrollment=(await db.doc('courseEnrollments/'+enrollmentId).get()).data();
    assert.equal(enrollment.status,'active');
    assert.equal(enrollment.lessonId,lessonId);
    assert.equal((await db.doc('shareReferences/'+code).get()).data().installs,1);

    const repeated=await api(learner,{action:'enroll',code});
    assert.equal(repeated.status,200,JSON.stringify(repeated));
    assert.equal(repeated.item.newlyEnrolled,false);
    assert.equal((await db.doc('shareReferences/'+code).get()).data().installs,1,
      'Reloading/retrying the same share link must not duplicate an install/enrollment.');
    assert.equal((await db.collection('courseEnrollments').where('uid','==',learner.uid).get()).size,1);

    const mentorJoin=await api(existingMentor,{action:'enroll',code});
    assert.equal(mentorJoin.status,200,JSON.stringify(mentorJoin));
    assert.equal((await db.doc('users/'+existingMentor.uid).get()).data().organizationRole,'mentor',
      'Enrollment must not downgrade an existing organization role.');
    assert.equal((await db.doc('organizations/'+orgA+'/members/'+existingMentor.uid).get()).data().role,'mentor');

    const blocked=await api(foreign,{action:'enroll',code});
    assert.equal(blocked.status,409,JSON.stringify(blocked));
    assert.match(String(blocked.error||''),/already belongs to another organization/i);
    assert.equal((await db.doc('courseEnrollments/'+orgA+'_'+foreign.uid+'_'+guideId).get()).exists,false);
    assert.equal((await db.doc('organizations/'+orgA+'/members/'+foreign.uid).get()).exists,false);
  } finally {
    await vite.close();
    if(getApps().includes(app)) await deleteApp(app);
  }
});
