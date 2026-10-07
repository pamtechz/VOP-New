import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { amountToMinor, minorToDecimal, normalizeCurrency } from '../shared/payments.js';
import { billingTenantRef, type BillingTenantType } from './tenant.js';

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

export interface SubscriptionAudiencePolicy{
  learnersCandidates:boolean;
  organizations:boolean;
  churches:boolean;
  districts:boolean;
  conferences:boolean;
  unions:boolean;
}

export interface PlatformBillingSettings{
  baseCurrency:'USD';
  zambiaCurrency:'ZMW';
  usdToZmwRate:number;
  fxSource:string;
  fxUpdatedAt:string;
  fxQuoteTtlMinutes:number;
  fxProviderDate:string;
  subscriptionAudience:SubscriptionAudiencePolicy;
  subscriptionsEnabled:boolean;
  globalQuotas:Record<string,number>;
}

export async function loadPlatformBillingSettings(db:Firestore):Promise<PlatformBillingSettings>{
  const snapshot=await db.doc('system/billing').get();
  const data=snapshot.data()||{};
  const rate=Number(data.usdToZmwRate||0);
  const ttl=Number(data.fxQuoteTtlMinutes||1440);
  const audience=data.subscriptionAudience&&typeof data.subscriptionAudience==='object'
    ?data.subscriptionAudience as Record<string,unknown>:{};
  const globalQuotas=data.globalQuotas&&typeof data.globalQuotas==='object'
    ?data.globalQuotas as Record<string,number>:{}
  return {
    baseCurrency:'USD',
    zambiaCurrency:'ZMW',
    usdToZmwRate:Number.isFinite(rate)&&rate>0?rate:0,
    fxSource:text(data.fxSource,'platform-configured'),
    fxUpdatedAt:text(data.fxUpdatedAt),
    fxQuoteTtlMinutes:Number.isFinite(ttl)&&ttl>0?Math.trunc(ttl):1440,
    fxProviderDate:text(data.fxProviderDate),
    subscriptionAudience:{
      learnersCandidates:audience.learnersCandidates===true,
      organizations:audience.organizations!==false,
      churches:audience.churches!==false,
      districts:audience.districts!==false,
      conferences:audience.conferences!==false,
      unions:audience.unions!==false,
    },
    subscriptionsEnabled:data.subscriptionsEnabled!==false,
    globalQuotas,
  };
}

export interface FrankfurterRateResult{
  rate:number;
  providerDate:string;
  fetchedAt:string;
  source:'frankfurter';
}

function fxPairKey(baseCurrency:string,quoteCurrency:string){
  return normalizeCurrency(baseCurrency)+'_'+normalizeCurrency(quoteCurrency);
}

export async function fetchFrankfurterRate(baseCurrency:string,quoteCurrency:string):Promise<FrankfurterRateResult>{
  const base=normalizeCurrency(baseCurrency),quote=normalizeCurrency(quoteCurrency);
  if(base===quote)return {rate:1,providerDate:new Date().toISOString().slice(0,10),fetchedAt:new Date().toISOString(),source:'frankfurter'};
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch('https://api.frankfurter.dev/v2/rate/'+encodeURIComponent(base)+'/'+encodeURIComponent(quote),{
      headers:{Accept:'application/json'},
      signal:controller.signal,
    });
    if(!response.ok)throw new Error('Frankfurter exchange-rate service is unavailable for '+base+' to '+quote+'.');
    const payload=await response.json() as {date?:unknown;base?:unknown;quote?:unknown;rate?:unknown};
    const rate=Number(payload.rate);
    if(!Number.isFinite(rate)||rate<=0)throw new Error('Frankfurter returned an invalid '+base+' to '+quote+' exchange rate.');
    if(text(payload.base).toUpperCase()!==base||text(payload.quote).toUpperCase()!==quote){
      throw new Error('Frankfurter returned an unexpected currency pair.');
    }
    return {rate,providerDate:text(payload.date),fetchedAt:new Date().toISOString(),source:'frankfurter'};
  }catch(error){
    if(error instanceof Error&&error.name==='AbortError')throw new Error('Frankfurter exchange-rate request timed out.');
    throw error;
  }finally{
    clearTimeout(timeout);
  }
}

export async function fetchFrankfurterUsdToZmwRate():Promise<FrankfurterRateResult>{
  return fetchFrankfurterRate('USD','ZMW');
}

export async function refreshPlatformFxRate(db:Firestore,baseCurrency:string,quoteCurrency:string){
  const base=normalizeCurrency(baseCurrency),quote=normalizeCurrency(quoteCurrency);
  const result=await fetchFrankfurterRate(base,quote);
  const ref=db.doc('system/billing');
  const current=await ref.get();
  const configuredTtl=Number(current.data()?.fxQuoteTtlMinutes);
  const fxQuoteTtlMinutes=Number.isFinite(configuredTtl)&&configuredTtl>=15&&configuredTtl<=10080
    ?Math.trunc(configuredTtl):1440;
  const key=fxPairKey(base,quote);
  const pair={
    baseCurrency:base,quoteCurrency:quote,rate:result.rate,source:result.source,
    providerDate:result.providerDate,fetchedAt:result.fetchedAt,
  };
  const update:Record<string,unknown>={
    baseCurrency:SAAS_BASE_CURRENCY,
    zambiaCurrency:ZAMBIA_BILLING_CURRENCY,
    fxRates:{...(object(current.data()?.fxRates)),[key]:pair},
    fxQuoteTtlMinutes,
    updatedAt:FieldValue.serverTimestamp(),
  };
  if(base==='USD'&&quote==='ZMW'){
    update.usdToZmwRate=result.rate;
    update.fxSource=result.source;
    update.fxUpdatedAt=result.fetchedAt;
    update.fxProviderDate=result.providerDate;
  }
  await ref.set(update,{merge:true});
  return result;
}

