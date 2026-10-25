import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, canEditCanonicalContent, writeTenantAudit } from '../../server/tenant.js';
import { requirePermission } from '../../server/permissions.js';

type Req={method?:string;headers?:Record<string,string|string[]|undefined>;body?:unknown};
type Res={status:(n:number)=>Res;json:(v:unknown)=>void};
type Kind='program'|'guide'|'lesson';
type Proposed={title?:string;description?:string;subtitle?:string};
const safe=(v:unknown)=>{const s=String(v??'').trim();if(!/^[a-zA-Z0-9_-]{1,120}$/.test(s))throw new Error('Invalid curriculum record ID.');return s;};
const rows=(v:unknown)=>Array.isArray(v)?v:[];
const normalizeIds=(v:unknown)=>[...new Set(rows(v).map(safe))].slice(0,150);
const canManage=(ctx:Awaited<ReturnType<typeof authenticateTenant>>,orgId:string)=>
  ctx.isSuperAdmin||Boolean(orgId&&ctx.tenantType==='organization'&&ctx.organizationId===orgId&&
    ['owner','admin'].includes(String(ctx.membership.role||'')));
const proposalPatch=(value:unknown):Proposed=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Provide the proposed changes.');
  const raw=value as Record<string,unknown>;
  if(Object.keys(raw).some(k=>!['title','description','subtitle'].includes(k)))
    throw new Error('Only title, description, and subtitle may be proposed through this form.');
  const patch:Proposed={};
  for(const key of ['title','description','subtitle'] as const){
    if(!Object.prototype.hasOwnProperty.call(raw,key))continue;
    const text=String(raw[key]??'').trim();
    if((key==='title'&&!text)||text.length>(key==='description'?10000:240))
      throw new Error('Proposed text is empty or exceeds its size limit.');
    patch[key]=text;
  }
  if(!Object.keys(patch).length)throw new Error('Enter at least one proposed change.');
  return patch;
};
const target=(db:FirebaseFirestore.Firestore,kind:Kind,id:string,guideId:string)=>{
  if(kind==='program')return db.doc('programs/'+safe(id));
  if(kind==='guide')return db.doc('guides/'+safe(id));
  if(kind==='lesson')return db.doc('guides/'+safe(guideId)+'/lessons/'+safe(id));
  throw new Error('Unsupported curriculum content type.');
};
const shared=(data:Record<string,unknown>)=>data.published===true&&data.archived!==true&&data.sharingScope==='shared';
const getOrg=async(ctx:Awaited<ReturnType<typeof authenticateTenant>>,requested:string)=>{
  const org=ctx.isSuperAdmin?requested:ctx.organizationId;
  if(!org)throw new Error('Choose an organisation to configure its shared studies.');
  if(!canManage(ctx,org))throw new Error('Only an owning organisation administrator or VOP Super Admin may configure this library.');
  return org;
};

