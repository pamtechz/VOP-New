import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createServer} from 'vite';

const project='demo-vop-security-rules';

test('unaffiliated learners retain private prayer and platform support without tenant privilege',async t=>{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Refuse to test without Firestore emulator.');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST,'Refuse to test without Firebase Auth emulator.');
  assert.ok(!process.env.FIREBASE_ADMIN_PROJECT_ID||process.env.FIREBASE_ADMIN_PROJECT_ID===project);
  process.env.FIREBASE_ADMIN_PROJECT_ID=project;
  const app=getApps()[0]||initializeApp({projectId:project});
  const db=getFirestore(app);
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  const register=async(name,profile={})=>{
    const res=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:name+'@personal-vop.invalid',password:'emulator-test-only',returnSecureToken:true}),
    });
    const value=await res.json();assert.equal(res.status,200,JSON.stringify(value));
    await db.doc('users/'+value.localId).set({
      uid:value.localId,role:'student',displayName:name,organizationId:'',
      organizationRole:'',...profile,
    });
    return {uid:value.localId,token:value.idToken};
  };
  try{
    const {default:prayer}=await vite.ssrLoadModule('/api/prayer.ts');
    const {default:mentorship}=await vite.ssrLoadModule('/api/mentorship.ts');
    const {default:certificates}=await vite.ssrLoadModule('/api/certificates.ts');
    const personal=await register('independent');
    const stranger=await register('outsider');
    const superAdmin=await register('platform-administrator',{role:'super_admin'});
    const tenantAdmin=await register('church-administrator',{organizationId:'personal-test-church',organizationRole:'admin'});
    await db.doc('organizations/personal-test-church').set({status:'active',name:'Test church'});
    await db.doc('organizations/personal-test-church/members/'+tenantAdmin.uid).set({
      uid:tenantAdmin.uid,role:'admin',active:true,
    });
    const respond=()=>({statusCode:200,body:null,status(code){this.statusCode=code;return this;},json(data){this.body=data;return this;}});
    async function call(handler,user,body={},method='POST',query={}){
      const res=respond();
      await handler({
        method,headers:user?{authorization:'Bearer '+user.token}:{},
        ...(method==='GET'?{query}:{body}),
      },res);
      return res;
    }
    let personalPrayerId='';
    await t.test('personal prayers are private even when client requests public sharing',async()=>{
      const unauthorized=await call(prayer,null,{action:'create',requestText:'Not authenticated'});
      assert.notEqual(unauthorized.statusCode,201);
      const created=await call(prayer,personal,{
        action:'create',requestText:'A private personal prayer journal note.',
        category:'Guidance',isPrivate:false,
      });
      assert.equal(created.statusCode,201,JSON.stringify(created.body));
      personalPrayerId=created.body.item.id;
      assert.equal(created.body.item.organizationId,'');
      assert.equal(created.body.item.isPrivate,true);
      const mine=await call(prayer,personal,{},'GET',{mine:'true'});
      assert.equal(mine.statusCode,200,JSON.stringify(mine.body));
      assert.ok(mine.body.items.some(item=>item.id===personalPrayerId));
      const ministryView=await call(prayer,superAdmin,{},'GET',{ministry:'true'});
      assert.equal(ministryView.statusCode,200,JSON.stringify(ministryView.body));
      assert.ok(!ministryView.body.items.some(item=>item.id===personalPrayerId),
        'even the platform ministry inbox must not reveal a private personal journal');
      const ministryStatus=await call(prayer,superAdmin,{
        action:'status',id:personalPrayerId,status:'Praying',
      });
      assert.notEqual(ministryStatus.statusCode,200);
      const strangerView=await call(prayer,stranger,{},'GET',{mine:'true'});
      assert.equal(strangerView.statusCode,200);
      assert.ok(!strangerView.body.items.some(item=>item.id===personalPrayerId));
      const community=await call(prayer,stranger,{},'GET',{mine:'false'});
      assert.equal(community.statusCode,200);
      assert.ok(!community.body.items.some(item=>item.id===personalPrayerId));
      const editAttempt=await call(prayer,stranger,{
        action:'edit',id:personalPrayerId,requestText:'Attempt to read or change another journal.',
        category:'Guidance',
      });
      assert.notEqual(editAttempt.statusCode,200);
      assert.equal((await db.doc('prayerRequests/'+personalPrayerId).get()).data().requestText,
        'A private personal prayer journal note.');
    });
    await t.test('personal prayer ownership survives church joining',async()=>{
      await db.doc('users/'+personal.uid).set({
        organizationId:'personal-test-church',organizationRole:'learner',
      },{merge:true});
      await db.doc('organizations/personal-test-church/members/'+personal.uid).set({
        uid:personal.uid,role:'learner',active:true,
      });
      const updated=await call(prayer,personal,{
        action:'edit',id:personalPrayerId,requestText:'A revised private prayer after joining.',
        category:'Guidance',isPrivate:false,
      });
      assert.equal(updated.statusCode,200,JSON.stringify(updated.body));
      assert.equal((await db.doc('prayerRequests/'+personalPrayerId).get()).data().organizationId,'');
      assert.equal((await db.doc('prayerRequests/'+personalPrayerId).get()).data().isPrivate,true);
      const answered=await call(prayer,personal,{action:'markAnswered',id:personalPrayerId});
      assert.equal(answered.statusCode,200,JSON.stringify(answered.body));
      assert.equal((await db.doc('prayerRequests/'+personalPrayerId).get()).data().status,'Answered');
      // The learner joined a church after writing a personal prayer, but the
      // church must never receive the private text in its immutable audit log.
      const tenantAudits=await db.collection('organizations/personal-test-church/audit').get();
      assert.ok(!tenantAudits.docs.some(doc=>
        JSON.stringify(doc.data()).includes('A revised private prayer after joining')),
        'private prayer journal leaked to the organization audit ledger');
      // Restore personal mode for the independent support tests.
      await db.doc('users/'+personal.uid).set({organizationId:'',organizationRole:''},{merge:true});
      await db.doc('organizations/personal-test-church/members/'+personal.uid).update({active:false});
    });
    let supportId='';
    await t.test('unaffiliated support requests route to a private VOP queue',async()=>{
      const created=await call(mentorship,personal,{
        action:'createSupportRequest',subject:'Personal Bible question',
        message:'Please explain the text in my study guide.',
        target:'mentor',channel:'whatsapp',category:'bible_question',
        priority:'normal',spiritualInterest:'none',
      });
      assert.equal(created.statusCode,201,JSON.stringify(created.body));
      supportId=created.body.item.id;
      assert.equal(created.body.item.organizationId,'');
      assert.equal(created.body.item.target,'support_team');
      assert.equal(created.body.item.channel,'in_app');
      const own=await call(mentorship,personal,{action:'listMySupportRequests'});
      assert.equal(own.statusCode,200,JSON.stringify(own.body));
      assert.ok(own.body.items.some(item=>item.id===supportId));
      const others=await call(mentorship,stranger,{action:'listMySupportRequests'});
      assert.ok(!others.body.items.some(item=>item.id===supportId));
      const strangerRead=await call(mentorship,stranger,{action:'supportRequestMessages',requestId:supportId});
      assert.notEqual(strangerRead.statusCode,200);
      const foreignAdmin=await call(mentorship,tenantAdmin,{action:'supportRequestMessages',requestId:supportId});
      assert.notEqual(foreignAdmin.statusCode,200);
      const tenantQueue=await call(mentorship,tenantAdmin,{action:'listSupportRequests'});
      assert.equal(tenantQueue.statusCode,200,JSON.stringify(tenantQueue.body));
      assert.ok(!tenantQueue.body.items.some(item=>item.id===supportId));
      // Stale organization metadata must not redirect Super Admin away from
      // the independent learner support queue.
      await db.doc('users/'+superAdmin.uid).set({
        organizationId:'personal-test-church',organizationRole:'admin',
      },{merge:true});
      const platformQueue=await call(mentorship,superAdmin,{
        action:'listSupportRequests',supportScope:'platform',
      });
      assert.equal(platformQueue.statusCode,200,JSON.stringify(platformQueue.body));
      assert.ok(platformQueue.body.items.some(item=>item.id===supportId));
      const staleTenantQueue=await call(mentorship,superAdmin,{action:'listSupportRequests'});
      assert.equal(staleTenantQueue.statusCode,200,JSON.stringify(staleTenantQueue.body));
      assert.ok(!staleTenantQueue.body.items.some(item=>item.id===supportId));
      await db.doc('users/'+superAdmin.uid).set({
        organizationId:'',organizationRole:'',
      },{merge:true});
      const adminReply=await call(mentorship,superAdmin,{
        action:'replySupportRequest',requestId:supportId,
        message:'Your question has reached the VOP support queue.',
      });
      assert.equal(adminReply.statusCode,200,JSON.stringify(adminReply.body));
      // Joining another organization must not retroactively impose its
      // mentorship subscription on this private platform request.
      await db.doc('users/'+personal.uid).set({
        organizationId:'personal-test-church',organizationRole:'learner',
      },{merge:true});
      await db.doc('organizations/personal-test-church/members/'+personal.uid).set({
        uid:personal.uid,role:'learner',active:true,
      },{merge:true});
      try{
        const learnerReply=await call(mentorship,personal,{
          action:'replySupportRequest',requestId:supportId,message:'Thank you.',
        });
        assert.equal(learnerReply.statusCode,200,JSON.stringify(learnerReply.body));
      }finally{
        await db.doc('users/'+personal.uid).set({organizationId:'',organizationRole:''},{merge:true});
        await db.doc('organizations/personal-test-church/members/'+personal.uid).update({active:false});
      }
    });
    await t.test('independent support stays queued even before a platform administrator is assigned',async()=>{
      const administratorRef=db.doc('users/'+superAdmin.uid);
      await administratorRef.update({role:'student'});
      try{
        const created=await call(mentorship,stranger,{
          action:'createSupportRequest',subject:'Platform support needed',
          message:'Please help with my independent Bible study.',
          target:'support_team',channel:'in_app',category:'bible_question',
          idempotencyKey:'independent-no-admin-request-001',
        });
        assert.equal(created.statusCode,201,JSON.stringify(created.body));
        const request=(await db.doc('learningSupportRequests/'+created.body.item.id).get()).data();
        assert.equal(request?.organizationId,'');
        assert.deepEqual(request?.recipientIds,[]);
        assert.equal(request?.candidateId,stranger.uid);
      }finally{
        await administratorRef.update({role:'super_admin'});
      }
    });
    await t.test('personal support retries are idempotent and daily limits are atomic',async()=>{
      const data={action:'createSupportRequest',subject:'Repeatable private help',
        message:'Help me understand my next study section.',
        category:'bible_question',target:'support_team',channel:'in_app',
        priority:'normal',spiritualInterest:'none'};
      const first=await call(mentorship,personal,{...data,idempotencyKey:'test-personal-support-00000001'});
      assert.equal(first.statusCode,201,JSON.stringify(first.body));
      const duplicate=await call(mentorship,personal,{...data,idempotencyKey:'test-personal-support-00000001'});
      assert.equal(duplicate.statusCode,200,JSON.stringify(duplicate.body));
      assert.equal(duplicate.body.item.id,first.body.item.id);
      const messages=await db.collection('learningSupportRequests/'+first.body.item.id+'/messages').get();
      assert.equal(messages.size,1,'a retry cannot create a second first message');
      const changed=await call(mentorship,personal,{...data,idempotencyKey:'test-personal-support-00000001',message:'Changed after first submit'});
      assert.notEqual(changed.statusCode,200,'a reused key cannot conceal changed content');
      // The preceding test created one initial request. The first keyed
      // request above makes two; six more exhaust the eight-request window.
      for(let i=0;i<6;i++){
        const created=await call(mentorship,personal,{
          ...data,subject:'Study question '+i,
          idempotencyKey:'test-personal-followup-'+String(i).padStart(8,'0'),
        });
        assert.equal(created.statusCode,201,JSON.stringify(created.body));
      }
      const limited=await call(mentorship,personal,{...data,idempotencyKey:'test-personal-support-over-limit'});
      assert.notEqual(limited.statusCode,201);
      assert.match(String(limited.body?.error||''),/limit reached/i);
      const previous=await call(mentorship,personal,{...data,idempotencyKey:'test-personal-support-00000001'});
      assert.equal(previous.statusCode,200,'idempotent replay is allowed even when quota is full');
      const quota=(await db.doc('personalSupportRateLimits/'+personal.uid).get()).data();
      assert.equal(quota?.requestTimes.length,8);
    });
    await t.test('historical certificates remain personal across future organization changes',async()=>{
      // A prior organization's certificate must not disappear on membership
      // changes, and another signed-in user must never see it.
      await db.doc('certificates/personal-history-verified').set({
        id:'personal-history-verified',candidateId:personal.uid,
        organizationId:'an-earlier-ministry',certificateNumber:'VOP-PRIVATE-TEST',
        candidateName:'independent',courseName:'Bible Study',status:'Certified',
        issuer:{name:'Original VOP Ministry'},
        presentationSnapshot:{
          certificateTitle:'Original Award',issuerName:'Original VOP Ministry',
          logoUrl:'https://example.invalid/original-logo.png',
          signatureUrl:'https://example.invalid/original-signature.png',
        },
      });
      const result=await call(certificates,personal,{},'GET',{action:'mine'});
      assert.equal(result.statusCode,200,JSON.stringify(result.body));
      assert.ok(result.body.certificates.some(row=>row.id==='personal-history-verified'));
      const historical=result.body.certificates.find(row=>row.id==='personal-history-verified');
      assert.equal(historical.presentationSnapshot.issuerName,'Original VOP Ministry');
      assert.equal(historical.presentationSnapshot.logoUrl,'https://example.invalid/original-logo.png');
      assert.equal(historical.presentationSnapshot.signatureUrl,'https://example.invalid/original-signature.png');
      await db.doc('users/'+personal.uid).set({organizationId:'personal-test-church',organizationRole:'learner'},{merge:true});
      const afterJoin=await call(certificates,personal,{},'GET',{action:'mine'});
      assert.equal(afterJoin.statusCode,200,JSON.stringify(afterJoin.body));
      assert.ok(afterJoin.body.certificates.some(row=>row.id==='personal-history-verified'));
      assert.equal(afterJoin.body.certificates.find(row=>row.id==='personal-history-verified')
        .presentationSnapshot.issuerName,'Original VOP Ministry');
      const outsiderHistory=await call(certificates,stranger,{},'GET',{action:'mine'});
      assert.equal(outsiderHistory.statusCode,200,JSON.stringify(outsiderHistory.body));
      assert.ok(!outsiderHistory.body.certificates.some(row=>row.id==='personal-history-verified'));
    });
  }finally{await vite.close();}
});
