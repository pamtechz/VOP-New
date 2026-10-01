import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('direct Airtel Money adapter follows OAuth, collection, callback and enquiry contracts',async()=>{
  const previous={...process.env};
  const originalFetch=globalThis.fetch;
  process.env.AIRTEL_MONEY_CLIENT_ID='airtel-client-id';
  process.env.AIRTEL_MONEY_CLIENT_SECRET='airtel-client-secret';
  process.env.AIRTEL_MONEY_ENVIRONMENT='staging';
  process.env.AIRTEL_MONEY_COUNTRY='ZM';
  process.env.AIRTEL_MONEY_CURRENCY='ZMW';
  process.env.AIRTEL_MONEY_CALLBACK_AUTHORIZATION='Bearer airtel-callback-secret';
  delete process.env.AIRTEL_MONEY_BASE_URL;
  delete process.env.AIRTEL_MONEY_COLLECTION_PATH;
  delete process.env.AIRTEL_MONEY_STATUS_PATH_PREFIX;

  const calls=[];
  let transactionId='';
  globalThis.fetch=async(url,init={})=>{
    const href=String(url),headers=new Headers(init.headers||{});
    const body=init.body?JSON.parse(String(init.body)):null;
    calls.push({href,method:init.method||'GET',headers,body});

    if(href==='https://openapiuat.airtel.africa/auth/oauth2/token'){
      assert.equal(init.method,'POST');
      assert.deepEqual(body,{
        client_id:'airtel-client-id',
        client_secret:'airtel-client-secret',
        grant_type:'client_credentials',
      });
      return new Response(JSON.stringify({
        access_token:'airtel-access-token',expires_in:3600,token_type:'Bearer',
      }),{status:200,headers:{'Content-Type':'application/json'}});
    }

    if(href==='https://openapiuat.airtel.africa/merchant/v1/payments/'){
      assert.equal(init.method,'POST');
      assert.equal(headers.get('authorization'),'Bearer airtel-access-token');
      assert.equal(headers.get('x-country'),'ZM');
      assert.equal(headers.get('x-currency'),'ZMW');
      assert.equal(body.reference,'VOP-AIRTEL-TEST-001');
      assert.equal(body.subscriber.country,'ZM');
      assert.equal(body.subscriber.currency,'ZMW');
      assert.equal(body.subscriber.msisdn,260977000000);
      assert.equal(body.transaction.amount,'125.00');
      assert.equal(body.transaction.currency,'ZMW');
      transactionId=body.transaction.id;
      assert.match(transactionId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      return new Response(JSON.stringify({
        data:{transaction:{id:transactionId,status:'TIP'}},
        status:{code:'200',message:'SUCCESS',success:true},
      }),{status:200,headers:{'Content-Type':'application/json'}});
    }

    if(href==='https://openapiuat.airtel.africa/standard/v1/payments/'+transactionId){
      assert.equal(init.method,'GET');
      assert.equal(headers.get('authorization'),'Bearer airtel-access-token');
      assert.equal(headers.get('x-country'),'ZM');
      assert.equal(headers.get('x-currency'),'ZMW');
      return new Response(JSON.stringify({
        data:{transaction:{
          id:transactionId,airtel_money_id:'AIRTEL-FIN-123',
          status:'TS',amount:'125.00',currency:'ZMW',
          reference:'VOP-AIRTEL-TEST-001',
        }},
        status:{code:'200',message:'SUCCESS',success:true},
      }),{status:200,headers:{'Content-Type':'application/json'}});
    }

    throw new Error('Unexpected Airtel test request: '+href);
  };

  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try{
    const providers=await vite.ssrLoadModule('/server/payments/providers.ts');
    const provider=providers.getPaymentProvider('airtel_money');
    assert.equal(provider.configured(),true);
    assert.deepEqual(provider.callbackMethods,['POST']);
    const publicConfig=provider.publicConfiguration();
    assert.equal(publicConfig.callbackPath,'/api/payments/webhooks/airtel-money');
    assert.deepEqual(publicConfig.methods,['airtel_money']);

    const started=await provider.createPayment({
      reference:'VOP-AIRTEL-TEST-001',amountMinor:12500,currency:'ZMW',
      method:'airtel_money',email:'payer@example.invalid',phone:'0977000000',
      description:'VOP programme registration',
    });
    assert.equal(started.status,'pending');
    assert.equal(started.providerTransactionId,transactionId);

    const verified=await provider.verifyPayment('VOP-AIRTEL-TEST-001',{
      providerTransactionId:transactionId,currency:'ZMW',amountMinor:12500,paymentMethod:'airtel_money',
    });
    assert.equal(verified.status,'paid');
    assert.equal(verified.reference,'VOP-AIRTEL-TEST-001');
    assert.equal(verified.amount,'125.00');
    assert.equal(verified.currency,'ZMW');
    assert.equal(verified.providerReference,'AIRTEL-FIN-123');

    const callback=provider.parseWebhook({
      headers:{authorization:'Bearer airtel-callback-secret'},
      body:{transaction:{id:transactionId,status_code:'TF',airtel_money_id:'AIRTEL-CALLBACK-1'}},
    });
    assert.equal(callback.reference,'');
    assert.equal(callback.providerTransactionId,transactionId);
    assert.equal(callback.providerStatus,'TF');
    assert.equal(callback.authenticated,true);

    assert.throws(()=>provider.parseWebhook({
      headers:{authorization:'Bearer wrong-secret'},
      body:{transaction:{id:transactionId,status_code:'TS'}},
    }),/invalid airtel money callback authorization/i);

    // When Airtel does not provide a callback credential, the notification is
    // explicitly unauthenticated. Core processing may act on it only when this
    // opaque, server-created transaction UUID matches an existing VOP payment.
    delete process.env.AIRTEL_MONEY_CALLBACK_AUTHORIZATION;
    const unsignedCallback=provider.parseWebhook({
      headers:{},
      body:{reference:'VOP-AIRTEL-TEST-001',transaction:{id:transactionId,status_code:'TS'}},
    });
    assert.equal(unsignedCallback.authenticated,false);
    assert.equal(unsignedCallback.providerTransactionId,transactionId);
    assert.equal(unsignedCallback.reference,'VOP-AIRTEL-TEST-001');
    assert.ok(calls.length>=3);
  }finally{
    await vite.close();
    globalThis.fetch=originalFetch;
    for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];
    for(const [key,value] of Object.entries(previous))process.env[key]=value;
  }
});
