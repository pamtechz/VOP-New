import {randomUUID} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import {normalizeProgramDraft} from '../shared/programModel.js';
import {assertMutableTenantResource,platformStewardedResource} from '../shared/platformStewardship.js';
import {canEditCanonicalContent,canManageOrganizationContent,
  accessibleOrganizationIds,organizationInHierarchyScope,writeTenantAudit,
  type TenantContext} from './tenant.js';
import {requirePermission} from './permissions.js';

type Reply={status:(code:number)=>Reply;json:(data:unknown)=>void};
const validId=(raw:unknown)=>{
  const value=String(raw||'').trim();
  if(!/^[a-zA-Z0-9_-]{1,120}$/.test(value))throw new Error('Select a valid program.');
  return value;
};
const ownScope=(ctx:TenantContext,orgId:string)=>{
  if(ctx.isSuperAdmin)return true;
  return ctx.tenantType==='organization' && orgId===ctx.organizationId;
};
async function mayEdit(ctx:TenantContext,data:Record<string,unknown>):Promise<boolean>{
  if(ctx.isSuperAdmin)return true;
  if(platformStewardedResource(data))return false;
  if(ctx.tenantType==='hierarchy')return canManageOrganizationContent(ctx,data);
  return canEditCanonicalContent(ctx,data);
}

/** A first-class course contains ordered guide references, not duplicated
 * lesson bodies. Permissions are enforced on both program and guide records. */
export async function handleCurriculumPrograms(ctx:TenantContext,
  action:string,body:Record<string,unknown>,targetOrganizationId:string,res:Reply){
  if(action==='list'){
    await requirePermission(ctx,'curriculum','view');
    const ids=ctx.tenantType==='hierarchy'&&!ctx.isSuperAdmin
      ? await accessibleOrganizationIds(ctx)
      : ctx.organizationId?[ctx.organizationId]:[];
    const collections=ctx.isSuperAdmin
      ? [await ctx.db.collection('programs').get()]
      : await Promise.all([
          ...ids.map(orgId=>ctx.db.collection('programs')
            .where('organizationId','==',orgId).get()),
          ctx.db.collection('programs').where('sharingScope','==','shared')
            .where('published','==',true).get(),
        ]);
    const known=new Map<string,Record<string,unknown>>();
    for(const snapshot of collections)for(const document of snapshot.docs){
      const data=document.data();
      const owned=ctx.isSuperAdmin||ids.includes(String(data.organizationId||''));
      const shared=data.sharingScope==='shared'&&data.published===true
        && data.archived!==true;
      if(data.archived===true&&!owned)continue;
      if(!owned&&!shared)continue;
      known.set(document.id,{
        id:document.id,...data,
        canEdit:await mayEdit(ctx,data),
      });
    }
    return res.status(200).json({ok:true,items:[...known.values()]});
  }
  if(!['upsert','delete'].includes(action))
    throw new Error('Unsupported program action.');
  const raw=body.data&&typeof body.data==='object'&&!Array.isArray(body.data)
    ?body.data as Record<string,unknown>:{};
  const id=action==='upsert'&&!body.id&&!raw.id
    ?'program-'+randomUUID().replace(/-/g,'')
    :validId(body.id||raw.id);
  const ref=ctx.db.doc('programs/'+id);
  const previous=await ref.get();
  const current=previous.data()||{};
  await requirePermission(ctx,'curriculum',
    action==='delete'?'delete':previous.exists?'update':'create');
  if(previous.exists){
    if(!(await mayEdit(ctx,current)))
      throw new Error('Only the owning contributor or VOP Super Admin may edit this program.');
    assertMutableTenantResource(ctx.isSuperAdmin,current,
      action==='delete'?'archive':'edit');
  }
  if(action==='delete'){
    if(!previous.exists)throw new Error('Program not found.');
    // Keep IDs, course order and existing progress references intact.
    await ref.update({
      published:false,archived:true,updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid,
    });
    await writeTenantAudit(ctx,'program.archive',ref.path,current,{...current,archived:true,published:false});
    return res.status(200).json({ok:true,id,archived:true});
  }
  if(previous.exists&&String(current.organizationId||'')!==targetOrganizationId)
    throw new Error('A program cannot be transferred between tenant scopes by editing.');
  if(!ctx.isSuperAdmin){
    if(ctx.tenantType==='hierarchy'){
      if(!targetOrganizationId||
         !(await organizationInHierarchyScope(ctx,targetOrganizationId)))
        throw new Error('Choose an organization in your authorized hierarchy for this program.');
    }else if(!ownScope(ctx,targetOrganizationId)||!targetOrganizationId){
      throw new Error('The selected organization is outside your curriculum scope.');
    }
  }
  if(targetOrganizationId){
    const organization=await ctx.db.doc('organizations/'+targetOrganizationId).get();
    if(!organization.exists||organization.data()?.status!=='active')
      throw new Error('The selected organization is not active.');
  }
  const input=normalizeProgramDraft(raw);
  if(input.sharingScope==='shared'&&!ctx.isSuperAdmin)
    throw new Error('Only VOP Super Admin may publish a cross-organization program.');
  if(!targetOrganizationId&&input.sharingScope==='organization')
    throw new Error('Platform-wide programs must be private or shared.');
  if(targetOrganizationId && !ctx.isSuperAdmin && input.published &&
     input.sharingScope==='private')
    throw new Error('Publish an organization-visible program instead of a private draft.');
  if(input.published&&!input.guideIds.length)
    throw new Error('Add at least one guide before publishing the program.');
  if(input.archived&&input.published)
    throw new Error('An archived program cannot be published.');
  // Every guide must be in the SAME tenant as its parent program. A shared
  // public guide cannot silently be adopted or reparented into another tenant.
  if(input.guideIds.length){
    const snapshots=await ctx.db.getAll(...input.guideIds.map(guideId=>
      ctx.db.doc('guides/'+guideId)));
    for(const guide of snapshots){
      const value=guide.data()||{};
      if(!guide.exists||value.archived===true||
         String(value.organizationId||'')!==targetOrganizationId)
        throw new Error('A selected guide is missing or belongs to another organization.');
      if(input.published&&value.published!==true)
        throw new Error('Publish every assigned guide before publishing the program.');
      if(input.published&&input.sharingScope==='shared'&&value.sharingScope!=='shared')
        throw new Error('A publicly shared program may contain only publicly shared guides.');
      if(!ctx.isSuperAdmin&&!await mayEdit(ctx,value))
        throw new Error('You cannot assign a guide owned by another contributor.');
    }
  }
  const next={
    ...input,id,organizationId:targetOrganizationId,
    ownerOrganizationId:previous.exists
      ?String(current.ownerOrganizationId||''):targetOrganizationId,
    ownerTenantId:previous.exists
      ?String(current.ownerTenantId||''):targetOrganizationId,
    ownerUid:previous.exists
      ?String(current.ownerUid||''):ctx.auth.uid,
    scope:targetOrganizationId?'organization':'platform',
    canonical:true,
    // Adoption remains permanent even after unpublishing or archiving. An
    // organization must never regain control over publicly adopted material.
    adoptedByPlatform:current.adoptedByPlatform===true||
      (input.published&&input.sharingScope==='shared'),
    createdAt:current.createdAt||new Date().toISOString(),
    updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid,
  };
  await ref.set(next,{merge:false});
  await writeTenantAudit(ctx,previous.exists?'program.update':'program.create',
    ref.path,previous.exists?current:undefined,next);
  return res.status(200).json({ok:true,item:{...input,id,
    organizationId:targetOrganizationId,canEdit:true}});
}