export async function refreshPlatformBillingRate(db:Firestore){
  return refreshPlatformFxRate(db,'USD','ZMW');
}

export interface CurrencyQuote{
  baseCurrency:string;
  baseAmountMinor:number;
  baseAmountDecimal:string;
  billingCurrency:string;
  amountMinor:number;
  amountDecimal:string;
  exchangeRate:number;
  fxSource:string;
  fxUpdatedAt:string;
}

export async function quoteAmountForCurrency(
  db:Firestore,
  amountMinor:number,
  baseCurrencyValue:string,
  quoteCurrencyValue:string,
):Promise<CurrencyQuote>{
  const baseCurrency=normalizeCurrency(baseCurrencyValue),billingCurrency=normalizeCurrency(quoteCurrencyValue);
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)throw new Error('The configured payment amount is invalid.');
  const baseAmountDecimal=minorToDecimal(amountMinor,baseCurrency);
  if(baseCurrency===billingCurrency){
    return {
      baseCurrency,baseAmountMinor:amountMinor,baseAmountDecimal,
      billingCurrency,amountMinor,amountDecimal:minorToDecimal(amountMinor,billingCurrency),
      exchangeRate:1,fxSource:'base-price',fxUpdatedAt:'',
    };
  }
  const settings=await loadPlatformBillingSettings(db);
  const snapshot=await db.doc('system/billing').get();
  const key=fxPairKey(baseCurrency,billingCurrency);
  const cached=object(object(snapshot.data()?.fxRates)[key]);
  let rate=Number(cached.rate||0);
  let source=text(cached.source);
  let updatedAt=text(cached.fetchedAt);
  if(baseCurrency==='USD'&&billingCurrency==='ZMW'&&!rate&&settings.usdToZmwRate){
    rate=settings.usdToZmwRate;source=settings.fxSource;updatedAt=settings.fxUpdatedAt;
  }
  const fetchedAt=Date.parse(updatedAt);
  const maxAgeMs=settings.fxQuoteTtlMinutes*60_000;
  const stale=!rate||!Number.isFinite(fetchedAt)||Date.now()-fetchedAt>maxAgeMs;
  if(stale){
    try{
      const refreshed=await refreshPlatformFxRate(db,baseCurrency,billingCurrency);
      rate=refreshed.rate;source=refreshed.source;updatedAt=refreshed.fetchedAt;
    }catch(error){
      const emergencyWindowMs=72*60*60*1000;
      if(!rate||!Number.isFinite(fetchedAt)||Date.now()-fetchedAt>emergencyWindowMs){
        throw new Error('Payment in '+billingCurrency+' is temporarily unavailable because the daily '+baseCurrency+' to '+billingCurrency+' exchange rate could not be refreshed.');
      }
    }
  }
  const baseAmount=Number(baseAmountDecimal);
  const convertedMinor=amountToMinor(baseAmount*rate,billingCurrency);
  return {
    baseCurrency,baseAmountMinor:amountMinor,baseAmountDecimal,
    billingCurrency,amountMinor:convertedMinor,amountDecimal:minorToDecimal(convertedMinor,billingCurrency),
    exchangeRate:rate,fxSource:source||'frankfurter',fxUpdatedAt:updatedAt,
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

export async function quoteSubscriptionPlanForTenant(
  db:Firestore,
  billingTenantType:BillingTenantType,
  billingTenantId:string,
  plan:DocumentData,
  billingCurrencyOverride?:string,
):Promise<SubscriptionBillingQuote>{
  if(!billingTenantId)throw new Error('An institutional billing tenant is required to price a subscription package.');
  const tenant=await billingTenantRef(db,billingTenantType,billingTenantId).get();
  let settings=await loadPlatformBillingSettings(db);
  if(!tenant.exists)throw new Error('The institutional billing tenant is not available.');
  const status=text(tenant.data()?.status).toLowerCase();
  if(billingTenantType==='organization'&&status!=='active')throw new Error('The organization is not available.');
  if(billingTenantType!=='organization'&&['inactive','disabled','archived','deleted'].includes(status)){
    throw new Error('The institutional billing tenant is not available.');
  }
  const profile=organizationBillingProfile(tenant.data());
  const priceUsd=planUsdPrice(plan,settings);
  const billingCurrency=billingCurrencyOverride?normalizeCurrency(billingCurrencyOverride):profile.billingCurrency;
  if(priceUsd===0){
    return {
      countryCode:profile.countryCode,pricingRegion:profile.pricingRegion,
      baseCurrency:'USD',baseAmountMinor:0,baseAmountDecimal:'0.00',
      billingCurrency,amountMinor:0,amountDecimal:minorToDecimal(0,billingCurrency),
      exchangeRate:1,fxSource:'free-plan',fxUpdatedAt:'',
    };
  }
  const baseAmountMinor=amountToMinor(priceUsd,'USD');
  const converted=await quoteAmountForCurrency(db,baseAmountMinor,'USD',billingCurrency);
  return {
    countryCode:profile.countryCode,pricingRegion:profile.pricingRegion,
    baseCurrency:'USD',baseAmountMinor,baseAmountDecimal:converted.baseAmountDecimal,
    billingCurrency:converted.billingCurrency,amountMinor:converted.amountMinor,amountDecimal:converted.amountDecimal,
    exchangeRate:converted.exchangeRate,fxSource:converted.fxSource,fxUpdatedAt:converted.fxUpdatedAt,
  };
}

export async function quoteSubscriptionPlan(
  db:Firestore,
  organizationId:string,
  plan:DocumentData,
):Promise<SubscriptionBillingQuote>{
  return quoteSubscriptionPlanForTenant(db,'organization',organizationId,plan);
}
