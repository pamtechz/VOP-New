import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, CreditCard, Download, LoaderCircle, RefreshCw, Smartphone, WalletCards, XCircle } from 'lucide-react';
import type { User } from '../types';
import type { PayableItem, PaymentMethod } from '../../shared/payments';
import { paymentMethodLabel, paymentStatusLabel } from '../../shared/payments';
import {
  getPaymentStatus, loadLencoCheckoutScript, loadPaymentCatalog, loadPaymentHistory,
  loadPaymentReceipt, startPaymentCheckout, verifyPayment,
  type ClientPayment, type PaymentProviderDescriptor,
} from '../services/payments';
import './payments.css';

interface Props{currentUser:User;onBack:()=>void}

type LencoApi={getPaid:(options:Record<string,unknown>)=>void};

function statusTone(status:string){
  if(status==='paid'||status==='refunded')return 'success';
  if(['failed','cancelled','expired'].includes(status))return 'danger';
  if(['pending','processing','requires_action','initiated'].includes(status))return 'warning';
  return 'neutral';
}
function methodIcon(method:PaymentMethod){
  return method==='card'?<CreditCard size={20}/>:<Smartphone size={20}/>;
}
function friendlyStatus(payment:ClientPayment){
  if(payment.status==='paid'&&payment.fulfilmentStatus!=='fulfilled')return 'Paid — activating access';
  if(payment.status==='requires_action')return payment.paymentMethod==='card'?'Complete payment verification':'Approve the request on your phone';
  if(payment.status==='processing'||payment.status==='pending')return 'Payment confirmation pending';
  return paymentStatusLabel(payment.status as never);
}

