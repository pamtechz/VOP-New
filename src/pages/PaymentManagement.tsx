import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, Download, LoaderCircle, Plus, RefreshCw, Search, Settings2, SlidersHorizontal, WalletCards, X, XCircle } from 'lucide-react';
import type { User } from '../types';
import type { PayableItem, PayableItemType, PaymentMethod } from '../../shared/payments';
import { PAYABLE_ITEM_TYPES, paymentMethodLabel, paymentStatusLabel } from '../../shared/payments';
import { adminPaymentRequest, type ClientPayment, type PaymentProviderDescriptor } from '../services/payments';
import { auth } from '../lib/firebase';
import { appConfirm } from '../components/layout/AppDialog';
import './payments.css';

interface Props{currentUser:User}
type Tab='transactions'|'items'|'providers'|'reconciliation';
type Organization={id:string;name:string};
type Target={id:string;name:string};
type PaymentDetails={payment:ClientPayment;attempts:Array<Record<string,unknown>>;audit:Array<Record<string,unknown>>;receipt:Record<string,unknown>|null};

async function adminApi(path:string,body:Record<string,unknown>){
  if(!auth?.currentUser)throw new Error('Sign in again.');
  const token=await auth.currentUser.getIdToken();
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({})) as {error?:string;items?:unknown[]};
  if(!response.ok)throw new Error(payload.error||'Administration request failed.');
  return payload;
}
function typeLabel(value:string){return value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());}
function statusClass(value:string){return value==='paid'?'success':['failed','cancelled','expired'].includes(value)?'danger':'warning';}

