import { randomUUID } from 'node:crypto';
import {
  mapProviderStatus, minorToDecimal, paymentMethodOperator,
  type PaymentMethod, type PaymentStatus,
} from '../../shared/payments.js';
import { verifyLencoWebhookSignature } from './lencoSignature.js';

export interface ProviderPaymentRequest {
  reference:string;
  amountMinor:number;
  currency:string;
  method:PaymentMethod;
  email:string;
  phone?:string;
  firstName?:string;
  lastName?:string;
  description?:string;
}

export interface ProviderPaymentResult {
  provider:string;
  providerStatus:string;
  status:PaymentStatus;
  providerTransactionId:string;
  providerReference:string;
  settlementStatus:string;
  safeMessage:string;
  checkout?:{
    mode:'inline'|'redirect'|'instructions';
    publicKey?:string;
    scriptUrl?:string;
    redirectUrl?:string;
    channels?:string[];
  };
  raw?:Record<string,unknown>;
}

export interface ProviderVerification extends ProviderPaymentResult {
  amount:string;
  currency:string;
  reference:string;
  completedAt?:string|null;
  initiatedAt?:string|null;
  paymentType?:string;
  settlement?:Record<string,unknown>|null;
}

export interface ProviderVerificationContext {
  providerTransactionId?:string;
  providerReference?:string;
  paymentMethod?:PaymentMethod;
  amountMinor?:number;
  currency?:string;
}

export interface ProviderWebhookRequest {
  headers?:Record<string,string|string[]|undefined>;
  body?:unknown;
  rawBody?:Buffer|string;
}

export interface ProviderWebhookEvent {
  reference:string;
  eventType:string;
  providerStatus:string;
  providerTransactionId:string;
  providerReference:string;
  completedAt?:string|null;
}

export interface ProviderRefundRequest {
  paymentReference:string;
  refundReference:string;
  amountMinor:number;
  currency:string;
  reason:string;
  providerTransactionId?:string;
  providerReference?:string;
}

export interface ProviderRefundResult {
  provider:string;
  providerStatus:string;
  status:'pending'|'completed'|'failed';
  providerRefundId:string;
  providerRefundReference:string;
  safeMessage:string;
}

export interface PaymentProviderAdapter {
  readonly key:string;
  readonly capabilities:{
    checkout:boolean;
    card:boolean;
    mobileMoney:boolean;
    bank:boolean;
    refunds:boolean;
    partialRefunds:boolean;
    webhooks:boolean;
    reconciliation:boolean;
  };
  configured():boolean;
  publicConfiguration():Record<string,unknown>;
  createPayment(input:ProviderPaymentRequest):Promise<ProviderPaymentResult>;
  resumeCheckout?(input:ProviderPaymentRequest):Promise<ProviderPaymentResult>;
  verifyPayment(reference:string,context?:ProviderVerificationContext):Promise<ProviderVerification>;
  refundPayment?(input:ProviderRefundRequest):Promise<ProviderRefundResult>;
  verifyRefund?(refundReference:string):Promise<ProviderRefundResult>;
  parseWebhook?(request:ProviderWebhookRequest):ProviderWebhookEvent;
}

type LencoResponse={
  status?:boolean;
  message?:string;
  data?:Record<string,unknown>;
  meta?:Record<string,unknown>;
};

function text(value:unknown){return String(value??'').trim();}
function object(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}

function webhookRawBody(request:ProviderWebhookRequest){
  if(Buffer.isBuffer(request.rawBody))return request.rawBody;
  if(typeof request.rawBody==='string')return Buffer.from(request.rawBody);
  if(Buffer.isBuffer(request.body))return request.body;
  if(typeof request.body==='string')return Buffer.from(request.body);
  return Buffer.from(JSON.stringify(request.body&&typeof request.body==='object'?request.body:{}));
}
function webhookHeader(request:ProviderWebhookRequest,name:string){
  const value=request.headers?.[name]??request.headers?.[name.toLowerCase()];
  return Array.isArray(value)?value[0]||'':value||'';
}

