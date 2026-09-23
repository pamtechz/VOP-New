import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant } from '../../server/tenant';

function cleanId(value: unknown) {
  const id = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
  if (!id) throw new Error('A valid plan ID is required.');
  return id.slice(0, 80);
}

export default async function handler(req:any,res:any) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed.'});
  try {
    const body=req.body&&typeof req.body==='object'?req.body:{};
    const ctx=await authenticateTenant(req, undefined, true);
    if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can manage platform plans.');
    const action=String(body.action||'list');

    if (action==='list') {
      const snap=await ctx.db.collection('plans').orderBy('name').get();
      return res.status(200).json({ok:true,items:snap.docs.map(doc=>({id:doc.id,...doc.data()}))});
    }

    const id=cleanId(body.id);
    const ref=ctx.db.doc(`plans/${id}`);
    const existing=await ref.get();

    if (action==='upsert') {
      const name=String(body.name||'').trim();
      if(!name) throw new Error('Plan name is required.');
      const quotas=body.quotas&&typeof body.quotas==='object'&&!Array.isArray(body.quotas)?body.quotas:{};
      const features=body.features&&typeof body.features==='object'&&!Array.isArray(body.features)?body.features:{};
      await ref.set({
        id,name,
        description:String(body.description||'').trim(),
        active:body.active!==false,
        quotas,
        features,
        updatedAt:FieldValue.serverTimestamp(),
        ...(existing.exists?{}:{createdAt:FieldValue.serverTimestamp()})
      },{merge:true});
      return res.status(200).json({ok:true,item:{id,name,description:String(body.description||'').trim(),active:body.active!==false,quotas,features}});
    }

    if(action==='delete'){
      if(!existing.exists) return res.status(404).json({error:'Plan not found.'});
      const organizations=await ctx.db.collection('organizations').where('plan','==',id).limit(1).get();
      if(!organizations.empty) throw new Error('This plan is assigned to an organization and cannot be deleted.');
      await ref.delete();
      return res.status(200).json({ok:true,id});
    }

    if(action==='getSubscription' || action==='setSubscription' || action==='cancelSubscription' || action==='reactivateSubscription'){
      const organizationId=String(body.organizationId||'').trim();
      if(!organizationId) throw new Error('An organization is required.');
      const organizationRef=ctx.db.doc(`organizations/${organizationId}`);
      const organization=await organizationRef.get();
      if(!organization.exists) throw new Error('Organization not found.');
      const subscriptionRef=organizationRef.collection('billing').doc('subscription');
      const existingSubscription=await subscriptionRef.get();

      if(action==='getSubscription'){
        return res.status(200).json({ok:true,item:existingSubscription.exists?{id:subscriptionRef.id,...existingSubscription.data()}:null});
      }

      if(action==='setSubscription'){
        const planId=cleanId(body.planId);
        const plan=await ctx.db.doc(`plans/${planId}`).get();
        if(!plan.exists || plan.data()?.active===false) throw new Error('The selected plan is not available.');
        const now=new Date();
        const start=String(body.currentPeriodStart||now.toISOString());
        const end=String(body.currentPeriodEnd||new Date(now.getTime()+30*24*60*60*1000).toISOString());
        const status=['trialing','active','past_due','cancelled','expired','suspended'].includes(String(body.status))?String(body.status):'active';
        const subscription={
          id:'subscription',
          organizationId,
          planId,
          status,
          startedAt:String(body.startedAt||start),
          currentPeriodStart:start,
          currentPeriodEnd:end,
          cancelAtPeriodEnd:body.cancelAtPeriodEnd===true,
          provider:String(body.provider||'manual'),
          providerSubscriptionId:String(body.providerSubscriptionId||''),
          updatedAt:now.toISOString(),
          updatedBy:ctx.auth.uid
        };
        await subscriptionRef.set(subscription,{merge:true});
        await organizationRef.set({plan:planId,updatedAt:FieldValue.serverTimestamp()},{merge:true});
        return res.status(200).json({ok:true,item:subscription});
      }

      if(!existingSubscription.exists) throw new Error('No subscription exists for this organization.');
      const current=existingSubscription.data()||{};
      if(action==='cancelSubscription'){
        await subscriptionRef.set({status:'cancelled',cancelAtPeriodEnd:body.immediate===true?false:true,cancelledAt:new Date().toISOString(),updatedAt:new Date().toISOString(),updatedBy:ctx.auth.uid},{merge:true});
        return res.status(200).json({ok:true});
      }

      await subscriptionRef.set({status:'active',cancelAtPeriodEnd:false,cancelledAt:null,updatedAt:new Date().toISOString(),updatedBy:ctx.auth.uid},{merge:true});
      return res.status(200).json({ok:true});
    }

    throw new Error('Unsupported plan action.');
  } catch(error) {
    const message=error instanceof Error?error.message:'Plan operation failed.';
    const status=/Sign in/.test(message)?401:/permission|Only|organization|assigned/.test(message)?403:400;
    return res.status(status).json({error:message});
  }
}
