import {randomUUID} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import {normalizeProgramDraft} from '../shared/programModel.js';
import {loadSharedCurriculumVisibility} from './curriculumCollaboration.js';
import {assertMutableTenantResource,platformStewardedResource} from '../shared/platformStewardship.js';
import {canEditCanonicalContent,canManageOrganizationContent,
  accessibleOrganizationIds,billingTenantFromContext,enforceBillingTenantQuota,enforceOrganizationQuota,organizationInHierarchyScope,tenantOwnerKey,writeTenantAudit,
  type TenantContext} from './tenant.js';
import {requireOrganizationSubscriptionFeature,requirePermission,requireSubscriptionFeature} from './permissions.js';

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
  if(action==='learnerList'){
    // Learner catalogue reads are server-filtered rather than relying on a
    // compound client Firestore query that can be rejected by tenant rules.
    const ids=ctx.tenantType==='hierarchy'&&!ctx.isSuperAdmin
      ?await accessibleOrganizationIds(ctx)
      :ctx.organizationId?[ctx.organizationId]:[];
    const snapshots=ctx.isSuperAdmin
      ?[await ctx.db.collection('programs').where('published','==',true).get()]
      :await Promise.all([
          ...ids.map(orgId=>ctx.db.collection('programs')
            .where('organizationId','==',orgId).where('published','==',true).get()),
          ctx.db.collection('programs').where('sharingScope','==','shared')
            .where('published','==',true).get(),
        ]);
    const hidden=await loadSharedCurriculumVisibility(ctx);
    const known=new Map<string,Record<string,unknown>>();
    for(const snapshot of snapshots)for(const document of snapshot.docs){
      const data=document.data();
      const orgId=String(data.organizationId||'').trim();
      const owned=ctx.isSuperAdmin||ids.includes(orgId);
      const shared=data.sharingScope==='shared';
      if(data.archived===true||data.published!==true||(!owned&&!shared)||
        (!owned&&hidden.programs.has(document.id)))continue;
      const title=String(data.title||'').trim();
      if(!title)continue;
      known.set(document.id,{
        id:document.id,
        title,
        description:String(data.description||''),
        coverImageUrl:String(data.coverImageUrl||''),
        guideIds:Array.isArray(data.guideIds)
          ?data.guideIds.filter((value:unknown):value is string=>
              typeof value==='string'&&value.length>0&&
                (owned||!hidden.guides.has(value))).slice(0,100)
          :[],
        organizationId:orgId,
        entryMode:data.entryMode==='sections'?'sections':'lessons',
        sharingScope:shared?'shared':'organization',
        certificateEligible:data.certificateEligible===true,
        certificateDocumentType:String(data.certificateDocumentType||'program'),
        certificateTypeName:String(data.certificateTypeName||''),
        published:true,
        archived:false,
      });
    }
    return res.status(200).json({ok:true,items:[...known.values()]
      .sort((a,b)=>String(a.title).localeCompare(String(b.title)))});
  }
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
    const hidden=await loadSharedCurriculumVisibility(ctx);
    const known=new Map<string,Record<string,unknown>>();
    for(const snapshot of collections)for(const document of snapshot.docs){
      const data=document.data();
      const owned=ctx.isSuperAdmin||ids.includes(String(data.organizationId||''));
      const shared=data.sharingScope==='shared'&&data.published===true
        && data.archived!==true;
      if(data.archived===true&&!owned)continue;
      if(!owned&&!shared)continue;
      if(!owned&&hidden.programs.has(document.id))continue;
      known.set(document.id,{
        id:document.id,...data,
        canEdit:await mayEdit(ctx,data),
      });
    }
    return res.status(200).json({ok:true,items:[...known.values()]});
  }
  if(action==='attachGuide'){
    await requirePermission(ctx,'curriculum','update');
    const requested=body.data&&typeof body.data==='object'
      ?body.data as Record<string,unknown>:{};
    const id=validId(body.id||body.programId||requested.programId);
    const guideId=validId(body.guideId||requested.guideId);
    const programRef=ctx.db.doc('programs/'+id);
    const guideRef=ctx.db.doc('guides/'+guideId);
    // Attach the existing canonical guide by reference. Never copy its lessons
    // or rewrite other programme fields to update one association.
    const result=await ctx.db.runTransaction(async transaction=>{
      const [programSnap,guideSnap]=await Promise.all([
        transaction.get(programRef),transaction.get(guideRef),
      ]);
      if(!programSnap.exists)throw new Error('The selected programme no longer exists.');
      if(!guideSnap.exists)throw new Error('The selected guide no longer exists.');
      const program=programSnap.data()||{};
      const guide=guideSnap.data()||{};
      if(!(await mayEdit(ctx,program)))
        throw new Error('Only the owning programme editor or VOP Super Admin can attach a guide.');
      assertMutableTenantResource(ctx.isSuperAdmin,program,'edit');
      if(program.archived===true||guide.archived===true)
        throw new Error('Archived programmes or guides cannot be linked.');
      const programOrg=String(program.organizationId||'');
      const guideOrg=String(guide.organizationId||'');
      const shared=guide.published===true&&guide.sharingScope==='shared';
      if(programOrg!==guideOrg&&!shared)
        throw new Error('Only published shared guides may be linked across organizations.');
      if(program.published===true&&guide.published!==true)
        throw new Error('Publish the guide before attaching it to a published programme.');
      if(program.sharingScope==='shared'&&!shared)
        throw new Error('Publicly shared programmes require publicly shared guides.');
      const ids=Array.isArray(program.guideIds)
        ?program.guideIds.filter((value:unknown):value is string=>typeof value==='string')
        :[];
      if(ids.includes(guideId))return {id,guideIds:ids,alreadyLinked:true};
      if(ids.length>=100)throw new Error('A programme cannot contain more than 100 guides.');
      const guideIds=[...ids,guideId];
      transaction.update(programRef,{guideIds,updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid});
      return {id,guideIds,alreadyLinked:false};
    });
    if(!result.alreadyLinked)await writeTenantAudit(ctx,'program.guide.attach',programRef.path,
      undefined,{guideId});
    return res.status(200).json({ok:true,...result});
  }
  if(!['upsert','delete'].includes(action))
    throw new Error('Unsupported program action.');
  const raw=body.data&&typeof body.data==='object'&&!Array.isArray(body.data)
    ?body.data as Record<string,unknown>:{};
  if(body.id&&raw.id&&String(body.id)!==String(raw.id))
    throw new Error('Programme identity changed during editing. Reload the original programme.');
  const id=action==='upsert'&&!body.id&&!raw.id
    ?'program-'+randomUUID().replace(/-/g,'')
    :validId(body.id||raw.id);
  const ref=ctx.db.doc('programs/'+id);
  const previous=await ref.get();
  if(action==='upsert' && raw.expectedExisting===true && !previous.exists)
    throw new Error('This programme was changed or removed. Reload before editing; no new record was created.');
  const current=previous.data()||{};
  // Existing programme ownership is immutable. A Super Admin editing a
  // programme after changing the UI tenant filter must retain its source.
  const programOrganizationId=ctx.isSuperAdmin&&previous.exists
    ?String(current.scope==='platform'?'':current.organizationId||current.ownerOrganizationId||'').trim()
    :targetOrganizationId;
  await requirePermission(ctx,'curriculum',
    action==='delete'?'delete':previous.exists?'update':'create');
  if(!ctx.isSuperAdmin&&programOrganizationId&&action!=='delete'){
    if(ctx.tenantType==='hierarchy')await requireSubscriptionFeature(ctx,'curriculum','');
    else await requireOrganizationSubscriptionFeature(ctx.db,'curriculum',programOrganizationId);
  }
  if(!ctx.isSuperAdmin&&programOrganizationId&&action==='upsert'&&!previous.exists){
    if(ctx.tenantType==='hierarchy'){
      const billingTarget=billingTenantFromContext(ctx);
      if(!billingTarget)throw new Error('This hierarchy administrator is not linked to a billing tenant.');
      await enforceBillingTenantQuota(ctx.db,billingTarget.type,billingTarget.id,'programs','maxPrograms');
    }else{
      await enforceOrganizationQuota(ctx.db,programOrganizationId,'programs','maxPrograms');
    }
  }
  if(previous.exists){
    if(!(await mayEdit(ctx,current)))
      throw new Error('Only the owning contributor or VOP Super Admin may edit this program.');
    assertMutableTenantResource(ctx.isSuperAdmin,current,
      action==='delete'?'archive':'edit');
  }
  if(action==='delete'){
    if(!previous.exists)throw new Error('Program not found.');
    if(body.permanent===true || raw.permanent===true){
      await ref.delete();
      await writeTenantAudit(ctx,'program.delete',ref.path,current,undefined);
      return res.status(200).json({ok:true,id,deleted:true});
    }
    // Keep IDs, course order and existing progress references intact.
    await ref.update({
      published:false,archived:true,updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid,
    });
    await writeTenantAudit(ctx,'program.archive',ref.path,current,{...current,archived:true,published:false});
    return res.status(200).json({ok:true,id,archived:true});
  }
  if(previous.exists&&String(current.organizationId||'')!==programOrganizationId)
    throw new Error('A program cannot be transferred between tenant scopes by editing.');
  if(!ctx.isSuperAdmin){
    if(ctx.tenantType==='hierarchy'){
      if(!programOrganizationId||
         !(await organizationInHierarchyScope(ctx,programOrganizationId)))
        throw new Error('Choose an organization in your authorized hierarchy for this program.');
    }else if(!ownScope(ctx,programOrganizationId)||!programOrganizationId){
      throw new Error('The selected organization is outside your curriculum scope.');
    }
  }
  if(programOrganizationId){
    const organization=await ctx.db.doc('organizations/'+programOrganizationId).get();
    if(!organization.exists||organization.data()?.status!=='active')
      throw new Error('The selected organization is not active.');
  }
  const input=normalizeProgramDraft(raw);
  // A published platform program is, by definition, system-wide. Do not
  // permit a platform publication whose visibility contradicts its scope.
  if(!programOrganizationId&&input.published)input.sharingScope='shared';
  if(input.sharingScope==='shared'&&!ctx.isSuperAdmin)
    throw new Error('Only VOP Super Admin may publish a cross-organization program.');
  if(!programOrganizationId&&input.sharingScope==='organization')
    throw new Error('Platform-wide programs must be private or shared.');
  if(programOrganizationId && !ctx.isSuperAdmin && input.published &&
     input.sharingScope==='private')
    throw new Error('Publish an organization-visible program instead of a private draft.');
  if(input.archived&&input.published)
    throw new Error('An archived program cannot be published.');
  // A programme stores canonical guide references, never copies. Owned
  // guides can be drafts; cross-tenant guides must be published and shared.
  if(input.guideIds.length){
    const snapshots=await ctx.db.getAll(...input.guideIds.map(guideId=>
      ctx.db.doc('guides/'+guideId)));
    for(const guide of snapshots){
      const value=guide.data()||{};
      if(!guide.exists||value.archived===true)
        throw new Error('A selected guide is missing or archived.');
      const isOwnGuide=String(value.organizationId||'')===programOrganizationId;
      const isSharedGuide=value.published===true&&value.sharingScope==='shared';
      if(!isOwnGuide&&!isSharedGuide)
        throw new Error('Only published shared guides may be assigned across organizations.');
      if(input.published&&value.published!==true)
        throw new Error('Publish every assigned guide before publishing the program.');
      if(input.published&&input.sharingScope==='shared'&&value.sharingScope!=='shared')
        throw new Error('A publicly shared program may contain only publicly shared guides.');
      // Assigning a published shared guide requires view access, not edit
      // permission to the originating content. Programme edits remain scoped.
      if(!ctx.isSuperAdmin&&!isSharedGuide&&!isOwnGuide)
        throw new Error('This guide is not visible to the programme organization.');
    }
  }
  const next={
    ...input,id,organizationId:programOrganizationId,
    ownerOrganizationId:previous.exists
      ?String(current.ownerOrganizationId||''):programOrganizationId,
    ownerTenantId:previous.exists
      ?String(current.ownerTenantId||''):tenantOwnerKey(ctx),
    ownerUid:previous.exists
      ?String(current.ownerUid||''):ctx.auth.uid,
    scope:programOrganizationId?'organization':'platform',
    canonical:true,
    // Adoption remains permanent even after unpublishing or archiving. An
    // organization must never regain control over publicly adopted material.
    adoptedByPlatform:current.adoptedByPlatform===true||
      (input.published&&input.sharingScope==='shared'),
    createdAt:current.createdAt||new Date().toISOString(),
    updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid,
  };
  if(previous.exists)await ref.update(next,{lastUpdateTime:previous.updateTime!});
  else await ref.create(next);
  await writeTenantAudit(ctx,previous.exists?'program.update':'program.create',
    ref.path,previous.exists?current:undefined,next);
  return res.status(200).json({ok:true,item:{...input,id,
    organizationId:programOrganizationId,canEdit:true}});
}
