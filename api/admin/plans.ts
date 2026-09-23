import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, requireOrgRole } from '../../server/tenant';

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

    throw new Error('Unsupported plan action.');
  } catch(error) {
    const message=error instanceof Error?error.message:'Plan operation failed.';
    const status=/Sign in/.test(message)?401:/permission|Only|organization|assigned/.test(message)?403:400;
    return res.status(status).json({error:message});
  }
}
