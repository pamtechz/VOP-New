import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  mapProviderStatus, minorToDecimal, paymentMethodOperator,
  type PaymentMethod, type PaymentStatus,
} from '../../shared/payments.js';

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
  verifyPayment(reference:string):Promise<ProviderVerification>;
  verifyWebhook(rawBody:Buffer,signature:string):boolean;
}

type LencoResponse={
  status?:boolean;
  message?:string;
  data?:Record<string,unknown>;
  meta?:Record<string,unknown>;
};

function text(value:unknown){return String(value??'').trim();}
function object(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}

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

  configured(){return Boolean(lencoApiToken()&&lencoPublicKey());}

  publicConfiguration(){
    return {
      key:this.key,
      configured:this.configured(),
      environment:lencoEnvironment(),
      methods:['card','airtel_money','mtn_money','zamtel_money'],
      capabilities:this.capabilities,
    };
  }

  async createPayment(input:ProviderPaymentRequest):Promise<ProviderPaymentResult>{
    if(!this.configured())throw new Error('Lenco payment processing is not configured.');
    if(input.method==='card'||input.method==='mobile_money'){
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

  async verifyPayment(reference:string):Promise<ProviderVerification>{
    const response=await lencoRequest('/collections/status/'+encodeURIComponent(reference),{method:'GET'});
    return normalizeLenco(response.data);
  }

  verifyWebhook(rawBody:Buffer,signature:string){
    const token=lencoApiToken();
    const supplied=text(signature).toLowerCase();
    if(!token||!/^[a-f0-9]{128}$/.test(supplied))return false;
    const webhookHashKey=createHash('sha256').update(token).digest('hex');
    const expected=createHmac('sha512',webhookHashKey).update(rawBody).digest('hex');
    const a=Buffer.from(expected,'hex'),b=Buffer.from(supplied,'hex');
    return a.length===b.length&&timingSafeEqual(a,b);
  }
}

const PROVIDERS:Record<string,PaymentProviderAdapter>=Object.freeze({
  lenco:new LencoProvider(),
});

export function getPaymentProvider(key:unknown){
  const provider=PROVIDERS[text(key).toLowerCase()];
  if(!provider)throw new Error('The selected payment provider is not available.');
  return provider;
}

export function paymentProviderCatalog(){
  return Object.values(PROVIDERS).map(provider=>provider.publicConfiguration());
}

export function registeredPaymentProviderKeys(){
  return Object.keys(PROVIDERS);
}