export default async function handler(req:Req,res:Res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
  try{
    const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)
      ?req.body as Record<string,unknown>:{};
    const action=String(body.action||'');
    const ctx=await authenticateTenant(req,String(body.organizationId||'')||undefined);
    await requirePermission(ctx,'curriculum','view');
    if(action==='getCatalog'){
      const [programs,guides]=await Promise.all([
        ctx.db.collection('programs').where('sharingScope','==','shared').where('published','==',true).limit(200).get(),
        ctx.db.collection('guides').where('sharingScope','==','shared').where('published','==',true).limit(200).get(),
      ]);
      const metadata=(snapshot:FirebaseFirestore.QuerySnapshot)=>snapshot.docs
        .filter(doc=>doc.data().archived!==true)
        .map(doc=>({id:doc.id,title:String(doc.data().title||'Untitled'),
          description:String(doc.data().description||'').slice(0,250),
          organizationId:String(doc.data().organizationId||'')}));
      return res.status(200).json({ok:true,programs:metadata(programs),guides:metadata(guides)});
    }
    if(action==='getSharedLessons'){
      const guideId=safe(body.guideId);
      const guide=await ctx.db.doc('guides/'+guideId).get();
      if(!guide.exists||!shared(guide.data()||{}))
        throw new Error('This guide is not publicly shared.');
      const lessons=await guide.ref.collection('lessons').limit(150).get();
      return res.status(200).json({ok:true,items:lessons.docs
        .filter(doc=>shared(doc.data())&&doc.data().type!=='Test')
        .map(doc=>({id:doc.id,title:String(doc.data().title||'Untitled'),
          guideId,lessonNumber:String(doc.data().lessonNumber||'')}))});
    }
    if(action==='getVisibility'||action==='setVisibility'){
      const org=await getOrg(ctx,String(body.organizationId||'').trim());
      const ref=ctx.db.doc('organizations/'+safe(org)+'/settings/sharedCurriculum');
      if(action==='getVisibility'){
        const snap=await ref.get();
        return res.status(200).json({ok:true,visibility:snap.exists?snap.data():{
          mode:'all',programIds:[],guideIds:[],lessonIds:[],
        }});
      }
      await requirePermission(ctx,'curriculum','update');
      const mode=body.mode==='selected'?'selected':'all';
      const programIds=normalizeIds(body.programIds);
      const guideIds=normalizeIds(body.guideIds);
      const lessonIds=[...new Set(rows(body.lessonIds).map(v=>{
        const parts=String(v).split(':');if(parts.length!==2)throw new Error('Invalid lesson selection.');
        return safe(parts[0])+':'+safe(parts[1]);
      }))].slice(0,150);
      const requested=[
        ...programIds.map(id=>ctx.db.doc('programs/'+id)),
        ...guideIds.map(id=>ctx.db.doc('guides/'+id)),
        ...lessonIds.map(id=>{
          const [guide,lesson]=id.split(':');
          return ctx.db.doc('guides/'+guide+'/lessons/'+lesson);
        }),
      ];
      // A preference never grants access; it may only display an already
      // published, shared canonical record belonging to another tenant.
      if(mode==='selected'&&requested.length){
        const snapshots=await ctx.db.getAll(...requested);
        for(const snap of snapshots){
          if(!snap.exists||!shared(snap.data()||{}))
            throw new Error('Choose only published shared curriculum records.');
        }
      }
      const next={mode,programIds,guideIds,lessonIds,
        updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid};
      await ref.set(next,{merge:true});
      await writeTenantAudit(ctx,'curriculum.shared-visibility.update',ref.path,undefined,
        {mode,programIds,guideIds,lessonIds});
      return res.status(200).json({ok:true,visibility:{mode,programIds,guideIds,lessonIds}});
    }
    if(action==='proposeEdit'){
      if(ctx.isSuperAdmin)throw new Error('VOP Super Admin may edit canonical content directly.');
      if(ctx.tenantType!=='organization'||!ctx.organizationId)
        throw new Error('Join an organisation to suggest edits.');
      if(!['owner','admin','editor'].includes(String(ctx.membership.role||'')))
        throw new Error('Only authorised organisation contributors may suggest edits.');
      const kind=String(body.kind||'') as Kind;
      const id=safe(body.id),guideId=kind==='lesson'?safe(body.guideId):'';
      const ref=target(ctx.db,kind,id,guideId);
      const doc=await ref.get();
      if(!doc.exists||!shared(doc.data()||{}))throw new Error('This curriculum record is not published for sharing.');
      const ownerOrganizationId=String(doc.data()?.ownerOrganizationId||doc.data()?.organizationId||'');
      if(ownerOrganizationId===ctx.organizationId)
        throw new Error('This study is owned by your organisation. Ask an administrator to edit it directly.');
      const changes=proposalPatch(body.changes);
      const reason=String(body.reason||'').trim();
      if(!reason||reason.length>3000)throw new Error('Explain the proposed correction (up to 3,000 characters).');
      const proposalId=randomUUID();
      const proposalRef=ctx.db.doc('curriculumEditProposals/'+proposalId);
      await proposalRef.create({
        kind,id,guideId,ownerOrganizationId,
        proposedByOrganizationId:ctx.organizationId,proposedByUid:ctx.auth.uid,
        sourceVersion:doc.updateTime?.toMillis()||0,
        sourceTitle:String(doc.data()?.title||''),
        changes,reason,status:'pending',
        createdAt:FieldValue.serverTimestamp(),
      });
      await writeTenantAudit(ctx,'curriculum.proposal.submit',proposalRef.path,undefined,
        {kind,id,guideId,ownerOrganizationId});
      return res.status(200).json({ok:true,id:proposalId,status:'pending'});
    }
    if(action==='listProposals'){
      const result=new Map<string,Record<string,unknown>>();
      const queries=ctx.isSuperAdmin
        ?[ctx.db.collection('curriculumEditProposals').limit(100)]
        :[
          ...(canManage(ctx,ctx.organizationId)?[
            ctx.db.collection('curriculumEditProposals')
              .where('ownerOrganizationId','==',ctx.organizationId).limit(100),
          ]:[]),
          ctx.db.collection('curriculumEditProposals')
            .where('proposedByUid','==',ctx.auth.uid).limit(100),
        ];
      for(const snapshot of await Promise.all(queries.map(q=>q.get())))
        for(const doc of snapshot.docs)result.set(doc.id,{id:doc.id,...doc.data()});
      return res.status(200).json({ok:true,items:[...result.values()]});
    }
    if(action==='reviewProposal'){
      const id=safe(body.id);
      const decision=String(body.decision||'');
      if(decision!=='approve'&&decision!=='reject')throw new Error('Choose approve or reject.');
      const proposalRef=ctx.db.doc('curriculumEditProposals/'+id);
      const snap=await proposalRef.get();
      if(!snap.exists)throw new Error('Suggestion not found.');
      const request=snap.data()||{};
      const owner=String(request.ownerOrganizationId||'');
      if(!canManage(ctx,owner))throw new Error('Only the content owner or VOP Super Admin can review this suggestion.');
      if(decision==='approve')await requirePermission(ctx,'curriculum','update');
      const kind=request.kind as Kind;
      const contentRef=target(ctx.db,kind,String(request.id||''),String(request.guideId||''));
      const acceptedStatus=decision==='reject'?'rejected':'approved';
      await ctx.db.runTransaction(async tx=>{
        const currentProposal=await tx.get(proposalRef);
        const status=String(currentProposal.data()?.status||'');
        if(status!=='pending')throw new Error('This suggestion was already reviewed.');
        const record=await tx.get(contentRef);
        if(!record.exists)throw new Error('Original content no longer exists.');
        const data=record.data()||{};
        const recordOrg=String(data.ownerOrganizationId||data.organizationId||'');
        if(recordOrg!==owner||!canEditCanonicalContent(ctx,data))
          throw new Error('The reviewer is no longer authorised for this content.');
        if(decision==='approve'){
          if((record.updateTime?.toMillis()||0)!==Number(request.sourceVersion||0))
            throw new Error('The original content has changed. Ask the proposer to submit a fresh suggestion.');
          // The owning organisation or Super Admin may approve. Both
          // authorization and optimistic version checks precede the write.
          tx.update(contentRef,{...proposalPatch(request.changes),
            updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid});
        }
        tx.update(proposalRef,{status:acceptedStatus,
          reviewedAt:FieldValue.serverTimestamp(),reviewedBy:ctx.auth.uid});
      });
      await writeTenantAudit(ctx,'curriculum.proposal.'+acceptedStatus,proposalRef.path,
        {status:request.status},{status:acceptedStatus,kind,recordId:request.id});
      return res.status(200).json({ok:true,status:acceptedStatus});
    }
    return res.status(400).json({error:'Unsupported curriculum collaboration action.'});
  }catch(error){
    const message=error instanceof Error?error.message:'Curriculum collaboration request failed.';
    const code=/sign in|account profile/i.test(message)?401:
      /permission|authori|owning|only|outside|join an organi/i.test(message)?403:400;
    return res.status(code).json({error:message});
  }
}
