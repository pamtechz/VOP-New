import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, Download, LoaderCircle, Plus, RefreshCw, Search, Settings2, SlidersHorizontal, WalletCards, X, XCircle } from 'lucide-react';
import type { User } from '../types';
import type { PayableItem, PayableItemType, PaymentMethod } from '../../shared/payments';
import { PAYABLE_ITEM_TYPES, minorToDecimal, paymentMethodLabel, paymentStatusLabel } from '../../shared/payments';
import { adminPaymentRequest, type ClientPayment, type PaymentProviderDescriptor } from '../services/payments';
import { auth } from '../lib/firebase';
import { appConfirm, appPrompt } from '../components/layout/AppDialog';
import SubscriptionWorkspace, { type SubscriptionPackageView } from '../components/admin/SubscriptionWorkspace';
import { SUBSCRIPTION_FEATURES, SUBSCRIPTION_QUOTAS, type SubscriptionQuotaKey } from '../../shared/subscriptions';
import './payments.css';

interface Props{currentUser:User;onOpenCheckout?:(planId?:string)=>void}
type Tab='transactions'|'subscriptions'|'items'|'providers'|'reconciliation';
type Organization={id:string;name:string};
type Target={id:string;name:string};
type SubscriptionPackage=SubscriptionPackageView;
const emptyPackageQuotas=()=>Object.fromEntries(SUBSCRIPTION_QUOTAS.map(item=>[item.key,''])) as Record<SubscriptionQuotaKey,string>;
const defaultPackageFeatures=()=>Object.fromEntries(SUBSCRIPTION_FEATURES.map(item=>[item.key,true])) as Record<string,boolean>;
type RefundRecord={id:string;amountMinor:number;amountDecimal:string;currency:string;reason:string;status:string;providerStatus:string;providerRefundReference:string;createdAt:string;completedAt:string};
type PaymentDetails={payment:ClientPayment;attempts:Array<Record<string,unknown>>;audit:Array<Record<string,unknown>>;refunds:RefundRecord[];receipt:Record<string,unknown>|null};

async function adminApi(path:string,body:Record<string,unknown>){
  if(!auth?.currentUser)throw new Error('Sign in again.');
  const token=await auth.currentUser.getIdToken();
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({})) as {error?:string;items?:unknown[];item?:unknown};
  if(!response.ok)throw new Error(payload.error||'Administration request failed.');
  return payload;
}
function typeLabel(value:string){return value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());}
function statusClass(value:string){return value==='paid'?'success':['failed','cancelled','expired'].includes(value)?'danger':'warning';}