const PaymentsPage:React.FC<Props>=({currentUser,onBack})=>{
  const [items,setItems]=useState<PayableItem[]>([]);
  const [providers,setProviders]=useState<PaymentProviderDescriptor[]>([]);
  const [history,setHistory]=useState<ClientPayment[]>([]);
  const [selected,setSelected]=useState<PayableItem|null>(null);
  const [providerKey,setProviderKey]=useState('lenco');
  const [method,setMethod]=useState<PaymentMethod>('airtel_money');
  const [phone,setPhone]=useState(currentUser.phoneNumber||'');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [receipt,setReceipt]=useState<Record<string,unknown>|null>(null);
  const [checkoutReference,setCheckoutReference]=useState('');
  const [checkoutStatus,setCheckoutStatus]=useState('Ready');

  const availableProviders=useMemo(()=>{
    if(!selected)return [] as PaymentProviderDescriptor[];
    const allowed=new Set(selected.allowedProviders||[]);
    return providers.filter(provider=>provider.configured&&provider.enabled&&(allowed.size===0||allowed.has(provider.key)));
  },[selected,providers]);
  const selectedProvider=useMemo(
    ()=>availableProviders.find(provider=>provider.key===providerKey)||availableProviders[0]||null,
    [availableProviders,providerKey],
  );
  const availableMethods=useMemo(()=>{
    if(!selected||!selectedProvider)return [] as PaymentMethod[];
    const allowed=new Set(selected.allowedMethods||[]);
    return (selectedProvider.methods||[]).filter(value=>allowed.size===0||allowed.has(value));
  },[selected,selectedProvider]);

  const refresh=async()=>{
    setLoading(true);setError('');
    try{
      const [catalog,payments]=await Promise.all([loadPaymentCatalog(),loadPaymentHistory()]);
      setItems(catalog.items);setProviders(catalog.providers);setHistory(payments.items);
    }catch(reason){setError(reason instanceof Error?reason.message:'Payments could not be loaded.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void refresh();},[]);

  useEffect(()=>{
    if(!selected)return;
    const firstProvider=availableProviders[0];
    if(firstProvider&&!availableProviders.some(provider=>provider.key===providerKey))setProviderKey(firstProvider.key);
  },[selected,availableProviders,providerKey]);

  useEffect(()=>{
    if(!selected)return;
    const preferred=(selected.allowedMethods||[]).find(value=>availableMethods.includes(value));
    if(preferred)setMethod(preferred);
    else if(availableMethods[0])setMethod(availableMethods[0]);
  },[selected,availableMethods]);

  const poll=async(reference:string)=>{
    for(let index=0;index<10;index++){
      await new Promise(resolve=>setTimeout(resolve,4500));
      try{
        const result=await getPaymentStatus(reference);
        if(['paid','failed','cancelled','expired'].includes(result.payment.status)){
          await refresh();
          setMessage(result.payment.status==='paid'?'Payment verified and access activated.':'Payment ended with status: '+friendlyStatus(result.payment));
          return;
        }
      }catch{/* Reconciliation remains authoritative if the browser loses connectivity. */}
    }
    setMessage('Payment is still being confirmed. You can close this page; VOP will continue reconciling it securely.');
    await refresh();
  };

  const pay=async()=>{
    if(!selected||!selectedProvider)return;
    if(method!=='card'&&!phone.trim()){setError('Enter the mobile money phone number.');return;}
    setBusy(true);setError('');setMessage('');
    try{
      const result=await startPaymentCheckout({
        payableItemId:selected.id,provider:selectedProvider.key,paymentMethod:method,
        phone:method==='card'?undefined:phone.trim(),
        firstName:(currentUser.displayName||'').trim().split(/\s+/)[0]||undefined,
        lastName:(currentUser.displayName||'').trim().split(/\s+/).slice(1).join(' ')||undefined,
      });
      const payment=result.payment;
      setCheckoutReference(payment.reference);
      setCheckoutStatus(friendlyStatus(payment));
      if(payment.status==='paid'){
        setMessage('This item is already paid. Your access is active.');
        setSelected(null);await refresh();return;
      }
      if(result.checkout?.mode==='inline'){
        if(selectedProvider.key!=='lenco')throw new Error('This provider checkout mode is not supported by the current client.');
        if(!result.checkout.scriptUrl||!result.checkout.publicKey)throw new Error('The secure card checkout is not available.');
        await loadLencoCheckoutScript(result.checkout.scriptUrl);
        const api=(window as unknown as {LencoPay?:LencoApi}).LencoPay;
        if(!api)throw new Error('The secure payment window did not initialize.');
        api.getPaid({
          key:result.checkout.publicKey,
          reference:payment.reference,
          email:currentUser.email,
          amount:Number(payment.amountDecimal),
          currency:payment.currency,
          channels:result.checkout.channels||['card'],
          label:selected.name,
          customer:{
            firstName:(currentUser.displayName||'').trim().split(/\s+/)[0]||'VOP',
            lastName:(currentUser.displayName||'').trim().split(/\s+/).slice(1).join(' ')||'Learner',
            phone:phone.trim()||undefined,
          },
          onSuccess:async()=>{
            setBusy(true);
            try{
              const verified=await verifyPayment(payment.reference);
              setMessage(verified.payment.status==='paid'?'Payment verified and access activated.':'Payment received and is being confirmed.');
              if(verified.payment.status!=='paid')void poll(payment.reference);
              setSelected(null);await refresh();
            }catch(reason){setError(reason instanceof Error?reason.message:'Payment verification could not be completed.');}
            finally{setBusy(false);}
          },
          onClose:()=>{setMessage('Payment window closed. No access is granted unless the server verifies payment.');void refresh();},
          onConfirmationPending:()=>{setMessage('Your payment is awaiting provider confirmation. VOP will verify it automatically.');void poll(payment.reference);},
        });
        return;
      }
      setMessage(payment.status==='requires_action'
        ?'Payment request sent. Approve it on your mobile phone; VOP will activate access only after verification.'
        :'Payment request created. VOP is waiting for provider confirmation.');
      setSelected(null);void poll(payment.reference);await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:'Payment could not be started.');}
    finally{setBusy(false);}
  };

  const showReceipt=async(paymentId:string)=>{
    setError('');
    try{const result=await loadPaymentReceipt(paymentId);setReceipt(result.item);}
    catch(reason){setError(reason instanceof Error?reason.message:'Receipt is not available yet.');}
  };

  return <main className="vop-payments-page">
    <header className="vop-payments-head">
      <button type="button" className="vop-back-button" onClick={onBack}><ArrowLeft size={18}/>Back</button>
      <div><span>Secure VOP payments</span><h1>Payments & receipts</h1><p>Pay configured VOP charges and track server-verified transactions.</p></div>
      <button type="button" className="btn btn-outline" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={16}/>Refresh</button>
    </header>

    {error&&<div className="vop-payment-alert danger"><XCircle size={18}/><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss">×</button></div>}
    {message&&<div className="vop-payment-alert success"><CheckCircle2 size={18}/><span>{message}</span><button onClick={()=>setMessage('')} aria-label="Dismiss">×</button></div>}

    <section className="vop-payment-section">
      <div className="vop-payment-section-title"><div><span>Available charges</span><h2>Payable items</h2></div><WalletCards size={24}/></div>
      {loading?<div className="vop-payment-empty"><LoaderCircle className="spin" size={28}/>Loading secure payment options…</div>:
      items.length?<div className="vop-payable-grid">{items.map(item=><article key={item.id} className="vop-payable-card">
        <div><span className="vop-payment-type">{item.itemType.replaceAll('_',' ')}</span><h3>{item.name}</h3><p>{item.description||'Configured VOP charge'}</p></div>
        <div className="vop-payable-footer"><strong>{item.currency} {item.amountDecimal}</strong>
          <button type="button" className="btn btn-primary" onClick={()=>{setSelected(item);setProviderKey((item.allowedProviders||[])[0]||'lenco');setCheckoutReference('');setCheckoutStatus('Ready');}}>Pay now</button></div>
      </article>)}</div>:<div className="vop-payment-empty">There are no payable items available to your account.</div>}
    </section>

    <section className="vop-payment-section">
      <div className="vop-payment-section-title"><div><span>Your records</span><h2>Payment history</h2></div><Clock3 size={24}/></div>
      {history.length?<div className="vop-payment-history">{history.map(payment=><article key={payment.id}>
        <div className="vop-payment-history-icon">{methodIcon(payment.paymentMethod)}</div>
        <div className="vop-payment-history-copy"><strong>{payment.description}</strong><span>{payment.reference} · {payment.provider==='lenco'?'Lenco':payment.provider}</span><small>{payment.createdAt?new Date(payment.createdAt).toLocaleString():'Date pending'}</small></div>
        <div className="vop-payment-history-amount"><strong>{payment.currency} {payment.amountDecimal}</strong><span className={'vop-payment-status '+statusTone(payment.status)}>{friendlyStatus(payment)}</span></div>
        {payment.receiptId&&<button type="button" className="vop-payment-receipt-button" onClick={()=>void showReceipt(payment.id)}><Download size={15}/>Receipt</button>}
      </article>)}</div>:<div className="vop-payment-empty">No payment transactions have been recorded for your account yet.</div>}
    </section>

    {selected&&<div className="vop-payment-modal-layer" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setSelected(null)}}>
      <section className="vop-payment-modal" role="dialog" aria-modal="true" aria-labelledby="vop-payment-title">
        <header><div><span>Secure checkout</span><h2 id="vop-payment-title">{selected.name}</h2></div><button onClick={()=>setSelected(null)} disabled={busy} aria-label="Close">×</button></header>
        <dl><div><dt>Amount</dt><dd>{selected.currency} {selected.amountDecimal}</dd></div><div><dt>Payer</dt><dd>{currentUser.displayName||currentUser.email}</dd></div>{selected.organizationName&&<div><dt>Organization</dt><dd>{selected.organizationName}</dd></div>}<div><dt>Provider</dt><dd>{selectedProvider?selectedProvider.key.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()):'Unavailable'}</dd></div>{checkoutReference&&<div><dt>Payment reference</dt><dd>{checkoutReference}</dd></div>}<div><dt>Status</dt><dd>{checkoutStatus}</dd></div></dl>
        {!selectedProvider?<div className="vop-payment-alert danger"><XCircle size={17}/>No configured payment provider is available for this charge.</div>:<>
          {availableProviders.length>1&&<fieldset><legend>Payment provider</legend><div className="vop-payment-methods">
            {availableProviders.map(provider=><button type="button" key={provider.key} className={selectedProvider.key===provider.key?'active':''} onClick={()=>setProviderKey(provider.key)} disabled={busy}><WalletCards size={20}/><span>{provider.key.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</span></button>)}
          </div></fieldset>}
          <fieldset><legend>Payment method</legend><div className="vop-payment-methods">
            {availableMethods.map(value=><button type="button" key={value} className={method===value?'active':''} onClick={()=>setMethod(value)} disabled={busy}>{methodIcon(value)}<span>{paymentMethodLabel(value)}</span></button>)}
          </div></fieldset>
          {method!=='card'&&<label className="vop-payment-phone"><span>Mobile money number</span><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="097..." inputMode="tel" disabled={busy}/><small>You will approve the request on this phone.</small></label>}
          <div className="vop-payment-security"><CreditCard size={18}/><p>VOP never marks a payment successful from the browser. Access is activated only after server verification with the payment provider.</p></div>
          <button type="button" className="btn btn-primary vop-payment-submit" onClick={()=>void pay()} disabled={busy||!availableMethods.length}>{busy?<><LoaderCircle className="spin" size={17}/>Starting secure payment…</>:<>Pay {selected.currency} {selected.amountDecimal}</>}</button>
        </>}
      </section>
    </div>}

    {receipt&&<div className="vop-payment-modal-layer" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setReceipt(null)}}>
      <section className="vop-payment-modal vop-receipt-modal" role="dialog" aria-modal="true">
        <header><div><span>Official VOP confirmation</span><h2>Payment receipt</h2></div><button onClick={()=>setReceipt(null)} aria-label="Close">×</button></header>
        <div className="vop-receipt-number">{String(receipt.receiptNumber||'')}</div>
        <dl>
          <div><dt>Paid by</dt><dd>{String(receipt.payerName||currentUser.displayName||currentUser.email)}</dd></div>
          <div><dt>Amount</dt><dd>{String(receipt.currency||'')} {String(receipt.amountDecimal||'')}</dd></div>
          <div><dt>Reference</dt><dd>{String(receipt.reference||'')}</dd></div>
          <div><dt>Provider</dt><dd>{String(receipt.provider||'').replace(/\b\w/g,c=>c.toUpperCase())}</dd></div>
          <div><dt>Paid</dt><dd>{receipt.paidAt?new Date(String(receipt.paidAt)).toLocaleString():'Recorded'}</dd></div>
        </dl>
      </section>
    </div>}
  </main>;
};

export default PaymentsPage;
