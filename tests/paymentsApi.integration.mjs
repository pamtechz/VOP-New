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
    const mtnCaptured=new Map();
    const mtnStatuses=new Map();
    let mtnVerifyCalls=0;
    const airtelCaptured=new Map();
    const airtelStatuses=new Map();
    const state={nextCreateStatus:'pending',nextCreateError:''};

    providers.registerPaymentProviderForTesting({
      key:'lenco',
      capabilities:{checkout:true,card:true,mobileMoney:true,bank:false,refunds:false,partialRefunds:false,webhooks:true,reconciliation:true},
      configured(){return true;},
      publicConfiguration(){return {key:'lenco',configured:true,environment:'test',methods:['card','airtel_money','mtn_money'],capabilities:this.capabilities};},
      async createPayment(input){
        if(state.nextCreateError){
          const message=state.nextCreateError;state.nextCreateError='';throw new Error(message);
        }
        captured.set(input.reference,input);
        const providerStatus=state.nextCreateStatus;
        state.nextCreateStatus='pending';
        return {
          provider:'lenco',providerStatus,status:providerStatus,
          providerTransactionId:'provider-'+input.reference,
          providerReference:'ext-'+input.reference,
          settlementStatus:providerStatus==='paid'?'pending':'unknown',
          safeMessage:'Test provider response.',
        };
      },
      async resumeCheckout(input){
        return {
          provider:'lenco',providerStatus:'initiated',status:'initiated',
          providerTransactionId:'provider-'+input.reference,providerReference:'ext-'+input.reference,
          settlementStatus:'unknown',safeMessage:'Resume checkout.',
          checkout:{mode:'inline',publicKey:'test-public-key',scriptUrl:'https://example.invalid/lenco.js',channels:['card']},
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
          provider:'lenco',providerStatus,status,
          providerTransactionId:'provider-'+reference,providerReference:'ext-'+reference,
          settlementStatus:status==='paid'?'pending':'unknown',safeMessage:'Verified.',
          amount:override.amount||((input.amountMinor/100).toFixed(2)),
          currency:override.currency||input.currency,
          reference:override.reference||reference,
          completedAt:status==='paid'?new Date().toISOString():null,
          initiatedAt:new Date().toISOString(),paymentType:'test',settlement:null,
        };
      },
      parseWebhook(request){
        const signature=request.headers?.['x-lenco-signature']||request.headers?.['X-Lenco-Signature'];
        if(signature!=='valid')throw new Error('Invalid payment webhook signature.');
        const data=request.body?.data||{};
        return {
          reference:String(data.reference||''),eventType:String(request.body?.event||'provider.event'),authenticated:true,
          providerStatus:String(data.status||''),providerTransactionId:'',
          providerReference:String(data.lencoReference||''),completedAt:data.completedAt||null,
        };
      },
    });

    providers.registerPaymentProviderForTesting({
      key:'mtn_momo',
      callbackMethods:['POST','PUT'],
      capabilities:{checkout:true,card:false,mobileMoney:true,bank:false,refunds:false,partialRefunds:false,webhooks:true,reconciliation:true},
      configured(){return true;},
      publicConfiguration(){return {key:'mtn_momo',configured:true,environment:'test',methods:['mtn_money'],capabilities:this.capabilities};},
      async createPayment(input){
        const transactionId='11111111-1111-4111-8111-'+String(mtnCaptured.size+1).padStart(12,'0');
        mtnCaptured.set(input.reference,{...input,transactionId});
        mtnStatuses.set(input.reference,'pending');
        return {
          provider:'mtn_momo',providerStatus:'pending',status:'pending',
          providerTransactionId:transactionId,providerReference:transactionId,
          settlementStatus:'unknown',safeMessage:'Approve MTN MoMo request.',
        };
      },
      async verifyPayment(reference,context){
        mtnVerifyCalls++;
        const input=mtnCaptured.get(reference);
        if(!input)throw new Error('Provider transaction was not found.');
        assert.equal(context?.providerTransactionId,input.transactionId);
        const providerStatus=mtnStatuses.get(reference)||'pending';
        const status=providerStatus==='successful'?'paid':providerStatus==='failed'?'failed':'pending';
        return {
          provider:'mtn_momo',providerStatus,status,
          providerTransactionId:input.transactionId,
          providerReference:status==='paid'?'MTN-FIN-'+reference:input.transactionId,
          settlementStatus:status==='paid'?'pending':'unknown',safeMessage:'MTN status verified.',
          amount:(input.amountMinor/100).toFixed(2),currency:input.currency,reference,
          completedAt:status==='paid'?new Date().toISOString():null,initiatedAt:null,paymentType:'mtn_momo',settlement:null,
        };
      },
      parseWebhook(request){
        const data=request.body||{};
        return {
          reference:String(data.externalId||''),eventType:'requesttopay.callback',authenticated:false,
          providerStatus:String(data.status||'').toLowerCase(),providerTransactionId:String(data.referenceId||''),
          providerReference:String(data.financialTransactionId||''),completedAt:null,
        };
      },
    });

    providers.registerPaymentProviderForTesting({
      key:'airtel_money',
      callbackMethods:['POST'],
      capabilities:{checkout:true,card:false,mobileMoney:true,bank:false,refunds:false,partialRefunds:false,webhooks:true,reconciliation:true},
      configured(){return true;},
      publicConfiguration(){return {key:'airtel_money',configured:true,environment:'test',methods:['airtel_money'],capabilities:this.capabilities};},
      async createPayment(input){
        const transactionId='22222222-2222-4222-8222-'+String(airtelCaptured.size+1).padStart(12,'0');
        airtelCaptured.set(input.reference,{...input,transactionId});
        airtelStatuses.set(input.reference,'TIP');
        return {
          provider:'airtel_money',providerStatus:'TIP',status:'pending',
          providerTransactionId:transactionId,providerReference:transactionId,
          settlementStatus:'unknown',safeMessage:'Approve Airtel Money request.',
        };
      },
      async verifyPayment(reference,context){
        const input=airtelCaptured.get(reference);
        if(!input)throw new Error('Airtel provider transaction was not found.');
        assert.equal(context?.providerTransactionId,input.transactionId);
        const providerStatus=airtelStatuses.get(reference)||'TIP';
        const status=providerStatus==='TS'?'paid':providerStatus==='TF'?'failed':providerStatus==='TE'?'expired':'processing';
        return {
          provider:'airtel_money',providerStatus,status,
          providerTransactionId:input.transactionId,
          providerReference:status==='paid'?'AIRTEL-FIN-'+reference:input.transactionId,
          settlementStatus:status==='paid'?'pending':'unknown',safeMessage:'Airtel status verified.',
          amount:(input.amountMinor/100).toFixed(2),currency:input.currency,reference,
          completedAt:status==='paid'||status==='failed'||status==='expired'?new Date().toISOString():null,
          initiatedAt:null,paymentType:'airtel_money',settlement:null,
        };
      },
      parseWebhook(request){
        const transaction=request.body?.transaction||{};
        return {
          reference:String(request.body?.reference||transaction.reference||''),
          eventType:'collection.callback',authenticated:true,
          providerStatus:String(transaction.status_code||transaction.status||''),
          providerTransactionId:String(transaction.id||''),
          providerReference:String(transaction.airtel_money_id||''),completedAt:null,
        };
      },
    });

    const {default:payments}=await vite.ssrLoadModule('/api/payments.ts');
    const {default:plans}=await vite.ssrLoadModule('/api_handlers/admin/plans.ts');
    const {default:organizationsApi}=await vite.ssrLoadModule('/api_handlers/admin/organizations.ts');
    const {requireOrganizationSubscriptionFeature}=await vite.ssrLoadModule('/server/permissions.ts');
    const {enforceOrganizationQuota}=await vite.ssrLoadModule('/server/tenant.ts');

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

    async function planCall(user,body={}){
      let status=200,output;
      await plans({
        method:'POST',headers:{authorization:'Bearer '+user.token},body,
      },{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
      });
      assert.ok(output&&typeof output==='object','Plan API must return JSON');
      return {status,...output,httpStatus:status};
    }

    async function organizationCall(user,body={}){
      let status=200,output;
      await organizationsApi({
        method:'POST',headers:{authorization:'Bearer '+user.token},body,
      },{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
      });
      assert.ok(output&&typeof output==='object','Organization API must return JSON');
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

    async function mtnWebhook(body,method='PUT'){
      let status=200,output;
      await payments({
        method,url:'/api/payments/webhooks/mtn-momo',
        query:{__vopPaymentRoute:'webhooks/mtn-momo'},
        headers:{},body,rawBody:Buffer.from(JSON.stringify(body)),
      },{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
        setHeader(){return this;},
      });
      return {status,...output};
    }

    async function airtelWebhook(body){
      let status=200,output;
      await payments({
        method:'POST',url:'/api/payments/webhooks/airtel-money',
        query:{__vopPaymentRoute:'webhooks/airtel-money'},
        headers:{authorization:'Bearer test-airtel-callback'},body,rawBody:Buffer.from(JSON.stringify(body)),
      },{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
        setHeader(){return this;},
      });
      return {status,...output};
    }

    const orgA='pay-org-a',orgB='pay-org-b',orgIntl='pay-org-intl';
    await db.doc('system/billing').set({
      baseCurrency:'USD',zambiaCurrency:'ZMW',usdToZmwRate:25,fxSource:'integration-test',
      fxUpdatedAt:new Date().toISOString(),fxQuoteTtlMinutes:1440,
    });
    await db.doc('organizations/'+orgA).set({
      id:orgA,name:'Payment Org A',status:'active',billingCountry:'Zambia',countryCode:'ZM',
      billingProfile:{countryCode:'ZM',countryName:'Zambia',billingCurrency:'ZMW',pricingRegion:'zambia'},
    });
    await db.doc('organizations/'+orgB).set({
      id:orgB,name:'Payment Org B',status:'active',billingCountry:'Zambia',countryCode:'ZM',
      billingProfile:{countryCode:'ZM',countryName:'Zambia',billingCurrency:'ZMW',pricingRegion:'zambia'},
    });
    await db.doc('organizations/'+orgIntl).set({
      id:orgIntl,name:'International Payment Org',status:'active',billingCountry:'United States',countryCode:'US',
      billingProfile:{countryCode:'US',countryName:'United States',billingCurrency:'USD',pricingRegion:'international'},
    });
    const admin=await identity('payment-super',{role:'super_admin',membershipRole:''});
    const learner=await identity('payment-learner',{organizationId:orgA,organizationRole:'learner'});
    const organizationOwner=await identity('payment-org-owner',{organizationId:orgA,organizationRole:'owner',membershipRole:'owner'});
    const organizationAdmin=await identity('payment-org-admin',{organizationId:orgA,organizationRole:'admin',membershipRole:'admin'});
    const internationalOwner=await identity('payment-intl-owner',{organizationId:orgIntl,organizationRole:'owner',membershipRole:'owner'});
    const webhookLearner=await identity('payment-webhook-learner',{organizationId:orgA,organizationRole:'learner'});
    const refundLearner=await identity('payment-refund-learner',{organizationId:orgA,organizationRole:'learner'});
    const mtnLearner=await identity('payment-mtn-learner',{organizationId:orgA,organizationRole:'learner'});
    const airtelLearner=await identity('payment-airtel-learner',{organizationId:orgA,organizationRole:'learner'});
    const outsider=await identity('payment-outsider',{organizationId:orgB,organizationRole:'learner'});

    const guideId='paid-guide';
    const programId='paid-program';
    const eventId='paid-event';
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
    async function createItem(name,itemType,itemId,{
      repeatable=false,amount=125,organizationId=orgA,
      allowedProviders=['lenco'],allowedMethods=['card'],
    }={}){
      const response=await call(admin,'admin/payable-items',{
        organizationId,
        action:'upsert',
        item:{
          name,description:name+' charge',itemType,itemId,
          organizationId,scope:'organization',amount,currency:'ZMW',
          repeatable,active:true,paymentRequired:true,
          allowedProviders,allowedMethods,
        },
      });
      assert.equal(response.status,200,JSON.stringify(response));
      return response.item;
    }

    await t.test('platform finance controls are Super Admin-only and consumer catalog hides provider administration',async()=>{
      const privateItem=await createItem('Super Admin charge','custom_charge','',{amount:25});
      const learnerCatalog=await call(learner,'catalog',{});
      assert.equal(learnerCatalog.status,200,JSON.stringify(learnerCatalog));
      assert.equal(Object.hasOwn(learnerCatalog,'providers'),false);
      const consumerItem=learnerCatalog.items.find(item=>item.id===privateItem.id);
      assert.ok(consumerItem);
      assert.equal(Object.hasOwn(consumerItem,'allowedProviders'),false);
      assert.deepEqual(consumerItem.allowedMethods,['card']);

      for(const routeBody of [
        ['admin/payable-items',{action:'list'}],
        ['admin/providers',{action:'list'}],
        ['admin/reconcile',{}],
      ]){
        const blocked=await call(organizationOwner,routeBody[0],routeBody[1]);
        assert.equal(blocked.status,403,JSON.stringify(blocked));
      }

      const ownerRows=await call(organizationOwner,'admin/transactions',{filters:{organizationId:orgA}});
      assert.equal(ownerRows.status,200,JSON.stringify(ownerRows));
      assert.ok(ownerRows.items.every(item=>item.provider===''&&item.providerReference===''&&item.reconciliationStatus===''));
    });

    await t.test('free subscription plans quote zero safely and activate without checkout',async()=>{
      const created=await planCall(admin,{
        action:'upsertPlan',
        name:'Community Free',
        description:'No-cost organization access',
        priceUsd:0,interval:'month',sortOrder:1,active:true,
        quotas:{maxSeats:10,maxCandidates:8,maxMentors:2,maxGuides:5},
        features:{curriculum:true,candidates:true,certification:true},
      });
      assert.equal(created.status,200,JSON.stringify(created));
      const planId=created.item.id;
      assert.equal(created.item.priceUsd,0);

      const payable=await db.doc('payableItems/subscription_'+planId).get();
      assert.equal(payable.exists,false,'free plans must not create payment checkout items');

      const zambiaCatalog=await planCall(organizationOwner,{action:'listAvailablePlans'});
      assert.equal(zambiaCatalog.status,200,JSON.stringify(zambiaCatalog));
      const zambiaFree=zambiaCatalog.items.find(item=>item.id===planId);
      assert.ok(zambiaFree,JSON.stringify(zambiaCatalog));
      assert.equal(zambiaFree.billingPrice,'0.00');
      assert.equal(zambiaFree.billingCurrency,'ZMW');
      assert.equal(zambiaFree.exchangeRate,1);
      assert.equal(zambiaFree.fxSource,'free-plan');

      const internationalCatalog=await planCall(internationalOwner,{action:'listAvailablePlans'});
      assert.equal(internationalCatalog.status,200,JSON.stringify(internationalCatalog));
      const internationalFree=internationalCatalog.items.find(item=>item.id===planId);
      assert.ok(internationalFree,JSON.stringify(internationalCatalog));
      assert.equal(internationalFree.billingPrice,'0.00');
      assert.equal(internationalFree.billingCurrency,'USD');

      const activated=await planCall(internationalOwner,{
        action:'activateFreePlan',organizationId:orgIntl,planId,
      });
      assert.equal(activated.status,200,JSON.stringify(activated));
      assert.equal(activated.status,'active');
      assert.equal(activated.currentPeriodEnd,null);

      const subscription=(await db.doc('organizations/'+orgIntl+'/subscription/current').get()).data();
      assert.equal(subscription?.status,'active');
      assert.equal(subscription?.planId,planId);
      assert.equal(subscription?.activationSource,'free_plan');
      assert.equal(subscription?.billingProvider,'none');
      assert.equal(subscription?.baseAmountDecimal,'0.00');
      assert.equal(subscription?.paidAmountDecimal,'0.00');
      assert.equal(subscription?.currentPeriodEnd,null);
      assert.equal(subscription?.renewalMode,'none');

      const organization=(await db.doc('organizations/'+orgIntl).get()).data();
      assert.equal(organization?.plan,planId);
      assert.equal(organization?.quotas?.maxSeats,10);
      assert.equal(organization?.featureEntitlements?.curriculum,true);

      const repeated=await planCall(internationalOwner,{
        action:'activateFreePlan',organizationId:orgIntl,planId,
      });
      assert.equal(repeated.status,200,JSON.stringify(repeated));
      assert.equal(repeated.alreadyActive,true);
    });

    await t.test('SaaS subscription packages keep USD canonical pricing and localize Zambia billing',async()=>{
      const created=await planCall(admin,{
        action:'upsertPlan',
        name:'Growth Package',
        description:'Expanded organization capacity',
        priceUsd:10,interval:'month',sortOrder:2,active:true,
        quotas:{maxSeats:100,maxCandidates:80,maxMentors:10,maxGuides:50},
        features:{payments:true,radio:true,curriculum:true},
      });
      assert.equal(created.status,200,JSON.stringify(created));
      const packageId=created.item.id;
      assert.match(packageId,/^growth-package-[a-f0-9]{8}$/);
      assert.equal(created.item.baseCurrency,'USD');
      assert.equal(created.item.priceUsd,10);

      const directPaidActivation=await planCall(organizationOwner,{
        action:'activateFreePlan',organizationId:orgA,planId:packageId,
      });
      assert.equal(directPaidActivation.status,400,JSON.stringify(directPaidActivation));
      assert.match(String(directPaidActivation.error||''),/secure checkout/i);

      const payableId='subscription_'+packageId;
      const payable=(await db.doc('payableItems/'+payableId).get()).data();
      assert.equal(payable?.itemType,'organization_subscription');
      assert.equal(payable?.itemId,packageId);
      assert.equal(payable?.scope,'platform');
      assert.equal(payable?.currency,'USD');
      assert.equal(payable?.amountDecimal,'10.00');
      assert.equal(payable?.repeatable,true);

      const learnerCatalog=await call(learner,'catalog',{});
      assert.equal(learnerCatalog.items.some(item=>item.id===payableId),false);

      const available=await planCall(organizationOwner,{action:'listAvailablePlans'});
      assert.equal(available.status,200,JSON.stringify(available));
      const availablePlan=available.items.find(item=>item.id===packageId);
      assert.ok(availablePlan);
      assert.equal(availablePlan.baseCurrency,'USD');
      assert.equal(availablePlan.priceUsd,10);
      assert.equal(availablePlan.billingCurrency,'ZMW');
      assert.equal(availablePlan.billingPrice,'250.00');
      assert.equal(availablePlan.exchangeRate,25);

      const blockedFullCatalog=await planCall(organizationOwner,{action:'listPlans'});
      assert.equal(blockedFullCatalog.status,403,JSON.stringify(blockedFullCatalog));

      const ownerCatalog=await call(organizationOwner,'catalog',{});
      const offer=ownerCatalog.items.find(item=>item.id===payableId);
      assert.ok(offer,JSON.stringify(ownerCatalog));
      assert.equal(Object.hasOwn(offer,'allowedProviders'),false);
      assert.equal(offer.currency,'ZMW');
      assert.equal(offer.amountDecimal,'250.00');
      assert.equal(offer.pricing.baseCurrency,'USD');
      assert.equal(offer.pricing.baseAmountDecimal,'10.00');
      assert.equal(offer.pricing.exchangeRate,25);
      assert.ok(offer.allowedMethods.includes('card'));

      const started=await call(organizationOwner,'checkout',{payableItemId:payableId,paymentMethod:'card'});
      assert.equal(started.status,200,JSON.stringify(started));
      assert.equal(started.payment.currency,'ZMW');
      assert.equal(started.payment.amountDecimal,'250.00');
      assert.equal(started.payment.provider,'');
      assert.equal(started.payment.providerReference,'');
      const storedPayment=(await db.doc('paymentTransactions/'+started.payment.id).get()).data();
      assert.equal(storedPayment?.itemSnapshot?.pricing?.baseCurrency,'USD');
      assert.equal(storedPayment?.itemSnapshot?.pricing?.baseAmountDecimal,'10.00');
      assert.equal(storedPayment?.itemSnapshot?.pricing?.exchangeRate,25);

      const verified=await call(organizationOwner,'verify',{reference:started.payment.reference});
      assert.equal(verified.status,200,JSON.stringify(verified));
      assert.equal(verified.payment.status,'paid');

      const subscription=(await db.doc('organizations/'+orgA+'/subscription/current').get()).data();
      assert.equal(subscription?.status,'active');
      assert.equal(subscription?.planId,packageId);
      assert.equal(subscription?.activationSource,'payment');
      assert.equal(subscription?.lastPaymentId,started.payment.id);
      assert.equal(subscription?.baseCurrency,'USD');
      assert.equal(subscription?.baseAmountDecimal,'10.00');
      assert.equal(subscription?.billingCurrency,'ZMW');
      assert.equal(subscription?.paidAmountDecimal,'250.00');
      assert.equal(subscription?.exchangeRate,25);
      const organization=(await db.doc('organizations/'+orgA).get()).data();
      assert.equal(organization?.plan,packageId);
      assert.equal(organization?.quotas?.maxSeats,100);
      assert.equal(organization?.featureEntitlements?.radio,true);
      assert.equal(subscription?.planName,'Growth Package');
      assert.equal(subscription?.planInterval,'month');
      assert.equal(subscription?.planSnapshot?.quotas?.maxSeats,100);
      assert.equal(subscription?.planSnapshot?.features?.radio,true);
      assert.equal(subscription?.cancelAtPeriodEnd,false);
      assert.ok(Date.parse(subscription?.currentPeriodEnd)>Date.now());

      const overview=await planCall(organizationOwner,{action:'getSubscription'});
      assert.equal(overview.status,200,JSON.stringify(overview));
      assert.equal(overview.plan,packageId);
      assert.equal(overview.catalogPlan.id,packageId);
      assert.equal(overview.subscription.planSnapshot.quotas.maxSeats,100);
      assert.equal(overview.quotas.maxSeats,100);
      assert.equal(overview.usage.seats>=3,true);
      assert.equal(overview.billingAccessSuspended,false);

      // Authorization must honor the subscription term immediately, even before
      // the daily reconciliation cron persists the expired lifecycle state.
      const activePeriodEnd=String(subscription?.currentPeriodEnd||'');
      await db.doc('organizations/'+orgA+'/subscription/current').update({
        status:'active',currentPeriodEnd:new Date(Date.now()-60_000).toISOString(),
      });
      await db.doc('organizations/'+orgA).set({
        billingAccessSuspended:false,billingSuspendedReason:null,
      },{merge:true});
      await assert.rejects(
        ()=>requireOrganizationSubscriptionFeature(db,'curriculum',orgA),
        /subscription term has ended/i,
      );
      await assert.rejects(
        ()=>enforceOrganizationQuota(db,orgA,'guides','maxGuides'),
        /subscription term has ended/i,
      );
      const expiredOverview=await planCall(organizationOwner,{action:'getSubscription'});
      assert.equal(expiredOverview.status,200,JSON.stringify(expiredOverview));
      assert.equal(expiredOverview.billingAccessSuspended,true);
      assert.equal(expiredOverview.subscription.status,'expired');
      assert.equal(expiredOverview.billingSuspendedReason,'subscription_expired');
      assert.match(String(expiredOverview.billingSuspendedMessage||''),/term has ended/i);
      await db.doc('organizations/'+orgA+'/subscription/current').update({
        status:'active',currentPeriodEnd:activePeriodEnd,
      });

      const scheduled=await planCall(organizationOwner,{
        action:'cancelSubscription',mode:'period_end',reason:'Owner requested end-of-term cancellation',
      });
      assert.equal(scheduled.httpStatus,200,JSON.stringify(scheduled));
      assert.equal(scheduled.status,'active');
      assert.equal(scheduled.cancelAtPeriodEnd,true);
      assert.notEqual((await db.doc('organizations/'+orgA).get()).data()?.billingAccessSuspended,true);
      assert.equal((await db.doc('organizations/'+orgA+'/subscription/current').get()).data()?.cancelAtPeriodEnd,true);

      const resumed=await planCall(organizationAdmin,{action:'reactivateSubscription'});
      assert.equal(resumed.httpStatus,200,JSON.stringify(resumed));
      assert.equal(resumed.cancelAtPeriodEnd,false);
      assert.equal((await db.doc('organizations/'+orgA+'/subscription/current').get()).data()?.cancelAtPeriodEnd,false);

      const adminCatalog=await call(organizationAdmin,'catalog',{});
      assert.ok(adminCatalog.items.some(item=>item.id===payableId));

      const internationalPlans=await planCall(internationalOwner,{action:'listAvailablePlans'});
      const internationalPlan=internationalPlans.items.find(item=>item.id===packageId);
      assert.ok(internationalPlan);
      assert.equal(internationalPlan.billingCurrency,'USD');
      assert.equal(internationalPlan.billingPrice,'10.00');
      assert.equal(internationalPlan.exchangeRate,1);

      const internationalCatalog=await call(internationalOwner,'catalog',{});
      const internationalOffer=internationalCatalog.items.find(item=>item.id===payableId);
      assert.ok(internationalOffer,JSON.stringify(internationalCatalog));
      assert.equal(internationalOffer.currency,'USD');
      assert.equal(internationalOffer.amountDecimal,'10.00');
      assert.deepEqual(internationalOffer.allowedMethods,['card']);
      const mobileMoneyBlocked=await call(internationalOwner,'checkout',{payableItemId:payableId,paymentMethod:'airtel_money',phone:'0977000000'});
      assert.equal(mobileMoneyBlocked.status,400,JSON.stringify(mobileMoneyBlocked));
      assert.match(String(mobileMoneyBlocked.error||''),/USD by card|payment method/i);
    });

    await t.test('manual plan assignment, cancellation and reactivation preserve one subscription entitlement model',async()=>{
      const created=await planCall(admin,{
        action:'upsertPlan',name:'Manual Operations',description:'Administrative entitlement test',
        priceUsd:20,interval:'year',active:true,
        quotas:{maxSeats:10,maxCandidates:8,maxMentors:2,maxGuides:5},
        features:{curriculum:true,candidates:true,certification:true,payments:true},
      });
      assert.equal(created.status,200,JSON.stringify(created));
      const planId=created.item.id;

      const assigned=await planCall(admin,{
        action:'assignPlan',organizationId:orgB,planId,
        activationSource:'complimentary',overrideReason:'Integration test complimentary entitlement',
      });
      assert.equal(assigned.httpStatus,200,JSON.stringify(assigned));
      const assignedSubscription=(await db.doc('organizations/'+orgB+'/subscription/current').get()).data();
      assert.equal(assignedSubscription?.status,'active');
      assert.equal(assignedSubscription?.planInterval,'year');
      assert.equal(assignedSubscription?.planSnapshot?.id,planId);
      assert.equal(assignedSubscription?.planSnapshot?.quotas?.maxSeats,10);
      assert.equal(assignedSubscription?.cancelAtPeriodEnd,false);
      assert.ok(Date.parse(assignedSubscription?.currentPeriodStart)<=Date.now());
      assert.ok(Date.parse(assignedSubscription?.currentPeriodEnd)>Date.now());
      assert.notEqual((await db.doc('organizations/'+orgB).get()).data()?.billingAccessSuspended,true);

      const directQuotaEdit=await organizationCall(admin,{
        action:'update',organizationId:orgB,data:{quotas:{maxSeats:999}},
      });
      assert.equal(directQuotaEdit.status,400,JSON.stringify(directQuotaEdit));
      assert.match(String(directQuotaEdit.error||''),/Billing & Subscriptions/i);
      assert.equal((await db.doc('organizations/'+orgB).get()).data()?.quotas?.maxSeats,10);

      const scheduled=await planCall(admin,{
        action:'cancelSubscription',organizationId:orgB,mode:'period_end',reason:'End after current term',
      });
      assert.equal(scheduled.httpStatus,200,JSON.stringify(scheduled));
      assert.equal(scheduled.cancelAtPeriodEnd,true);
      assert.notEqual((await db.doc('organizations/'+orgB).get()).data()?.billingAccessSuspended,true);

      const immediate=await planCall(admin,{
        action:'cancelSubscription',organizationId:orgB,mode:'immediate',reason:'Immediate administrative cancellation',
      });
      assert.equal(immediate.httpStatus,200,JSON.stringify(immediate));
      assert.equal(immediate.status,'cancelled');
      assert.equal((await db.doc('organizations/'+orgB).get()).data()?.billingAccessSuspended,true);
      assert.equal((await db.doc('organizations/'+orgB).get()).data()?.billingSuspendedReason,'subscription_cancelled');

      const reactivated=await planCall(admin,{
        action:'reactivateSubscription',organizationId:orgB,overrideReason:'Restore complimentary entitlement',
      });
      assert.equal(reactivated.httpStatus,200,JSON.stringify(reactivated));
      assert.equal(reactivated.status,'active');
      const restoredOrg=(await db.doc('organizations/'+orgB).get()).data();
      assert.notEqual(restoredOrg?.billingAccessSuspended,true);
      assert.equal(restoredOrg?.quotas?.maxSeats,10);
      assert.equal(restoredOrg?.featureEntitlements?.certification,true);
    });

    await t.test('duplicate checkout is idempotent and client amount is never authoritative',async()=>{
      const item=await createItem('Duplicate safe charge','custom_charge','',{amount:250});
      state.nextCreateStatus='pending';
      const first=await call(learner,'checkout',{payableItemId:item.id,provider:'lenco',paymentMethod:'card',amount:1,currency:'USD'});
      assert.equal(first.status,200,JSON.stringify(first));
      assert.equal(first.payment.amountDecimal,'250.00');
      assert.equal(first.payment.currency,'ZMW');
      const second=await call(learner,'checkout',{payableItemId:item.id,provider:'lenco',paymentMethod:'card',amount:999999});
      assert.equal(second.status,200,JSON.stringify(second));
      assert.equal(second.reused,true);
      assert.equal(second.payment.id,first.payment.id);
      assert.equal(second.checkout?.mode,'inline');
      assert.equal((await db.collection('paymentTransactions').where('payableItemId','==',item.id).where('payerUid','==',learner.uid).get()).size,1);
    });

    await t.test('successful verified programme payment creates receipt and programme/course access once',async()=>{
      const item=await createItem('Programme registration','programme_registration',programId,{amount:300});
      state.nextCreateStatus='pending';
      const started=await call(learner,'checkout',{payableItemId:item.id,provider:'lenco',paymentMethod:'card'});
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
      const started=await call(learner,'checkout',{payableItemId:item.id,provider:'lenco',paymentMethod:'card'});
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
      const blocked=await call(outsider,'checkout',{payableItemId:item.id,provider:'lenco',paymentMethod:'card'});
      assert.equal(blocked.status,400,JSON.stringify(blocked));
      assert.match(String(blocked.error||''),/not available|account/i);
      assert.equal((await db.collection('paymentTransactions').where('payerUid','==',outsider.uid).where('payableItemId','==',item.id).get()).size,0);
    });

    await t.test('failed and pending provider states remain non-entitled',async()=>{
      const failedItem=await createItem('Failed charge','custom_charge','',{amount:60});
      state.nextCreateStatus='failed';
      const failed=await call(learner,'checkout',{payableItemId:failedItem.id,provider:'lenco',paymentMethod:'card'});
      assert.equal(failed.payment.status,'failed');
      assert.equal((await db.doc('paymentFulfilments/'+failed.payment.id).get()).exists,false);

      const pendingItem=await createItem('Pending charge','custom_charge','',{amount:70});
      state.nextCreateStatus='pending';
      const pending=await call(learner,'checkout',{payableItemId:pendingItem.id,provider:'lenco',paymentMethod:'card'});
      assert.equal(pending.payment.status,'pending');
      assert.equal((await db.doc('paymentFulfilments/'+pending.payment.id).get()).exists,false);
    });

    await t.test('network interruption preserves an ambiguous transaction for later reconciliation',async()=>{
      const item=await createItem('Network recovery charge','custom_charge','',{amount:80});
      state.nextCreateError='The payment provider timed out. The transaction will be reconciled automatically.';
      const ambiguous=await call(learner,'checkout',{payableItemId:item.id,provider:'lenco',paymentMethod:'card'});
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
      const started=await call(learner,'checkout',{payableItemId:item.id,provider:'lenco',paymentMethod:'card'});
      const verified=await call(learner,'verify',{reference:started.payment.reference});
      assert.equal(verified.payment.status,'paid');
      const registrations=await db.collection('eventRegistrations').where('uid','==',learner.uid).where('eventId','==',eventId).get();
      assert.equal(registrations.size,1);
      assert.equal(registrations.docs[0].data().source,'verified-payment');
    });

    await t.test('partial and full refunds are bounded, audited and revoke fulfilled access only after confirmation',async()=>{
      const item=await createItem('Refundable ministry charge','custom_charge','',{amount:200});
      const started=await call(refundLearner,'checkout',{payableItemId:item.id,provider:'lenco',paymentMethod:'card'});
      assert.equal(started.status,200,JSON.stringify(started));
      const verified=await call(refundLearner,'verify',{reference:started.payment.reference});
      assert.equal(verified.payment.status,'paid');
      const entitlementBefore=await db.collection('paymentEntitlements').where('paymentId','==',started.payment.id).get();
      assert.equal(entitlementBefore.size,1);
      assert.equal(entitlementBefore.docs[0].data().status,'active');

      const first=await call(admin,'admin/refunds',{
        action:'request',paymentId:started.payment.id,amount:50,reason:'Partial service refund',
      });
      assert.equal(first.status,200,JSON.stringify(first));
      assert.equal(first.item.status,'manual_action_required');
      const stillPaid=(await db.doc('paymentTransactions/'+started.payment.id).get()).data();
      assert.equal(stillPaid?.status,'paid');

      const over=await call(admin,'admin/refunds',{
        action:'request',paymentId:started.payment.id,amount:151,reason:'Must exceed refundable balance',
      });
      assert.equal(over.status,400,JSON.stringify(over));
      assert.match(String(over.error||''),/remaining refundable/i);

      const firstDone=await call(admin,'admin/refunds',{
        action:'completeManual',refundId:first.item.id,
        providerRefundReference:'LENCO-RF-PARTIAL-001',
        confirmationNote:'Refund completed and confirmed in provider dashboard.',
      });
      assert.equal(firstDone.status,200,JSON.stringify(firstDone));
      assert.equal(firstDone.item.status,'completed');
      const partial=(await db.doc('paymentTransactions/'+started.payment.id).get()).data();
      assert.equal(partial?.status,'partially_refunded');
      assert.equal(partial?.refundedMinor,5000);
      assert.equal((await db.collection('paymentEntitlements').where('paymentId','==',started.payment.id).get()).docs[0].data().status,'active');

      const rest=await call(admin,'admin/refunds',{
        action:'request',paymentId:started.payment.id,amount:150,reason:'Complete remaining refund',
      });
      assert.equal(rest.status,200,JSON.stringify(rest));
      assert.equal(rest.item.status,'manual_action_required');
      const restDone=await call(admin,'admin/refunds',{
        action:'completeManual',refundId:rest.item.id,
        providerRefundReference:'LENCO-RF-FULL-002',
        confirmationNote:'Remaining amount refunded through provider dashboard.',
      });
      assert.equal(restDone.status,200,JSON.stringify(restDone));
      const full=(await db.doc('paymentTransactions/'+started.payment.id).get()).data();
      assert.equal(full?.status,'refunded');
      assert.equal(full?.refundedMinor,20000);
      const entitlementAfter=await db.collection('paymentEntitlements').where('paymentId','==',started.payment.id).get();
      assert.equal(entitlementAfter.docs[0].data().status,'refunded');
      const details=await call(admin,'admin/transaction',{paymentId:started.payment.id});
      assert.equal(details.status,200,JSON.stringify(details));
      assert.equal(details.item.refunds.filter(refund=>refund.status==='completed').length,2);
    });

    await t.test('unsigned MTN callbacks require the exact provider transaction id before verification',async()=>{
      const item=await createItem('Direct MTN charge','custom_charge','',{
        amount:130,allowedProviders:['mtn_momo'],allowedMethods:['mtn_money'],
      });
      const started=await call(mtnLearner,'checkout',{
        payableItemId:item.id,provider:'mtn_momo',paymentMethod:'mtn_money',phone:'0977000000',
      });
      assert.equal(started.status,200,JSON.stringify(started));
      assert.equal(started.payment.status,'pending');
      assert.equal(started.payment.providerTransactionId,'');
      const storedMtn=(await db.doc('paymentTransactions/'+started.payment.id).get()).data();
      const providerTransactionId=storedMtn?.providerTransactionId;
      assert.ok(providerTransactionId);

      // A public reference-only callback must not be allowed to turn a VOP
      // reference into an authenticated provider lookup.
      const referenceOnly=await mtnWebhook({
        externalId:started.payment.reference,status:'SUCCESSFUL',financialTransactionId:'CALLBACK-CLAIM-1',
      });
      assert.equal(referenceOnly.status,200,JSON.stringify(referenceOnly));
      assert.equal(referenceOnly.ignored,true);
      assert.equal(referenceOnly.orphaned,true);
      assert.equal(mtnVerifyCalls,0);
      assert.equal((await db.collection('paymentWebhookEvents').where('paymentId','==',started.payment.id).get()).size,0);

      // Even with the exact server-created transaction UUID, callback status is
      // only a notification. VOP independently verifies MTN before changing state.
      const untrusted=await mtnWebhook({
        externalId:started.payment.reference,referenceId:providerTransactionId,
        status:'SUCCESSFUL',financialTransactionId:'CALLBACK-CLAIM-2',
      });
      assert.equal(untrusted.status,200,JSON.stringify(untrusted));
      assert.equal(untrusted.duplicate,false);
      assert.equal(mtnVerifyCalls,1);
      const stillPending=(await db.doc('paymentTransactions/'+started.payment.id).get()).data();
      assert.equal(stillPending?.status,'pending');
      assert.equal((await db.doc('paymentFulfilments/'+started.payment.id).get()).exists,false);

      // Replays with the same opaque transaction locator are deduplicated before
      // another provider lookup, even if the attacker changes claimed status.
      const duplicate=await mtnWebhook({
        externalId:started.payment.reference,referenceId:providerTransactionId,
        status:'FAILED',financialTransactionId:'CALLBACK-CLAIM-3',
      },'POST');
      assert.equal(duplicate.status,200,JSON.stringify(duplicate));
      assert.equal(duplicate.duplicate,true);
      assert.equal(mtnVerifyCalls,1);

      // A normal authenticated user verification remains authoritative.
      mtnStatuses.set(started.payment.reference,'successful');
      const verified=await call(mtnLearner,'verify',{reference:started.payment.reference});
      assert.equal(verified.status,200,JSON.stringify(verified));
      assert.equal(mtnVerifyCalls,2);
      const paid=(await db.doc('paymentTransactions/'+started.payment.id).get()).data();
      assert.equal(paid?.status,'paid');
      assert.equal(paid?.verificationStatus,'verified');
      assert.equal((await db.doc('paymentFulfilments/'+started.payment.id).get()).data()?.status,'fulfilled');
    });

    await t.test('Airtel callback resolves by provider transaction id but cannot bypass authenticated enquiry',async()=>{
      const item=await createItem('Direct Airtel charge','custom_charge','',{
        amount:145,allowedProviders:['airtel_money'],allowedMethods:['airtel_money'],
      });
      const started=await call(airtelLearner,'checkout',{
        payableItemId:item.id,provider:'airtel_money',paymentMethod:'airtel_money',phone:'0977000000',
      });
      assert.equal(started.status,200,JSON.stringify(started));
      assert.equal(started.payment.status,'pending');
      assert.equal(started.payment.providerTransactionId,'');
      const storedAirtel=(await db.doc('paymentTransactions/'+started.payment.id).get()).data();
      const providerTransactionId=storedAirtel?.providerTransactionId;
      assert.ok(providerTransactionId);

      // Airtel callback has no VOP reference here and falsely claims success.
      // Core must locate the payment by Airtel transaction UUID, then call the
      // provider verifier. The authoritative provider state is still TIP.
      const callback=await airtelWebhook({
        transaction:{id:providerTransactionId,status_code:'TS',airtel_money_id:'CALLBACK-CLAIM-AIRTEL'},
      });
      assert.equal(callback.status,200,JSON.stringify(callback));
      assert.equal(callback.duplicate,false);
      const stillPending=(await db.doc('paymentTransactions/'+started.payment.id).get()).data();
      assert.notEqual(stillPending?.status,'paid');
      assert.equal(stillPending?.verificationStatus,'verified');
      assert.equal((await db.doc('paymentFulfilments/'+started.payment.id).get()).exists,false);
      const events=await db.collection('paymentWebhookEvents').where('paymentId','==',started.payment.id).get();
      assert.equal(events.size,1);

      // Only the independent authenticated provider enquiry can establish paid.
      airtelStatuses.set(started.payment.reference,'TS');
      const verified=await call(airtelLearner,'verify',{reference:started.payment.reference});
      assert.equal(verified.status,200,JSON.stringify(verified));
      assert.equal(verified.payment.status,'paid');
      assert.equal(verified.payment.verificationStatus,'verified');
      assert.equal((await db.doc('paymentFulfilments/'+started.payment.id).get()).data()?.status,'fulfilled');
    });

    await t.test('signed webhook is idempotent and invalid webhook is rejected',async()=>{
      const item=await createItem('Webhook charge','custom_charge','',{amount:120});
      const started=await call(webhookLearner,'checkout',{payableItemId:item.id,provider:'lenco',paymentMethod:'card'});
      assert.equal(started.status,200,JSON.stringify(started));
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
      assert.ok(history.items.every(item=>item.provider===''&&item.providerReference===''&&item.providerTransactionId===''));

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
