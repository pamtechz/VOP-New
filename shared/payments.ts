export const PAYMENT_STATUSES = [
  'draft','initiated','pending','requires_action','processing','paid',
  'failed','cancelled','expired','refunded','partially_refunded',
] as const;
export type PaymentStatus = typeof PAYMENT_STATUSES[number];

export const PAYABLE_ITEM_TYPES = [
  'programme_registration','event_registration','organization_subscription',
  'training','material','ministry_service','donation','custom_charge',
] as const;
export type PayableItemType = typeof PAYABLE_ITEM_TYPES[number];

export const PAYMENT_METHODS = [
  'card','airtel_money','mtn_money','zamtel_money','mobile_money','bank','manual',
] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export type PaymentScope = 'platform'|'organization'|'hierarchy';
export type VerificationStatus = 'unverified'|'verified'|'mismatch'|'failed';
export type WebhookStatus = 'not_received'|'received'|'processed'|'rejected'|'duplicate';
export type ReconciliationStatus = 'not_required'|'pending'|'matched'|'mismatch'|'failed';
export type FulfilmentStatus = 'not_required'|'pending'|'processing'|'fulfilled'|'failed';
export type SettlementStatus = 'not_applicable'|'pending'|'settled'|'unknown';

export interface PayableItem {
  id:string;
  scope:PaymentScope;
  tenantId:string;
  organizationId:string;
  organizationName?:string;
  itemId:string;
  itemType:PayableItemType;
  name:string;
  description:string;
  currency:string;
  amountMinor:number;
  amountDecimal:string;
  active:boolean;
  paymentRequired:boolean;
  repeatable:boolean;
  allowedProviders:string[];
  allowedMethods:PaymentMethod[];
  availabilityStart?:string|null;
  availabilityEnd?:string|null;
  fulfilmentConfig?:Record<string,unknown>;
  metadata?:Record<string,unknown>;
  createdBy:string;
  updatedBy:string;
  createdAt?:unknown;
  updatedAt?:unknown;
}

export interface PaymentTransaction {
  id:string;
  reference:string;
  payerUid:string;
  payerEmail:string;
  payerName:string;
  scope:PaymentScope;
  organizationId:string;
  tenantId:string;
  payableItemId:string;
  itemId:string;
  itemType:PayableItemType;
  description:string;
  itemSnapshot:Record<string,unknown>;
  currency:string;
  amountMinor:number;
  amountDecimal:string;
  provider:string;
  paymentMethod:PaymentMethod;
  status:PaymentStatus;
  providerStatus:string;
  providerTransactionId:string;
  providerReference:string;
  attemptNumber:number;
  idempotencyKey:string;
  verificationStatus:VerificationStatus;
  webhookStatus:WebhookStatus;
  reconciliationStatus:ReconciliationStatus;
  settlementStatus:SettlementStatus;
  fulfilmentStatus:FulfilmentStatus;
  receiptId:string;
  createdAt?:unknown;
  initiatedAt?:unknown;
  paidAt?:unknown;
  failedAt?:unknown;
  cancelledAt?:unknown;
  expiredAt?:unknown;
  refundedAt?:unknown;
  verifiedAt?:unknown;
  settledAt?:unknown;
  fulfilledAt?:unknown;
  updatedAt?:unknown;
  metadata?:Record<string,unknown>;
  createdBy:string;
  updatedBy:string;
}

const ZERO_DECIMAL = new Set(['BIF','CLP','DJF','GNF','JPY','KMF','KRW','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF']);
const THREE_DECIMAL = new Set(['BHD','IQD','JOD','KWD','LYD','OMR','TND']);

export function currencyDecimals(currency:unknown){
  const code=String(currency||'').trim().toUpperCase();
  if(ZERO_DECIMAL.has(code)) return 0;
  if(THREE_DECIMAL.has(code)) return 3;
  return 2;
}

export function normalizeCurrency(value:unknown,fallback='ZMW'){
  const code=String(value||fallback).trim().toUpperCase();
  if(!/^[A-Z]{3}$/.test(code)) throw new Error('A valid three-letter currency code is required.');
  return code;
}

