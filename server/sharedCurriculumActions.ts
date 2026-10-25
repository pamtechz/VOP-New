import {FieldValue} from 'firebase-admin/firestore';
import {randomUUID} from 'node:crypto';
import type {TenantContext} from './tenant.js';
import {canEditCanonicalContent,requireOrgRole,writeTenantAudit} from './tenant.js';
import {loadSharedVisibility,updateSharedVisibility,validSharedId,
  type SharedKind} from './sharedCurriculumVisibility.js';

type Reply={status:(code:number)=>Reply;json:(value:unknown)=>void};
type Raw=Record<string,unknown>;
const kinds=new Set<SharedKind>(['programs','guides','lessons']);
const allowedCollections=new Set(['programs','guides','curriculum']);
const idPattern=/^[A-Za-z0-9_-]{1,120}$/;
const text=(input:unknown,limit:number)=>typeof input==='string'?input.trim().slice(0,limit):'';
function location(ctx:TenantContext,collection:string,id:string,guideId:string){
  if(!idPattern.test(id))throw Error('Choose a valid content item.');
  if(!allowedCollections.has(collection))throw Error('Unsupported shared content collection.');
  if(collection==='curriculum'){
    if(!idPattern.test(guideId))throw Error('Select the lesson guide.');
    return ctx.db.doc('guides/'+guideId+'/lessons/'+id);
  }
  return ctx.db.doc(collection+'/'+id);
}