function safeProviderMessage(value:unknown,fallback='Payment provider request could not be completed.'){
  const message=text(value).replace(/[\r\n\t]+/g,' ').slice(0,240);
  if(!message)return fallback;
  // Provider messages are logged server-side; this value is still sanitized so
  // callers can safely map it to a friendly UI message without exposing JSON.
  return message.replace(/(?:bearer|token|secret|key)\s*[:=]\s*[^\s,;]+/gi,'[redacted]');
}

function lencoEnvironment(){
  return text(process.env.LENCO_ENVIRONMENT||'sandbox').toLowerCase()==='production'?'production':'sandbox';
}
function lencoApiToken(){return text(process.env.LENCO_API_TOKEN);}
function lencoPublicKey(){return text(process.env.LENCO_PUBLIC_KEY);}
const LENCO_API_BASE='https://api.lenco.co/access/v2';

async function lencoRequest(path:string,init:RequestInit={}):Promise<LencoResponse>{
  const token=lencoApiToken();
  if(!token)throw new Error('Lenco server configuration is incomplete.');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),20_000);
  try{
    const response=await fetch(LENCO_API_BASE+path,{
      ...init,
      headers:{
        Accept:'application/json',
        Authorization:'Bearer '+token,
        ...(init.body?{'Content-Type':'application/json'}:{}),
        ...(init.headers||{}),
      },
      signal:controller.signal,
    });
    const body=await response.json().catch(()=>({})) as LencoResponse;
    if(!response.ok||body.status===false){
      const error=new Error(safeProviderMessage(body.message,'Lenco rejected the payment request.'));
      (error as Error&{statusCode?:number}).statusCode=response.status;
      throw error;
    }
    return body;
  }catch(error){
    if(error instanceof Error&&error.name==='AbortError')throw new Error('The payment provider timed out. The transaction will be reconciled automatically.');
    throw error;
  }finally{clearTimeout(timeout);}
}

function normalizeLenco(dataValue:unknown):ProviderVerification{
  const data=object(dataValue);
  const providerStatus=text(data.status);
  const settlement=object(data.settlement);
  return {
    provider:'lenco',
    providerStatus,
    status:mapProviderStatus(providerStatus),
    providerTransactionId:text(data.id),
    providerReference:text(data.lencoReference),
    settlementStatus:text(data.settlementStatus)||'unknown',
    safeMessage:providerStatus==='pay-offline'
      ?'Approve the payment request on your mobile phone.'
      :providerStatus==='3ds-auth-required'
        ?'Additional card verification is required.'
        :'Payment status received.',
    amount:text(data.amount),
    currency:text(data.currency).toUpperCase(),
    reference:text(data.reference),
    initiatedAt:text(data.initiatedAt)||null,
    completedAt:text(data.completedAt)||null,
    paymentType:text(data.type),
    settlement:Object.keys(settlement).length?settlement:null,
    raw:data,
  };
}

class LencoProvider implements PaymentProviderAdapter{
  readonly key='lenco';
  readonly capabilities={
    checkout:true,card:true,mobileMoney:true,bank:false,
    refunds:false,partialRefunds:false,webhooks:true,reconciliation:true,
  };

  configured(){return Boolean(lencoApiToken());}

  publicConfiguration(){
    return {
      key:this.key,
      configured:this.configured(),
      environment:lencoEnvironment(),
      methods:[...(lencoPublicKey()?['card']:[]),'airtel_money','mtn_money','zamtel_money'],
      capabilities:this.capabilities,
    };
  }

