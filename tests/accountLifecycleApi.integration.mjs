import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer } from 'vite';

const projectId='demo-vop-security-rules';

function response(){
  return {code:200,payload:null,status(code){this.code=code;return this;},json(payload){this.payload=payload;return this;},setHeader(){}};
}

async function emulatorSignUp(email,password='local-emulator-only'){
  const resp=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password,returnSecureToken:true}),
    });
  const data=await resp.json();
  assert.equal(resp.status,200,JSON.stringify(data));
  return {uid:data.localId,token:data.idToken,email};
}

test('account privacy export and staged deletion are server authoritative',async t=>{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore emulator required; never run against production.');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST,'Auth emulator required; never run against production.');
  if(process.env.FIREBASE_ADMIN_PROJECT_ID&&process.env.FIREBASE_ADMIN_PROJECT_ID!==projectId){
    throw new Error('Refusing to test on a non-demo Firebase project.');
  }
  process.env.FIREBASE_ADMIN_PROJECT_ID=projectId;
  const app=getApps()[0]||initializeApp({projectId});
  const db=getFirestore(app);
  const auth=getAuth(app);
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try{
    const {default:account}=await vite.ssrLoadModule('/api/admin.ts');
    const lifecycle=await vite.ssrLoadModule('/server/accountLifecycle.ts');

    const call=async(identity,method,action,body={})=>{
      const res=response();
      await account({
        method,
        headers:{authorization:'Bearer '+identity.token},
        query:method==='GET'?{__vopRoute:'account',action}:{__vopRoute:'account'},
        body:method==='POST'?{action,...body}:undefined,
      },res);
      return res;
    };

    const learner=await emulatorSignUp('privacy-learner@vop-test.invalid');
    await db.doc('users/'+learner.uid).set({
      uid:learner.uid,email:learner.email,displayName:'Privacy Learner',role:'student',
      organizationId:'org-privacy',organizationRole:'learner',
    });
    await db.doc('organizations/org-privacy').set({id:'org-privacy',name:'Privacy Org',status:'active'});
    await db.doc('organizations/org-privacy/members/'+learner.uid).set({uid:learner.uid,organizationId:'org-privacy',role:'learner',active:true});
    await db.doc('users/'+learner.uid+'/settings/personal').set({theme:'light',privacy:{profileVisibility:'private'}});
    await db.doc('prayerRequests/prayer-privacy').set({candidateId:learner.uid,organizationId:'org-privacy',requestText:'Please pray',status:'Received'});
    await db.doc('certificates/cert-privacy').set({candidateId:learner.uid,candidateName:'Privacy Learner',candidateEmail:learner.email,certificateNumber:'VOP-TEST-PRIVACY',status:'Certified'});
    await db.doc('paymentTransactions/pay-privacy').set({payerUid:learner.uid,payerEmail:learner.email,payerName:'Privacy Learner',status:'paid',amountMinor:5000,currency:'ZMW'});
    await db.doc('paymentReceipts/pay-privacy').set({payerUid:learner.uid,payerEmail:learner.email,payerName:'Privacy Learner',paymentId:'pay-privacy'});
    await db.doc('assessmentAttempts/attempt-privacy').set({candidateId:learner.uid,score:80,answers:{q1:'A'},correctOptionIndex:0});
    await db.doc('passkeyCredentials/passkey-privacy').set({
      uid:learner.uid,credentialId:'private-credential-id',publicKeyDer:'private-public-key-material',
      algorithm:-7,label:'Privacy device',transports:['internal'],rpId:'localhost',
      createdAt:new Date().toISOString(),
    });
    await db.doc('passkeyChallenges/passkey-pending-privacy').set({
      uid:learner.uid,purpose:'registration',origin:'http://localhost',rpId:'localhost',
      expiresAt:new Date(Date.now()+300000).toISOString(),
    });

    await t.test('export returns owned data but strips official answer-key material',async()=>{
      const res=await call(learner,'GET','export');
      assert.equal(res.code,200,JSON.stringify(res.payload));
      assert.equal(res.payload.export.data.profile.email,learner.email);
      assert.equal(res.payload.export.data.prayerRequests.length,1);
      const attempt=res.payload.export.data.assessmentAttempts.find(item=>item.id==='attempt-privacy');
      assert.equal(attempt.answers.q1,'A');
      assert.equal('correctOptionIndex' in attempt,false);
      assert.equal(res.payload.export.data.passkeys.length,1);
      assert.equal(res.payload.export.data.passkeys[0].label,'Privacy device');
      assert.equal(res.payload.export.data.passkeys[0].rpId,'localhost');
      assert.equal('credentialId' in res.payload.export.data.passkeys[0],false);
      assert.equal('publicKeyDer' in res.payload.export.data.passkeys[0],false);
      const events=(await db.collection('accountSecurityEvents').where('uid','==',learner.uid).get()).docs;
      assert.equal(events.length,1);
      assert.equal(events[0].data().action,'account_exported');
      assert.equal((await db.collection('notifications').where('recipientId','==',learner.uid).get()).docs
        .some(item=>item.data().type==='security'),true);
    });

    await t.test('account security activity is owned, bounded and excludes other users',async()=>{
      const own=await call(learner,'GET','security-activity');
      assert.equal(own.code,200,JSON.stringify(own.payload));
      assert.ok(own.payload.items.some(row=>row.action==='account_exported'));
      assert.ok(own.payload.items.every(row=>!('uid' in row)&&!('notificationId' in row)));
      const stranger=await emulatorSignUp('security-stranger@vop-test.invalid');
      await db.doc('users/'+stranger.uid).set({uid:stranger.uid,email:stranger.email,role:'student'});
      const other=await call(stranger,'GET','security-activity');
      assert.equal(other.code,200);
      assert.deepEqual(other.payload.items,[]);
      await db.doc('users/'+stranger.uid).delete();
      await auth.deleteUser(stranger.uid);
      const exportedAgain=await call(learner,'GET','export');
      assert.equal(exportedAgain.code,200);
      assert.ok(exportedAgain.payload.export.data.securityActivity
        .some(item=>item.action==='account_exported'));
    });

    await t.test('security summary exposes limited identity metadata and revocation demands recent authentication',async()=>{
      const securityUser=await emulatorSignUp('privacy-security@vop-test.invalid');
      await db.doc('users/'+securityUser.uid).set({uid:securityUser.uid,email:securityUser.email,displayName:'Security Test',role:'student'});
      const status=await call(securityUser,'GET','security-status');
      assert.equal(status.code,200,JSON.stringify(status.payload));
      assert.equal(typeof status.payload.emailVerified,'boolean');
      assert.ok(Array.isArray(status.payload.signInProviders));
      assert.equal('passwordHash' in status.payload,false);
      assert.equal('refreshToken' in status.payload,false);
      const rejected=await call(securityUser,'POST','revoke-sessions',{confirmation:'YES'});
      assert.equal(rejected.code,400);
      await new Promise(resolve=>setTimeout(resolve,1100));
      const revoked=await call(securityUser,'POST','revoke-sessions',{confirmation:'SIGN OUT ALL DEVICES'});
      assert.equal(revoked.code,200,JSON.stringify(revoked.payload));
      assert.equal(revoked.payload.revoked,true);
      await assert.rejects(()=>auth.verifyIdToken(securityUser.token,true));
      await db.doc('users/'+securityUser.uid).delete();
      await auth.deleteUser(securityUser.uid);
    });

    await t.test('revoked access tokens cannot export records or request account deletion',async()=>{
      const actor=await emulatorSignUp('privacy-revoked@vop-test.invalid');
      await db.doc('users/'+actor.uid).set({
        uid:actor.uid,email:actor.email,displayName:'Revocation Test',role:'student',
      });
      const before=await call(actor,'GET','export');
      assert.equal(before.code,200,JSON.stringify(before.payload));
      await new Promise(resolve=>setTimeout(resolve,1100));
      await auth.revokeRefreshTokens(actor.uid);
      const exported=await call(actor,'GET','export');
      assert.equal(exported.code,401,JSON.stringify(exported.payload));
      assert.equal(exported.payload.export,undefined);
      const deletion=await call(actor,'POST','request-deletion',{
        confirmation:'DELETE MY ACCOUNT',
      });
      assert.equal(deletion.code,401,JSON.stringify(deletion.payload));
      assert.equal((await db.doc('accountLifecycle/'+actor.uid).get()).exists,false);
      await db.doc('users/'+actor.uid).delete();
      await auth.deleteUser(actor.uid);
    });

    await t.test('confirmation phrase is mandatory and a valid request remains cancellable',async()=>{
      const rejected=await call(learner,'POST','request-deletion',{confirmation:'delete'});
      assert.equal(rejected.code,400);
      const requested=await call(learner,'POST','request-deletion',{confirmation:'DELETE MY ACCOUNT'});
      assert.equal(requested.code,202,JSON.stringify(requested.payload));
      assert.equal(requested.payload.status,'requested');
      assert.ok(Date.parse(requested.payload.scheduledFor)>Date.now());
      const status=await call(learner,'GET','status');
      assert.equal(status.payload.status,'requested');
      const cancelled=await call(learner,'POST','cancel-deletion');
      assert.equal(cancelled.code,200);
      assert.equal(cancelled.payload.status,'cancelled');
    });

    await t.test('organization ownership blocks self-deletion until responsibility is transferred',async()=>{
      const owner=await emulatorSignUp('privacy-owner@vop-test.invalid');
      await db.doc('users/'+owner.uid).set({
        uid:owner.uid,email:owner.email,displayName:'Privacy Owner',role:'student',
        organizationId:'org-privacy',organizationRole:'owner',
      });
      await db.doc('organizations/org-privacy/members/'+owner.uid).set({uid:owner.uid,organizationId:'org-privacy',role:'owner',active:true});
      const blocked=await call(owner,'POST','request-deletion',{confirmation:'DELETE MY ACCOUNT'});
      assert.equal(blocked.code,409,JSON.stringify(blocked.payload));
      assert.match(String(blocked.payload.error||''),/transfer ownership/i);
      await auth.deleteUser(owner.uid);
      await db.doc('users/'+owner.uid).delete();
      await db.doc('organizations/org-privacy/members/'+owner.uid).delete();
    });

    await t.test('due deletion removes personal records and pseudonymizes retained records',async()=>{
      const requested=await call(learner,'POST','request-deletion',{confirmation:'DELETE MY ACCOUNT'});
      assert.equal(requested.code,202,JSON.stringify(requested.payload));
      await db.doc('accountLifecycle/'+learner.uid).set({
        status:'requested',scheduledFor:new Date(Date.now()-60_000).toISOString(),
      },{merge:true});
      const result=await lifecycle.processAccountDeletion(db,learner.uid,new Date());
      assert.equal(result.status,'completed',JSON.stringify(result));
      assert.equal((await db.doc('users/'+learner.uid).get()).exists,false);
      assert.equal((await db.doc('prayerRequests/prayer-privacy').get()).exists,false);
      assert.equal((await db.doc('passkeyCredentials/passkey-privacy').get()).exists,false);
      assert.equal((await db.doc('passkeyChallenges/passkey-pending-privacy').get()).exists,false);
      await assert.rejects(()=>auth.getUser(learner.uid));
      const certificate=(await db.doc('certificates/cert-privacy').get()).data();
      assert.match(String(certificate.candidateId||''),/^deleted:/);
      assert.equal(certificate.candidateName,'Privacy Learner');
      assert.equal(certificate.candidateEmail,undefined);
      const payment=(await db.doc('paymentTransactions/pay-privacy').get()).data();
      assert.match(String(payment.payerUid||''),/^deleted:/);
      assert.equal(payment.payerEmail,undefined);
      assert.equal(payment.payerName,'Deleted VOP account');
      assert.ok(result.pseudonym);
      assert.equal((await db.doc('accountDeletionTombstones/'+result.pseudonym).get()).exists,true);
      assert.equal((await db.doc('accountLifecycle/'+learner.uid).get()).exists,false);
    });
  }finally{
    await vite.close();
  }
});
