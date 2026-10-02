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
    const {default:organizations}=await vite.ssrLoadModule('/api_handlers/admin/organizations.ts');
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
    async function resolveShare(code){
      let status=200,output,location='';
      await share({method:'GET',headers:{},query:{c:code}},{
        status(codeValue){status=codeValue;return this;},
        setHeader(name,value){if(String(name).toLowerCase()==='location')location=String(value);},
        json(data){output=data;return this;},
      });
      assert.ok(output&&typeof output==='object','Share redirect should return JSON.');
      return {status,location,...output};
    }
    async function callOrganization(user,body){
      let status=200,output;
      await organizations({method:'POST',headers:{
        ...(user?{authorization:'Bearer '+user.token}:{}),
        origin:'https://vopapp.org',host:'vopapp.org',
      },body},{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
      });
      assert.ok(output&&typeof output==='object','Organization API must return JSON.');
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
    const foreign=await identity('share-enroll-foreign',{organizationId:orgB,organizationRole:'learner',membershipRole:'learner'});
    const ordinaryMember=await identity('share-invite-member',{organizationId:orgA,organizationRole:'learner',membershipRole:'learner'});
    const invitee=await identity('share-invite-newcomer');
    const platformAdmin=await identity('share-platform-admin',{role:'super_admin'});

    const quotaOrg='share-quota-org';
    await db.doc('organizations/'+quotaOrg).set({
      id:quotaOrg,name:'Quota Organization',status:'active',
      quotas:{maxSeats:4,maxCandidates:1,maxMentors:1},
    });
    const quotaOwner=await identity('quota-owner',{organizationId:quotaOrg,organizationRole:'owner',membershipRole:'owner'});
    const quotaCandidate=await identity('quota-candidate');
    const quotaCandidateTwo=await identity('quota-candidate-two');
    const quotaMentor=await identity('quota-mentor');
    const quotaAdmin=await identity('quota-admin');
    const quotaExtra=await identity('quota-extra');
    const quotaExtraTwo=await identity('quota-extra-two');
    const quotaCandidateThree=await identity('quota-candidate-three');
    await db.doc('system/billing').set({
      subscriptionAudience:{
        learnersCandidates:false,organizations:true,churches:true,districts:true,conferences:true,unions:true,
      },
    },{merge:true});

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

    await db.doc('shareReferences/legacy-link-01').set({
      code:'legacy-link-01',targetPath:'/?guide=legacy-guide&lesson=legacy-lesson',
      organizationId:orgA,sharingScope:'organization',clicks:0,installs:0,
    });
    const legacyRedirect=await resolveShare('legacy-link-01');
    assert.equal(legacyRedirect.status,302,JSON.stringify(legacyRedirect));
    assert.equal(legacyRedirect.location,'/?guide=legacy-guide&lesson=legacy-lesson&ref=legacy-link-01');

    const created=await callShare(author,{
      action:'create',guideId,lessonId,targetPath:'/?guide='+guideId+'&lesson='+lessonId,
      label:'Organization enrollment',sharingScope:'organization',
    });
    assert.equal(created.status,200,JSON.stringify(created));
    const code=created.item.code;

    await t.test('candidates are separate from institutional member seats and learner billing is switchable',async()=>{
      const candidate=await callOrganization(quotaOwner,{
        action:'setMember',organizationId:quotaOrg,uid:quotaCandidate.uid,role:'learner',active:true,
      });
      assert.equal(candidate.status,200,JSON.stringify(candidate));

      const secondCandidate=await callOrganization(quotaOwner,{
        action:'setMember',organizationId:quotaOrg,uid:quotaCandidateTwo.uid,role:'learner',active:true,
      });
      assert.equal(secondCandidate.status,200,JSON.stringify(secondCandidate));

      const mentor=await callOrganization(quotaOwner,{
        action:'setMember',organizationId:quotaOrg,uid:quotaMentor.uid,role:'mentor',active:true,
      });
      assert.equal(mentor.status,200,JSON.stringify(mentor));

      const adminMember=await callOrganization(quotaOwner,{
        action:'setMember',organizationId:quotaOrg,uid:quotaAdmin.uid,role:'admin',active:true,
      });
      assert.equal(adminMember.status,200,JSON.stringify(adminMember));

      const fourthSeat=await callOrganization(quotaOwner,{
        action:'setMember',organizationId:quotaOrg,uid:quotaExtra.uid,role:'editor',active:true,
      });
      assert.equal(fourthSeat.status,200,JSON.stringify(fourthSeat));

      const overSeat=await callOrganization(quotaOwner,{
        action:'setMember',organizationId:quotaOrg,uid:quotaExtraTwo.uid,role:'viewer',active:true,
      });
      assert.equal(overSeat.status,400,JSON.stringify(overSeat));
      assert.match(String(overSeat.error||''),/member\/staff seat limit|seat limit/i);

      const usage=await callOrganization(quotaOwner,{action:'getUsage',organizationId:quotaOrg});
      assert.equal(usage.status,200,JSON.stringify(usage));
      assert.equal(usage.usage.seats,4);
      assert.equal(usage.usage.memberSeats,4);
      assert.equal(usage.usage.candidates,2);
      assert.equal(usage.usage.mentors,1);
      assert.equal(usage.usage.administrators,2);

      await db.doc('system/billing').set({
        subscriptionAudience:{
          learnersCandidates:true,organizations:true,churches:true,districts:true,conferences:true,unions:true,
        },
      },{merge:true});
      const billedCandidate=await callOrganization(quotaOwner,{
        action:'setMember',organizationId:quotaOrg,uid:quotaCandidateThree.uid,role:'learner',active:true,
      });
      assert.equal(billedCandidate.status,400,JSON.stringify(billedCandidate));
      assert.match(String(billedCandidate.error||''),/candidate limit/i);

      const superAdminOverride=await callOrganization(platformAdmin,{
        action:'setMember',organizationId:quotaOrg,uid:quotaCandidateThree.uid,role:'learner',active:true,
      });
      assert.equal(superAdminOverride.status,200,JSON.stringify(superAdminOverride));

      await db.doc('system/billing').set({
        subscriptionAudience:{
          learnersCandidates:false,organizations:true,churches:true,districts:true,conferences:true,unions:true,
        },
      },{merge:true});

      const listed=await callOrganization(quotaOwner,{action:'list'});
      assert.equal(listed.status,200,JSON.stringify(listed));
      const quotaSummary=listed.items.find(item=>item.id===quotaOrg);
      assert.equal(quotaSummary.memberCount,4);
      assert.equal(quotaSummary.candidateCount,3);
    });

    await t.test('active members create explicit lesson invitations and the recipient joins only after accepting',async()=>{
      const createdInvite=await callOrganization(ordinaryMember,{
        action:'createMemberInvite',organizationId:orgA,role:'admin',
        targetKind:'lesson',guideId,lessonId,targetLabel:'Enrollment Lesson',
      });
      assert.equal(createdInvite.status,200,JSON.stringify(createdInvite));
      assert.equal(createdInvite.item.role,'learner','ordinary members cannot grant elevated roles');
      assert.match(createdInvite.item.inviteUrl,/^https:\/\/vopapp\.org\/\?invite=[A-Za-z0-9]+$/);
      assert.equal((await db.doc('users/'+invitee.uid).get()).data()?.organizationId,'');

      const preview=await callOrganization(null,{action:'previewInvite',token:createdInvite.item.token});
      assert.equal(preview.status,200,JSON.stringify(preview));
      assert.equal(preview.item.organizationId,orgA);
      assert.equal(preview.item.targetLabel,'Enrollment Lesson');
      assert.equal(preview.item.emailBound,false);

      const accepted=await callOrganization(invitee,{action:'acceptInvite',token:createdInvite.item.token});
      assert.equal(accepted.status,200,JSON.stringify(accepted));
      assert.equal(accepted.targetPath,'/?route=lessons&guide='+guideId+'&lesson='+lessonId);
      assert.equal((await db.doc('users/'+invitee.uid).get()).data()?.organizationId,orgA);
      assert.equal((await db.doc('organizations/'+orgA+'/members/'+invitee.uid).get()).data()?.role,'learner');

      const firstEnrollment=await callShare(invitee,{action:'enroll',code});
      assert.equal(firstEnrollment.status,200,JSON.stringify(firstEnrollment));
      assert.equal(firstEnrollment.item.newlyEnrolled,true);
      const repeatedEnrollment=await callShare(invitee,{action:'enroll',code});
      assert.equal(repeatedEnrollment.status,200,JSON.stringify(repeatedEnrollment));
      assert.equal(repeatedEnrollment.item.newlyEnrolled,false);
      assert.equal((await db.collection('courseEnrollments')
        .where('uid','==',invitee.uid).where('guideId','==',guideId).get()).size,1);

      const reused=await callOrganization(invitee,{action:'acceptInvite',token:createdInvite.item.token});
      assert.equal(reused.status,409,JSON.stringify(reused));
    });

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

    await t.test('course links cannot create organization membership for an uninvited account',async()=>{
      const blocked=await callShare(newcomer,{action:'enroll',code});
      assert.equal(blocked.status,409,JSON.stringify(blocked));
      assert.match(String(blocked.error||''),/invitation acceptance is required/i);
      assert.equal((await db.doc('users/'+newcomer.uid).get()).data()?.organizationId,'');
      assert.equal((await db.doc('organizations/'+orgA+'/members/'+newcomer.uid).get()).exists,false);
      assert.equal((await db.collection('courseEnrollments')
        .where('uid','==',newcomer.uid).where('guideId','==',guideId).get()).size,0);
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
