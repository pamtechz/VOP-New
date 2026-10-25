import {FieldValue} from 'firebase-admin/firestore';
import type {TenantContext} from './tenant.js';
import {canEditCanonicalContent, canManageOrganizationContent, writeTenantAudit} from './tenant.js';

type SuggestionTarget='programs'|'guides'|'lessons';
type Reply={status:(code:number)=>Reply;json:(body:unknown)=>void};
type Input=Record<string,unknown>;
const id=(value:unknown)=>{
  const text=String(value??'').trim();
  if(!/^[a-zA-Z0-9_-]{1,120}$/.test(text))throw new Error('Select a valid curriculum record.');
  return text;
};
const changeFields=['title','description'] as const;
const draft=(input:unknown)=>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Provide the proposed changes.');
  const source=input as Input;
  const changed:Record<string,string>={};
  for(const field of changeFields)if(Object.prototype.hasOwnProperty.call(source,field)){
    const value=source[field];
    if(typeof value!=='string'||value.length>(field==='title'?240:8000))
      throw new Error('The proposed '+field+' exceeds the allowed length.');
    changed[field]=value.trim();
  }
  if(!Object.keys(changed).length)throw new Error('Enter a proposed title or description.');
  if('title' in changed&&!changed.title)throw new Error('A study title cannot be empty.');
  return changed;
};
const targetRef=(ctx:TenantContext,kind:SuggestionTarget,recordId:string,guideId:string)=>{
  if(kind==='lessons')return ctx.db.doc('guides/'+id(guideId)+'/lessons/'+recordId);
  return ctx.db.doc(kind+'/'+recordId);
};
const own=(ctx:TenantContext,data:Record<string,unknown>)=>{
  const org=String(data.ownerOrganizationId||data.organizationId||'');
  return Boolean(org && ctx.organizationId===org);
};
const shared=(data:Record<string,unknown>)=>
  data.published===true&&data.archived!==true&&data.sharingScope==='shared';

