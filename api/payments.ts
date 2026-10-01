import { getAdminDb } from '../server/tenant.js';
import { getPaymentProvider } from '../server/payments/providers.js';
import {
  adminCancelRefund, adminCompleteManualRefund, adminExportTransactions, adminListTransactions,
  adminPaymentDetails, adminProviderConfig, adminReconcile, adminRequestRefund,
  configuredPaymentStatuses, createCheckout, deletePayableItem, listPayableItems,
  listPaymentProviders, paymentContext, paymentHistory, paymentStatusForUser,
  processProviderWebhook, receiptForUser, reconcilePendingPayments, reconcilePendingRefunds,
  upsertPayableItem,
} from '../server/payments/core.js';

type Request={
  method?:string;
  url?:string;
  query?:Record<string,string|string[]|undefined>;
  headers?:Record<string,string|string[]|undefined>;
  body?:unknown;
  rawBody?:Buffer|string;
};
type Response={
  status:(code:number)=>Response;
  json:(body:unknown)=>void;
  setHeader?:(name:string,value:string)=>void;
};
function object(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function text(value:unknown){return String(value??'').trim();}
function header(req:Request,name:string){
  const value=req.headers?.[name]??req.headers?.[name.toLowerCase()];
  return Array.isArray(value)?value[0]||'':value||'';
}
function route(req:Request){
  const raw=req.query?.__vopPaymentRoute;
  const queryRoute=Array.isArray(raw)?raw[0]:raw;
  if(queryRoute)return String(queryRoute).replace(/^\/+|\/+$/g,'');
  const pathname=new URL(req.url||'/', 'http://localhost').pathname;
  return pathname.replace(/^\/api\/payments\/?/,'').replace(/^\/+|\/+$/g,'');
}
function statusFor(error:unknown){
  const message=error instanceof Error?error.message:'';
  if(/sign in|authentication/i.test(message))return 401;
  if(/permission|outside your|only super admin|authorized scope/i.test(message))return 403;
  if(/not found|does not exist/i.test(message))return 404;
  if(/too many/i.test(message))return 429;
  if(/already|duplicate|not currently available|does not require payment/i.test(message))return 409;
  return 400;
}
function safeError(error:unknown){
  const message=error instanceof Error?error.message:'Payment request failed.';
  if(/secret|token|credential|private key|authorization/i.test(message))return 'Payment provider configuration error.';
  return message.slice(0,300);
}

export default async function handler(req:Request,res:Response){
  const name=route(req);
  try{
    if(name.startsWith('webhooks/')){
      const providerKey=name.slice('webhooks/'.length).replaceAll('-','_');
      let provider;
      try{provider=getPaymentProvider(providerKey);}catch{return res.status(404).json({error:'Unknown payment callback endpoint.'});}
      if(!provider.capabilities.webhooks||!provider.parseWebhook)return res.status(404).json({error:'This provider does not use a payment callback endpoint.'});
      const allowedMethods=provider.callbackMethods||['POST'];
      if(!allowedMethods.includes((req.method||'').toUpperCase() as 'POST'|'PUT'))return res.status(405).json({error:'Method not allowed.'});
      const result=await processProviderWebhook(getAdminDb(),providerKey,req);
      return res.status(200).json({ok:true,...result});
    }

    if(name==='reconcile-cron'){
      if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
      const secret=text(process.env.CRON_SECRET);
      if(!secret||header(req,'authorization')!=='Bearer '+secret)return res.status(401).json({error:'Unauthorized.'});
      const db=getAdminDb();
      const [payments,refunds]=await Promise.all([
        reconcilePendingPayments(db,100),reconcilePendingRefunds(db,100),
      ]);
      return res.status(200).json({ok:true,summary:{payments,refunds}});
    }

    const body=object(req.body);
    const requestedOrganizationId=text(body.organizationId||req.query?.organizationId);
    const ctx=await paymentContext(req,requestedOrganizationId||undefined);

    if(name==='catalog'){
      if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
      const items=await listPayableItems(ctx,false);
      return res.status(200).json({ok:true,items});
    }
    if(name==='checkout'){
      if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
      const result=await createCheckout(ctx,body);
      return res.status(200).json({ok:true,...result});
    }
    if(name==='verify'){
      if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
      const payment=await paymentStatusForUser(ctx,body.reference,true);
      return res.status(200).json({ok:true,payment});
    }
    if(name==='status'){
      if(req.method!=='POST'&&req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
      const reference=body.reference||req.query?.reference;
      const payment=await paymentStatusForUser(ctx,reference,false);
      return res.status(200).json({ok:true,payment});
    }
    if(name==='history'){
      if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
      return res.status(200).json({ok:true,items:await paymentHistory(ctx)});
    }
    if(name==='receipt'){
      if(req.method!=='POST'&&req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
      const paymentId=body.paymentId||req.query?.paymentId;
      return res.status(200).json({ok:true,item:await receiptForUser(ctx,paymentId)});
    }

    if(name==='admin/transactions'){
      if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
      return res.status(200).json({ok:true,items:await adminListTransactions(ctx,object(body.filters))});
    }
    if(name==='admin/transaction'){
      if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
      return res.status(200).json({ok:true,item:await adminPaymentDetails(ctx,body.paymentId)});
    }
    if(name==='admin/payable-items'){
      if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
      const action=text(body.action||'list');
      if(action==='list')return res.status(200).json({ok:true,items:await listPayableItems(ctx,true)});
      if(action==='upsert')return res.status(200).json({ok:true,item:await upsertPayableItem(ctx,object(body.item))});
      if(action==='delete')return res.status(200).json({ok:true,item:await deletePayableItem(ctx,body.id)});
      return res.status(400).json({error:'Unsupported payable item action.'});
    }
    if(name==='admin/providers'){
      if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
      const action=text(body.action||'list');
      if(action==='list')return res.status(200).json({ok:true,items:await listPaymentProviders(ctx)});
      if(action==='configure')return res.status(200).json({ok:true,item:await adminProviderConfig(ctx,object(body.provider))});
      return res.status(400).json({error:'Unsupported provider action.'});
    }
    if(name==='admin/reconcile'){
      if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
      return res.status(200).json({ok:true,...await adminReconcile(ctx,body.paymentId)});
    }
    if(name==='admin/refunds'){
      if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
      const action=text(body.action||'request');
      if(action==='request')return res.status(200).json({ok:true,item:await adminRequestRefund(ctx,body)});
      if(action==='completeManual')return res.status(200).json({ok:true,item:await adminCompleteManualRefund(ctx,body)});
      if(action==='cancel')return res.status(200).json({ok:true,item:await adminCancelRefund(ctx,body)});
      return res.status(400).json({error:'Unsupported refund action.'});
    }
    if(name==='admin/export'){
      if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
      const csv=await adminExportTransactions(ctx,object(body.filters));
      return res.status(200).json({ok:true,csv,filename:'vop-payments-'+new Date().toISOString().slice(0,10)+'.csv'});
    }
    if(name==='admin/statuses'){
      return res.status(200).json({ok:true,items:configuredPaymentStatuses()});
    }

    return res.status(404).json({error:'Unknown payment endpoint.'});
  }catch(error){
    if(name.startsWith('webhooks/')){
      // Signed providers such as Lenco return 401 for invalid signatures.
      // MTN callbacks are notification-only and are independently verified.
      return res.status(/signature/i.test(safeError(error))?401:400).json({error:'Webhook rejected.'});
    }
    return res.status(statusFor(error)).json({error:safeError(error)});
  }
}
