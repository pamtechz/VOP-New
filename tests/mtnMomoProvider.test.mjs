import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('direct MTN MoMo adapter follows token, RequestToPay, callback and status contracts',async()=>{
  const previous={...process.env};
  const originalFetch=globalThis.fetch;
  process.env.MTN_MOMO_SUBSCRIPTION_KEY='sandbox-collection-key';
  process.env.MTN_MOMO_API_USER='11111111-1111-4111-8111-111111111111';
  process.env.MTN_MOMO_API_KEY='sandbox-generated-secret';
  process.env.MTN_MOMO_ENVIRONMENT='sandbox';
  process.env.MTN_MOMO_TARGET_ENVIRONMENT='sandbox';
  process.env.MTN_MOMO_CALLBACK_URL='https://vopafrica.vercel.app/api/payments/webhooks/mtn-momo';
  delete process.env.MTN_MOMO_BASE_URL;

  const calls=[];
  let transactionId='';
  globalThis.fetch=async(url,init={})=>{
    const href=String(url),headers=new Headers(init.headers||{});
    calls.push({href,method:init.method||'GET',headers,body:init.body?JSON.parse(String(init.body)):null});
    if(href.endsWith('/collection/token/')){
      assert.match(headers.get('authorization')||'',/^Basic /);
      assert.equal(headers.get('ocp-apim-subscription-key'),'sandbox-collection-key');
      return new Response(JSON.stringify({access_token:'sandbox-access-token',expires_in:3600}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if(href.endsWith('/collection/v1_0/requesttopay')){
      assert.equal(init.method,'POST');
      transactionId=headers.get('x-reference-id')||'';
      assert.match(transactionId,/^[0-9a-f-]{36}$/i);
      assert.equal(headers.get('x-target-environment'),'sandbox');
      assert.equal(headers.get('x-callback-url'),'https://vopafrica.vercel.app/api/payments/webhooks/mtn-momo');
      const body=JSON.parse(String(init.body));
      assert.equal(body.amount,'125.00');
      assert.equal(body.currency,'ZMW');
      assert.equal(body.externalId,'VOP-MTN-TEST-001');
      assert.equal(body.payer.partyIdType,'MSISDN');
      assert.equal(body.payer.partyId,'260977000000');
      return new Response('',{status:202});
    }
    if(href.endsWith('/collection/v1_0/requesttopay/'+transactionId)){
      assert.equal(init.method,'GET');
      assert.equal(headers.get('authorization'),'Bearer sandbox-access-token');
      return new Response(JSON.stringify({
        amount:'125.00',currency:'ZMW',externalId:'VOP-MTN-TEST-001',
        financialTransactionId:'MTN-FIN-123',status:'SUCCESSFUL',
      }),{status:200,headers:{'Content-Type':'application/json'}});
    }
    throw new Error('Unexpected MTN test request: '+href);
  };

  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try{
    const providers=await vite.ssrLoadModule('/server/payments/providers.ts');
    const provider=providers.getPaymentProvider('mtn_momo');
    assert.equal(provider.configured(),true);
    assert.deepEqual(provider.callbackMethods,['POST','PUT']);

    const started=await provider.createPayment({
      reference:'VOP-MTN-TEST-001',amountMinor:12500,currency:'ZMW',
      method:'mtn_money',email:'payer@example.invalid',phone:'0977000000',
      description:'VOP programme registration',
    });
    assert.equal(started.status,'pending');
    assert.equal(started.providerTransactionId,transactionId);

    const verified=await provider.verifyPayment('VOP-MTN-TEST-001',{
      providerTransactionId:transactionId,currency:'ZMW',amountMinor:12500,paymentMethod:'mtn_money',
    });
    assert.equal(verified.status,'paid');
    assert.equal(verified.reference,'VOP-MTN-TEST-001');
    assert.equal(verified.providerReference,'MTN-FIN-123');

    const callback=provider.parseWebhook({
      body:{externalId:'VOP-MTN-TEST-001',status:'FAILED',financialTransactionId:'UNTRUSTED-CALLBACK-VALUE'},
    });
    assert.equal(callback.reference,'VOP-MTN-TEST-001');
    assert.equal(callback.providerStatus,'failed');
    assert.ok(calls.length>=3);
  }finally{
    await vite.close();
    globalThis.fetch=originalFetch;
    for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];
    for(const [key,value] of Object.entries(previous))process.env[key]=value;
  }
});
