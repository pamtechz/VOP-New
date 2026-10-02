import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CreditCard, Gauge, RefreshCw, RotateCcw, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import type { User } from '../../types';
import { auth } from '../../lib/firebase';
import { appConfirm, appPrompt } from '../layout/AppDialog';
import {
  SUBSCRIPTION_FEATURES, SUBSCRIPTION_QUOTAS,
  subscriptionIntervalLabel, subscriptionQuotaLimit, subscriptionStatusLabel,
} from '../../../shared/subscriptions';

export type SubscriptionPackageView={
  id:string;name:string;description:string;active:boolean;price:number;priceUsd?:number;baseCurrency?:string;currency:string;
  interval:string;sortOrder:number;defaultForUnsubscribed?:boolean;quotas:Record<string,unknown>;features:Record<string,unknown>;
  billingPrice?:string;billingCurrency?:string;exchangeRate?:number;billingCountryCode?:string;
};

type Organization={id:string;name:string};
type Usage=Record<string,number>;
type Overview={
  organizationId:string;organizationName:string;plan:string|null;
  catalogPlan:SubscriptionPackageView|null;
  subscription:Record<string,unknown>|null;
  quotas:Record<string,unknown>;
  featureEntitlements:Record<string,unknown>;
  usage:Usage;
  billingProfile:Record<string,unknown>;
  subscriptionAudience?:{learnersCandidates?:boolean;organizations?:boolean;churches?:boolean;districts?:boolean;conferences?:boolean;unions?:boolean};
  freeTier?:boolean;
  paidPlanActive?:boolean;
  exhaustedQuotaKeys?:string[];
  billingAccessSuspended:boolean;
  billingSuspendedReason:string;
};

interface Props{
  currentUser:User;
  isSuperAdmin:boolean;
  organizations:Organization[];
  packages:SubscriptionPackageView[];
  busy?:boolean;
  onCreatePlan?:()=>void;
  onEditPlan?:(plan:SubscriptionPackageView)=>void;
  onDeletePlan?:(plan:SubscriptionPackageView)=>void|Promise<void>;
  onOpenCheckout?:(planId?:string)=>void;
}

async function planApi(body:Record<string,unknown>){
  if(!auth?.currentUser)throw new Error('Sign in again.');
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('/api/admin/plans',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify(body),
  });
  const payload=await response.json().catch(()=>({})) as {
    error?:string;item?:unknown;items?:unknown[];subscription?:unknown;usage?:unknown;
  }&Record<string,unknown>;
  if(!response.ok)throw new Error(payload.error||'Subscription request failed.');
  return payload;
}

function formatDate(value:unknown){
  const raw=String(value||'').trim();
  if(!raw)return 'No expiry';
  const date=new Date(raw);
  return Number.isNaN(date.getTime())?raw:date.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
}

function reasonLabel(value:unknown){
  return String(value||'').replaceAll('_',' ').replace(/\b\w/g,character=>character.toUpperCase())||'Not recorded';
}

function planFitsUsage(plan:SubscriptionPackageView,usage:Usage,learnersCandidatesBilled:boolean){
  return SUBSCRIPTION_QUOTAS.every(definition=>{
    if(definition.key==='maxCandidates'&&!learnersCandidatesBilled)return true;
    const limit=subscriptionQuotaLimit(plan.quotas,definition.key);
    return limit===null||Number(usage[definition.usageKey]||0)<=limit;
  });
}