export function amountToMinor(value:unknown,currency='ZMW'){
  const number=typeof value==='number'?value:Number(String(value??'').trim());
  if(!Number.isFinite(number)||number<=0) throw new Error('Payment amount must be greater than zero.');
  const factor=10**currencyDecimals(currency);
  const scaled=Math.round(number*factor);
  if(!Number.isSafeInteger(scaled)||scaled<=0) throw new Error('Payment amount is outside the supported range.');
  return scaled;
}

export function minorToDecimal(minor:unknown,currency='ZMW'){
  const amount=Number(minor);
  if(!Number.isSafeInteger(amount)||amount<0) throw new Error('Payment amount is invalid.');
  const decimals=currencyDecimals(currency);
  return (amount/(10**decimals)).toFixed(decimals);
}

export function safePaymentId(value:unknown,field='payment identifier'){
  const text=String(value||'').trim();
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(text)) throw new Error('A valid '+field+' is required.');
  return text;
}

export function safeReference(value:unknown){
  const text=String(value||'').trim();
  if(!/^[A-Za-z0-9._-]{6,180}$/.test(text)) throw new Error('A valid payment reference is required.');
  return text;
}

export function normalizePhone(value:unknown){
  const raw=String(value||'').trim().replace(/[\s()-]/g,'');
  if(!/^\+?\d{9,15}$/.test(raw)) throw new Error('Enter a valid mobile money phone number.');
  return raw;
}

export function mapProviderStatus(value:unknown):PaymentStatus{
  const status=String(value||'').trim().toLowerCase();
  if(['successful','success','paid','completed'].includes(status)) return 'paid';
  if(['pay-offline','3ds-auth-required','otp-required','requires_action'].includes(status)) return 'requires_action';
  if(['processing'].includes(status)) return 'processing';
  if(['pending','created','queued'].includes(status)) return 'pending';
  if(['cancelled','canceled'].includes(status)) return 'cancelled';
  if(['expired'].includes(status)) return 'expired';
  if(['refunded'].includes(status)) return 'refunded';
  if(['partially_refunded','partially-refunded'].includes(status)) return 'partially_refunded';
  if(['failed','failure','declined'].includes(status)) return 'failed';
  return 'pending';
}

export const TERMINAL_PAYMENT_STATUSES = new Set<PaymentStatus>(['paid','failed','cancelled','expired','refunded','partially_refunded']);

const ALLOWED_TRANSITIONS:Record<PaymentStatus,ReadonlySet<PaymentStatus>>={
  draft:new Set(['initiated','cancelled']),
  initiated:new Set(['pending','requires_action','processing','paid','failed','cancelled','expired']),
  pending:new Set(['requires_action','processing','paid','failed','cancelled','expired']),
  requires_action:new Set(['pending','processing','paid','failed','cancelled','expired']),
  processing:new Set(['pending','paid','failed','cancelled','expired']),
  paid:new Set(['partially_refunded','refunded']),
  failed:new Set([]),
  cancelled:new Set([]),
  expired:new Set([]),
  refunded:new Set([]),
  partially_refunded:new Set(['refunded']),
};

export function canTransitionPaymentStatus(from:PaymentStatus,to:PaymentStatus){
  return from===to||ALLOWED_TRANSITIONS[from]?.has(to)===true;
}

export function paymentMethodOperator(method:PaymentMethod){
  if(method==='airtel_money')return 'airtel';
  if(method==='mtn_money')return 'mtn';
  if(method==='zamtel_money')return 'zamtel';
  return '';
}

export function paymentMethodLabel(method:PaymentMethod){
  return method==='airtel_money'?'Airtel Money':
    method==='mtn_money'?'MTN MoMo':
    method==='zamtel_money'?'Zamtel Money':
    method==='mobile_money'?'Mobile Money':
    method==='card'?'Card':
    method==='bank'?'Bank':
    method==='manual'?'Manual':'Payment';
}

export function paymentStatusLabel(status:PaymentStatus){
  return status.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
}