export async function loadSharedCurriculumVisibility(ctx:TenantContext){
  const settings=ctx.isSuperAdmin||!ctx.organizationId ? {} :
    (await ctx.db.doc('organizations/'+ctx.organizationId+'/settings/sharedCurriculum').get()).data()||{};
  const set=(key:string)=>new Set<string>(
    Array.isArray(settings[key]) ? settings[key].filter((item:unknown):item is string=>
      typeof item==='string') : []);
  return {
    programs:set('hiddenProgramIds'),
    guides:set('hiddenGuideIds'),
    lessons:set('hiddenLessonKeys'),
  };
}
export async function handleCurriculumCollaboration(
  ctx:TenantContext,action:string,body:Input,res:Reply
):Promise<boolean>{
  if(!['getSharedVisibility','setSharedVisibility','proposeEdit','listSuggestedEdits','reviewSuggestedEdit'].includes(action))return false;
  const organizationId=ctx.organizationId;
  if(action==='getSharedVisibility'||action==='setSharedVisibility'){
    if(!organizationId)throw new Error('Choose your organization before configuring shared study content.');
    const ref=ctx.db.doc('organizations/'+organizationId+'/settings/sharedCurriculum');
    if(action==='getSharedVisibility'){
      const snapshot=await ref.get();
      res.status(200).json({ok:true,settings:{
        hiddenProgramIds:snapshot.data()?.hiddenProgramIds||[],
        hiddenGuideIds:snapshot.data()?.hiddenGuideIds||[],
        hiddenLessonKeys:snapshot.data()?.hiddenLessonKeys||[],
      }});
      return true;
    }
    const role=String(ctx.membership.role||'');
    if(!ctx.isSuperAdmin&&!['owner','admin','editor'].includes(role))
      throw new Error('Only an organization administrator can configure shared studies.');
    const kind=String(body.kind||'') as SuggestionTarget;
    if(!['programs','guides','lessons'].includes(kind))throw new Error('Select a curriculum content type.');
    const recordId=id(body.id);
    const guideId=kind==='lessons'?id(body.guideId):'';
    const target=targetRef(ctx,kind,recordId,guideId);
    const targetSnap=await target.get();
    const targetData=(targetSnap.data()||{}) as Input;
    if(!targetSnap.exists||!shared(targetData))
      throw new Error('Only published shared curriculum can be selected here.');
    if(kind==='lessons'){
      const parent=await ctx.db.doc('guides/'+guideId).get();
      if(!parent.exists||!shared(parent.data()||{}))
        throw new Error('The lesson must belong to a published shared guide.');
    }
    const field=kind==='programs'?'hiddenProgramIds':kind==='guides'?'hiddenGuideIds':'hiddenLessonKeys';
    const selection=kind==='lessons'?guideId+'/'+recordId:recordId;
    const hidden=body.hidden===true;
    const settings=await ctx.db.runTransaction(async tx=>{
      const prev=await tx.get(ref);
      const current=prev.data()||{};
      const values=new Set<string>(Array.isArray(current[field])?
        current[field].filter((v:unknown):v is string=>typeof v==='string') :[]);
      if(hidden)values.add(selection);else values.delete(selection);
      if(values.size>500)throw new Error('Too many shared content visibility selections.');
      const updated={...current,[field]:[...values],updatedBy:ctx.auth.uid,
        updatedAt:FieldValue.serverTimestamp()};
      tx.set(ref,updated,{merge:true});
      return {[field]:[...values]};
    });
    await writeTenantAudit(ctx,'curriculum.shared.visibility',ref.path,undefined,
      {kind,recordId,hidden});
    res.status(200).json({ok:true,settings});
    return true;
  }
  if(action==='proposeEdit'){
    if(!organizationId)throw new Error('Join an organization to suggest curriculum edits.');
    const kind=String(body.kind||'') as SuggestionTarget;
    if(!['programs','guides','lessons'].includes(kind))throw new Error('Choose a programme, guide or lesson.');
    const recordId=id(body.id),guideId=kind==='lessons'?id(body.guideId):'';
    const ref=targetRef(ctx,kind,recordId,guideId);
    const current=await ref.get();
    const data=(current.data()||{}) as Input;
    if(!current.exists||!shared(data)||own(ctx,data))
      throw new Error('Suggestions are for published content shared by another owner.');
    if(kind==='lessons'){
      const parent=await ctx.db.doc('guides/'+guideId).get();
      if(!parent.exists||!shared(parent.data()||{}))throw new Error('This lesson is not shared.');
    }
    const proposed=draft(body.proposed);
    const reason=String(body.reason||'').trim();
    if(!reason||reason.length>2000)throw new Error('Explain the suggested correction (up to 2,000 characters).');
    const suggestionRef=ctx.db.collection('curriculumEditSuggestions').doc();
    const baseline:Record<string,string>={};
    for(const key of Object.keys(proposed))baseline[key]=String(data[key]??'');
    const suggestion={
      kind,recordId,guideId,targetPath:ref.path,
      ownerOrganizationId:String(data.ownerOrganizationId||data.organizationId||''),
      proposed,baseline,reason,
      proposerUid:ctx.auth.uid,proposerOrganizationId:organizationId,
      status:'pending',createdAt:FieldValue.serverTimestamp(),
    };
    await suggestionRef.create(suggestion);
    await writeTenantAudit(ctx,'curriculum.suggestion.submit',suggestionRef.path,undefined,
      {kind,recordId,ownerOrganizationId:suggestion.ownerOrganizationId});
    res.status(200).json({ok:true,id:suggestionRef.id,status:'pending'});
    return true;
  }
  if(action==='listSuggestedEdits'){
    const collection=ctx.db.collection('curriculumEditSuggestions');
    const snapshots=ctx.isSuperAdmin?[await collection.limit(100).get()]:await Promise.all([
      collection.where('ownerOrganizationId','==',organizationId).limit(100).get(),
      collection.where('proposerUid','==',ctx.auth.uid).limit(50).get(),
    ]);
    const results=new Map<string,Input>();
    for(const snapshot of snapshots)for(const doc of snapshot.docs){
      const data=doc.data();
      if(!ctx.isSuperAdmin&&
        !(data.proposerUid===ctx.auth.uid || (data.ownerOrganizationId===organizationId &&
          ['owner','admin','editor'].includes(String(ctx.membership.role||'')))))continue;
      results.set(doc.id,{id:doc.id,...data});
    }
    res.status(200).json({ok:true,items:[...results.values()]});
    return true;
  }
  if(action==='reviewSuggestedEdit'){
    const proposalId=id(body.id);
    const decision=String(body.decision||'');
    if(!['approve','reject'].includes(decision))throw new Error('Choose approve or reject.');
    const suggestionRef=ctx.db.doc('curriculumEditSuggestions/'+proposalId);
    const suggestion=await suggestionRef.get();
    if(!suggestion.exists)throw new Error('Suggestion not found.');
    const submitted=suggestion.data()||{};
    const kind=String(submitted.kind||'') as SuggestionTarget;
    if(!['programs','guides','lessons'].includes(kind))throw new Error('Unsupported suggestion.');
    const ref=targetRef(ctx,kind,id(submitted.recordId),
      kind==='lessons'?id(submitted.guideId):'');
    const record=await ref.get();
    if(!record.exists)throw new Error('Original curriculum record no longer exists.');
    const ownerOrganizationId=String(record.data()?.ownerOrganizationId||record.data()?.organizationId||'');
    const ownerOrgAdministrator=Boolean(ownerOrganizationId&&ctx.organizationId===ownerOrganizationId
      &&['owner','admin'].includes(String(ctx.membership.role||'')));
    if(!ctx.isSuperAdmin && !ownerOrgAdministrator &&
        !(await canManageOrganizationContent(ctx,record.data())) &&
        !canEditCanonicalContent(ctx,record.data()))
      throw new Error('Only the content owner or platform administrator can review this suggestion.');
    const result=await ctx.db.runTransaction(async tx=>{
      const [pending,target]=await Promise.all([tx.get(suggestionRef),tx.get(ref)]);
      const data=pending.data()||{},value=target.data()||{};
      if(data.status!=='pending')throw new Error('This suggestion has already been reviewed.');
      if(!target.exists)throw new Error('The original was deleted.');
      const changes=draft(data.proposed);
      if(decision==='approve'){
        for(const key of Object.keys(changes)){
          if(String(value[key]??'')!==String((data.baseline||{})[key]??''))
            throw new Error('The owner has edited this content since the suggestion. Review the updated original first.');
        }
        tx.update(ref,{...changes,updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid});
      }
      tx.update(suggestionRef,{status:decision==='approve'?'approved':'rejected',
        reviewedAt:FieldValue.serverTimestamp(),reviewedBy:ctx.auth.uid});
      return {status:decision==='approve'?'approved':'rejected',kind,recordId:ref.id};
    });
    await writeTenantAudit(ctx,'curriculum.suggestion.'+decision,ref.path,undefined,
      {suggestionId:proposalId});
    res.status(200).json({ok:true,...result});
    return true;
  }
  return false;
}