export async function handleSharedCurriculumAction(
  ctx:TenantContext,action:string,collection:string,body:Raw,res:Reply,
):Promise<void>{
  if(action==='getSharedVisibility'){
    if(collection!=='programs')throw Error('Choose the program settings collection.');
    const organizationId=ctx.organizationId;
    return res.status(200).json({ok:true,
      selection:await loadSharedVisibility(ctx.db,organizationId)});
  }
  if(action==='setSharedVisibility'){
    requireOrgRole(ctx,['owner','admin']);
    const organizationId=ctx.organizationId;
    if(!organizationId)throw Error('Select an organization first.');
    const kind=String(body.kind||'') as SharedKind;
    if(!kinds.has(kind))throw Error('Choose programs, guides or lessons.');
    const id=text(body.contentId,250);
    if(!validSharedId(kind,id))throw Error('Invalid shared item ID.');
    if(typeof body.visible!=='boolean')throw Error('Select visible or hidden.');
    const [guide,lesson]=kind==='lessons'?id.split(':'):['',''];
    const target=kind==='lessons'
      ?ctx.db.doc('guides/'+guide+'/lessons/'+lesson)
      :ctx.db.doc(kind+'/'+id);
    const doc=await target.get();
    if(!doc.exists)throw Error('Shared curriculum record no longer exists.');
    const data=doc.data()||{};
    const owner=String(data.organizationId||data.ownerOrganizationId||'');
    if(owner!==organizationId &&
        !(data.published===true&&data.sharingScope==='shared'&&data.archived!==true))
      throw Error('Only published, shared curriculum is eligible for organisation selection.');
    const selection=await updateSharedVisibility(ctx.db,organizationId,
      kind,id,body.visible,ctx.auth.uid);
    await writeTenantAudit(ctx,'curriculum.shared.visibility',
      'organizations/'+organizationId+'/settings/sharedCurriculum',undefined,
      {kind,id,visible:body.visible});
    return res.status(200).json({ok:true,selection});
  }
  if(action==='proposeEdit'){
    requireOrgRole(ctx,['owner','admin','editor']);
    if(!ctx.organizationId)throw Error('An organization is required to propose edits.');
    const id=text(body.id,120),guideId=text(body.guideId,120);
    const target=location(ctx,collection,id,guideId);
    const doc=await target.get();
    const data=doc.data()||{};
    if(!doc.exists||data.archived===true||data.published!==true||
       data.sharingScope!=='shared')
      throw Error('Only published shared records accept outside edit suggestions.');
    const ownerOrg=String(data.ownerOrganizationId||data.organizationId||'');
    if(ownerOrg===ctx.organizationId)throw Error('This is your own content. Use the regular editor.');
    const proposed=body.changes&&typeof body.changes==='object'&&!Array.isArray(body.changes)
      ?body.changes as Raw:{};
    const changes:Raw={};
    if(typeof proposed.title==='string'&&text(proposed.title,180)!==text(data.title,180))
      changes.title=text(proposed.title,180);
    if(typeof proposed.description==='string'&&text(proposed.description,5000)!==text(data.description,5000))
      changes.description=text(proposed.description,5000);
    if(!Object.keys(changes).length)throw Error('Suggest a title or description change.');
    const notes=text(body.notes,4000);
    const proposalId=randomUUID();
    await ctx.db.doc('contentEditProposals/'+proposalId).create({
      id:proposalId,collection,targetId:id,guideId:collection==='curriculum'?guideId:'',
      ownerOrganizationId:ownerOrg,proposerOrganizationId:ctx.organizationId,
      proposerUid:ctx.auth.uid,notes,changes,status:'pending',
      baseVersion:data.updatedAt?.toMillis?.()||0,
      createdAt:FieldValue.serverTimestamp(),
    });
    await writeTenantAudit(ctx,'curriculum.edit.propose',target.path,undefined,
      {proposalId,changes:Object.keys(changes)});
    return res.status(200).json({ok:true,id:proposalId,status:'pending'});
  }
  if(action==='listEditProposals'){
    requireOrgRole(ctx,['owner','admin','editor']);
    const orgId=ctx.organizationId;
    const snapshots=ctx.isSuperAdmin
      ?[await ctx.db.collection('contentEditProposals').limit(150).get()]
      :orgId?[await ctx.db.collection('contentEditProposals')
        .where('ownerOrganizationId','==',orgId).limit(100).get(),
        await ctx.db.collection('contentEditProposals')
          .where('proposerOrganizationId','==',orgId).limit(100).get()]:[];
    const byId=new Map<string,Raw>();
    for(const snapshot of snapshots)for(const item of snapshot.docs)
      byId.set(item.id,{id:item.id,...item.data()});
    return res.status(200).json({ok:true,items:[...byId.values()]});
  }
  if(action==='reviewEditProposal'){
    requireOrgRole(ctx,['owner','admin']);
    const id=text(body.id,120);
    if(!idPattern.test(id))throw Error('Select a valid proposal.');
    const approved=body.approved===true;
    const proposalRef=ctx.db.doc('contentEditProposals/'+id);
    const outcome=await ctx.db.runTransaction(async tx=>{
      const proposal=await tx.get(proposalRef);
      if(!proposal.exists||proposal.data()?.status!=='pending')
        throw Error('This proposal has already been reviewed.');
      const request=proposal.data()||{};
      if(!ctx.isSuperAdmin&&
        String(request.ownerOrganizationId||'')!==ctx.organizationId)
        throw Error('Only the owning organisation or VOP Super Admin may review this suggestion.');
      const target=location(ctx,String(request.collection||''),
        String(request.targetId||''),String(request.guideId||''));
      const existing=await tx.get(target);
      if(!existing.exists)throw Error('The original content no longer exists.');
      const data=existing.data()||{};
      if(!ctx.isSuperAdmin&&!canEditCanonicalContent(ctx,data))
        throw Error('You cannot approve edits to a record outside your organisation.');
      if(approved){
        if((data.updatedAt?.toMillis?.()||0)!==Number(request.baseVersion||0))
          throw Error('Original content changed after the suggestion. Ask for a new proposal.');
        const safe=request.changes&&typeof request.changes==='object'
          ?request.changes as Raw:{};
        const update:Raw={};
        for(const key of ['title','description']){
          if(typeof safe[key]==='string')update[key]=text(safe[key],
            key==='title'?180:5000);
        }
        tx.update(target,{...update,updatedAt:FieldValue.serverTimestamp(),
          updatedBy:ctx.auth.uid});
      }
      tx.update(proposalRef,{status:approved?'approved':'rejected',
        reviewedBy:ctx.auth.uid,reviewedAt:FieldValue.serverTimestamp()});
      return {status:approved?'approved':'rejected',target:target.path};
    });
    await writeTenantAudit(ctx,'curriculum.edit.review',outcome.target,undefined,
      {proposalId:id,status:outcome.status});
    return res.status(200).json({ok:true,id,...outcome});
  }
  throw Error('Unsupported shared curriculum action.');
}
