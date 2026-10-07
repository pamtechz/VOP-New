import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, Clock3, CreditCard, Download, LoaderCircle,
  Lock, RefreshCw, Shield, ShieldCheck, Smartphone, WalletCards, XCircle,
} from 'lucide-react';
import type { User } from '../types';
import type { PayableItem, PaymentMethod } from '../../shared/payments';
import { paymentMethodLabel, paymentStatusLabel } from '../../shared/payments';
import {
  getPaymentStatus, loadLencoCheckoutScript, loadPaymentCatalog, loadPaymentHistory,
  loadPaymentReceipt, startPaymentCheckout, verifyPayment,
  type ClientPayment,
} from '../services/payments';
import { ShimmerCards, ShimmerList } from '../components/layout/Shimmer';
import './payments.css';

interface Props{currentUser:User;onBack?:()=>void;embedded?:boolean}

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
  if(payment.status==='requires_action')return payment.paymentMethod==='card'?'3D-Secure verification required':'Approve the request on your phone';
  if(payment.status==='processing'||payment.status==='pending')return 'Payment confirmation pending';
  return paymentStatusLabel(payment.status as never);
}
function singleCheckoutQuote(item:PayableItem){
  const quotes=(item.allowedMethods||[])
    .map(method=>item.methodQuotes?.[method])
    .filter((quote):quote is NonNullable<typeof quote>=>Boolean(quote));
  if(!quotes.length)return null;
  const first=quotes[0];
  return quotes.every(quote=>quote.currency===first.currency&&quote.amountDecimal===first.amountDecimal)?first:null;
}

