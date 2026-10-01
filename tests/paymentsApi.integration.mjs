import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer } from 'vite';

test('payments: server pricing, provider verification, tenant isolation and fulfilment', async t => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator required; never run payment tests against production.');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Auth emulator required; never run payment tests against production.');
  if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_PROJECT_ID !== 'demo-vop-security-rules') {
    throw new Error('Refusing to test payments on a non-demo Firebase project.');
  }
  process.env.FIREBASE_ADMIN_PROJECT_ID='demo-vop-security-rules';
  const app=getApps()[0] || initializeApp({projectId:'demo-vop-security-rules'});
  const db=getFirestore(app);
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try{
    const providers=await vite.ssrLoadModule('/server/payments/providers.ts');
    const captured=new Map();
    const verificationOverrides=new Map();
    const state={nextCreateStatus:'pending',nextCreateError:''};

    providers.registerPaymentProviderForTesting({
      key:'testpay',
      capabilities:{checkout:true,card:true,mobileMoney:true,bank:false,refunds:false,partialRefunds:false,webhooks:true,reconciliation:true},
      configured(){return true;},
      publicConfiguration(){return {key:'testpay',configured:true,environment:'test',methods:['card','airtel_money','mtn_money'],capabilities:this.capabilities};},
      async createPayment(input){
        if(state.nextCreateError){
          const message=state.nextCreateError;state.nextCreateError='';throw new Error(message);
        }
        captured.set(input.reference,input);
        const providerStatus=state.nextCreateStatus;
        state.nextCreateStatus='pending';
        return {
          provider:'testpay',providerStatus,status:providerStatus,
          providerTransactionId:'provider-'+input.reference,
          providerReference:'ext-'+input.reference,
          settlementStatus:providerStatus==='paid'?'pending':'unknown',
          safeMessage:'Test provider response.',
        };
      },
      async verifyPayment(reference){
        const input=captured.get(reference);
        if(!input)throw new Error('Provider transaction was not found.');
        const override=verificationOverrides.get(reference)||{};
        const providerStatus=override.providerStatus||'successful';
        const status=providerStatus==='successful'?'paid':
          providerStatus==='failed'?'failed':
          providerStatus==='pay-offline'?'requires_action':'pending';
        return {
          provider:'testpay',providerStatus,status,
          providerTransactionId:'provider-'+reference,providerReference:'ext-'+reference,
          settlementStatus:status==='paid'?'pending':'unknown',safeMessage:'Verified.',
          amount:override.amount||((input.amountMinor/100).toFixed(2)),
          currency:override.currency||input.currency,
          reference:override.reference||reference,
          completedAt:status==='paid'?new Date().toISOString():null,
          initiatedAt:new Date().toISOString(),paymentType:'test',settlement:null,
        };
      },
      verifyWebhook(_body,signature){return signature==='valid';},
    });

    const {default:payments}=await vite.ssrLoadModule('/api/payments.ts');

    async function identity(name,{organizationId='',organizationRole='',role='student',membershipRole='learner'}={}){
      const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
        '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({email:name+'@payments.invalid',password:'local-emulator-only',returnSecureToken:true}),
        });
      const account=await response.json();
      assert.equal(response.status,200,JSON.stringify(account));
      await db.doc('users/'+account.localId).set({
        uid:account.localId,role,organizationId,organizationRole,
        displayName:name,email:name+'@payments.invalid',progress:{},
      });
      if(organizationId){
        await db.doc('organizations/'+organizationId+'/members/'+account.localId).set({
          uid:account.localId,organizationId,role:membershipRole,active:true,
        });
      }
      return {uid:account.localId,token:account.idToken};
    }

    async function call(user,route,body={},extraHeaders={}){
      let status=200,output;
      await payments({
        method:'POST',url:'/api/payments/'+route,query:{__vopPaymentRoute:route},
        headers:{...(user?{authorization:'Bearer '+user.token}:{}),...extraHeaders},
        body,
      },{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
        setHeader(){return this;},
      });
      assert.ok(output&&typeof output==='object','Payment API must return JSON for '+route);
      return {status,...output};
    }

    async function webhook(body,signature='valid'){
      let status=200,output;
      const rawBody=Buffer.from(JSON.stringify(body));
      await payments({
        method:'POST',url:'/api/payments/webhooks/lenco',
        query:{__vopPaymentRoute:'webhooks/lenco'},
        headers:{'x-lenco-signature':signature},body,rawBody,
      },{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
        setHeader(){return this;},
      });
      return {status,...output};
    }

    const orgA='pay-org-a',orgB='pay-org-b';
    await db.doc('organizations/'+orgA).set({id:orgA,name:'Payment Org A',status:'active'});
    await db.doc('organizations/'+orgB).set({id:orgB,name:'Payment Org B',status:'active'});
    const admin=await identity('payment-super',{role:'super_admin',membershipRole:''});
    const learner=await identity('payment-learner',{organizationId:orgA,organizationRole:'learner'});
    const outsider=await identity('payment-outsider',{organizationId:orgB,organizationRole:'learner'});

    const guideId='paid-guide';
    const programId='paid-program';
    const eventId='paid-event';
    const planId='paid-plan';
    await db.doc('guides/'+guideId).set({
      id:guideId,title:'Paid Guide',organizationId:orgA,ownerOrganizationId:orgA,
      published:true,archived:false,sharingScope:'organization',language:'en',
    });
    await db.doc('programs/'+programId).set({
      id:programId,title:'Paid Programme',organizationId:orgA,sharingScope:'organization',
      published:true,archived:false,guideIds:[guideId],
    });
    await db.doc('events/'+eventId).set({
      id:eventId,title:'Paid Event',organizationId:orgA,published:true,sharingScope:'organization',
    });
    await db.doc('system/plans/catalog/'+planId).set({
      id:planId,name:'Paid Organization Plan',active:true,interval:'month',
      price:99,currency:'ZMW',features:{payments:true,radio:true},quotas:{users:100},
    });

    async function createItem(name,itemType,itemId,{repeatable=false,amount=125,organizationId=orgA}={}){
      const response=await call(admin,'admin/payable-items',{
        organizationId,
        action:'upsert',
        item:{
          name,description:name+' charge',itemType,itemId,
          organizationId,scope:'organization',amount,currency:'ZMW',
          repeatable,active:true,paymentRequired:true,
          allowedProviders:['testpay'],allowedMethods:['card'],
        },
      });
      assert.equal(response.status,200,JSON.stringify(response));
      return response.item;
    }

    await t.test('duplicate checkout is idempotent and client amount is never authoritative',async()=>{
      const item=await createItem('Duplicate safe charge','custom_charge','',{amount:250});
      state.nextCreateStatus='pending';
      const first=await call(learner,'checkout',{payableItemId:item.id,provider:'testpay',paymentMethod:'card',amount:1,currency:'USD'});
      assert.equal(first.status,200,JSON.stringify(first));
      assert.equal(first.payment.amountDecimal,'250.00');
      assert.equal(first.payment.currency,'ZMW');
      const second=await call(learner,'checkout',{payableItemId:item.id,provider:'testpay',paymentMethod:'card',amount:999999});
      assert.equal(second.status,200,JSON.stringify(second));
      assert.equal(second.reused,true);
      assert.equal(second.payment.id,first.payment.id);
      assert.equal((await db.collection('paymentTransactions').where('payableItemId','==',item.id).where('payerUid','==',learner.uid).get()).size,1);
    });

    await t.test('successful verified programme payment creates receipt and programme/course access once',async()=>{
      const item=await createItem('Programme registration','programme_registration',programId,{amount:300});
      state.nextCreateStatus='pending';
      const started=await call(learner,'checkout',{payableItemId:item.id,provider:'testpay',paymentMethod:'card'});
      assert.equal(started.payment.status,'pending');
      const verified=await call(learner,'verify',{reference:started.payment.reference});
      assert.equal(verified.status,200,JSON.stringify(verified));
      assert.equal(verified.payment.status,'paid');
      assert.equal(verified.payment.verificationStatus,'verified');
      assert.equal(verified.payment.fulfilmentStatus,'fulfilled');
      assert.equal((await db.doc('paymentReceipts/'+started.payment.id).get()).exists,true);
      assert.equal((await db.doc('courseEnrollments/'+orgA+'_'+learner.uid+'_'+guideId).get()).data()?.status,'active');
      const programs=await db.collection('programEnrollments').where('uid','==',learner.uid).where('programId','==',programId).get();
      assert.equal(programs.size,1);
      await call(learner,'verify',{reference:started.payment.reference});
      const audit=await db.doc('paymentTransactions/'+started.payment.id).collection('audit').get();
      assert.equal(audit.docs.filter(doc=>doc.data().action==='fulfilment.completed').length,1);
    });

    await t.test('tampered provider amount is quarantined and cannot activate entitlement',async()=>{
      const item=await createItem('Amount integrity charge','custom_charge','',{amount:410});
      const started=await call(learner,'checkout',{payableItemId:item.id,provider:'testpay',paymentMethod:'card'});
      verificationOverrides.set(started.payment.reference,{amount:'1.00'});
      const verified=await call(learner,'verify',{reference:started.payment.reference});
      assert.equal(verified.status,200,JSON.stringify(verified));
      assert.equal(verified.payment.verificationStatus,'mismatch');
      assert.notEqual(verified.payment.status,'paid');
      assert.equal((await db.doc('paymentFulfilments/'+started.payment.id).get()).exists,false);
      verificationOverrides.delete(started.payment.reference);
    });

    await t.test('unauthorized organization cannot pay another organization private charge',async()=>{
      const item=await createItem('Org A only charge','custom_charge','',{amount:50});
      const blocked=await call(outsider,'checkout',{payableItemId:item.id,provider:'testpay',paymentMethod:'card'});
      assert.equal(blocked.status,400,JSON.stringify(blocked));
      assert.match(String(blocked.error||''),/not available|account/i);
      assert.equal((await db.collection('paymentTransactions').where('payerUid','==',outsider.uid).where('payableItemId','==',item.id).get()).size,0);
    });

    await t.test('failed and pending provider states remain non-entitled',async()=>{
      const failedItem=await createItem('Failed charge','custom_charge','',{amount:60});
      state.nextCreateStatus='failed';
      const failed=await call(learner,'checkout',{payableItemId:failedItem.id,provider:'testpay',paymentMethod:'card'});
      assert.equal(failed.payment.status,'failed');
      assert.equal((await db.doc('paymentFulfilments/'+failed.payment.id).get()).exists,false);

      const pendingItem=await createItem('Pending charge','custom_charge','',{amount:70});
      state.nextCreateStatus='pending';
      const pending=await call(learner,'checkout',{payableItemId:pendingItem.id,provider:'testpay',paymentMethod:'card'});
      assert.equal(pending.payment.status,'pending');
      assert.equal((await db.doc('paymentFulfilments/'+pending.payment.id).get()).exists,false);
    });

    await t.test('network interruption preserves an ambiguous transaction for later reconciliation',async()=>{
      const item=await createItem('Network recovery charge','custom_charge','',{amount:80});
      state.nextCreateError='The payment provider timed out. The transaction will be reconciled automatically.';
      const ambiguous=await call(learner,'checkout',{payableItemId:item.id,provider:'testpay',paymentMethod:'card'});
      assert.equal(ambiguous.status,200,JSON.stringify(ambiguous));
      assert.equal(ambiguous.payment.status,'pending');
      assert.equal(ambiguous.payment.reconciliationStatus,'pending');
      // Simulate the provider having accepted the request despite the lost response.
      captured.set(ambiguous.payment.reference,{reference:ambiguous.payment.reference,amountMinor:8000,currency:'ZMW'});
      const reconciled=await call(admin,'admin/reconcile',{paymentId:ambiguous.payment.id});
      assert.equal(reconciled.status,200,JSON.stringify(reconciled));
      assert.equal(reconciled.payment.status,'paid');
      assert.equal((await db.doc('paymentFulfilments/'+ambiguous.payment.id).get()).data()?.status,'fulfilled');
    });

    await t.test('verified event payment registers the learner',async()=>{
      const item=await createItem('Event registration','event_registration',eventId,{amount:95});
      const started=await call(learner,'checkout',{payableItemId:item.id,provider:'testpay',paymentMethod:'card'});
      const verified=await call(learner,'verify',{reference:started.payment.reference});
      assert.equal(verified.payment.status,'paid');
      const registrations=await db.collection('eventRegistrations').where('uid','==',learner.uid).where('eventId','==',eventId).get();
      assert.equal(registrations.size,1);
      assert.equal(registrations.docs[0].data().source,'verified-payment');
    });

    await t.test('verified subscription payment activates plan with payment provenance',async()=>{
      const item=await createItem('Organization subscription','organization_subscription',planId,{amount:99});
      const started=await call(learner,'checkout',{payableItemId:item.id,provider:'testpay',paymentMethod:'card'});
      const verified=await call(learner,'verify',{reference:started.payment.reference});
      assert.equal(verified.payment.status,'paid');
      const subscription=(await db.doc('organizations/'+orgA+'/subscription/current').get()).data();
      assert.equal(subscription?.status,'active');
      assert.equal(subscription?.planId,planId);
      assert.equal(subscription?.activationSource,'payment');
      assert.equal(subscription?.lastPaymentId,started.payment.id);
      const organization=(await db.doc('organizations/'+orgA).get()).data();
      assert.equal(organization?.plan,planId);
      assert.equal(organization?.featureEntitlements?.radio,true);
    });

    await t.test('signed webhook is idempotent and invalid webhook is rejected',async()=>{
      const item=await createItem('Webhook charge','custom_charge','',{amount:120});
      const started=await call(learner,'checkout',{payableItemId:item.id,provider:'testpay',paymentMethod:'card'});
      const body={event:'collection.successful',data:{reference:started.payment.reference,lencoReference:'ext-'+started.payment.reference,status:'successful',completedAt:'2026-10-01T12:00:00Z'}};
      const invalid=await webhook(body,'bad');
      assert.equal(invalid.status,401,JSON.stringify(invalid));
      assert.equal((await db.doc('paymentFulfilments/'+started.payment.id).get()).exists,false);

      const first=await webhook(body,'valid');
      assert.equal(first.status,200,JSON.stringify(first));
      assert.equal(first.duplicate,false);
      const second=await webhook(body,'valid');
      assert.equal(second.status,200,JSON.stringify(second));
      assert.equal(second.duplicate,true);
      assert.equal((await db.doc('paymentFulfilments/'+started.payment.id).get()).data()?.status,'fulfilled');
      const audit=await db.doc('paymentTransactions/'+started.payment.id).collection('audit').get();
      assert.equal(audit.docs.filter(doc=>doc.data().action==='fulfilment.completed').length,1);
    });

    await t.test('unknown and malformed transaction references never leak payment data',async()=>{
      const unknown=await call(learner,'status',{reference:'VOP-UNKNOWN-123'});
      assert.equal(unknown.status,404,JSON.stringify(unknown));
      const malformed=await call(learner,'status',{reference:'bad'});
      assert.equal(malformed.status,400,JSON.stringify(malformed));
    });

    await t.test('payment history is owner-only while Super Admin gets scoped administration access',async()=>{
      const history=await call(learner,'history',{});
      assert.equal(history.status,200);
      assert.ok(history.items.length>=1);
      assert.ok(history.items.every(item=>item.payerUid===learner.uid));

      const adminRows=await call(admin,'admin/transactions',{filters:{organizationId:orgA}});
      assert.equal(adminRows.status,200,JSON.stringify(adminRows));
      assert.ok(adminRows.items.length>=1);
      assert.ok(adminRows.items.every(item=>item.organizationId===orgA));
    });
  }finally{
    await vite.close();
    if(getApps().includes(app))await deleteApp(app);
  }
});