  async createPayment(input:ProviderPaymentRequest):Promise<ProviderPaymentResult>{
    if(!this.configured())throw new Error('Lenco payment processing is not configured.');
    if(input.method==='card'||input.method==='mobile_money'){
      if(!lencoPublicKey())throw new Error('Lenco hosted checkout is not configured.');
      return {
        provider:'lenco',providerStatus:'initiated',status:'initiated',
        providerTransactionId:'',providerReference:'',settlementStatus:'unknown',
        safeMessage:'Continue in the secure Lenco payment window.',
        checkout:{
          mode:'inline',
          publicKey:lencoPublicKey(),
          scriptUrl:lencoEnvironment()==='production'
            ?'https://pay.lenco.co/js/v1/inline.js'
            :'https://pay.sandbox.lenco.co/js/v1/inline.js',
          channels:input.method==='card'?['card']:['mobile-money'],
        },
      };
    }
    const operator=paymentMethodOperator(input.method);
    if(!operator)throw new Error('The selected Lenco payment method is not supported.');
    if(!input.phone)throw new Error('A mobile money phone number is required.');
    const body={
      amount:Number(minorToDecimal(input.amountMinor,input.currency)),
      reference:input.reference,
      phone:input.phone,
      operator,
      country:'zm',
      bearer:'merchant',
    };
    const response=await lencoRequest('/collections/mobile-money',{method:'POST',body:JSON.stringify(body)});
    const normalized=normalizeLenco(response.data);
    return {
      ...normalized,
      safeMessage:normalized.status==='requires_action'
        ?'Approve the payment request on your mobile phone.'
        :normalized.status==='paid'
          ?'Payment received. VOP is verifying it now.'
          :normalized.status==='failed'
            ?'The mobile money request failed. You can try again.'
            :'The mobile money request is being processed.',
    };
  }

  async resumeCheckout(input:ProviderPaymentRequest):Promise<ProviderPaymentResult>{
    if(input.method!=='card'&&input.method!=='mobile_money')throw new Error('This payment method cannot be safely resumed.');
    return this.createPayment(input);
  }

  async verifyPayment(reference:string):Promise<ProviderVerification>{
    const response=await lencoRequest('/collections/status/'+encodeURIComponent(reference),{method:'GET'});
    return normalizeLenco(response.data);
  }

  parseWebhook(request:ProviderWebhookRequest):ProviderWebhookEvent{
    const raw=webhookRawBody(request);
    const signature=webhookHeader(request,'x-lenco-signature');
    if(!verifyLencoWebhookSignature(raw,signature,lencoApiToken())){
      throw new Error('Invalid payment webhook signature.');
    }
    const event=object(request.body),data=object(event.data);
    return {
      reference:text(data.reference),
      eventType:text(event.event)||'provider.event',
      providerStatus:text(data.status),
      providerTransactionId:text(data.id),
      providerReference:text(data.lencoReference),
      completedAt:text(data.completedAt)||null,
    };
  }
}


type MtnMomoStatusResponse={
  amount?:string;
  currency?:string;
  financialTransactionId?:string;
  externalId?:string;
  status?:string;
  reason?:string;
};

let mtnTokenCache:{token:string;expiresAt:number}|null=null;