const PaymentsPage:React.FC<Props>=({currentUser,onBack,embedded=false})=>{
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
  const [threeDSecureModal,setThreeDSecureModal]=useState<{
    reference:string;
    amount:string;
    currency:string;
    name:string;
    status:'challenge_pending'|'validating'|'authenticated'|'failed';
    summary:string;
  }|null>(null);

  const availableMethods=useMemo(
    ()=>selected?(selected.allowedMethods||[]).filter(value=>value!=='manual'&&value!=='bank'):[] as PaymentMethod[],
    [selected],
  );
  const subscriptionItems=useMemo(()=>items.filter(item=>item.itemType==='organization_subscription'),[items]);
  const otherItems=useMemo(()=>items.filter(item=>item.itemType!=='organization_subscription'),[items]);
  const selectedQuote=useMemo(()=>selected?.methodQuotes?.[method]||null,[selected,method]);

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
        setThreeDSecureModal({
          reference:payment.reference,
          amount:payment.amountDecimal,
          currency:payment.currency,
          name:selected.name,
          status:'challenge_pending',
          summary:'Issuing bank 3D-Secure 2.0 verification is active. Complete the bank prompt in the secure checkout window.',
        });
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
            setThreeDSecureModal(prev=>prev?{
              ...prev,
              status:'validating',
              summary:'Bank authentication callback received. Validating 3D-Secure certification with server...',
            }:null);
            try{
              const verified=await verifyPayment(payment.reference);
              if(verified.payment.status==='paid'){
                setThreeDSecureModal(prev=>prev?{
                  ...prev,
                  status:'authenticated',
                  summary:'3D-Secure 2.0 Strong Customer Authentication verified! Fraud liability shifted to issuing bank and access activated.',
                }:null);
                setMessage('Payment verified and access activated via 3D-Secure 2.0.');
              }else{
                setMessage('Payment received and is being confirmed.');
                void poll(payment.reference);
              }
              setSelected(null);await refresh();
            }catch(reason){
              setError(reason instanceof Error?reason.message:'Payment verification could not be completed.');
              setThreeDSecureModal(prev=>prev?{
                ...prev,
                status:'failed',
                summary:'3D-Secure bank verification could not be completed.',
              }:null);
            }finally{setBusy(false);}
          },
          onClose:()=>{
            setThreeDSecureModal(prev=>(prev&&prev.status!=='authenticated')?{
              ...prev,
              status:'challenge_pending',
              summary:'Checkout window closed. If you completed your bank verification prompt, click "Check 3DS Verification Status" below.',
            }:prev);
            void refresh();
          },
          onConfirmationPending:()=>{
            setThreeDSecureModal(prev=>prev?{
              ...prev,
              status:'challenge_pending',
              summary:'Your issuing bank is verifying your 3D-Secure authorization. Confirming authentication automatically...',
            }:null);
            void poll(payment.reference);
          },
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

  const validate3DSManual=async(ref:string)=>{
    setBusy(true);
    try{
      const verified=await verifyPayment(ref);
      if(verified.payment.status==='paid'){
        setThreeDSecureModal(prev=>prev?{
          ...prev,
          status:'authenticated',
          summary:'3D-Secure 2.0 Strong Customer Authentication verified! Bank liability shift certified and access activated.',
        }:null);
        setMessage('3D-Secure payment verified and access activated.');
      }else{
        setMessage('Bank authorization is still processing. Please allow a few moments.');
      }
      await refresh();
    }catch(e){
      setError(e instanceof Error?e.message:'3D-Secure verification check failed.');
    }finally{
      setBusy(false);
    }
  };

  const showReceipt=async(paymentId:string)=>{
    setError('');
    try{const result=await loadPaymentReceipt(paymentId);setReceipt(result.item);}
    catch(reason){setError(reason instanceof Error?reason.message:'Receipt is not available yet.');}
  };

  return <div className={'vop-payments-page'+(embedded?' embedded':'')}>
    <header className="vop-payments-head">
      {!embedded&&onBack&&<button type="button" className="vop-back-button" onClick={onBack}><ArrowLeft size={18}/>Back</button>}
      <div><span>Secure VOP payments</span><h1>Payments & Billing</h1><p>Pay available charges, manage applicable subscriptions and keep server-verified receipts in one place.</p></div>
      <button type="button" className="btn btn-outline" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={16}/>Refresh</button>
    </header>

    {error&&<div className="vop-payment-alert danger"><XCircle size={18}/><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss">×</button></div>}
    {message&&<div className="vop-payment-alert success"><CheckCircle2 size={18}/><span>{message}</span><button onClick={()=>setMessage('')} aria-label="Dismiss">×</button></div>}

    {subscriptionItems.length>0&&<section className="vop-payment-section">
      <div className="vop-payment-section-title"><div><span>Organization billing</span><h2>Subscription packages</h2></div><WalletCards size={24}/></div>
      <div className={'vop-payable-grid'+(loading?' vop-refreshing vop-shimmer-overlay':'')}>{subscriptionItems.map(item=><article key={item.id} className="vop-payable-card">
        <div><span className="vop-payment-type">Organization subscription</span><h3>{item.name}</h3><p>{item.description||'VOP organization subscription package'}</p>{item.pricing?.baseAmountDecimal&&item.currency!=='USD'&&<small>Base price: USD {item.pricing.baseAmountDecimal} · billed in {item.currency} for this organization</small>}{item.currency==='USD'&&<small>International billing · canonical USD price</small>}</div>
        <div className="vop-payable-footer">{singleCheckoutQuote(item)?<strong>{singleCheckoutQuote(item)?.currency} {singleCheckoutQuote(item)?.amountDecimal}</strong>:<strong>{item.currency} {item.amountDecimal}</strong>}
          <button type="button" className="btn btn-primary" onClick={()=>{setSelected(item);setCheckoutReference('');setCheckoutStatus('Ready');}}>Choose package</button></div>
      </article>)}</div>
    </section>}

    <section className="vop-payment-section">
      <div className="vop-payment-section-title"><div><span>Available payments</span><h2>Charges & registrations</h2></div><WalletCards size={24}/></div>
      {loading&&items.length===0?<ShimmerCards cards={3} label="Loading secure payment options"/>:
      otherItems.length?<div className={'vop-payable-grid'+(loading?' vop-refreshing vop-shimmer-overlay':'')}>{otherItems.map(item=><article key={item.id} className="vop-payable-card">
        <div><span className="vop-payment-type">{item.itemType.replaceAll('_',' ')}</span><h3>{item.name}</h3><p>{item.description||'Available VOP payment'}</p></div>
        <div className="vop-payable-footer">{singleCheckoutQuote(item)?<strong>{singleCheckoutQuote(item)?.currency} {singleCheckoutQuote(item)?.amountDecimal}</strong>:<strong>{item.currency} {item.amountDecimal}</strong>}
          <button type="button" className="btn btn-primary" onClick={()=>{setSelected(item);setCheckoutReference('');setCheckoutStatus('Ready');}}>Pay now</button></div>
      </article>)}</div>:<div className="vop-payment-empty">{subscriptionItems.length?'No other charges are currently available.':'There are no payment options available to your account.'}</div>}
    </section>

    <section className="vop-payment-section">
      <div className="vop-payment-section-title"><div><span>Your records</span><h2>Payment history</h2></div><Clock3 size={24}/></div>
      {loading&&history.length===0?<ShimmerList rows={4} compact label="Loading payment history"/>:history.length?<div className={'vop-payment-history'+(loading?' vop-refreshing vop-shimmer-overlay':'')}>{history.map(payment=><article key={payment.id}>
        <div className="vop-payment-history-icon">{methodIcon(payment.paymentMethod)}</div>
        <div className="vop-payment-history-copy"><strong>{payment.description}</strong><span>{payment.reference}</span><small>{payment.createdAt?new Date(payment.createdAt).toLocaleString():'Date pending'}</small></div>
        <div className="vop-payment-history-amount">
          <strong>{payment.currency} {payment.amountDecimal}</strong>
          <span className={'vop-payment-status '+statusTone(payment.status)}>{friendlyStatus(payment)}</span>
          {payment.paymentMethod==='card'&&<small className="vop-3ds-badge"><ShieldCheck size={11}/> {payment.threeDSecure?.status==='authenticated'||payment.status==='paid'?'3DS Certified':'3DS Enforced'}</small>}
        </div>
        {payment.receiptId&&<button type="button" className="vop-payment-receipt-button" onClick={()=>void showReceipt(payment.id)}><Download size={15}/>Receipt</button>}
      </article>)}</div>:<div className="vop-payment-empty">No payment transactions have been recorded for your account yet.</div>}
    </section>

    {selected&&<div className="vop-payment-modal-layer" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setSelected(null)}}>
      <section className="vop-payment-modal" role="dialog" aria-modal="true" aria-labelledby="vop-payment-title">
        <header><div><span>Secure checkout</span><h2 id="vop-payment-title">{selected.name}</h2></div><button onClick={()=>setSelected(null)} disabled={busy} aria-label="Close">×</button></header>
        <dl><div><dt>Amount to pay</dt><dd>{selectedQuote?.currency||selected.currency} {selectedQuote?.amountDecimal||selected.amountDecimal}</dd></div>{selectedQuote&&selectedQuote.currency!==selectedQuote.baseCurrency&&<><div><dt>Original price</dt><dd>{selectedQuote.baseCurrency} {selectedQuote.baseAmountDecimal}</dd></div><div><dt>Today's exchange rate</dt><dd>1 {selectedQuote.baseCurrency} = {Number(selectedQuote.exchangeRate).toFixed(4)} {selectedQuote.currency}</dd></div></>}{selected.itemType==='organization_subscription'&&selected.pricing?.baseAmountDecimal&&selected.currency!=='USD'&&!selectedQuote?.baseAmountDecimal&&<div><dt>Canonical price</dt><dd>USD {selected.pricing.baseAmountDecimal}</dd></div>}<div><dt>Payer</dt><dd>{currentUser.displayName||currentUser.email}</dd></div>{selected.organizationName&&<div><dt>Organization</dt><dd>{selected.organizationName}</dd></div>}{checkoutReference&&<div><dt>Payment reference</dt><dd>{checkoutReference}</dd></div>}<div><dt>Status</dt><dd>{checkoutStatus}</dd></div></dl>
        {!availableMethods.length?<div className="vop-payment-alert danger"><XCircle size={17}/>This payment option is temporarily unavailable. Refresh to load the currently configured methods.</div>:<>
          <fieldset><legend>Payment method</legend><div className="vop-payment-methods">
            {availableMethods.map(value=><button type="button" key={value} className={method===value?'active':''} onClick={()=>setMethod(value)} disabled={busy}>{methodIcon(value)}<span>{paymentMethodLabel(value)}</span></button>)}
          </div></fieldset>
          {method!=='card'&&<label className="vop-payment-phone"><span>Mobile money number</span><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="097..." inputMode="tel" disabled={busy}/><small>You will approve the request on this phone.</small></label>}
          {method==='card'&&(
            <div className="vop-payment-pci-shield">
              <div className="vop-pci-shield-header">
                <ShieldCheck size={18} className="vop-shield-icon"/>
                <div>
                  <strong>3D-Secure 2.0 & PCI-DSS Compliant Gateway</strong>
                  <span>Bank of Zambia & Global Card Schemes (Visa Secure, Mastercard Identity Check)</span>
                </div>
              </div>
              <p>
                Card payments are processed directly via PCI-DSS Level 1 certified infrastructure. VOP servers never receive or store card numbers or CVV. You will authenticate this transaction via 3D-Secure 2.0 with your card issuer.
              </p>
            </div>
          )}
          <div className="vop-payment-security"><CreditCard size={18}/><p>{selectedQuote&&selectedQuote.currency!==selectedQuote.baseCurrency?'The amount above is a server-issued daily exchange-rate quote for the selected payment method. ':''}Only configured payment methods are shown. VOP recalculates the quote server-side when checkout starts and activates access only after independent payment verification.</p></div>
          <button type="button" className="btn btn-primary vop-payment-submit" onClick={()=>void pay()} disabled={busy||!availableMethods.length}>{busy?<><LoaderCircle className="spin" size={17}/>Starting secure payment…</>:<>Pay {selectedQuote?.currency||selected.currency} {selectedQuote?.amountDecimal||selected.amountDecimal}</>}</button>
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
          <div><dt>Method</dt><dd>{paymentMethodLabel(String(receipt.paymentMethod||'') as PaymentMethod)}</dd></div>
          <div><dt>Paid</dt><dd>{receipt.paidAt?new Date(String(receipt.paidAt)).toLocaleString():'Recorded'}</dd></div>
          {receipt.paymentMethod==='card'&&(
            <>
              <div><dt>3D-Secure</dt><dd className="vop-receipt-3ds-tag"><ShieldCheck size={13}/> Certified (EMV 3DS 2.0 · Liability Shifted)</dd></div>
              <div><dt>Card Data Security</dt><dd>PCI-DSS v4.0 SAQ-A Compliant (Zero CHD Stored)</dd></div>
              <div><dt>Jurisdiction</dt><dd>Bank of Zambia (BoZ) National Payment Systems Compliant</dd></div>
            </>
          )}
        </dl>
      </section>
    </div>}

    {threeDSecureModal&&(
      <div className="vop-payment-modal-layer" role="presentation">
        <section className="vop-payment-modal vop-3ds-validation-modal" role="dialog" aria-modal="true">
          <header>
            <div className="vop-3ds-modal-title">
              <ShieldCheck size={26} className="vop-3ds-shield-large"/>
              <div>
                <span>Bank of Zambia & Global Card Schemes</span>
                <h2>3D-Secure Customer Validation</h2>
              </div>
            </div>
            <button onClick={()=>setThreeDSecureModal(null)} disabled={busy&&threeDSecureModal.status==='validating'} aria-label="Close">×</button>
          </header>

          <div className={`vop-3ds-status-banner ${threeDSecureModal.status}`}>
            {threeDSecureModal.status==='authenticated'?(
              <CheckCircle2 size={26} className="vop-3ds-status-icon success"/>
            ):threeDSecureModal.status==='failed'?(
              <XCircle size={26} className="vop-3ds-status-icon error"/>
            ):(
              <LoaderCircle size={26} className="spin vop-3ds-status-icon pending"/>
            )}
            <div>
              <strong>
                {threeDSecureModal.status==='authenticated'
                  ?'Transaction Certified & Identity Validated'
                  :threeDSecureModal.status==='validating'
                    ?'Validating 3D-Secure Response'
                    :threeDSecureModal.status==='failed'
                      ?'3D-Secure Validation Incomplete'
                      :'Customer 3D-Secure Verification Active'}
              </strong>
              <p>{threeDSecureModal.summary}</p>
            </div>
          </div>

          <dl className="vop-3ds-details">
            <div><dt>Payment Reference</dt><dd>{threeDSecureModal.reference}</dd></div>
            <div><dt>Amount</dt><dd>{threeDSecureModal.currency} {threeDSecureModal.amount}</dd></div>
            <div><dt>Security Protocol</dt><dd>EMV 3-D Secure 2.2.0 (Visa Secure & Mastercard Identity Check)</dd></div>
            <div><dt>Fraud Protection</dt><dd>{threeDSecureModal.status==='authenticated'?'Fraud Liability Shifted to Card Issuer':'Bank Authentication Required'}</dd></div>
            <div><dt>Data Privacy</dt><dd>PCI-DSS v4.0 SAQ-A (Zero Server Card Storage)</dd></div>
          </dl>

          <div className="vop-3ds-actions">
            {threeDSecureModal.status==='authenticated'?(
              <button className="btn btn-primary" type="button" onClick={()=>setThreeDSecureModal(null)}>Done</button>
            ):(
              <>
                <button className="btn btn-primary" type="button" disabled={busy} onClick={()=>void validate3DSManual(threeDSecureModal.reference)}>
                  {busy?<LoaderCircle size={16} className="spin"/>:<RefreshCw size={16}/>}
                  Check 3DS Verification Status
                </button>
                <button className="btn btn-outline" type="button" onClick={()=>setThreeDSecureModal(null)}>Dismiss</button>
              </>
            )}
          </div>
        </section>
      </div>
    )}
  </div>;
};

export default PaymentsPage;
