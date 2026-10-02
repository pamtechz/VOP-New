import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { amountToMinor, minorToDecimal } from '../shared/payments.js';

export const SAAS_BASE_CURRENCY='USD';
export const ZAMBIA_COUNTRY_CODE='ZM';
export const ZAMBIA_BILLING_CURRENCY='ZMW';

function text(value:unknown,fallback=''){return String(value??fallback).trim();}
function object(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}

export function normalizeCountryCode(value:unknown,fallback=ZAMBIA_COUNTRY_CODE){
  const code=text(value,fallback).toUpperCase();
  if(!/^[A-Z]{2}$/.test(code))throw new Error('A valid two-letter billing country code is required.');
  return code;
}

export interface OrganizationBillingProfile{
  countryCode:string;
  countryName:string;
  billingCurrency:string;
  pricingRegion:'zambia'|'international';
}

export function normalizedBillingCountryName(value:unknown,fallback='Zambia'){
  const name=text(value,fallback).replace(/\s+/g,' ').slice(0,120);
  if(!name)throw new Error('A billing country is required.');
  return name;
}

export function organizationBillingProfile(data:DocumentData|undefined):OrganizationBillingProfile{
  const billing=object(data?.billingProfile);
  const countryName=normalizedBillingCountryName(billing.countryName||data?.billingCountry||(
    text(billing.countryCode||data?.countryCode).toUpperCase()==='ZM'?'Zambia':'International'
  ));
  const explicitCode=text(billing.countryCode||data?.countryCode).toUpperCase();
  const countryCode=explicitCode&&/^[A-Z]{2}$/.test(explicitCode)
    ?explicitCode
    :countryName.toLowerCase()==='zambia'?ZAMBIA_COUNTRY_CODE:'ZZ';
  return {
    countryCode,countryName,
    billingCurrency:countryCode===ZAMBIA_COUNTRY_CODE?ZAMBIA_BILLING_CURRENCY:SAAS_BASE_CURRENCY,
    pricingRegion:countryCode===ZAMBIA_COUNTRY_CODE?'zambia':'international',
  };
}

export interface PlatformBillingSettings{
  baseCurrency:'USD';
  zambiaCurrency:'ZMW';
  usdToZmwRate:number;
  fxSource:string;
  fxUpdatedAt:string;
  fxQuoteTtlMinutes:number;
}

export async function loadPlatformBillingSettings(db:Firestore):Promise<PlatformBillingSettings>{
  const snapshot=await db.doc('system/billing').get();
  const data=snapshot.data()||{};
  const rate=Number(data.usdToZmwRate||0);
  const ttl=Number(data.fxQuoteTtlMinutes||1440);
  return {
    baseCurrency:'USD',
    zambiaCurrency:'ZMW',
    usdToZmwRate:Number.isFinite(rate)&&rate>0?rate:0,
    fxSource:text(data.fxSource,'platform-configured'),
    fxUpdatedAt:text(data.fxUpdatedAt),
    fxQuoteTtlMinutes:Number.isFinite(ttl)&&ttl>0?Math.trunc(ttl):1440,
  };
}

export function planUsdPrice(plan:DocumentData,settings?:PlatformBillingSettings){
  const explicit=Number(plan.priceUsd);
  if(Number.isFinite(explicit)&&explicit>=0)return explicit;
  const price=Number(plan.price);
  const currency=text(plan.baseCurrency||plan.currency).toUpperCase();
  if(Number.isFinite(price)&&price>=0&&currency==='USD')return price;
  if(Number.isFinite(price)&&price>=0&&currency==='ZMW'&&settings?.usdToZmwRate){
    return Number((price/settings.usdToZmwRate).toFixed(2));
  }
  throw new Error('This subscription package does not have a valid USD base price.');
}

export interface SubscriptionBillingQuote{
  countryCode:string;
  pricingRegion:'zambia'|'international';
  baseCurrency:'USD';
  baseAmountMinor:number;
  baseAmountDecimal:string;
  billingCurrency:string;
  amountMinor:number;
  amountDecimal:string;
  exchangeRate:number;
  fxSource:string;
  fxUpdatedAt:string;
}

export async function quoteSubscriptionPlan(
  db:Firestore,
  organizationId:string,
  plan:DocumentData,
):Promise<SubscriptionBillingQuote>{
  if(!organizationId)throw new Error('An organization is required to price a subscription package.');
  const [organization,settings]=await Promise.all([
    db.doc('organizations/'+organizationId).get(),
    loadPlatformBillingSettings(db),
  ]);
  if(!organization.exists||organization.data()?.status!=='active')throw new Error('The organization is not available.');
  const profile=organizationBillingProfile(organization.data());
  const priceUsd=planUsdPrice(plan,settings);
  const baseAmountMinor=amountToMinor(priceUsd,'USD');
  if(profile.billingCurrency==='USD'){
    return {
      countryCode:profile.countryCode,pricingRegion:profile.pricingRegion,
      baseCurrency:'USD',baseAmountMinor,baseAmountDecimal:minorToDecimal(baseAmountMinor,'USD'),
      billingCurrency:'USD',amountMinor:baseAmountMinor,amountDecimal:minorToDecimal(baseAmountMinor,'USD'),
      exchangeRate:1,fxSource:'base-price',fxUpdatedAt:'',
    };
  }
  if(!settings.usdToZmwRate){
    throw new Error('Zambian subscription billing is temporarily unavailable because the USD to ZMW exchange rate has not been configured.');
  }
  const updatedAt=Date.parse(settings.fxUpdatedAt);
  const maxAgeMs=settings.fxQuoteTtlMinutes*60_000;
  if(!Number.isFinite(updatedAt)||Date.now()-updatedAt>maxAgeMs){
    throw new Error('Zambian subscription billing is temporarily unavailable because the USD to ZMW exchange rate is stale. A Super Admin must refresh the billing rate.');
  }
  const amountMinor=amountToMinor(priceUsd*settings.usdToZmwRate,'ZMW');
  return {
    countryCode:profile.countryCode,pricingRegion:profile.pricingRegion,
    baseCurrency:'USD',baseAmountMinor,baseAmountDecimal:minorToDecimal(baseAmountMinor,'USD'),
    billingCurrency:'ZMW',amountMinor,amountDecimal:minorToDecimal(amountMinor,'ZMW'),
    exchangeRate:settings.usdToZmwRate,fxSource:settings.fxSource,fxUpdatedAt:settings.fxUpdatedAt,
  };
}