function mtnEnvironment(){
  return text(process.env.MTN_MOMO_ENVIRONMENT||'sandbox').toLowerCase()==='production'?'production':'sandbox';
}
function mtnBaseUrl(){
  const configured=text(process.env.MTN_MOMO_BASE_URL).replace(/\/+$/,'');
  if(configured)return configured;
  return mtnEnvironment()==='sandbox'?'https://sandbox.momodeveloper.mtn.com':'';
}
function mtnTargetEnvironment(){
  return text(process.env.MTN_MOMO_TARGET_ENVIRONMENT||(mtnEnvironment()==='sandbox'?'sandbox':'mtnzambia'));
}
function mtnSubscriptionKey(){return text(process.env.MTN_MOMO_SUBSCRIPTION_KEY);}
function mtnApiUser(){return text(process.env.MTN_MOMO_API_USER);}
function mtnApiKey(){return text(process.env.MTN_MOMO_API_KEY);}
function mtnCallbackUrl(){return text(process.env.MTN_MOMO_CALLBACK_URL);}
function mtnConfigured(){
  return Boolean(mtnBaseUrl()&&mtnSubscriptionKey()&&mtnApiUser()&&mtnApiKey()&&mtnCallbackUrl());
}
function mtnMsisdn(value:unknown){
  let digits=text(value).replace(/\D/g,'');
  if(digits.startsWith('0'))digits='260'+digits.slice(1);
  if(!/^\d{9,15}$/.test(digits))throw new Error('Enter a valid MTN MoMo number.');
  return digits;
}
async function mtnAccessToken(){
  if(mtnTokenCache&&mtnTokenCache.expiresAt>Date.now()+30_000)return mtnTokenCache.token;
  const base=mtnBaseUrl(),subscriptionKey=mtnSubscriptionKey(),user=mtnApiUser(),key=mtnApiKey();
  if(!base||!subscriptionKey||!user||!key)throw new Error('MTN MoMo server configuration is incomplete.');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20_000);
  try{
    const response=await fetch(base+'/collection/token/',{
      method:'POST',
      headers:{
        Authorization:'Basic '+Buffer.from(user+':'+key).toString('base64'),
        'Ocp-Apim-Subscription-Key':subscriptionKey,
      },
      signal:controller.signal,
    });
    const body=await response.json().catch(()=>({})) as Record<string,unknown>;
    const token=text(body.access_token);
    if(!response.ok||!token)throw new Error(safeProviderMessage(body.message,'MTN MoMo authentication failed.'));
    const expiresIn=Math.max(60,Number(body.expires_in||3600));
    mtnTokenCache={token,expiresAt:Date.now()+expiresIn*1000};
    return token;
  }catch(error){
    if(error instanceof Error&&error.name==='AbortError')throw new Error('The payment provider timed out. The transaction will be reconciled automatically.');
    throw error;
  }finally{clearTimeout(timeout);}
}
async function mtnFetch(path:string,init:RequestInit={}){
  const base=mtnBaseUrl();
  if(!base)throw new Error('MTN MoMo production base URL must be supplied by onboarding.');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20_000);
  try{
    const response=await fetch(base+path,{...init,signal:controller.signal});
    return response;
  }catch(error){
    if(error instanceof Error&&error.name==='AbortError')throw new Error('The payment provider timed out. The transaction will be reconciled automatically.');
    throw error;
  }finally{clearTimeout(timeout);}
}
function normalizeMtnStatus(
  data:MtnMomoStatusResponse,
  transactionId:string,
  fallbackReference:string,
):ProviderVerification{
  const providerStatus=text(data.status).toLowerCase();
  const status=mapProviderStatus(providerStatus);
  return {
    provider:'mtn_momo',
    providerStatus,
    status,
    providerTransactionId:transactionId,
    providerReference:text(data.financialTransactionId)||transactionId,
    settlementStatus:status==='paid'?'pending':'unknown',
    safeMessage:status==='paid'
      ?'MTN MoMo payment confirmed.'
      :status==='failed'
        ?'MTN MoMo payment failed.'
        :'Approve the MTN MoMo payment request on your phone.',
    amount:text(data.amount),
    currency:text(data.currency).toUpperCase(),
    reference:text(data.externalId)||fallbackReference,
    initiatedAt:null,
    completedAt:status==='paid'||status==='failed'?new Date().toISOString():null,
    paymentType:'mtn_momo',
    settlement:null,
    raw:data as unknown as Record<string,unknown>,
  };
}

class MtnMomoProvider implements PaymentProviderAdapter{
  readonly key='mtn_momo';
  readonly capabilities={
    checkout:true,card:false,mobileMoney:true,bank:false,
    refunds:false,partialRefunds:false,webhooks:true,reconciliation:true,
  };

  configured(){return mtnConfigured();}

  publicConfiguration(){
    return {
      key:this.key,
      configured:this.configured(),
      environment:mtnEnvironment(),
      targetEnvironment:mtnTargetEnvironment(),
      methods:['mtn_money'],
      callbackUrl:mtnCallbackUrl()?'configured':'not_configured',
      capabilities:this.capabilities,
    };
  }

