import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, CreditCard, Download, LoaderCircle, RefreshCw, Smartphone, WalletCards, XCircle } from 'lucide-react';
import type { User } from '../types';
import type { PayableItem, PaymentMethod } from '../../shared/payments';
import { paymentMethodLabel, paymentStatusLabel } from '../../shared/payments';
import {
  getPaymentStatus, loadLencoCheckoutScript, loadPaymentCatalog, loadPaymentHistory,
  loadPaymentReceipt, startPaymentCheckout, verifyPayment,
  type ClientPayment,
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
  const [history,setHistory]=useState<ClientPayment[]>([]);
  const [selected,setSelected]=useState<PayableItem|null>(null);
  const [method,setMethod]=useState<PaymentMethod>('airtel_money');
  const [phone,setPhone]=useState(currentUser.phoneNumber||'');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [receipt,setReceipt]=useState<Record<string,unknown>|null>(null);
  const [checkoutReference,setCheckoutReference]=useState('');
  const [checkoutStatus,setCheckoutStatus]=useState('Ready');

  const availableMethods=useMemo(
    ()=>selected?(selected.allowedMethods||[]).filter(value=>value!=='manual'&&value!=='bank'):[] as PaymentMethod[],
    [selected],
  );
  const subscriptionItems=useMemo(()=>items.filter(item=>item.itemType==='organization_subscription'),[items]);
  const otherItems=useMemo(()=>items.filter(item=>item.itemType!=='organization_subscription'),[items]);

  const refresh=async()=>{
    setLoading(true);setError('');
    try{
      const [catalog,payments]=await Promise.all([loadPaymentCatalog(),loadPaymentHistory()]);
      setItems(catalog.items);setHistory(payments.items);
      try{
        const focusedPlan=sessionStorage.getItem('vop-subscription-checkout-plan')||'';
        if(focusedPlan){
          sessionStorage.removeItem('vop-subscription-checkout-plan');
          const focused=catalog.items.find(item=>item.itemType==='organization_subscription'&&item.itemId===focusedPlan);
          if(focused)setSelected(focused);
        }
      }catch{/* storage may be unavailable */}
    }catch(reason){setError(reason instanceof Error?reason.message:'Payments could not be loaded.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void refresh();},[]);

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
      }catch{/* Server-side payment confirmation remains authoritative if the browser loses connectivity. */}
    }
    setMessage('Payment is still being confirmed. You can close this page; VOP will continue confirming it securely.');
    await refresh();
  };

  const pay=async()=>{
    if(!selected)return;
    if(method!=='card'&&!phone.trim()){setError('Enter the mobile money phone number.');return;}
    setBusy(true);setError('');setMessage('');
    try{
      const result=await startPaymentCheckout({
        payableItemId:selected.id,paymentMethod:method,
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
          onConfirmationPending:()=>{setMessage('Your payment is awaiting confirmation. VOP will verify it automatically.');void poll(payment.reference);},
        });
        return;
      }
      setMessage(payment.status==='requires_action'
        ?'Payment request sent. Approve it on your mobile phone; VOP will activate access only after verification.'
        :'Payment request created. VOP is waiting for secure payment confirmation.');
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

    {subscriptionItems.length>0&&<section className="vop-payment-section">
      <div className="vop-payment-section-title"><div><span>Organization billing</span><h2>Subscription packages</h2></div><WalletCards size={24}/></div>
      <div className="vop-payable-grid">{subscriptionItems.map(item=><article key={item.id} className="vop-payable-card">
        <div><span className="vop-payment-type">Organization subscription</span><h3>{item.name}</h3><p>{item.description||'VOP organization subscription package'}</p>{item.pricing?.baseAmountDecimal&&item.currency!=='USD'&&<small>Base price: USD {item.pricing.baseAmountDecimal} · billed in {item.currency} for this organization</small>}{item.currency==='USD'&&<small>International billing · canonical USD price</small>}</div>
        <div className="vop-payable-footer"><strong>{item.currency} {item.amountDecimal}</strong>
          <button type="button" className="btn btn-primary" onClick={()=>{setSelected(item);setCheckoutReference('');setCheckoutStatus('Ready');}}>Choose package</button></div>
      </article>)}</div>
    </section>}

    <section className="vop-payment-section">
      <div className="vop-payment-section-title"><div><span>Available payments</span><h2>Charges & registrations</h2></div><WalletCards size={24}/></div>
      {loading?<div className="vop-payment-empty"><LoaderCircle className="spin" size={28}/>Loading secure payment options…</div>:
      otherItems.length?<div className="vop-payable-grid">{otherItems.map(item=><article key={item.id} className="vop-payable-card">
        <div><span className="vop-payment-type">{item.itemType.replaceAll('_',' ')}</span><h3>{item.name}</h3><p>{item.description||'Available VOP payment'}</p></div>
        <div className="vop-payable-footer"><strong>{item.currency} {item.amountDecimal}</strong>
          <button type="button" className="btn btn-primary" onClick={()=>{setSelected(item);setCheckoutReference('');setCheckoutStatus('Ready');}}>Pay now</button></div>
      </article>)}</div>:<div className="vop-payment-empty">{subscriptionItems.length?'No other charges are currently available.':'There are no payment options available to your account.'}</div>}
    </section>

    <section className="vop-payment-section">
      <div className="vop-payment-section-title"><div><span>Your records</span><h2>Payment history</h2></div><Clock3 size={24}/></div>
      {history.length?<div className="vop-payment-history">{history.map(payment=><article key={payment.id}>
        <div className="vop-payment-history-icon">{methodIcon(payment.paymentMethod)}</div>
        <div className="vop-payment-history-copy"><strong>{payment.description}</strong><span>{payment.reference}</span><small>{payment.createdAt?new Date(payment.createdAt).toLocaleString():'Date pending'}</small></div>
        <div className="vop-payment-history-amount"><strong>{payment.currency} {payment.amountDecimal}</strong><span className={'vop-payment-status '+statusTone(payment.status)}>{friendlyStatus(payment)}</span></div>
        {payment.receiptId&&<button type="button" className="vop-payment-receipt-button" onClick={()=>void showReceipt(payment.id)}><Download size={15}/>Receipt</button>}
      </article>)}</div>:<div className="vop-payment-empty">No payment transactions have been recorded for your account yet.</div>}
    </section>

    {selected&&<div className="vop-payment-modal-layer" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setSelected(null)}}>
      <section className="vop-payment-modal" role="dialog" aria-modal="true" aria-labelledby="vop-payment-title">
        <header><div><span>Secure checkout</span><h2 id="vop-payment-title">{selected.name}</h2></div><button onClick={()=>setSelected(null)} disabled={busy} aria-label="Close">×</button></header>
        <dl><div><dt>Amount</dt><dd>{selected.currency} {selected.amountDecimal}</dd></div>{selected.itemType==='organization_subscription'&&selected.pricing?.baseAmountDecimal&&selected.currency!=='USD'&&<div><dt>Canonical price</dt><dd>USD {selected.pricing.baseAmountDecimal}</dd></div>}{selected.itemType==='organization_subscription'&&selected.pricing?.exchangeRate&&selected.currency!=='USD'&&<div><dt>Exchange rate</dt><dd>1 USD = {Number(selected.pricing.exchangeRate).toFixed(4)} {selected.currency}</dd></div>}<div><dt>Payer</dt><dd>{currentUser.displayName||currentUser.email}</dd></div>{selected.organizationName&&<div><dt>Organization</dt><dd>{selected.organizationName}</dd></div>}{checkoutReference&&<div><dt>Payment reference</dt><dd>{checkoutReference}</dd></div>}<div><dt>Status</dt><dd>{checkoutStatus}</dd></div></dl>
        {!availableMethods.length?<div className="vop-payment-alert danger"><XCircle size={17}/>No payment method is currently available for this charge.</div>:<>
          <fieldset><legend>Payment method</legend><div className="vop-payment-methods">
            {availableMethods.map(value=><button type="button" key={value} className={method===value?'active':''} onClick={()=>setMethod(value)} disabled={busy}>{methodIcon(value)}<span>{paymentMethodLabel(value)}</span></button>)}
          </div></fieldset>
          {method!=='card'&&<label className="vop-payment-phone"><span>Mobile money number</span><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="097..." inputMode="tel" disabled={busy}/><small>You will approve the request on this phone.</small></label>}
          <div className="vop-payment-security"><CreditCard size={18}/><p>{selected.itemType==='organization_subscription'&&selected.currency!=='USD'?'The subscription has a canonical USD price. This organization is billed in ZMW using the server-issued exchange-rate quote shown above. ':selected.itemType==='organization_subscription'?'This organization is billed at the canonical USD subscription price. ':''}VOP activates access only after independent server-side payment verification.</p></div>
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
          <div><dt>Paid</dt><dd>{receipt.paidAt?new Date(String(receipt.paidAt)).toLocaleString():'Recorded'}</dd></div>
        </dl>
      </section>
    </div>}
  </main>;
};

export default PaymentsPage;