const PaymentManagement:React.FC<Props>=({currentUser})=>{
  const [tab,setTab]=useState<Tab>('transactions');
  const [transactions,setTransactions]=useState<ClientPayment[]>([]);
  const [items,setItems]=useState<PayableItem[]>([]);
  const [providers,setProviders]=useState<PaymentProviderDescriptor[]>([]);
  const [organizations,setOrganizations]=useState<Organization[]>([]);
  const [targets,setTargets]=useState<Target[]>([]);
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('');
  const [organizationFilter,setOrganizationFilter]=useState('');
  const [typeFilter,setTypeFilter]=useState('');
  const [methodFilter,setMethodFilter]=useState('');
  const [dateFrom,setDateFrom]=useState('');
  const [dateTo,setDateTo]=useState('');
  const [minAmount,setMinAmount]=useState('');
  const [maxAmount,setMaxAmount]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [editing,setEditing]=useState<PayableItem|null>(null);
  const [details,setDetails]=useState<PaymentDetails|null>(null);
  const [draft,setDraft]=useState({
    name:'',description:'',itemType:'programme_registration' as PayableItemType,
    targetId:'',organizationId:'',scope:currentUser.role==='super_admin'?'platform':'organization',
    amount:'',currency:'ZMW',repeatable:false,active:true,
    allowedMethods:['card','airtel_money','mtn_money','zamtel_money'] as PaymentMethod[],
  });
  const isSuperAdmin=currentUser.role==='super_admin';

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const [tx,itemResult,providerResult,orgResult]=await Promise.all([
        adminPaymentRequest<{ok:true;items:ClientPayment[]}>('transactions',{filters:{search,status,organizationId:organizationFilter,itemType:typeFilter,paymentMethod:methodFilter,dateFrom,dateTo,minAmount,maxAmount}}),
        adminPaymentRequest<{ok:true;items:PayableItem[]}>('payable-items',{action:'list'}),
        adminPaymentRequest<{ok:true;items:PaymentProviderDescriptor[]}>('providers',{action:'list'}),
        adminApi('/api/admin/organizations',{action:'list'}),
      ]);
      setTransactions(tx.items);setItems(itemResult.items);setProviders(providerResult.items);
      setOrganizations((orgResult.items||[]).map(value=>{
        const item=value as Record<string,unknown>;return {id:String(item.id||''),name:String(item.name||'Organization')};
      }).filter(item=>item.id));
    }catch(reason){setError(reason instanceof Error?reason.message:'Payments could not be loaded.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);

  const loadTargets=async(type:PayableItemType)=>{
    setTargets([]);
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
    setDraft({name:'',description:'',itemType:'programme_registration',targetId:'',organizationId:currentUser.organizationId||'',scope:isSuperAdmin?'platform':'organization',amount:'',currency:'ZMW',repeatable:false,active:true,allowedMethods:['card','airtel_money','mtn_money','zamtel_money']});
  };
  const startEdit=(item:PayableItem)=>{
    setEditing(item);
    setDraft({
      name:item.name,description:item.description,itemType:item.itemType,targetId:item.itemId,
      organizationId:item.organizationId||'',scope:item.scope,amount:item.amountDecimal,currency:item.currency,
      repeatable:item.repeatable,active:item.active,allowedMethods:item.allowedMethods||[],
    });
  };
  const toggleMethod=(method:PaymentMethod)=>setDraft(value=>({...value,allowedMethods:value.allowedMethods.includes(method)?value.allowedMethods.filter(item=>item!==method):[...value.allowedMethods,method]}));

  const saveItem=async()=>{
    if(!draft.name.trim()||!draft.amount.trim()){setError('Name and amount are required.');return;}
    if(['programme_registration','event_registration','organization_subscription','material'].includes(draft.itemType)&&!draft.targetId){setError('Choose the linked item by name.');return;}
    setBusy(true);setError('');
    try{
      await adminPaymentRequest('payable-items',{action:'upsert',item:{
        ...(editing?.id?{id:editing.id}:{}),name:draft.name,description:draft.description,itemType:draft.itemType,
        ...(draft.targetId?{itemId:draft.targetId}:{}),organizationId:draft.organizationId||undefined,
        scope:draft.scope,amount:Number(draft.amount),currency:draft.currency,repeatable:draft.repeatable,
        active:draft.active,paymentRequired:true,allowedProviders:['lenco'],allowedMethods:draft.allowedMethods,
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
      const result=await adminPaymentRequest<{ok:true;csv:string;filename:string}>('export',{filters:{search,status,organizationId:organizationFilter,itemType:typeFilter,paymentMethod:methodFilter,dateFrom,dateTo,minAmount,maxAmount}});
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
    <div className="vop-page-header"><div><span className="vop-page-kicker">Financial operations</span><h1>Payments & Transactions</h1><p>Configure charges, reconcile provider confirmations, and review tenant-scoped payment history.</p></div>
      <div className="vop-payment-admin-actions"><button className="btn btn-outline" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/>Refresh</button>{tab==='items'&&<button className="btn btn-primary" onClick={startCreate}><Plus size={16}/>New payable item</button>}</div></div>
    <div className="vop-payment-admin-tabs">
      {([['transactions','Transactions'],['items','Payable items'],['providers','Providers'],['reconciliation','Reconciliation']] as Array<[Tab,string]>).map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}
    </div>
    {error&&<div className="vop-payment-alert danger"><XCircle size={17}/><span>{error}</span><button onClick={()=>setError('')}>×</button></div>}
    {message&&<div className="vop-payment-alert success"><CheckCircle2 size={17}/><span>{message}</span><button onClick={()=>setMessage('')}>×</button></div>}

    {tab==='transactions'&&<>
      <div className="vop-payment-admin-toolbar vop-payment-filter-grid">
        <label className="search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Payer, internal or provider reference"/></label>
        <select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{['initiated','pending','requires_action','processing','paid','failed','cancelled','expired','refunded','partially_refunded'].map(value=><option value={value} key={value}>{paymentStatusLabel(value as never)}</option>)}</select>
        <select value={organizationFilter} onChange={e=>setOrganizationFilter(e.target.value)}><option value="">All organizations</option>{organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}</select>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="">All payment types</option>{PAYABLE_ITEM_TYPES.map(value=><option value={value} key={value}>{typeLabel(value)}</option>)}</select>
        <select value={methodFilter} onChange={e=>setMethodFilter(e.target.value)}><option value="">All methods</option>{(['card','airtel_money','mtn_money','zamtel_money'] as PaymentMethod[]).map(value=><option value={value} key={value}>{paymentMethodLabel(value)}</option>)}</select>
        <label><span className="sr-only">From date</span><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label>
        <label><span className="sr-only">To date</span><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label>
        <label><span className="sr-only">Minimum amount</span><input inputMode="decimal" value={minAmount} onChange={e=>setMinAmount(e.target.value)} placeholder="Min amount"/></label>
        <label><span className="sr-only">Maximum amount</span><input inputMode="decimal" value={maxAmount} onChange={e=>setMaxAmount(e.target.value)} placeholder="Max amount"/></label>
        <button className="btn btn-outline" onClick={()=>void load()}><SlidersHorizontal size={15}/>Apply</button><button className="btn btn-outline" onClick={()=>void exportCsv()} disabled={busy}><Download size={15}/>Export</button>
      </div>
      {loading?<div className="vop-payment-empty"><LoaderCircle className="spin" size={26}/>Loading transactions…</div>:<div className="vop-payment-admin-table-wrap"><table className="vop-payment-admin-table"><thead><tr><th>Reference</th><th>Payer</th><th>Organization</th><th>Item</th><th>Amount</th><th>Method</th><th>Status</th><th>Verification</th></tr></thead><tbody>{filtered.map(payment=><tr key={payment.id} onClick={()=>void openDetails(payment)}><td><strong>{payment.reference}</strong><small>{payment.providerReference||'Provider reference pending'}</small></td><td>{payment.payerName||payment.payerEmail}<small>{payment.payerEmail}</small></td><td>{organizations.find(org=>org.id===payment.organizationId)?.name|| (payment.organizationId?'Authorized organization':'Platform')}</td><td>{payment.description}</td><td>{payment.currency} {payment.amountDecimal}</td><td>{paymentMethodLabel(payment.paymentMethod)}</td><td><span className={'vop-payment-status '+statusClass(payment.status)}>{paymentStatusLabel(payment.status as never)}</span></td><td>{payment.verificationStatus}</td></tr>)}</tbody></table></div>}
    </>}

    {tab==='items'&&<div className="vop-payment-admin-cards">{items.map(item=><article key={item.id}><div><span>{typeLabel(item.itemType)}</span><h3>{item.name}</h3><p>{item.description||'Configured charge'}</p></div><dl><div><dt>Amount</dt><dd>{item.currency} {item.amountDecimal}</dd></div><div><dt>Scope</dt><dd>{organizations.find(org=>org.id===item.organizationId)?.name||typeLabel(item.scope)}</dd></div><div><dt>Status</dt><dd>{item.active?'Active':'Inactive'}</dd></div></dl><footer><button className="btn btn-outline" onClick={()=>startEdit(item)}>Edit</button><button className="btn btn-danger" onClick={()=>void deleteItem(item)}>Remove</button></footer></article>)}</div>}

    {tab==='providers'&&<div className="vop-payment-admin-cards">{providers.map(provider=><article key={provider.key}><div><span>{provider.environment}</span><h3>{provider.key.replace(/\b\w/g,c=>c.toUpperCase())}</h3><p>{provider.configured?'Server credentials detected.':'Credentials are not configured in the deployment environment.'}</p></div><dl><div><dt>Methods</dt><dd>{provider.methods.map(paymentMethodLabel).join(', ')}</dd></div><div><dt>Webhooks</dt><dd>{provider.capabilities.webhooks?'Supported':'Not available'}</dd></div><div><dt>Status</dt><dd>{provider.enabled&&provider.configured?'Enabled':'Unavailable'}</dd></div></dl>{isSuperAdmin&&<footer><button className="btn btn-outline" disabled={!provider.configured||busy} onClick={()=>void configureProvider(provider,!provider.enabled)}>{provider.enabled?'Disable':'Enable'} provider</button></footer>}</article>)}</div>}

    {tab==='reconciliation'&&<section className="vop-payment-reconciliation"><Settings2 size={34}/><div><h2>Provider reconciliation</h2><p>Webhook delivery is not treated as the only source of truth. Pending provider transactions are independently re-queried and matched against VOP reference, amount and currency before fulfilment.</p>{isSuperAdmin?<button className="btn btn-primary" disabled={busy} onClick={()=>void reconcile()}>{busy?<LoaderCircle className="spin" size={16}/>:<RefreshCw size={16}/>}Run reconciliation now</button>:<small>Platform-wide reconciliation is restricted to Super Admin. Your scoped transactions are still reconciled automatically.</small>}</div></section>}

    {editing&&<div className="vop-payment-modal-layer"><section className="vop-payment-modal vop-payable-editor"><header><div><span>Administrator configured charge</span><h2>{editing.id?'Edit payable item':'New payable item'}</h2></div><button onClick={()=>setEditing(null)} aria-label="Close"><X size={18}/></button></header>
      <div className="vop-payable-editor-grid"><label><span>Name</span><input value={draft.name} onChange={e=>setDraft(v=>({...v,name:e.target.value}))}/></label><label><span>Type</span><select value={draft.itemType} onChange={e=>setDraft(v=>({...v,itemType:e.target.value as PayableItemType,targetId:''}))}>{PAYABLE_ITEM_TYPES.map(value=><option key={value} value={value}>{typeLabel(value)}</option>)}</select></label>
      {targets.length>0&&<label className="wide"><span>Linked item</span><select value={draft.targetId} onChange={e=>setDraft(v=>({...v,targetId:e.target.value}))}><option value="">Choose by name</option>{targets.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <label><span>Amount</span><input value={draft.amount} onChange={e=>setDraft(v=>({...v,amount:e.target.value}))} inputMode="decimal"/></label><label><span>Currency</span><input value={draft.currency} maxLength={3} onChange={e=>setDraft(v=>({...v,currency:e.target.value.toUpperCase()}))}/></label>
      {isSuperAdmin&&<label><span>Scope</span><select value={draft.scope} onChange={e=>setDraft(v=>({...v,scope:e.target.value,organizationId:e.target.value==='platform'?'':v.organizationId}))}><option value="platform">Platform-wide</option><option value="organization">Organization</option><option value="hierarchy">Hierarchy-managed organization</option></select></label>}
      {draft.scope!=='platform'&&<label><span>Organization</span><select value={draft.organizationId} onChange={e=>setDraft(v=>({...v,organizationId:e.target.value}))}><option value="">Choose organization</option>{organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}</select></label>}
      <label className="wide"><span>Description</span><textarea value={draft.description} onChange={e=>setDraft(v=>({...v,description:e.target.value}))}/></label>
      <fieldset className="wide"><legend>Payment methods</legend><div className="vop-payment-method-checks">{(['card','airtel_money','mtn_money','zamtel_money'] as PaymentMethod[]).map(value=><label key={value}><input type="checkbox" checked={draft.allowedMethods.includes(value)} onChange={()=>toggleMethod(value)}/>{paymentMethodLabel(value)}</label>)}</div></fieldset>
      <label className="vop-checkbox"><input type="checkbox" checked={draft.repeatable} onChange={e=>setDraft(v=>({...v,repeatable:e.target.checked}))}/>Allow repeat payments</label><label className="vop-checkbox"><input type="checkbox" checked={draft.active} onChange={e=>setDraft(v=>({...v,active:e.target.checked}))}/>Active</label></div>
      <button className="btn btn-primary vop-payment-submit" onClick={()=>void saveItem()} disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:<CreditCard size={16}/>}Save payable item</button></section></div>}

    {details&&<div className="vop-payment-modal-layer"><section className="vop-payment-modal vop-transaction-details"><header><div><span>Transaction details</span><h2>{details.payment.reference}</h2></div><button onClick={()=>setDetails(null)}><X size={18}/></button></header><dl><div><dt>Payer</dt><dd>{details.payment.payerName||details.payment.payerEmail}</dd></div><div><dt>Item</dt><dd>{details.payment.description}</dd></div><div><dt>Amount</dt><dd>{details.payment.currency} {details.payment.amountDecimal}</dd></div><div><dt>Status</dt><dd>{paymentStatusLabel(details.payment.status as never)}</dd></div><div><dt>Provider</dt><dd>{details.payment.provider}</dd></div><div><dt>Provider reference</dt><dd>{details.payment.providerReference||'Pending'}</dd></div><div><dt>Webhook</dt><dd>{details.payment.webhookStatus}</dd></div><div><dt>Reconciliation</dt><dd>{details.payment.reconciliationStatus}</dd></div><div><dt>Fulfilment</dt><dd>{details.payment.fulfilmentStatus}</dd></div></dl>
      <h3>Audit history</h3><div className="vop-payment-audit">{details.audit.map((entry,index)=><div key={String(entry.id||index)}><strong>{String(entry.action||'Payment update').replaceAll('.',' ')}</strong><span>{entry.createdAt?new Date(String(entry.createdAt)).toLocaleString():'Recorded'}</span></div>)}</div>
      <button className="btn btn-outline vop-payment-submit" onClick={()=>void reconcile(details.payment.id)} disabled={busy}><RefreshCw size={15}/>Verify with provider</button></section></div>}
  </div>;
};

export default PaymentManagement;