  async createPayment(input:ProviderPaymentRequest):Promise<ProviderPaymentResult>{
    if(!this.configured())throw new Error('MTN MoMo payment processing is not configured.');
    if(input.method!=='mtn_money')throw new Error('MTN MoMo supports the MTN Money payment method only.');
    if(!input.phone)throw new Error('An MTN MoMo phone number is required.');
    const transactionId=randomUUID();
    const token=await mtnAccessToken();
    const response=await mtnFetch('/collection/v1_0/requesttopay',{
      method:'POST',
      headers:{
        Authorization:'Bearer '+token,
        'Ocp-Apim-Subscription-Key':mtnSubscriptionKey(),
        'X-Target-Environment':mtnTargetEnvironment(),
        'X-Reference-Id':transactionId,
        'X-Callback-Url':mtnCallbackUrl(),
        'Content-Type':'application/json',
      },
      body:JSON.stringify({
        amount:minorToDecimal(input.amountMinor,input.currency),
        currency:input.currency,
        externalId:input.reference,
        payer:{partyIdType:'MSISDN',partyId:mtnMsisdn(input.phone)},
        payerMessage:(input.description||'VOP payment').slice(0,160),
        payeeNote:(input.description||'VOP payment').slice(0,160),
      }),
    });
    if(response.status!==202){
      const body=await response.json().catch(()=>({})) as Record<string,unknown>;
      throw new Error(safeProviderMessage(body.message||body.code,'MTN MoMo rejected the payment request.'));
    }
    return {
      provider:this.key,providerStatus:'pending',status:'pending',
      providerTransactionId:transactionId,providerReference:transactionId,
      settlementStatus:'unknown',
      safeMessage:'MTN MoMo request sent. Approve it on your phone.',
    };
  }

  async verifyPayment(reference:string,context?:ProviderVerificationContext):Promise<ProviderVerification>{
    const transactionId=text(context?.providerTransactionId||context?.providerReference);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(transactionId)){
      throw new Error('MTN MoMo transaction reference is unavailable.');
    }
    const token=await mtnAccessToken();
    const response=await mtnFetch('/collection/v1_0/requesttopay/'+encodeURIComponent(transactionId),{
      method:'GET',
      headers:{
        Authorization:'Bearer '+token,
        'Ocp-Apim-Subscription-Key':mtnSubscriptionKey(),
        'X-Target-Environment':mtnTargetEnvironment(),
      },
    });
    const body=await response.json().catch(()=>({})) as MtnMomoStatusResponse&Record<string,unknown>;
    if(!response.ok)throw new Error(safeProviderMessage(body.message||body.reason,'MTN MoMo status verification failed.'));
    return normalizeMtnStatus(body,transactionId,reference);
  }

  parseWebhook(request:ProviderWebhookRequest):ProviderWebhookEvent{
    const data=object(request.body);
    // MTN does not document a callback signature for RequestToPay. Treat the
    // callback only as a notification: VOP independently queries RequestToPay
    // status with the server-held API credentials before changing payment state.
    return {
      reference:text(data.externalId),
      eventType:'requesttopay.callback',
      providerStatus:text(data.status).toLowerCase(),
      providerTransactionId:text(data.referenceId||data.referenceId),
      providerReference:text(data.financialTransactionId),
      completedAt:null,
    };
  }
}

const PROVIDERS=new Map<string,PaymentProviderAdapter>([
  ['lenco',new LencoProvider()],
  ['mtn_momo',new MtnMomoProvider()],
]);

/** Register additional server-side adapters without changing checkout or
 * financial-domain code. Direct Airtel/MTN adapters can be added here when
 * their merchant credentials/API contracts are approved. */
export function registerPaymentProvider(adapter:PaymentProviderAdapter){
  const key=text(adapter?.key).toLowerCase();
  if(!/^[a-z][a-z0-9_-]{1,60}$/.test(key))throw new Error('A valid payment provider key is required.');
  PROVIDERS.set(key,adapter);
}

export function registerPaymentProviderForTesting(adapter:PaymentProviderAdapter){
  if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Test payment providers are allowed only with the Firestore emulator.');
  registerPaymentProvider(adapter);
}

export function getPaymentProvider(key:unknown){
  const provider=PROVIDERS.get(text(key).toLowerCase());
  if(!provider)throw new Error('The selected payment provider is not available.');
  return provider;
}

export function paymentProviderCatalog(){
  return [...PROVIDERS.values()].map(provider=>provider.publicConfiguration());
}

export function registeredPaymentProviderKeys(){
  return [...PROVIDERS.keys()];
}
