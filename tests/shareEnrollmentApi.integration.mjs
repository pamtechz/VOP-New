import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer } from 'vite';

test('share enrollment preserves tenant privilege and creates idempotent course access', async t => {
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
    const {default:study}=await vite.ssrLoadModule('/api/study/progress.ts');
    async function identity(name,{organizationId='',organizationRole='',role='student',membershipRole='',membershipActive=true}={}) {
      const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
        '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({email:name+'@vop-test.invalid',password:'local-emulator-only',returnSecureToken:true}),
        });
      const account=await response.json();
      assert.equal(response.status,200,JSON.stringify(account));
      await db.doc('users/'+account.localId).set({
        uid:account.localId,role,organizationId,organizationRole,
        displayName:name,email:name+'@vop-test.invalid',progress:{},
      });
      if(organizationId&&membershipRole){
        await db.doc('organizations/'+organizationId+'/members/'+account.localId).set({
          uid:account.localId,organizationId,role:membershipRole,active:membershipActive,
        });
      }
      return {uid:account.localId,token:account.idToken};
    }
    async function callShare(user,body){
      let status=200,output;
      await share({method:'POST',headers:{authorization:'Bearer '+user.token,host:'vop.test'},body},{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
      });
      assert.ok(output&&typeof output==='object','Share API must return JSON.');
      return {status,...output};
    }
    async function callStudy(user,body){
      let status=200,output;
      await study({method:'POST',headers:{authorization:'Bearer '+user.token},body},{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
      });
      assert.ok(output&&typeof output==='object','Study API must return JSON.');
      return {status,...output};
    }

    const orgA='share-enroll-org-a',orgB='share-enroll-org-b';
    await db.doc('organizations/'+orgA).set({id:orgA,status:'active'});
    await db.doc('organizations/'+orgB).set({id:orgB,status:'active'});
    const author=await identity('share-author',{organizationId:orgA,organizationRole:'owner',membershipRole:'owner'});
    const sameOrg=await identity('share-existing-owner',{organizationId:orgA,organizationRole:'learner',membershipRole:'owner'});
    const newcomer=await identity('share-newcomer');
    const foreign=await identity('share-foreign',{organizationId:orgB,organizationRole:'learner',membershipRole:'learner'});
    const platformAdmin=await identity('share-platform-admin',{role:'super_admin'});

    const guideId='share-enroll-guide',lessonId='share-enroll-lesson';
    await db.doc('guides/'+guideId).set({
      id:guideId,organizationId:orgA,ownerOrganizationId:orgA,ownerUid:author.uid,
      title:'Enrollment Guide',language:'en',published:true,archived:false,
      sharingScope:'organization',canonical:true,
    });
    await db.doc('guides/'+guideId+'/lessons/'+lessonId).set({
      id:lessonId,guideId,organizationId:orgA,type:'Lesson',language:'en',
      title:'Enrollment Lesson',published:true,archived:false,sharingScope:'organization',
      contentPages:[{pageNumber:1,title:'Study',content:'Enrollment content'}],
    });

    const created=await callShare(author,{
      action:'create',guideId,lessonId,targetPath:'/?guide='+guideId+'&lesson='+lessonId,
      label:'Organization enrollment',sharingScope:'organization',
    });
    assert.equal(created.status,200,JSON.stringify(created));
    const code=created.item.code;

    await t.test('existing organization privilege is never downgraded by enrollment',async()=>{
      const enrolled=await callShare(sameOrg,{action:'enroll',code});
      assert.equal(enrolled.status,200,JSON.stringify(enrolled));
      assert.equal(enrolled.item.primaryScopePreserved,false);
      const profile=(await db.doc('users/'+sameOrg.uid).get()).data();
      const membership=(await db.doc('organizations/'+orgA+'/members/'+sameOrg.uid).get()).data();
      assert.equal(profile.organizationRole,'owner');
      assert.equal(membership.role,'owner');
      assert.equal((await db.doc('courseEnrollments/'+orgA+'_'+sameOrg.uid+'_'+guideId).get()).data()?.status,'active');
    });

    await t.test('new learner joins the organization and repeated enrollment is idempotent',async()=>{
      const first=await callShare(newcomer,{action:'enroll',code});
      assert.equal(first.status,200,JSON.stringify(first));
      assert.equal(first.item.newlyEnrolled,true);
      assert.equal((await db.doc('users/'+newcomer.uid).get()).data()?.organizationId,orgA);
      assert.equal((await db.doc('organizations/'+orgA+'/members/'+newcomer.uid).get()).data()?.role,'learner');
      const second=await callShare(newcomer,{action:'enroll',code});
      assert.equal(second.status,200,JSON.stringify(second));
      assert.equal(second.item.newlyEnrolled,false);
      const shareRef=await db.doc('shareReferences/'+code).get();
      assert.equal(shareRef.data()?.installs,2,'Each distinct account is counted once.');
      assert.equal((await db.collection('courseEnrollments')
        .where('uid','==',newcomer.uid).where('guideId','==',guideId).get()).size,1);
    });

    await t.test('foreign organization account cannot use an organization-only enrollment link',async()=>{
      const blocked=await callShare(foreign,{action:'enroll',code});
      assert.equal(blocked.status,409,JSON.stringify(blocked));
      assert.equal((await db.doc('users/'+foreign.uid).get()).data()?.organizationId,orgB);
      assert.equal((await db.doc('courseEnrollments/'+orgA+'_'+foreign.uid+'_'+guideId).get()).exists,false);
    });

    await t.test('platform administrator can study through course enrollment without losing platform scope',async()=>{
      const enrolled=await callShare(platformAdmin,{action:'enroll',code});
      assert.equal(enrolled.status,200,JSON.stringify(enrolled));
      assert.equal(enrolled.item.primaryScopePreserved,true);
      const profile=(await db.doc('users/'+platformAdmin.uid).get()).data();
      assert.equal(profile.role,'super_admin');
      assert.equal(profile.organizationId,'');
      assert.equal((await db.doc('organizations/'+orgA+'/members/'+platformAdmin.uid).get()).exists,false);
      assert.equal((await db.doc('courseEnrollments/'+orgA+'_'+platformAdmin.uid+'_'+guideId).get()).data()?.status,'active');
      const completion=await callStudy(platformAdmin,{
        action:'completeLesson',language:'en',guideId,lessonId,
      });
      assert.equal(completion.status,200,JSON.stringify(completion));
      assert.equal((await db.doc('users/'+platformAdmin.uid).get()).data()?.progress?.completedLessons?.includes('en:'+guideId+':'+lessonId),true);
    });

    await t.test('shared enrollment preserves a foreign learner home organization',async()=>{
      await db.doc('guides/'+guideId).update({sharingScope:'shared'});
      await db.doc('guides/'+guideId+'/lessons/'+lessonId).update({sharingScope:'shared'});
      const shared=await callShare(author,{
        action:'create',guideId,lessonId,targetPath:'/?guide='+guideId+'&lesson='+lessonId,
        label:'Shared enrollment',sharingScope:'shared',
      });
      assert.equal(shared.status,200,JSON.stringify(shared));
      const sharedEnroll=await callShare(foreign,{action:'enroll',code:shared.item.code});
      assert.equal(sharedEnroll.status,200,JSON.stringify(sharedEnroll));
      assert.equal(sharedEnroll.item.primaryScopePreserved,true);
      assert.equal((await db.doc('users/'+foreign.uid).get()).data()?.organizationId,orgB);
      assert.equal((await db.doc('organizations/'+orgA+'/members/'+foreign.uid).get()).exists,false);
      assert.equal((await db.doc('courseEnrollments/'+orgA+'_'+foreign.uid+'_'+guideId).get()).data()?.status,'active');
    });
  } finally {
    await vite.close();
    if(getApps().includes(app)) await deleteApp(app);
  }
});
