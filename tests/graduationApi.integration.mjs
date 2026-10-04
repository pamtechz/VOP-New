import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer } from 'vite';

test('graduation: completion auto-queues review and final approval auto-awards the verified certificate', async t => {
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
    const { ensureAutomaticGraduationReview } = await vite.ssrLoadModule('/server/graduationAutomation.ts');
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
    async function verifyCertificate(certificateNumber) {
      let status=200,output;
      await certificates({method:'GET',headers:{},query:{certificateNumber}},{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
      });
      assert.ok(output && typeof output==='object','Certificate verification should return JSON');
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
      enabled:true,verificationEnabled:true,minimumScore:80,releaseMode:'review',
      certificateTitle:'Platform default certificate',issuerName:'Voice of Prophecy',
      approvalStages:[{id:'church',label:'Church',approverRoles:['admin'],enabled:true}],
    });
    await db.doc('organizations/'+org+'/settings/settings').set({quizPassThreshold:80});
    await db.doc('guides/'+guide).set({
      id:guide,title:'VOP Graduation',organizationId:org,
      language:lang,published:true,archived:false,certificateEligible:true,
      certificateDocumentType:'course',certificateTypeName:'Bible Correspondence Certificate',
      certificationRequirementIds:['cert-req'],
    });
    await db.doc('masterGuideRequirements/cert-req').set({
      id:'cert-req',title:'Signed ministry evidence',organizationId:org,status:'published',
      requiredSignatures:2,evidenceRequired:true,
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
    await db.doc('certificates/legacy-certificate').set({
      candidateId:'legacy-candidate',organizationId:org,
      candidateName:'Legacy Learner',courseName:'Legacy Bible Course',
      certificateNumber:'VOP-2024-LEGACY',status:'Certified',
      issuedAt:'2024-06-01T00:00:00.000Z',verificationEnabled:true,
    });
    const legacyPublic=await verifyCertificate('VOP-2024-LEGACY');
    assert.equal(legacyPublic.status,200,JSON.stringify(legacyPublic));
    assert.equal(legacyPublic.verified,true);
    assert.equal(legacyPublic.state,'valid');
    assert.equal(legacyPublic.certificate.documentType,'course',
      'Historical certificates without a documentType remain compatible.');

    const candidate=await identity('graduation-candidate',org);
    const strictAttemptCandidate=await identity('graduation-strict-attempt',org);
    const admin=await identity('graduation-admin',org,'admin');
    const outsider=await identity('graduation-outsider','org-graduation-b','admin');
    await db.doc('users/'+candidate.uid).update({
      progress:{completedLessons:[lang+':'+guide+':lesson-one'],guideScores:scores},
    });

    await t.test('certificate eligibility honors a stricter verified attempt threshold than the global minimum',async()=>{
      const strictScores={
        [org+':'+lang+':'+guide+':test-one']:85,
        [org+':'+lang+':'+guide+':test-two']:98,
      };
      await db.doc('users/'+strictAttemptCandidate.uid).update({
        progress:{completedLessons:[lang+':'+guide+':lesson-one'],guideScores:strictScores},
      });
      const attemptRef=db.doc('users/'+strictAttemptCandidate.uid+'/assessmentAttempts/strict-test-one');
      await attemptRef.set({
        candidateId:strictAttemptCandidate.uid,userId:strictAttemptCandidate.uid,
        organizationId:org,language:lang,guideId:guide,lessonId:'test-one',
        score:85,threshold:90,passed:false,creditStatus:'active',attemptNumber:1,
        createdAt:new Date().toISOString(),
      });
      const blocked=await ensureAutomaticGraduationReview(db,strictAttemptCandidate.uid,guide,'test:strict-attempt');
      assert.equal(blocked.eligible,false,JSON.stringify(blocked));
      assert.equal(blocked.reason,'assessments_incomplete_or_failed');

      await attemptRef.update({score:92,passed:true});
      await db.doc('users/'+strictAttemptCandidate.uid).update({
        ['progress.guideScores.'+org+':'+lang+':'+guide+':test-one']:92,
      });
      const eligible=await ensureAutomaticGraduationReview(db,strictAttemptCandidate.uid,guide,'test:strict-attempt-passed');
      assert.equal(eligible.eligible,true,JSON.stringify(eligible));
      assert.equal(eligible.averageScore,95);
    });

    await t.test('verified completion creates the review automatically without learner submission',async()=>{
      const unauthorized=await api(certificates,candidate,{action:'issue',candidateId:candidate.uid,guideId:guide});
      assert.equal(unauthorized.status,403,JSON.stringify(unauthorized));
      const automatic=await ensureAutomaticGraduationReview(db,candidate.uid,guide,'test:completion');
      assert.equal(automatic.eligible,true,JSON.stringify(automatic));
      assert.equal(automatic.created,true,JSON.stringify(automatic));
      assert.equal(automatic.averageScore,90);
      const pending=await db.doc('graduationRequests/'+automatic.requestId).get();
      assert.equal(pending.exists,true);
      assert.equal(pending.data()?.candidateId,candidate.uid);
      assert.equal(pending.data()?.organizationId,org);
      assert.equal(pending.data()?.averageScore,90);
      assert.equal(pending.data()?.automatic,true);
      assert.equal(pending.data()?.source,'completion');
      assert.equal((await db.doc('users/'+candidate.uid).get()).data()?.information?.graduating,true);
      const duplicate=await ensureAutomaticGraduationReview(db,candidate.uid,guide,'test:completion-retry');
      assert.equal(duplicate.created,false,'automatic completion retries must not duplicate the review');
    });

    await t.test('other organizations cannot decide this graduation',async()=>{
      const pending=(await db.collection('graduationRequests').where('candidateId','==',candidate.uid).get()).docs[0];
      const response=await api(graduation,outsider,{
        action:'decision',requestId:pending.id,revision:1,decision:'approve',
      });
      assert.equal(response.status,403,JSON.stringify(response));
    });

    await t.test('approval rejects a later failing retake and repairs an old client average',async()=>{
      const request=(await db.collection('graduationRequests').where('candidateId','==',candidate.uid).get()).docs[0];
      const downgraded={...scores,[org+':'+lang+':'+guide+':test-two']:45};
      await db.doc('users/'+candidate.uid).update({'progress.guideScores':downgraded});
      const rejected=await api(graduation,admin,{
        action:'decision',requestId:request.id,revision:1,decision:'approve',
      });
      assert.equal(rejected.status,409,JSON.stringify(rejected));
      const stillPending=(await request.ref.get()).data();
      assert.equal(stillPending?.revision,1);
      assert.notEqual(stillPending?.status,'approved');
      assert.equal((await db.doc('users/'+candidate.uid).get()).data()?.information?.graduated,false);
      await db.doc('users/'+candidate.uid).update({'progress.guideScores':scores});
      // Simulate an old pending graduation record written before the fix.
      await request.ref.update({averageScore:100});
    });

    await t.test('final approval stays withheld until configured evidence is complete, then auto-awards',async()=>{
      const pending=(await db.collection('graduationRequests').where('candidateId','==',candidate.uid).get()).docs[0];

      const missingPortfolio=await api(graduation,admin,{
        action:'decision',requestId:pending.id,revision:1,decision:'approve',
      });
      assert.equal(missingPortfolio.status,409,JSON.stringify(missingPortfolio));
      assert.match(String(missingPortfolio.error||''),/Signed ministry evidence: submit the required activity/i);
      assert.notEqual((await pending.ref.get()).data()?.status,'approved');

      await db.doc('masterGuidePortfolios/'+candidate.uid).set({
        learnerId:candidate.uid,organizationId:org,
        activities:[{id:'activity-1',requirementId:'cert-req',status:'submitted',revision:1,requiredSignatures:2}],
        evidence:[{id:'evidence-1',requirementId:'cert-req',title:'Signed log',url:'https://example.org/log',revision:1}],
        signoffs:[{id:'approval-1',requirementId:'cert-req',revision:1,decision:'approved',evaluatorId:'mentor-one'}],
      });
      const oneSignature=await api(graduation,admin,{
        action:'decision',requestId:pending.id,revision:1,decision:'approve',
      });
      assert.equal(oneSignature.status,409,JSON.stringify(oneSignature));
      assert.match(String(oneSignature.error||''),/1 more evaluator signature is required/i);
      assert.notEqual((await pending.ref.get()).data()?.status,'approved');

      await db.doc('masterGuidePortfolios/'+candidate.uid).update({
        signoffs:[
          {id:'approval-1',requirementId:'cert-req',revision:1,decision:'approved',evaluatorId:'mentor-one'},
          {id:'approval-2',requirementId:'cert-req',revision:1,decision:'approved',evaluatorId:'mentor-two'},
        ],
      });
      const approval=await api(graduation,admin,{
        action:'decision',requestId:pending.id,revision:1,decision:'approve',
      });
      assert.equal(approval.status,200,JSON.stringify(approval));
      assert.equal(approval.request.status,'approved');
      assert.equal(approval.request.averageScore,90,'Approval must recompute the authoritative average.');
      assert.equal(approval.certificateAwarded,true,JSON.stringify(approval));
      assert.ok(approval.certificate?.certificateNumber,'final approval should publish the official certificate automatically');
      assert.equal(approval.certificate.assessmentAverageScore,90);
      assert.equal(approval.certificate.organizationId,org);
      assert.equal(approval.certificate.documentType,'course');
      assert.equal(approval.certificate.certificateTypeName,'Bible Correspondence Certificate');
      assert.equal(approval.certificate.courseName,'VOP Graduation');
      assert.equal(approval.certificate.eligibilitySnapshot.passThreshold,80);
      assert.equal(approval.certificate.eligibilitySnapshot.assessmentAverageScore,90);
      assert.deepEqual(new Set(approval.certificate.eligibilitySnapshot.requiredAssessmentIds),new Set(['test-one','test-two']));
      assert.equal(approval.certificate.eligibilitySnapshot.certificationRequirements[0].requirementId,'cert-req');
      assert.equal(approval.certificate.eligibilitySnapshot.certificationRequirements[0].approvalCount,2);
      assert.equal(approval.certificate.eligibilitySnapshot.certificationRequirements[0].evidenceCount,1);
      assert.equal(approval.certificate.issuer.name,'Voice of Prophecy');

      assert.equal((await api(certificates,candidate,{action:'issue',candidateId:candidate.uid,guideId:guide})).status,403,
        'learner must never be able to invoke privileged issuance');
      const duplicate=await api(certificates,admin,{action:'issue',candidateId:candidate.uid,guideId:guide});
      assert.equal(duplicate.status,200,JSON.stringify(duplicate));
      assert.equal(duplicate.created,false);

      const valid=await verifyCertificate(approval.certificate.certificateNumber);
      assert.equal(valid.status,200,JSON.stringify(valid));
      assert.equal(valid.verified,true);
      assert.equal(valid.state,'valid');
      assert.equal(valid.certificate.certificateTypeName,'Bible Correspondence Certificate');
    });

    await t.test('certificate lifecycle exposes valid, replaced, revoked and unknown states without cross-tenant mutation',async()=>{
      const existing=(await db.collection('certificates').where('candidateId','==',candidate.uid).limit(1).get()).docs[0];
      assert.ok(existing);
      const originalNumber=String(existing.data().certificateNumber);
      const foreignReplace=await api(certificates,outsider,{
        action:'replace',certificateId:existing.id,reason:'Foreign tenant attempt',
      });
      assert.equal(foreignReplace.status,403,JSON.stringify(foreignReplace));
      assert.equal((await existing.ref.get()).data().status,'Certified');

      const replaced=await api(certificates,admin,{
        action:'replace',certificateId:existing.id,reason:'Corrected official issue date',
      });
      assert.equal(replaced.status,201,JSON.stringify(replaced));
      assert.equal(replaced.certificate.status,'Certified');
      assert.equal(replaced.certificate.replacesCertificateNumber,originalNumber);
      assert.equal(replaced.certificate.eligibilitySnapshot.assessmentAverageScore,90,
        'Replacement preserves the immutable eligibility snapshot.');

      const oldPublic=await verifyCertificate(originalNumber);
      assert.equal(oldPublic.status,200,JSON.stringify(oldPublic));
      assert.equal(oldPublic.verified,false);
      assert.equal(oldPublic.state,'replaced');
      assert.equal(oldPublic.replacement.certificateNumber,replaced.certificate.certificateNumber);

      const replacementPublic=await verifyCertificate(replaced.certificate.certificateNumber);
      assert.equal(replacementPublic.verified,true,JSON.stringify(replacementPublic));
      assert.equal(replacementPublic.state,'valid');

      const revoked=await api(certificates,admin,{
        action:'revoke',certificateId:replaced.certificate.id,reason:'Credential withdrawn after formal review',
      });
      assert.equal(revoked.status,200,JSON.stringify(revoked));
      assert.equal(revoked.certificate.status,'Revoked');
      const revokedPublic=await verifyCertificate(replaced.certificate.certificateNumber);
      assert.equal(revokedPublic.status,200,JSON.stringify(revokedPublic));
      assert.equal(revokedPublic.verified,false);
      assert.equal(revokedPublic.state,'revoked');

      const unknown=await verifyCertificate('VOP-2099-DOES-NOT-EXIST');
      assert.equal(unknown.status,404,JSON.stringify(unknown));
      assert.equal(unknown.verified,false);
      assert.equal(unknown.state,'unknown');
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
