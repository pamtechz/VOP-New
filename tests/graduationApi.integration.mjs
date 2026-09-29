import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer } from 'vite';

test('graduation: learner self-submission and official issuance require verified scores', async t => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator required; never run against production.');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Auth emulator required; never run against production.');
  if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_PROJECT_ID !== 'demo-vop-security-rules') {
    throw new Error('Refusing to test on a non-demo Firebase project.');
  }
  process.env.FIREBASE_ADMIN_PROJECT_ID = 'demo-vop-security-rules';
  const app = getApps()[0] || initializeApp({ projectId:'demo-vop-security-rules' });
  const db = getFirestore(app);
  const vite = await createServer({ configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error' });
  try {
    const { default: graduation } = await vite.ssrLoadModule('/api_handlers/admin/graduations.ts');
    const { default: certificates } = await vite.ssrLoadModule('/api/certificates.ts');
    async function identity(name, organizationId, membershipRole='learner') {
      const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
        '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({email:name+'@vop-test.invalid',password:'local-emulator-only',returnSecureToken:true}),
        });
      const record=await response.json();
      assert.equal(response.status,200,JSON.stringify(record));
      await db.doc('users/'+record.localId).set({
        uid:record.localId,role:'student',organizationId,organizationRole:membershipRole,
        displayName:name,email:name+'@vop-test.invalid',
        information:{graduating:false,graduated:false},
      });
      await db.doc('organizations/'+organizationId+'/members/'+record.localId).set({
        uid:record.localId,organizationId,role:membershipRole,active:true,
      });
      return {uid:record.localId,token:record.idToken};
    }
    async function api(handler,user,body) {
      let status=200,output;
      await handler({method:'POST',headers:{authorization:'Bearer '+user.token},body},{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
      });
      assert.ok(output && typeof output==='object','API should return JSON');
      return {status,...output};
    }

    const org='org-graduation-a',guide='guide-graduation-a',lang='en';
    const scores={
      [org+':'+lang+':'+guide+':test-one']:82,
      [org+':'+lang+':'+guide+':test-two']:98,
    };
    await db.doc('organizations/'+org).set({id:org,status:'active'});
    await db.doc('organizations/org-graduation-b').set({id:'org-graduation-b',status:'active'});
    await db.doc('system/certification').set({
      enabled:true,minimumScore:80,
      approvalStages:[{id:'church',label:'Church',approverRoles:['admin'],enabled:true}],
    });
    await db.doc('organizations/'+org+'/settings/settings').set({quizPassThreshold:80});
    await db.doc('guides/'+guide).set({
      id:guide,title:'VOP Graduation',organizationId:org,
      language:lang,published:true,archived:false,certificateEligible:true,
    });
    await db.doc('guides/'+guide+'/lessons/lesson-one').set({
      id:'lesson-one',type:'Lesson',published:true,
      contentPages:[{pageNumber:1,content:'Study'}],guideId:guide,
    });
    for(const id of ['test-one','test-two']) {
      await db.doc('guides/'+guide+'/lessons/'+id).set({
        id,guideId:guide,type:'Test',published:true,
        questions:[{key:id+'-q1',question:'Assessment?',options:['Wrong','Right']}],
      });
    }
    const candidate=await identity('graduation-candidate',org);
    const admin=await identity('graduation-admin',org,'admin');
    const outsider=await identity('graduation-outsider','org-graduation-b','admin');
    await db.doc('users/'+candidate.uid).update({
      progress:{completedLessons:[lang+':'+guide+':lesson-one'],guideScores:scores},
    });

    await t.test('learner can submit without administrative certificate creation privilege',async()=>{
      const unauthorized=await api(certificates,candidate,{action:'issue',candidateId:candidate.uid});
      assert.equal(unauthorized.status,403,JSON.stringify(unauthorized));
      const submitted=await api(graduation,candidate,{
        action:'submit',guideId:guide,averageScore:100,
        candidateId:outsider.uid,organizationId:'org-graduation-b',
      });
      assert.equal(submitted.status,201,JSON.stringify(submitted));
      assert.equal(submitted.request.candidateId,candidate.uid);
      assert.equal(submitted.request.organizationId,org);
      assert.equal(submitted.request.averageScore,90,'Tampered browser average must be ignored');
      const pending=await db.doc('graduationRequests/'+submitted.request.id).get();
      assert.equal(pending.data()?.averageScore,90);
    });

    await t.test('other organizations cannot decide this graduation',async()=>{
      const pending=(await db.collection('graduationRequests').where('candidateId','==',candidate.uid).get()).docs[0];
      const response=await api(graduation,outsider,{
        action:'decision',requestId:pending.id,revision:1,decision:'approve',
      });
      assert.equal(response.status,403,JSON.stringify(response));
    });

    await t.test('authorized admin approves, learner still cannot issue, admin issues verified average',async()=>{
      const pending=(await db.collection('graduationRequests').where('candidateId','==',candidate.uid).get()).docs[0];
      const approval=await api(graduation,admin,{
        action:'decision',requestId:pending.id,revision:1,decision:'approve',
      });
      assert.equal(approval.status,200,JSON.stringify(approval));
      assert.equal(approval.request.status,'approved');
      assert.equal((await api(certificates,candidate,{action:'issue',candidateId:candidate.uid})).status,403);
      const issued=await api(certificates,admin,{action:'issue',candidateId:candidate.uid});
      assert.equal(issued.status,201,JSON.stringify(issued));
      assert.equal(issued.certificate.assessmentAverageScore,90);
      assert.equal(issued.certificate.organizationId,org);
      const duplicate=await api(certificates,admin,{action:'issue',candidateId:candidate.uid});
      assert.equal(duplicate.status,200,JSON.stringify(duplicate));
      assert.equal(duplicate.created,false);
    });

    await t.test('a fraudulent foreign-tenant or malformed score cannot submit',async()=>{
      const another=await identity('graduation-candidate-b',org);
      await db.doc('users/'+another.uid).update({
        progress:{completedLessons:[lang+':'+guide+':lesson-one'],
          guideScores:{...scores,[org+':'+lang+':'+guide+':test-two']:'100'}},
      });
      const malformed=await api(graduation,another,{action:'submit',guideId:guide,averageScore:100});
      assert.equal(malformed.status,409,JSON.stringify(malformed));
      const changed={
        ['org-graduation-b:'+lang+':'+guide+':test-two']:100,
        [org+':'+lang+':'+guide+':test-one']:82,
      };
      await db.doc('users/'+another.uid).update({progress:{
        completedLessons:[lang+':'+guide+':lesson-one'],guideScores:changed,
      }});
      const foreign=await api(graduation,another,{action:'submit',guideId:guide,averageScore:100});
      assert.equal(foreign.status,409,JSON.stringify(foreign));
      const requests=await db.collection('graduationRequests').where('candidateId','==',another.uid).get();
      assert.equal(requests.empty,true);
    });
  } finally {
    await vite.close();
    if (getApps().includes(app)) await deleteApp(app);
  }
});