const PaymentManagement:React.FC<Props>=({currentUser,onOpenCheckout})=>{
  const [tab,setTab]=useState<Tab>('transactions');
  const [transactions,setTransactions]=useState<ClientPayment[]>([]);
  const [items,setItems]=useState<PayableItem[]>([]);
  const [providers,setProviders]=useState<PaymentProviderDescriptor[]>([]);
  const [packages,setPackages]=useState<SubscriptionPackage[]>([]);
  const [organizations,setOrganizations]=useState<Organization[]>([]);
  const [targets,setTargets]=useState<Target[]>([]);
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('');
  const [organizationFilter,setOrganizationFilter]=useState('');
  const [typeFilter,setTypeFilter]=useState('');
  const [methodFilter,setMethodFilter]=useState('');
  const [providerFilter,setProviderFilter]=useState('');
  const [dateFrom,setDateFrom]=useState('');
  const [dateTo,setDateTo]=useState('');
  const [minAmount,setMinAmount]=useState('');
  const [maxAmount,setMaxAmount]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [editing,setEditing]=useState<PayableItem|null>(null);
  const [editingPackage,setEditingPackage]=useState<SubscriptionPackage|null|undefined>(undefined);
  const [details,setDetails]=useState<PaymentDetails|null>(null);
  const [packageDraft,setPackageDraft]=useState({
    name:'',description:'',price:'',interval:'month',sortOrder:'0',active:true,defaultForUnsubscribed:false,
    quotas:emptyPackageQuotas(),features:defaultPackageFeatures(),
  });
  const [billingSettings,setBillingSettings]=useState({
    usdToZmwRate:'',fxSource:'frankfurter',fxQuoteTtlMinutes:'1440',fxUpdatedAt:'',fxProviderDate:'',
    subscriptionAudience:{learnersCandidates:false,organizations:true,churches:true,districts:true,conferences:true,unions:true},
  });
  const [draft,setDraft]=useState({
    name:'',description:'',itemType:'programme_registration' as PayableItemType,
    targetId:'',organizationId:'',scope:currentUser.role==='super_admin'?'platform':'organization',
    amount:'',currency:'ZMW',repeatable:false,active:true,
    allowedProviders:['lenco'] as string[],
    allowedMethods:['card','airtel_money','mtn_money','zamtel_money'] as PaymentMethod[],
  });
  const isSuperAdmin=currentUser.role==='super_admin';
  const canManageOwnSubscription=!isSuperAdmin&&Boolean(currentUser.organizationId)&&['owner','admin'].includes(String(currentUser.organizationRole||''));

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const [tx,orgResult]=await Promise.all([
        adminPaymentRequest<{ok:true;items:ClientPayment[]}>('transactions',{filters:{search,status,organizationId:organizationFilter,itemType:typeFilter,paymentMethod:methodFilter,provider:isSuperAdmin?providerFilter:'',dateFrom,dateTo,minAmount,maxAmount}}),
        adminApi('/api/admin/organizations',{action:'list'}),
      ]);
      setTransactions(tx.items);
      setOrganizations((orgResult.items||[]).map(value=>{
        const item=value as Record<string,unknown>;return {id:String(item.id||''),name:String(item.name||'Organization')};
      }).filter(item=>item.id));
      if(isSuperAdmin){
        const [itemResult,providerResult,packageResult,billingResult]=await Promise.all([
          adminPaymentRequest<{ok:true;items:PayableItem[]}>('payable-items',{action:'list'}),
          adminPaymentRequest<{ok:true;items:PaymentProviderDescriptor[]}>('providers',{action:'list'}),
          adminApi('/api/admin/plans',{action:'listPlans'}),
          adminApi('/api/admin/plans',{action:'getBillingSettings'}),
        ]);
        setItems(itemResult.items);setProviders(providerResult.items);
        setPackages((packageResult.items||[]) as SubscriptionPackage[]);
        const settings=(billingResult.item||{}) as Record<string,unknown>;
        const subscriptionAudience=settings.subscriptionAudience&&typeof settings.subscriptionAudience==='object'
          ?settings.subscriptionAudience as Record<string,unknown>:{};
        setBillingSettings({
          usdToZmwRate:Number(settings.usdToZmwRate||0)>0?String(settings.usdToZmwRate):'',
          fxSource:String(settings.fxSource||'frankfurter'),
          fxQuoteTtlMinutes:String(settings.fxQuoteTtlMinutes||1440),
          fxUpdatedAt:String(settings.fxUpdatedAt||''),
          fxProviderDate:String(settings.fxProviderDate||''),
          subscriptionAudience:{
            learnersCandidates:subscriptionAudience.learnersCandidates===true,
            organizations:subscriptionAudience.organizations!==false,
            churches:subscriptionAudience.churches!==false,
            districts:subscriptionAudience.districts!==false,
            conferences:subscriptionAudience.conferences!==false,
            unions:subscriptionAudience.unions!==false,
          },
        });
      }else{
        setItems([]);setProviders([]);setPackages([]);
        if(!canManageOwnSubscription&&tab!=='transactions')setTab('transactions');
      }
    }catch(reason){setError(reason instanceof Error?reason.message:'Payments could not be loaded.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);

  const loadTargets=async(type:PayableItemType)=>{
    setTargets([]);
    if(!isSuperAdmin)return;
    try{
      let collection='';
      if(type==='programme_registration')collection='programs';
      if(type==='event_registration')collection='events';
      if(type==='material')collection='books';
      if(type==='organization_subscription'){
        const result=await adminApi('/api/admin/plans',{action:'listPlans'});
        setTargets((result.items||[]).map(value=>{const item=value as Record<string,unknown>;return{id:String(item.id||''),name:String(item.name||'Plan')}}).filter(item=>item.id));
        return;
      }
      if(!collection)return;
      const result=await adminApi('/api/admin/content',{action:'list',collection});
      setTargets((result.items||[]).map(value=>{
        const item=value as Record<string,unknown>;return{id:String(item.id||''),name:String(item.title||item.name||'Item')};
      }).filter(item=>item.id));
    }catch(reason){setError(reason instanceof Error?reason.message:'Linked items could not be loaded.');}
  };
  useEffect(()=>{void loadTargets(draft.itemType);},[draft.itemType]);

  const startCreate=()=>{
    setEditing({} as PayableItem);
    setDraft({name:'',description:'',itemType:'programme_registration',targetId:'',organizationId:currentUser.organizationId||'',scope:isSuperAdmin?'platform':'organization',amount:'',currency:'ZMW',repeatable:false,active:true,allowedProviders:providers.filter(provider=>provider.configured&&provider.enabled).map(provider=>provider.key),allowedMethods:['card','airtel_money','mtn_money','zamtel_money']});
  };
  const startEdit=(item:PayableItem)=>{
    setEditing(item);
    setDraft({
      name:item.name,description:item.description,itemType:item.itemType,targetId:item.itemId,
      organizationId:item.organizationId||'',scope:item.scope,amount:item.amountDecimal,currency:item.currency,
      repeatable:item.repeatable,active:item.active,allowedProviders:item.allowedProviders||[],allowedMethods:item.allowedMethods||[],
    });
  };
  const toggleMethod=(method:PaymentMethod)=>setDraft(value=>({...value,allowedMethods:value.allowedMethods.includes(method)?value.allowedMethods.filter(item=>item!==method):[...value.allowedMethods,method]}));
  const toggleProvider=(providerKey:string)=>setDraft(value=>({...value,allowedProviders:value.allowedProviders.includes(providerKey)?value.allowedProviders.filter(item=>item!==providerKey):[...value.allowedProviders,providerKey]}));

  const saveItem=async()=>{
    if(!draft.name.trim()||!draft.amount.trim()){setError('Name and amount are required.');return;}
    if(!draft.allowedProviders.length){setError('Select at least one payment provider.');return;}
    if(['programme_registration','event_registration','organization_subscription','material'].includes(draft.itemType)&&!draft.targetId){setError('Choose the linked item by name.');return;}
    setBusy(true);setError('');
    try{
      await adminPaymentRequest('payable-items',{action:'upsert',item:{
        ...(editing?.id?{id:editing.id}:{}),name:draft.name,description:draft.description,itemType:draft.itemType,
        ...(draft.targetId?{itemId:draft.targetId}:{}),organizationId:draft.organizationId||undefined,
        scope:draft.scope,amount:Number(draft.amount),currency:draft.currency,repeatable:draft.repeatable,
        active:draft.active,paymentRequired:true,allowedProviders:draft.allowedProviders,allowedMethods:draft.allowedMethods,
      }});
      setEditing(null);setMessage('Payable item saved.');await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'The payable item could not be saved.');}
    finally{setBusy(false);}
  };

  const deleteItem=async(item:PayableItem)=>{
    if(!await appConfirm('Remove this payable item? Used items will be deactivated instead of deleting financial history.',{
      title:'Remove payable item',confirmLabel:'Remove',tone:'danger',
    }))return;
    setBusy(true);setError('');
    try{await adminPaymentRequest('payable-items',{action:'delete',id:item.id});setMessage('Payable item updated.');await load();}
    catch(reason){setError(reason instanceof Error?reason.message:'The payable item could not be removed.');}
    finally{setBusy(false);}
  };

  const openDetails=async(payment:ClientPayment)=>{
    setBusy(true);setError('');
    try{const result=await adminPaymentRequest<{ok:true;item:PaymentDetails}>('transaction',{paymentId:payment.id});setDetails(result.item);}
    catch(reason){setError(reason instanceof Error?reason.message:'Transaction details could not be loaded.');}
    finally{setBusy(false);}
  };

  const exportCsv=async()=>{
    setBusy(true);setError('');
    try{
      const result=await adminPaymentRequest<{ok:true;csv:string;filename:string}>('export',{filters:{search,status,organizationId:organizationFilter,itemType:typeFilter,paymentMethod:methodFilter,provider:providerFilter,dateFrom,dateTo,minAmount,maxAmount}});
      const blob=new Blob([result.csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=url;link.download=result.filename;link.click();URL.revokeObjectURL(url);
    }catch(reason){setError(reason instanceof Error?reason.message:'Payment export failed.');}
    finally{setBusy(false);}
  };

  const reconcile=async(paymentId?:string)=>{
    setBusy(true);setError('');
    try{
      await adminPaymentRequest('reconcile',paymentId?{paymentId}:{});
      setMessage(paymentId?'Transaction reconciled with the provider.':'Pending transactions reconciled.');
      setDetails(null);await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Reconciliation failed.');}
    finally{setBusy(false);}
  };

  const requestRefund=async(payment:ClientPayment)=>{
    const remainingMinor=Math.max(0,Number(payment.amountMinor||0)-Math.max(0,Number(payment.refundedMinor||0)));
    const amount=await appPrompt('Enter the amount to refund. VOP will prevent refunds above the remaining paid amount.',{
      title:'Refund amount',defaultValue:minorToDecimal(remainingMinor,payment.currency),placeholder:'0.00',
    });
    if(amount===null)return;
    const reason=await appPrompt('Enter the reason for this refund. This becomes part of the immutable payment audit trail.',{
      title:'Refund reason',placeholder:'Reason for refund',
    });
    if(reason===null)return;
    setBusy(true);setError('');
    try{
      const result=await adminPaymentRequest<{ok:true;item:RefundRecord}>('refunds',{
        action:'request',paymentId:payment.id,amount,reason,
      });
      setMessage(result.item.status==='manual_action_required'
        ?'Refund recorded. Complete the refund in the provider dashboard, then confirm the provider reference here.'
        :'Refund request submitted to the provider.');
      await load();
      await openDetails(payment);
    }catch(reasonValue){setError(reasonValue instanceof Error?reasonValue.message:'Refund request failed.');}
    finally{setBusy(false);}
  };

  const completeManualRefund=async(refund:RefundRecord)=>{
    const providerRefundReference=await appPrompt('Enter the refund/reversal reference issued by the payment provider.',{
      title:'Confirm provider refund',placeholder:'Provider refund reference',
    });
    if(providerRefundReference===null)return;
    const confirmationNote=await appPrompt('Describe how and where the refund was completed so another finance administrator can audit it.',{
      title:'Refund confirmation note',placeholder:'Refund completed in provider dashboard…',
    });
    if(confirmationNote===null)return;
    setBusy(true);setError('');
    try{
      await adminPaymentRequest('refunds',{
        action:'completeManual',refundId:refund.id,providerRefundReference,confirmationNote,
      });
      setMessage('Refund confirmed and the VOP payment record has been updated.');
      const payment=details?.payment;
      if(payment){await load();await openDetails(payment);}
    }catch(reasonValue){setError(reasonValue instanceof Error?reasonValue.message:'Refund confirmation failed.');}
    finally{setBusy(false);}
  };

  const startPackageCreate=()=>{
    if(!isSuperAdmin)return;
    setEditingPackage(null);
    setPackageDraft({
      name:'',description:'',price:'',interval:'month',sortOrder:String(packages.length),active:true,defaultForUnsubscribed:false,
      quotas:emptyPackageQuotas(),features:defaultPackageFeatures(),
    });
  };
  const startPackageEdit=(item:SubscriptionPackage)=>{
    if(!isSuperAdmin)return;
    const quotas=emptyPackageQuotas();
    for(const {key} of SUBSCRIPTION_QUOTAS){
      const value=item.quotas?.[key];
      // The plan editor uses a blank value as the explicit "Unlimited" UX.
      // Legacy -1 values are normalized to that representation instead of
      // silently becoming zero when the plan is saved again.
      quotas[key]=value===undefined||value===null||Number(value)<0?'':String(value);
    }
    if(!quotas.maxSeats&&item.quotas?.maxUsers!==undefined&&item.quotas?.maxUsers!==null){
      quotas.maxSeats=String(item.quotas.maxUsers);
    }
    const features=defaultPackageFeatures();
    for(const {key} of SUBSCRIPTION_FEATURES){
      if(Object.hasOwn(item.features||{},key))features[key]=item.features[key]===true;
    }
    setEditingPackage(item);
    setPackageDraft({
      name:item.name||'',description:item.description||'',price:String(item.priceUsd??item.price??''),
      interval:item.interval||'month',sortOrder:String(item.sortOrder??0),active:item.active!==false,
      defaultForUnsubscribed:item.defaultForUnsubscribed===true,quotas,features,
    });
  };
  const savePackage=async()=>{
    if(!isSuperAdmin)return;
    if(!packageDraft.name.trim()){setError('Package name is required.');return;}
    const price=Number(packageDraft.price);
    if(!Number.isFinite(price)||price<0){setError('Enter a valid package price.');return;}
    const quotas:Record<string,number>={};
    for(const definition of SUBSCRIPTION_QUOTAS){
      const raw=String(packageDraft.quotas[definition.key]??'').trim();
      if(!raw)continue;
      const value=Number(raw);
      if(!Number.isInteger(value)||value<0){
        setError(definition.label+' must be a whole number of 0 or greater, or left blank for Unlimited.');
        return;
      }
      quotas[definition.key]=value;
    }
    setBusy(true);setError('');
    try{
      await adminApi('/api/admin/plans',{
        action:'upsertPlan',
        ...(editingPackage?.id?{planId:editingPackage.id}:{}),
        name:packageDraft.name.trim(),description:packageDraft.description.trim(),priceUsd:price,
        interval:packageDraft.interval,
        sortOrder:Math.trunc(Number(packageDraft.sortOrder)||0),active:packageDraft.active,
        defaultForUnsubscribed:price===0&&packageDraft.active&&packageDraft.defaultForUnsubscribed,
        quotas,features:packageDraft.features,
      });
      setEditingPackage(undefined);setMessage('Subscription package saved and checkout offer synchronized.');await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Subscription package could not be saved.');}
    finally{setBusy(false);}
  };
  const refreshBillingRate=async()=>{
    if(!isSuperAdmin)return;
    setBusy(true);setError('');
    try{
      const result=await adminApi('/api/admin/plans',{action:'refreshBillingRate'});
      const settings=(result.item||{}) as Record<string,unknown>;
      setBillingSettings(previous=>({
        ...previous,
        usdToZmwRate:Number(settings.usdToZmwRate||0)>0?String(settings.usdToZmwRate):'',
        fxSource:String(settings.fxSource||'frankfurter'),
        fxQuoteTtlMinutes:String(settings.fxQuoteTtlMinutes||1440),
        fxUpdatedAt:String(settings.fxUpdatedAt||''),
        fxProviderDate:String(settings.fxProviderDate||''),
      }));
      setMessage('Daily USD → ZMW rate refreshed from Frankfurter.');
    }catch(reason){setError(reason instanceof Error?reason.message:'The daily exchange rate could not be refreshed.');}
    finally{setBusy(false);}
  };

  const saveBillingSettings=async()=>{
    if(!isSuperAdmin)return;
    const rawRate=billingSettings.usdToZmwRate.trim();
    const rate=rawRate?Number(rawRate):0;
    if(rawRate&&(!Number.isFinite(rate)||rate<=0)){setError('Enter a valid USD to ZMW exchange rate or leave it blank and refresh later.');return;}
    setBusy(true);setError('');
    try{
      await adminApi('/api/admin/plans',{
        action:'updateBillingSettings',
        ...(rawRate?{usdToZmwRate:rate}:{}),
        fxSource:billingSettings.fxSource.trim()||'platform-configured',
        fxQuoteTtlMinutes:Math.max(15,Math.trunc(Number(billingSettings.fxQuoteTtlMinutes)||1440)),
        subscriptionAudience:billingSettings.subscriptionAudience,
      });
      setMessage('Platform billing and subscription audience policy updated.');
      await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Billing settings could not be saved.');}
    finally{setBusy(false);}
  };

  const deletePackage=async(item:SubscriptionPackage)=>{
    if(!isSuperAdmin)return;
    if(!await appConfirm('Delete this subscription package? Packages assigned to active organizations cannot be deleted.',{
      title:'Delete subscription package',confirmLabel:'Delete package',tone:'danger',
    }))return;
    setBusy(true);setError('');
    try{
      await adminApi('/api/admin/plans',{action:'deletePlan',planId:item.id});
      setMessage('Subscription package deleted.');await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Subscription package could not be deleted.');}
    finally{setBusy(false);}
  };

  const configureProvider=async(provider:PaymentProviderDescriptor,enabled:boolean)=>{
    setBusy(true);setError('');
    try{
      await adminPaymentRequest('providers',{action:'configure',provider:{key:provider.key,enabled,methods:provider.methods}});
      setMessage('Provider configuration updated.');await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Provider configuration could not be updated.');}
    finally{setBusy(false);}
  };

  const filtered=useMemo(()=>transactions,[transactions]);

  return <div className="vop-payment-admin">
    <div className="vop-page-header"><div><span className="vop-page-kicker">Financial operations</span><h1>Billing & Subscriptions</h1><p>{isSuperAdmin?'Manage SaaS plans, organization subscriptions, live usage, charges, payment providers and transaction operations from one billing workspace.':canManageOwnSubscription?'Manage your organization subscription and review its payment transactions.':'Review payment transactions within your authorized organization scope.'}</p></div>
      <div className="vop-payment-admin-actions"><button className="btn btn-outline" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/>Refresh</button>{isSuperAdmin&&tab==='items'&&<button className="btn btn-primary" onClick={startCreate}><Plus size={16}/>New payable item</button>}</div></div>
    <div className="vop-payment-admin-tabs">
      {(isSuperAdmin
        ?([['transactions','Transactions'],['subscriptions','Plans & subscriptions'],['items','Payable items'],['providers','Providers'],['reconciliation','Reconciliation']] as Array<[Tab,string]>)
        :canManageOwnSubscription
          ?([['transactions','Transactions'],['subscriptions','Plan & subscription']] as Array<[Tab,string]>)
          :([['transactions','Transactions']] as Array<[Tab,string]>)
      ).map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}
    </div>
    {error&&<div className="vop-payment-alert danger"><XCircle size={17}/><span>{error}</span><button onClick={()=>setError('')}>×</button></div>}
    {message&&<div className="vop-payment-alert success"><CheckCircle2 size={17}/><span>{message}</span><button onClick={()=>setMessage('')}>×</button></div>}

    {tab==='transactions'&&<>
      <div className="vop-payment-admin-toolbar vop-payment-filter-grid">
        <label className="search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={isSuperAdmin?'Payer, internal or provider reference':'Payer or payment reference'}/></label>
        <select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{['initiated','pending','requires_action','processing','paid','failed','cancelled','expired','refunded','partially_refunded'].map(value=><option value={value} key={value}>{paymentStatusLabel(value as never)}</option>)}</select>
        <select value={organizationFilter} onChange={e=>setOrganizationFilter(e.target.value)}><option value="">All organizations</option>{organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}</select>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="">All payment types</option>{PAYABLE_ITEM_TYPES.map(value=><option value={value} key={value}>{typeLabel(value)}</option>)}</select>
        <select value={methodFilter} onChange={e=>setMethodFilter(e.target.value)}><option value="">All methods</option>{(['card','airtel_money','mtn_money','zamtel_money'] as PaymentMethod[]).map(value=><option value={value} key={value}>{paymentMethodLabel(value)}</option>)}</select>
        {isSuperAdmin&&<select value={providerFilter} onChange={e=>setProviderFilter(e.target.value)}><option value="">All providers</option>{providers.map(provider=><option value={provider.key} key={provider.key}>{provider.key.replace(/\b\w/g,c=>c.toUpperCase())}</option>)}</select>}
        <label><span className="sr-only">From date</span><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label>
        <label><span className="sr-only">To date</span><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label>
        <label><span className="sr-only">Minimum amount</span><input inputMode="decimal" value={minAmount} onChange={e=>setMinAmount(e.target.value)} placeholder="Min amount"/></label>
        <label><span className="sr-only">Maximum amount</span><input inputMode="decimal" value={maxAmount} onChange={e=>setMaxAmount(e.target.value)} placeholder="Max amount"/></label>
        <button className="btn btn-outline" onClick={()=>void load()}><SlidersHorizontal size={15}/>Apply</button><button className="btn btn-outline" onClick={()=>void exportCsv()} disabled={busy}><Download size={15}/>Export</button>
      </div>
      {loading?<div className="vop-payment-empty"><LoaderCircle className="spin" size={26}/>Loading transactions…</div>:<div className="vop-payment-admin-table-wrap"><table className="vop-payment-admin-table"><thead><tr><th>Reference</th><th>Payer</th><th>Organization</th><th>Item</th><th>Amount</th><th>Method</th><th>Status</th>{isSuperAdmin&&<th>Verification</th>}</tr></thead><tbody>{filtered.map(payment=><tr key={payment.id} onClick={()=>void openDetails(payment)}><td><strong>{payment.reference}</strong>{isSuperAdmin&&<small>{payment.providerReference||'Provider reference pending'}</small>}</td><td>{payment.payerName||payment.payerEmail}<small>{payment.payerEmail}</small></td><td>{organizations.find(org=>org.id===payment.organizationId)?.name|| (payment.organizationId?'Authorized organization':'Platform')}</td><td>{payment.description}</td><td>{payment.currency} {payment.amountDecimal}</td><td>{paymentMethodLabel(payment.paymentMethod)}</td><td><span className={'vop-payment-status '+statusClass(payment.status)}>{paymentStatusLabel(payment.status as never)}</span></td>{isSuperAdmin&&<td>{payment.verificationStatus}</td>}</tr>)}</tbody></table></div>}
    </>}

    {(isSuperAdmin||canManageOwnSubscription)&&tab==='subscriptions'&&<>
      <SubscriptionWorkspace
        currentUser={currentUser}
        isSuperAdmin={isSuperAdmin}
        organizations={organizations}
        packages={packages}
        busy={busy}
        onCreatePlan={isSuperAdmin?startPackageCreate:undefined}
        onEditPlan={isSuperAdmin?startPackageEdit:undefined}
        onDeletePlan={isSuperAdmin?deletePackage:undefined}
        onOpenCheckout={onOpenCheckout}
      />
      {isSuperAdmin&&<section className="vop-payment-reconciliation vop-billing-policy-card"><Settings2 size={34}/><div><h2>Billing & subscription policy</h2><p>Plans have one canonical USD price. Zambia organizations receive a locked ZMW quote from the daily Frankfurter USD→ZMW rate. Subscription policy is institutional by default; learners/candidates are excluded from individual subscription billing unless Super Admin explicitly enables it.</p><div className="vop-payable-editor-grid"><label><span>USD → ZMW rate</span><input inputMode="decimal" value={billingSettings.usdToZmwRate} onChange={e=>setBillingSettings(v=>({...v,usdToZmwRate:e.target.value,fxSource:'manual'}))} placeholder="Daily rate"/></label><label><span>Rate source</span><input value={billingSettings.fxSource} readOnly disabled/></label><label><span>Quote validity (minutes)</span><input inputMode="numeric" value={billingSettings.fxQuoteTtlMinutes} onChange={e=>setBillingSettings(v=>({...v,fxQuoteTtlMinutes:e.target.value}))}/></label></div><fieldset className="vop-billing-audience"><legend>Subscription-bearing accounts</legend><label className="vop-checkbox"><input type="checkbox" checked={billingSettings.subscriptionAudience.learnersCandidates} onChange={e=>setBillingSettings(v=>({...v,subscriptionAudience:{...v.subscriptionAudience,learnersCandidates:e.target.checked}}))}/>Learners / candidates require subscription billing</label><p className="vop-payment-security">Currently off: learner, student and candidate accounts do not require an individual subscription and do not consume member/staff seats. Institutional subscription policy remains enabled for organizations, churches, districts, conferences and unions.</p></fieldset><div className="vop-payment-admin-actions"><button className="btn btn-primary" disabled={busy} onClick={()=>void refreshBillingRate()}><RefreshCw size={16}/>Refresh daily rate</button><button className="btn btn-outline" disabled={busy} onClick={()=>void saveBillingSettings()}><Settings2 size={16}/>Save billing policy</button></div>{billingSettings.fxUpdatedAt&&<small>Last refreshed: {new Date(billingSettings.fxUpdatedAt).toLocaleString()}{billingSettings.fxProviderDate?' · provider date '+billingSettings.fxProviderDate:''}</small>}</div></section>}
    </>}

    {isSuperAdmin&&tab==='items'&&<div className="vop-payment-admin-cards">{items.map(item=><article key={item.id}><div><span>{typeLabel(item.itemType)}</span><h3>{item.name}</h3><p>{item.description||'Configured charge'}</p></div><dl><div><dt>Amount</dt><dd>{item.currency} {item.amountDecimal}</dd></div><div><dt>Scope</dt><dd>{organizations.find(org=>org.id===item.organizationId)?.name||typeLabel(item.scope)}</dd></div><div><dt>Status</dt><dd>{item.active?'Active':'Inactive'}</dd></div></dl><footer><button className="btn btn-outline" onClick={()=>startEdit(item)}>Edit</button><button className="btn btn-danger" onClick={()=>void deleteItem(item)}>Remove</button></footer></article>)}</div>}

    {isSuperAdmin&&tab==='providers'&&<div className="vop-payment-admin-cards">{providers.map(provider=><article key={provider.key}><div><span>{provider.environment}</span><h3>{provider.key.replace(/\b\w/g,c=>c.toUpperCase())}</h3><p>{provider.configured?'Server credentials detected.':'Credentials are not configured in the deployment environment.'}</p></div><dl><div><dt>Methods</dt><dd>{provider.methods.map(paymentMethodLabel).join(', ')}</dd></div><div><dt>Webhooks</dt><dd>{provider.capabilities.webhooks?'Supported':'Not available'}</dd></div>{provider.callbackPath&&<div><dt>Callback endpoint</dt><dd><code>{provider.callbackPath}</code></dd></div>}<div><dt>Status</dt><dd>{provider.enabled&&provider.configured?'Enabled':'Unavailable'}</dd></div></dl>{isSuperAdmin&&<footer><button className="btn btn-outline" disabled={!provider.configured||busy} onClick={()=>void configureProvider(provider,!provider.enabled)}>{provider.enabled?'Disable':'Enable'} provider</button></footer>}</article>)}</div>}

    {isSuperAdmin&&tab==='reconciliation'&&<section className="vop-payment-reconciliation"><Settings2 size={34}/><div><h2>Provider reconciliation</h2><p>Webhook delivery is not treated as the only source of truth. Pending provider transactions are independently re-queried and matched against VOP reference, amount and currency before fulfilment.</p><button className="btn btn-primary" disabled={busy} onClick={()=>void reconcile()}>{busy?<LoaderCircle className="spin" size={16}/>:<RefreshCw size={16}/>}Run reconciliation now</button></div></section>}

    {isSuperAdmin&&editingPackage!==undefined&&<div className="vop-payment-modal-layer"><section className="vop-payment-modal vop-payable-editor"><header><div><span>Organization subscription package</span><h2>{editingPackage?.id?'Edit subscription package':'New subscription package'}</h2></div><button onClick={()=>setEditingPackage(undefined)} aria-label="Close"><X size={18}/></button></header>
      <div className="vop-payable-editor-grid">
        <label><span>Package name</span><input value={packageDraft.name} onChange={e=>setPackageDraft(v=>({...v,name:e.target.value}))} placeholder="e.g. Growth"/></label>
        <label><span>Billing interval</span><select value={packageDraft.interval} onChange={e=>setPackageDraft(v=>({...v,interval:e.target.value}))}><option value="month">Monthly</option><option value="year">Yearly</option><option value="one_time">One-time</option></select></label>
        <label><span>Canonical price (USD)</span><input value={packageDraft.price} inputMode="decimal" onChange={e=>setPackageDraft(v=>({...v,price:e.target.value}))} placeholder="0.00"/></label>
        <label><span>Base currency</span><input value="USD" disabled readOnly/></label>
        <label><span>Display order</span><input value={packageDraft.sortOrder} inputMode="numeric" onChange={e=>setPackageDraft(v=>({...v,sortOrder:e.target.value}))}/></label>
        <label className="vop-checkbox"><input type="checkbox" checked={packageDraft.active} onChange={e=>setPackageDraft(v=>({...v,active:e.target.checked,defaultForUnsubscribed:e.target.checked?v.defaultForUnsubscribed:false}))}/>Available to organizations</label>
        <label className="vop-checkbox wide"><input type="checkbox" checked={packageDraft.defaultForUnsubscribed} disabled={!packageDraft.active||Number(packageDraft.price)!==0} onChange={e=>setPackageDraft(v=>({...v,defaultForUnsubscribed:e.target.checked}))}/>Default free plan for organizations without a subscription</label>
        <label className="wide"><span>Description</span><textarea value={packageDraft.description} onChange={e=>setPackageDraft(v=>({...v,description:e.target.value}))}/></label>
        <fieldset className="wide"><legend>Organization limits</legend><div className="vop-payment-method-checks">{SUBSCRIPTION_QUOTAS.map(({key,label,description})=><label key={key} title={description}><span>{label}</span><input type="number" min="0" step="1" value={packageDraft.quotas[key]} inputMode="numeric" placeholder="Unlimited" aria-label={label+' limit; leave blank for Unlimited'} onChange={e=>setPackageDraft(v=>({...v,quotas:{...v.quotas,[key]:e.target.value}}))}/></label>)}</div></fieldset>
        <fieldset className="wide"><legend>Included capabilities</legend><div className="vop-payment-method-checks">{SUBSCRIPTION_FEATURES.map(({key,label})=><label key={key}><input type="checkbox" checked={packageDraft.features[key]===true} onChange={e=>setPackageDraft(v=>({...v,features:{...v.features,[key]:e.target.checked}}))}/>{label}</label>)}</div></fieldset>
      </div>
      <p className="vop-payment-security">Leave a limit blank for Unlimited; enter 0 to disable new usage of that resource. Limits count active, non-archived resources. A $0 active package can be marked as the default free plan; organizations without a plan are subscribed automatically. The package identifier and matching organization-subscription payable item are generated automatically for paid plans only. Member/staff seats cover owners, organization admins, editors, teachers, mentors and other institutional staff. Learners, students and candidates are tracked separately and never consume member/staff seats; their candidate limit is enforced only when Super Admin enables learner/candidate subscription billing.</p>
      <button className="btn btn-primary vop-payment-submit" onClick={()=>void savePackage()} disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:<CreditCard size={16}/>}Save subscription package</button>
    </section></div>}

    {isSuperAdmin&&editing&&<div className="vop-payment-modal-layer"><section className="vop-payment-modal vop-payable-editor"><header><div><span>Administrator configured charge</span><h2>{editing.id?'Edit payable item':'New payable item'}</h2></div><button onClick={()=>setEditing(null)} aria-label="Close"><X size={18}/></button></header>
      <div className="vop-payable-editor-grid"><label><span>Name</span><input value={draft.name} onChange={e=>setDraft(v=>({...v,name:e.target.value}))}/></label><label><span>Type</span><select value={draft.itemType} onChange={e=>setDraft(v=>({...v,itemType:e.target.value as PayableItemType,targetId:''}))}>{PAYABLE_ITEM_TYPES.map(value=><option key={value} value={value}>{typeLabel(value)}</option>)}</select></label>
      {targets.length>0&&<label className="wide"><span>Linked item</span><select value={draft.targetId} onChange={e=>setDraft(v=>({...v,targetId:e.target.value}))}><option value="">Choose by name</option>{targets.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <label><span>Amount</span><input value={draft.amount} onChange={e=>setDraft(v=>({...v,amount:e.target.value}))} inputMode="decimal"/></label><label><span>Currency</span><input value={draft.currency} maxLength={3} onChange={e=>setDraft(v=>({...v,currency:e.target.value.toUpperCase()}))}/></label>
      {isSuperAdmin&&<label><span>Scope</span><select value={draft.scope} onChange={e=>setDraft(v=>({...v,scope:e.target.value,organizationId:e.target.value==='platform'?'':v.organizationId}))}><option value="platform">Platform-wide</option><option value="organization">Organization</option><option value="hierarchy">Hierarchy-managed organization</option></select></label>}
      {draft.scope!=='platform'&&<label><span>Organization</span><select value={draft.organizationId} onChange={e=>setDraft(v=>({...v,organizationId:e.target.value}))}><option value="">Choose organization</option>{organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}</select></label>}
      <label className="wide"><span>Description</span><textarea value={draft.description} onChange={e=>setDraft(v=>({...v,description:e.target.value}))}/></label>
      <fieldset className="wide"><legend>Payment providers</legend><div className="vop-payment-method-checks">{providers.map(provider=><label key={provider.key}><input type="checkbox" checked={draft.allowedProviders.includes(provider.key)} onChange={()=>toggleProvider(provider.key)} disabled={!provider.configured}/>{provider.key.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}{!provider.configured?' (not configured)':''}</label>)}</div></fieldset>
      <fieldset className="wide"><legend>Payment methods</legend><div className="vop-payment-method-checks">{(['card','airtel_money','mtn_money','zamtel_money'] as PaymentMethod[]).map(value=><label key={value}><input type="checkbox" checked={draft.allowedMethods.includes(value)} onChange={()=>toggleMethod(value)}/>{paymentMethodLabel(value)}</label>)}</div></fieldset>
      <label className="vop-checkbox"><input type="checkbox" checked={draft.repeatable} onChange={e=>setDraft(v=>({...v,repeatable:e.target.checked}))}/>Allow repeat payments</label><label className="vop-checkbox"><input type="checkbox" checked={draft.active} onChange={e=>setDraft(v=>({...v,active:e.target.checked}))}/>Active</label></div>
      <button className="btn btn-primary vop-payment-submit" onClick={()=>void saveItem()} disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:<CreditCard size={16}/>}Save payable item</button></section></div>}

    {details&&<div className="vop-payment-modal-layer"><section className="vop-payment-modal vop-transaction-details"><header><div><span>Transaction details</span><h2>{details.payment.reference}</h2></div><button onClick={()=>setDetails(null)}><X size={18}/></button></header><dl><div><dt>Payer</dt><dd>{details.payment.payerName||details.payment.payerEmail}</dd></div><div><dt>Item</dt><dd>{details.payment.description}</dd></div><div><dt>Amount</dt><dd>{details.payment.currency} {details.payment.amountDecimal}</dd></div><div><dt>Status</dt><dd>{paymentStatusLabel(details.payment.status as never)}</dd></div>{isSuperAdmin&&<><div><dt>Provider</dt><dd>{details.payment.provider}</dd></div><div><dt>Provider reference</dt><dd>{details.payment.providerReference||'Pending'}</dd></div><div><dt>Webhook</dt><dd>{details.payment.webhookStatus}</dd></div><div><dt>Reconciliation</dt><dd>{details.payment.reconciliationStatus}</dd></div></>}<div><dt>Fulfilment</dt><dd>{details.payment.fulfilmentStatus}</dd></div><div><dt>Refunded</dt><dd>{details.payment.refundedMinor?details.payment.currency+' '+minorToDecimal(details.payment.refundedMinor,details.payment.currency):'None'}</dd></div></dl>
      {isSuperAdmin&&['paid','partially_refunded'].includes(details.payment.status)&&<button className="btn btn-outline vop-payment-submit" onClick={()=>void requestRefund(details.payment)} disabled={busy}>Request refund</button>}
      {isSuperAdmin&&<><h3>Refunds</h3><div className="vop-payment-audit">{details.refunds?.length?details.refunds.map(refund=><div key={refund.id}><strong>{refund.currency} {refund.amountDecimal} · {typeLabel(refund.status)}</strong><span>{refund.reason}</span>{refund.status==='manual_action_required'&&<button className="btn btn-outline" onClick={()=>void completeManualRefund(refund)} disabled={busy}>Confirm provider refund</button>}</div>):<div><strong>No refunds</strong><span>—</span></div>}</div>
      <h3>Payment attempts</h3><div className="vop-payment-audit">{details.attempts.length?details.attempts.map((entry,index)=><div key={String(entry.id||index)}><strong>{paymentMethodLabel(String(entry.paymentMethod||'card') as PaymentMethod)} · {paymentStatusLabel(String(entry.status||'pending') as never)}</strong><span>{entry.createdAt?new Date(String(entry.createdAt)).toLocaleString():'Recorded'}</span></div>):<div><strong>No provider attempt recorded</strong><span>—</span></div>}</div>
      <h3>Audit history</h3><div className="vop-payment-audit">{details.audit.map((entry,index)=><div key={String(entry.id||index)}><strong>{String(entry.action||'Payment update').replaceAll('.',' ')}</strong><span>{entry.createdAt?new Date(String(entry.createdAt)).toLocaleString():'Recorded'}</span></div>)}</div>
      <button className="btn btn-outline vop-payment-submit" onClick={()=>void reconcile(details.payment.id)} disabled={busy}><RefreshCw size={15}/>Verify with provider</button></>}{!isSuperAdmin&&<p className="vop-payment-security">Provider configuration, provider references, reconciliation, attempts and provider audit are managed centrally by the VOP Super Admin.</p>}</section></div>}
  </div>;
};

export default PaymentManagement;