export default function SubscriptionWorkspace({
  currentUser,isSuperAdmin,organizations,packages,busy=false,
  onCreatePlan,onEditPlan,onDeletePlan,onOpenCheckout,
}:Props){
  const organizationRole=String(currentUser.organizationRole||'');
  const selfService=!isSuperAdmin&&['owner','admin'].includes(organizationRole)&&Boolean(currentUser.organizationId);
  const [organizationId,setOrganizationId]=useState(isSuperAdmin?'':String(currentUser.organizationId||''));
  const [overview,setOverview]=useState<Overview|null>(null);
  const [availablePlans,setAvailablePlans]=useState<SubscriptionPackageView[]>([]);
  const [loading,setLoading]=useState(false);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  useEffect(()=>{
    if(!isSuperAdmin){
      setOrganizationId(String(currentUser.organizationId||''));
      return;
    }
    if(organizationId&&organizations.some(item=>item.id===organizationId))return;
    setOrganizationId(organizations[0]?.id||'');
  },[isSuperAdmin,currentUser.organizationId,organizations,organizationId]);

  const refresh=async()=>{
    if(!organizationId){setOverview(null);setAvailablePlans([]);return;}
    setLoading(true);setError('');
    try{
      const [current,catalog]=await Promise.all([
        planApi({action:'getSubscription',organizationId}),
        planApi({action:'listAvailablePlans',organizationId}),
      ]);
      setOverview(current as unknown as Overview);
      setAvailablePlans((catalog.items||[]) as SubscriptionPackageView[]);
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Subscription details could not be loaded.');
      setOverview(null);
    }finally{setLoading(false);}
  };
  useEffect(()=>{void refresh();},[organizationId]);

  const usage=overview?.usage||{};
  const subscription=overview?.subscription||{};
  const currentPlanId=String(overview?.plan||subscription.planId||'');
  const snapshotPlan=subscription.planSnapshot&&typeof subscription.planSnapshot==='object'
    ?subscription.planSnapshot as SubscriptionPackageView:null;
  const currentPlan=snapshotPlan
    ||availablePlans.find(plan=>plan.id===currentPlanId)
    ||overview?.catalogPlan
    ||packages.find(plan=>plan.id===currentPlanId)
    ||null;
  const currentPlanFree=Boolean(currentPlan)&&Number(currentPlan?.priceUsd??currentPlan?.price??0)===0;
  const status=String(subscription.status||'');
  const active=status==='active';
  const cancelAtPeriodEnd=subscription.cancelAtPeriodEnd===true;
  const planOptions=useMemo(()=>{
    const source=isSuperAdmin
      ?availablePlans.length?availablePlans:packages.filter(plan=>plan.active!==false)
      :availablePlans;
    return [...source].sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)||a.name.localeCompare(b.name));
  },[availablePlans,packages,isSuperAdmin]);

  const assign=async(plan:SubscriptionPackageView)=>{
    if(!isSuperAdmin||!organizationId)return;
    const reason=await appPrompt('Record why this subscription is being activated without a customer payment.',{
      title:'Assign subscription plan',placeholder:'Complimentary access, migration, support adjustment…',
    });
    if(reason===null||!reason.trim())return;
    setWorking(true);setError('');
    try{
      await planApi({action:'assignPlan',organizationId,planId:plan.id,activationSource:'manual_override',overrideReason:reason.trim()});
      setMessage(plan.name+' assigned. The organization now uses this plan’s entitlement snapshot.');
      await refresh();
    }catch(reasonValue){setError(reasonValue instanceof Error?reasonValue.message:'The subscription could not be assigned.');}
    finally{setWorking(false);}
  };

  const activateFreePlan=async(plan:SubscriptionPackageView)=>{
    if(isSuperAdmin||!organizationId)return;
    setWorking(true);setError('');
    try{
      const result=await planApi({action:'activateFreePlan',organizationId,planId:plan.id});
      setMessage(result.alreadyActive===true
        ?plan.name+' is already active.'
        :plan.name+' activated. No payment is required for this plan.');
      await refresh();
    }catch(reasonValue){
      setError(reasonValue instanceof Error?reasonValue.message:'The free subscription plan could not be activated.');
    }finally{setWorking(false);}
  };

  const cancel=async(mode:'period_end'|'immediate')=>{
    if(!organizationId||(!isSuperAdmin&&mode==='immediate'))return;
    const confirmed=await appConfirm(
      mode==='period_end'
        ?'Schedule this subscription to end after the current paid term? Access remains active until the period ends.'
        :'Cancel this subscription immediately? Paid feature access and new resource creation will be suspended now.',
      {title:mode==='period_end'?'Cancel at period end':'Cancel subscription now',confirmLabel:mode==='period_end'?'Schedule cancellation':'Cancel now',tone:'danger'},
    );
    if(!confirmed)return;
    const reason=await appPrompt('Record the cancellation reason.',{title:'Cancellation reason',placeholder:'Requested by organization, billing correction…'});
    if(reason===null||!reason.trim())return;
    setWorking(true);setError('');
    try{
      await planApi({action:'cancelSubscription',organizationId,mode,reason:reason.trim()});
      setMessage(mode==='period_end'?'Cancellation scheduled for the end of the current term.':'Subscription cancelled and paid feature access suspended.');
      await refresh();
    }catch(reasonValue){setError(reasonValue instanceof Error?reasonValue.message:'The subscription could not be cancelled.');}
    finally{setWorking(false);}
  };

  const reactivate=async()=>{
    if(!organizationId)return;
    let overrideReason='';
    if(isSuperAdmin){
      const reason=await appPrompt('Record why this subscription is being reactivated without a new payment.',{
        title:'Reactivate subscription',placeholder:'Cancellation reversed, support adjustment…',
      });
      if(reason===null||!reason.trim())return;
      overrideReason=reason.trim();
    }
    setWorking(true);setError('');
    try{
      await planApi({action:'reactivateSubscription',organizationId,...(overrideReason?{overrideReason}:{})});
      setMessage(cancelAtPeriodEnd?'Scheduled cancellation removed.':'Subscription reactivated.');
      await refresh();
    }catch(reasonValue){setError(reasonValue instanceof Error?reasonValue.message:'The subscription could not be reactivated.');}
    finally{setWorking(false);}
  };

  const openCheckout=(planId?:string)=>{
    if(onOpenCheckout)onOpenCheckout(planId);
  };

  if(!isSuperAdmin&&!selfService){
    return <div className="vop-payment-empty">Subscription administration is available to the organization owner and administrators.</div>;
  }

  return <div className="vop-subscription-workspace">
    <section className="vop-subscription-toolbar">
      <div>
        <span className="vop-page-kicker">SaaS subscription</span>
        <h2>Plan, subscription & usage</h2>
        <p>One entitlement model controls commercial plan limits, subscription lifecycle and live organization consumption.</p>
      </div>
      <div className="vop-subscription-toolbar-actions">
        {isSuperAdmin&&<label><span>Organization</span><select value={organizationId} onChange={event=>setOrganizationId(event.target.value)}><option value="">Choose organization</option>{organizations.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <button className="btn btn-outline" type="button" disabled={loading||!organizationId} onClick={()=>void refresh()}><RefreshCw size={16}/>Refresh</button>
        {isSuperAdmin&&onCreatePlan&&<button className="btn btn-primary" type="button" onClick={onCreatePlan}><Sparkles size={16}/>New plan</button>}
      </div>
    </section>

    {error&&<div className="vop-payment-alert danger"><XCircle size={17}/><span>{error}</span><button onClick={()=>setError('')}>×</button></div>}
    {message&&<div className="vop-payment-alert success"><Check size={17}/><span>{message}</span><button onClick={()=>setMessage('')}>×</button></div>}

    {!organizationId?<div className="vop-payment-empty">Choose an organization to inspect its subscription and usage.</div>
    :loading&&!overview?<div className="vop-payment-empty">Loading subscription…</div>
    :overview&&<>
      <div className="vop-subscription-summary-grid">
        <article className="vop-subscription-current">
          <div className="vop-subscription-card-head"><div><span>Current plan</span><h3>{String(subscription.planName||currentPlan?.name||'No active plan')}</h3></div><span className={'vop-subscription-status '+(active?'active':'inactive')}>{subscriptionStatusLabel(status)}</span></div>
          <p>{currentPlan?.description||'No subscription package is currently assigned.'}</p>
          <dl>
            <div><dt>Billing interval</dt><dd>{currentPlan||subscription.planInterval?subscriptionIntervalLabel(subscription.planInterval||currentPlan?.interval):'—'}</dd></div>
            <div><dt>Current term ends</dt><dd>{formatDate(subscription.currentPeriodEnd)}</dd></div>
            <div><dt>Activation</dt><dd>{reasonLabel(subscription.activationSource)}</dd></div>
            <div><dt>Billing currency</dt><dd>{String(subscription.billingCurrency||overview.billingProfile?.billingCurrency||currentPlan?.billingCurrency||'—')}</dd></div>
          </dl>
          {overview.freeTier&&<div className="vop-subscription-warning"><AlertTriangle size={17}/><div><strong>Free version active</strong><span>Your organization is using the free VOP plan. Upgrade for higher institutional limits and paid-plan capacity.</span></div></div>}
          {overview.billingAccessSuspended&&<div className="vop-subscription-warning"><AlertTriangle size={17}/><div><strong>Paid access is suspended</strong><span>{reasonLabel(overview.billingSuspendedReason)}</span></div></div>}
          {cancelAtPeriodEnd&&<div className="vop-subscription-warning"><AlertTriangle size={17}/><div><strong>Cancellation scheduled</strong><span>Access remains available until {formatDate(subscription.currentPeriodEnd)}.</span></div></div>}
          <div className="vop-subscription-actions">
            {!isSuperAdmin&&<button className="btn btn-primary" type="button" onClick={()=>openCheckout(currentPlanId||undefined)}><CreditCard size={16}/>{active?'Renew / change plan':'Choose a plan'}</button>}
            {active&&!currentPlanFree&&!cancelAtPeriodEnd&&<button className="btn btn-outline" type="button" disabled={working||busy} onClick={()=>void cancel('period_end')}>Cancel at period end</button>}
            {isSuperAdmin&&active&&<button className="btn btn-danger" type="button" disabled={working||busy} onClick={()=>void cancel('immediate')}>Cancel now</button>}
            {cancelAtPeriodEnd&&<button className="btn btn-outline" type="button" disabled={working||busy} onClick={()=>void reactivate()}><RotateCcw size={16}/>Keep subscription</button>}
            {isSuperAdmin&&!active&&currentPlanId&&<button className="btn btn-primary" type="button" disabled={working||busy} onClick={()=>void reactivate()}><RotateCcw size={16}/>Reactivate</button>}
          </div>
        </article>

        <article className="vop-subscription-entitlements">
          <div className="vop-subscription-card-head"><div><span>Included capabilities</span><h3>Plan entitlements</h3></div><ShieldCheck size={22}/></div>
          <div className="vop-subscription-feature-grid">{SUBSCRIPTION_FEATURES.map(feature=>{
            const included=overview.featureEntitlements?.[feature.key]===true;
            return <span key={feature.key} className={'vop-subscription-feature '+(included?'included':'excluded')}>{included?<Check size={14}/>:<XCircle size={14}/>} {feature.label}</span>;
          })}</div>
          <p className="vop-subscription-footnote">Entitlements are snapshotted when the subscription is activated. Editing the catalog plan does not silently change an organization mid-term.</p>
        </article>
      </div>

      <section className="vop-subscription-usage-section">
        <div className="vop-subscription-section-head"><div><span>Live consumption</span><h3>Usage against plan limits</h3><p>Limits are enforced server-side before new members or resources are created.</p></div><Gauge size={24}/></div>
        <div className="vop-subscription-usage-grid">{SUBSCRIPTION_QUOTAS.map(definition=>{
          const used=Math.max(0,Number(usage[definition.usageKey]||0));
          const excludedFromBilling=definition.key==='maxCandidates'&&overview.subscriptionAudience?.learnersCandidates!==true;
          const limit=excludedFromBilling?null:subscriptionQuotaLimit(overview.quotas,definition.key);
          const percent=limit===null?0:limit===0?(used>0?100:0):Math.min(100,Math.round((used/limit)*100));
          const level=limit!==null&&used>=limit?'danger':limit!==null&&percent>=80?'warning':'normal';
          return <article key={definition.key} className={'vop-subscription-usage-card '+level}>
            <div><strong>{definition.label}</strong><span>{used} / {excludedFromBilling?'Not billed':limit===null?'Unlimited':limit}</span></div>
            <div className="vop-subscription-meter" aria-label={definition.label+' usage'}><span style={{width:(limit===null?0:percent)+'%'}}/></div>
            <small>{excludedFromBilling?'Learners/candidates are currently excluded from subscription billing by Super Admin policy.':definition.description}</small>
          </article>;
        })}</div>
      </section>

      <section className="vop-subscription-plans-section">
        <div className="vop-subscription-section-head"><div><span>Plan catalog</span><h3>{isSuperAdmin?'Available plans for this organization':'Upgrade, downgrade or renew'}</h3><p>{isSuperAdmin?'Manual assignment requires an audit reason. Paid changes should be completed through checkout.':'Prices are quoted for your organization’s billing country. Checkout performs final capacity and payment validation.'}</p></div></div>
        <div className="vop-subscription-plan-grid">{planOptions.map(plan=>{
          const isCurrent=plan.id===currentPlanId;
          const fits=planFitsUsage(plan,usage,overview.subscriptionAudience?.learnersCandidates===true);
          const freePlan=Number(plan.priceUsd??plan.price??0)===0;
          const enabledFeatures=SUBSCRIPTION_FEATURES.filter(feature=>plan.features?.[feature.key]===true);
          return <article key={plan.id} className={'vop-subscription-plan-card '+(isCurrent?'current':'')+(fits?'':' incompatible')}>
            <header><div><span>{subscriptionIntervalLabel(plan.interval)}</span><h4>{plan.name}</h4></div>{isCurrent&&<span className="vop-subscription-current-chip">Current</span>}</header>
            <p>{plan.description||'Organization subscription plan'}</p>
            <div className="vop-subscription-price">{freePlan?<strong>Free</strong>:<>{plan.billingCurrency||'USD'} <strong>{plan.billingPrice||Number(plan.priceUsd??plan.price??0).toFixed(2)}</strong><span> / {plan.interval==='year'?'year':plan.interval==='one_time'?'one-time':'month'}</span></>}</div>
            <div className="vop-subscription-plan-limits">{SUBSCRIPTION_QUOTAS.slice(0,3).map(definition=>{
              const limit=subscriptionQuotaLimit(plan.quotas,definition.key);
              return <span key={definition.key}>{definition.label}: <strong>{limit===null?'Unlimited':limit}</strong></span>;
            })}</div>
            <div className="vop-subscription-feature-summary">{enabledFeatures.slice(0,5).map(feature=><span key={feature.key}><Check size={13}/>{feature.label}</span>)}</div>
            {!fits&&<div className="vop-subscription-plan-warning"><AlertTriangle size={15}/>Below current organization usage</div>}
            <footer>
              {isSuperAdmin&&onEditPlan&&<button className="btn btn-outline" type="button" onClick={()=>onEditPlan(plan)}>Edit plan</button>}
              {isSuperAdmin&&onDeletePlan&&<button className="btn btn-outline" type="button" disabled={isCurrent||busy} onClick={()=>void onDeletePlan(plan)}>Delete</button>}
              {isSuperAdmin?<button className="btn btn-primary" type="button" disabled={isCurrent||!fits||working||busy} onClick={()=>void assign(plan)}>{isCurrent?'Current plan':'Assign manually'}</button>
              :freePlan
                ?<button className="btn btn-primary" type="button" disabled={!fits||working||busy||(isCurrent&&active)} onClick={()=>void activateFreePlan(plan)}>{isCurrent&&active?'Current plan':'Activate free plan'}</button>
                :<button className="btn btn-primary" type="button" disabled={!fits||working||busy} onClick={()=>openCheckout(plan.id)}>{isCurrent&&active?'Renew in checkout':'Choose plan'}</button>}
            </footer>
          </article>;
        })}</div>
        {!planOptions.length&&<div className="vop-payment-empty">No active subscription plans are available.</div>}
      </section>
    </>}
  </div>;
}
