import { auth } from '../lib/firebase';
import type { PayableItem, PaymentMethod } from '../../shared/payments';

export interface ClientPayment {
  id:string;
  reference:string;
  payerUid:string;
  payerEmail:string;
  payerName:string;
  organizationId:string;
  tenantId:string;
  payableItemId:string;
  itemId:string;
  itemType:string;
  description:string;
  currency:string;
  amountMinor:number;
  amountDecimal:string;
  provider:string;
  paymentMethod:PaymentMethod;
  status:string;
  providerStatus:string;
  providerReference:string;
  providerTransactionId:string;
  verificationStatus:string;
  webhookStatus:string;
  reconciliationStatus:string;
  settlementStatus:string;
  fulfilmentStatus:string;
  receiptId:string;
  refundedMinor:number;
  refundStatus:string;
  createdAt:string;
  paidAt:string;
  failedAt:string;
  verifiedAt:string;
  fulfilledAt:string;
  itemSnapshot?:Record<string,unknown>;
}

export interface PaymentProviderDescriptor {
  key:string;
  configured:boolean;
  enabled:boolean;
  environment:string;
  methods:PaymentMethod[];
  capabilities:Record<string,boolean>;
  callbackPath?:string;
}

export interface CheckoutResult {
  payment:ClientPayment;
  reused:boolean;
  checkout?:{
    mode:'inline'|'redirect'|'instructions';
    publicKey?:string;
    scriptUrl?:string;
    redirectUrl?:string;
    channels?:string[];
  }|null;
}

async function token(){
  if(!auth?.currentUser)throw new Error('Sign in to use payments.');
  return auth.currentUser.getIdToken();
}

async function request<T>(path:string,body?:Record<string,unknown>,method:'GET'|'POST'='POST'):Promise<T>{
  const bearer=await token();
  const response=await fetch('/api/payments/'+path,{
    method,
    headers:{
      Authorization:'Bearer '+bearer,
      ...(method==='POST'?{'Content-Type':'application/json'}:{}),
    },
    ...(method==='POST'?{body:JSON.stringify(body||{})}:{}),
  });
  const payload=await response.json().catch(()=>({})) as T&{error?:string};
  if(!response.ok)throw new Error(payload.error||'Payment request failed.');
  return payload;
}

export async function loadPaymentCatalog(){
  return request<{ok:true;items:PayableItem[];providers:PaymentProviderDescriptor[]}>('catalog',{},'POST');
}
export async function startPaymentCheckout(input:{
  payableItemId:string;
  provider?:string;
  paymentMethod:PaymentMethod;
  phone?:string;
  firstName?:string;
  lastName?:string;
}){
  return request<{ok:true}&CheckoutResult>('checkout',input as unknown as Record<string,unknown>);
}
export async function verifyPayment(reference:string){
  return request<{ok:true;payment:ClientPayment}>('verify',{reference});
}
export async function getPaymentStatus(reference:string){
  return request<{ok:true;payment:ClientPayment}>('status',{reference});
}
export async function loadPaymentHistory(){
  return request<{ok:true;items:ClientPayment[]}>('history',{},'POST');
}
export async function loadPaymentReceipt(paymentId:string){
  return request<{ok:true;item:Record<string,unknown>}>('receipt',{paymentId});
}

export async function adminPaymentRequest<T>(path:string,body:Record<string,unknown>={}):Promise<T>{
  return request<T>('admin/'+path,body);
}

let lencoScriptPromise:Promise<void>|null=null;
export function loadLencoCheckoutScript(src:string){
  if(typeof window==='undefined')return Promise.reject(new Error('Checkout is only available in the browser.'));
  const existing=document.querySelector<HTMLScriptElement>('script[data-vop-lenco="true"]');
  if(existing&&existing.src===src&&(window as unknown as {LencoPay?:unknown}).LencoPay)return Promise.resolve();
  if(lencoScriptPromise)return lencoScriptPromise;
  lencoScriptPromise=new Promise<void>((resolve,reject)=>{
    if(existing)existing.remove();
    const script=document.createElement('script');
    script.src=src;
    script.async=true;
    script.dataset.vopLenco='true';
    script.onload=()=>resolve();
    script.onerror=()=>{lencoScriptPromise=null;reject(new Error('The secure payment window could not be loaded.'));};
    document.head.appendChild(script);
  });
  return lencoScriptPromise;
}
