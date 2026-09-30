import { saveLocaleTranslations, translationKey } from '../server/localization.js';
import { isEnglishLocale, localeAliases } from '../shared/locales.js';
import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, getAdminDb, writeTenantAudit } from '../server/tenant.js';
import { requirePermission } from '../server/permissions.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status:(code:number)=>Response; json:(body:unknown)=>void };
type ContributorRole = 'translator' | 'reviewer';

const LOCALE_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();
function cleanLocale(value: unknown) { const locale=normalize(value); if(!LOCALE_RE.test(locale)) throw new Error('A valid locale code is required.'); return locale; }
const cleanKey = translationKey;
function namespaceOf(key:string){ return key.split('.')[0]; }
function queryValue(req:Request,name:string){ const value=req.query?.[name]; return Array.isArray(value)?value[0]||'':value||''; }
function roles(value: unknown): ContributorRole[] {
  const values=Array.isArray(value)?value:[];
  const result=values.map(String).filter((item):item is ContributorRole=>item==='translator'||item==='reviewer');
  return [...new Set(result)];
}
function locales(value: unknown): string[] {
  const values=Array.isArray(value)?value:[];
  return [...new Set(values.map(item=>normalize(item)).filter(item=>LOCALE_RE.test(item)))].slice(0,50);
}
function contributorActive(data: Record<string,unknown> | undefined, role?: ContributorRole) {
  return Boolean(data && data.status==='active' && (!role || roles(data.roles).includes(role)));
}

async function buildLanguageRegistry(db: FirebaseFirestore.Firestore) {
  const snap=await db.collection('languages').get();
  return snap.docs.map(doc=>{
    const data=doc.data()||{};
    const code=normalize(data.code||data.languageCode||doc.id);
    return {
      id:code, code, aliases:localeAliases(code,data.aliases),
      name:String(data.name||code).trim(), nativeName:String(data.nativeName||data.name||code).trim(),
      enabled:data.enabled!==false, sortOrder:Number(data.sortOrder||0),
      direction:data.rtl===true?'rtl':'ltr', fallback:normalize(data.fallback||''),
    };
  }).filter(item=>item.enabled&&LOCALE_RE.test(item.code)).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));
}

async function resolveLocale(db: FirebaseFirestore.Firestore, requested:string){
  const code=cleanLocale(requested); const registry=await buildLanguageRegistry(db);
  const configured=registry.find(item=>item.code===code)||registry.find(item=>item.aliases.includes(code));
  if(configured)return {code:configured.code,language:configured,aliases:configured.aliases};
  return {code,language:null,aliases:[code]};
}

async function requireConfiguredLocale(db: FirebaseFirestore.Firestore, value: unknown) {
  const requested=cleanLocale(value);
  if(isEnglishLocale(requested))throw new Error('English is the source language. Select another target language.');
  const resolved=await resolveLocale(db,requested);
  if(!resolved.language)throw new Error('Only a language enabled by VOP Super Admin can receive localization proposals.');
  return resolved.code;
}

async function contributorFor(db: FirebaseFirestore.Firestore, uid:string) {
  const snap=await db.doc('localizationContributors/'+uid).get();
  return snap.exists ? {id:snap.id,...snap.data()} as Record<string,unknown> : null;
}

async function publishApprovedProposal(
  db: FirebaseFirestore.Firestore,
  proposalRef: FirebaseFirestore.DocumentReference,
  proposal: Record<string,unknown>,
  approvedBy: string,
  automatic: boolean,
) {
  const locale=await requireConfiguredLocale(db,proposal.locale);
  const key=cleanKey(proposal.key);
  const value=String(proposal.value||'').trim();
  if(!value)throw new Error('The approved translation is empty.');
  const canonicalRef=db.doc(`locales/${locale}/translations/${key}`);
  const aggregateRef=db.doc(`translations/${locale}`);
  const localeRef=db.doc(`locales/${locale}`);
  await db.runTransaction(async transaction=>{
    const [canonical,aggregate,currentProposal]=await Promise.all([
      transaction.get(canonicalRef), transaction.get(aggregateRef), transaction.get(proposalRef),
    ]);
    if(!currentProposal.exists)throw new Error('Localization proposal was not found.');
    if(currentProposal.data()?.status==='published')return;
    const aggregateData=aggregate.data()||{};
    const publishedValues=aggregateData.values&&typeof aggregateData.values==='object'
      ? {...aggregateData.values as Record<string,unknown>} : {};
    publishedValues[key]=value;
    transaction.set(canonicalRef,{
      key,locale,namespace:namespaceOf(key),value,source:String(proposal.source||''),
      status:'published',version:FieldValue.increment(1),
      updatedAt:FieldValue.serverTimestamp(),updatedBy:approvedBy,
      reviewSource:'localization-proposal',proposalId:proposalRef.id,
    },{merge:true});
    transaction.set(aggregateRef,{
      id:locale,languageCode:locale,values:publishedValues,sharingScope:'shared',organizationId:'',
      ownerUid:String(aggregateData.ownerUid||approvedBy),updatedAt:FieldValue.serverTimestamp(),updatedBy:approvedBy,
    },{merge:true});
    transaction.set(localeRef,{version:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    transaction.set(proposalRef,{
      status:'published',publishedAt:FieldValue.serverTimestamp(),publishedBy:approvedBy,
      autoPublished:automatic,updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
  });
}

export default async function handler(req:Request,res:Response){
  try{
    const db=getAdminDb();
    const bearer=req.headers?.authorization||req.headers?.Authorization;
    const viewer=typeof bearer==='string'&&bearer.startsWith('Bearer ')?await authenticateTenant(req):null;

    if(req.method==='GET'){
      const requestedLocale=queryValue(req,'locale').trim();
      if(!requestedLocale)return res.status(200).json({ok:true,items:await buildLanguageRegistry(db)});
      const requested=cleanLocale(requestedLocale);const resolved=await resolveLocale(db,requested);const locale=resolved.code;
      const localeSnap=await db.doc(`locales/${locale}`).get();
      const metadata=resolved.language||(localeSnap.exists?localeSnap.data()||{}:null);
      if(!metadata||metadata.enabled===false)return res.status(404).json({error:'Locale is not available. Select a language configured by VOP Super Admin.'});
      const translations:Record<string,string>={};
      const canonicalSnap=await db.collection(`locales/${locale}/translations`).get();
      const canonicalKeys=new Set(canonicalSnap.docs.map(doc=>doc.id));
      canonicalSnap.docs.forEach(doc=>{const data=doc.data();const value=String(data?.value??'');if(data.status==='published'&&value.trim())translations[doc.id]=value;});
      const legacy=await db.doc(`translations/${locale}`).get();
      const values=legacy.exists&&legacy.data()?.values&&typeof legacy.data()?.values==='object'?legacy.data()?.values as Record<string,string>:{};
      Object.entries(values).forEach(([key,value])=>{if(!canonicalKeys.has(key)&&typeof value==='string'&&value.trim())translations[key]=value;});
      return res.status(200).json({ok:true,locale,requestedLocale:requested,fallback:normalize(metadata.fallback||''),direction:String(metadata.direction||(metadata.rtl===true?'rtl':'ltr'))==='rtl'?'rtl':'ltr',version:Number(metadata.version||1),translations});
    }

    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
    const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};
    const action=normalize(body.action);
    const ctx=viewer||await authenticateTenant(req);

    if(action==='myaccess'){
      const [application,contributor]=await Promise.all([
        db.doc('localizationApplications/'+ctx.auth.uid).get(),
        db.doc('localizationContributors/'+ctx.auth.uid).get(),
      ]);
      return res.status(200).json({
        ok:true,
        application:application.exists?{id:application.id,...application.data()}:null,
        contributor:contributor.exists?{id:contributor.id,...contributor.data()}:null,
        languages:await buildLanguageRegistry(db),
      });
    }

    if(action==='apply'){
      const requestedLocales=locales(body.locales);
      const statement=String(body.statement||'').trim().slice(0,4000);
      const experience=String(body.experience||'').trim().slice(0,2000);
      if(!requestedLocales.length)throw new Error('Choose at least one language you can help localize.');
      const ref=db.doc('localizationApplications/'+ctx.auth.uid);
      const current=await ref.get();
      if(current.exists&&current.data()?.status==='approved')throw new Error('You are already approved for the localization programme.');
      await ref.set({
        applicantUid:ctx.auth.uid,email:String(ctx.profile.email||''),displayName:String(ctx.profile.displayName||''),
        locales:requestedLocales,statement,experience,status:'pending',
        createdAt:current.data()?.createdAt||FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      await writeTenantAudit(ctx,'localization.application.submit',ref.path,current.data(),{status:'pending',locales:requestedLocales});
      return res.status(200).json({ok:true,status:'pending'});
    }

    if(action==='listapplications'||action==='listcontributors'||action==='invite'||action==='approveapplication'||action==='rejectapplication'||action==='revokecontributor'){
      if(!ctx.isSuperAdmin)throw new Error('Only VOP Super Admin can manage localization contributors.');
      if(action==='listapplications'){
        const snap=await db.collection('localizationApplications').get();
        return res.status(200).json({ok:true,items:snap.docs.map(doc=>({id:doc.id,...doc.data()}))});
      }
      if(action==='listcontributors'){
        const snap=await db.collection('localizationContributors').get();
        return res.status(200).json({ok:true,items:snap.docs.map(doc=>({id:doc.id,...doc.data()}))});
      }
      if(action==='invite'){
        const email=String(body.email||'').trim().toLowerCase();
        const contributorRoles=roles(body.roles);
        const localeCodes=locales(body.locales);
        if(!email||!contributorRoles.length)throw new Error('Enter an existing VOP user email and at least one localization role.');
        const userSnap=await db.collection('users').where('email','==',email).limit(1).get();
        if(userSnap.empty)throw new Error('The invitee must first have a VOP account using that email address.');
        const user=userSnap.docs[0];
        const ref=db.doc('localizationContributors/'+user.id);
        await ref.set({
          uid:user.id,email,displayName:String(user.data().displayName||email),roles:contributorRoles,
          locales:localeCodes,status:'active',invitedBy:ctx.auth.uid,invitedAt:FieldValue.serverTimestamp(),
          updatedAt:FieldValue.serverTimestamp(),
        },{merge:true});
        await writeTenantAudit(ctx,'localization.contributor.invite',ref.path,undefined,{email,roles:contributorRoles,locales:localeCodes});
        return res.status(200).json({ok:true,uid:user.id});
      }
      const uid=String(body.uid||'').trim();
      if(!/^[A-Za-z0-9_-]{1,160}$/.test(uid))throw new Error('A valid applicant or contributor is required.');
      if(action==='revokecontributor'){
        const ref=db.doc('localizationContributors/'+uid);await ref.set({status:'revoked',revokedAt:FieldValue.serverTimestamp(),revokedBy:ctx.auth.uid,updatedAt:FieldValue.serverTimestamp()},{merge:true});
        return res.status(200).json({ok:true,uid});
      }
      const appRef=db.doc('localizationApplications/'+uid);const application=await appRef.get();
      if(!application.exists)throw new Error('Localization application was not found.');
      if(action==='rejectapplication'){
        await appRef.set({status:'rejected',reviewedAt:FieldValue.serverTimestamp(),reviewedBy:ctx.auth.uid,reviewNote:String(body.note||'').trim().slice(0,2000)},{merge:true});
        return res.status(200).json({ok:true,uid,status:'rejected'});
      }
      const contributorRoles=roles(body.roles);if(!contributorRoles.length)contributorRoles.push('translator');
      const localeCodes=locales(body.locales).length?locales(body.locales):locales(application.data()?.locales);
      const contributorRef=db.doc('localizationContributors/'+uid);
      await db.runTransaction(async transaction=>{
        transaction.set(appRef,{status:'approved',reviewedAt:FieldValue.serverTimestamp(),reviewedBy:ctx.auth.uid},{merge:true});
        transaction.set(contributorRef,{
          uid,email:String(application.data()?.email||''),displayName:String(application.data()?.displayName||''),
          roles:contributorRoles,locales:localeCodes,status:'active',approvedBy:ctx.auth.uid,
          approvedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
        },{merge:true});
      });
      return res.status(200).json({ok:true,uid,status:'approved'});
    }

    if(action==='listproposals'){
      const contributor=await contributorFor(db,ctx.auth.uid);
      if(!ctx.isSuperAdmin&&!contributorActive(contributor||undefined))throw new Error('An approved localization contributor account is required.');
      const snap=await db.collection('localizationProposals').orderBy('createdAt','desc').limit(200).get();
      return res.status(200).json({ok:true,items:snap.docs.map(doc=>({id:doc.id,...doc.data()}))});
    }

    if(action==='submitproposal'){
      const contributor=await contributorFor(db,ctx.auth.uid);
      if(!ctx.isSuperAdmin&&!contributorActive(contributor||undefined,'translator'))throw new Error('Only an approved translator can submit localization proposals.');
      const locale=await requireConfiguredLocale(db,body.locale);
      const allowedLocales=contributor&&!ctx.isSuperAdmin?locales(contributor.locales):[];
      if(allowedLocales.length&&!allowedLocales.includes(locale))throw new Error('This language is outside your approved translator scope.');
      const key=cleanKey(body.key);const value=String(body.value||'').trim();const source=String(body.source||'').trim().slice(0,12000);
      const notes=String(body.notes||'').trim().slice(0,4000);
      if(!value||value.length>12000)throw new Error('A translation value is required (maximum 12,000 characters).');
      const ref=db.collection('localizationProposals').doc();
      await ref.set({
        locale,key,namespace:namespaceOf(key),source,value,notes,status:'review',
        submittedBy:ctx.auth.uid,submittedByName:String(ctx.profile.displayName||ctx.profile.email||ctx.auth.uid),
        recommendationCount:0,approvalRecommendations:0,recommendationRate:0,
        createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
      });
      await writeTenantAudit(ctx,'localization.proposal.submit',ref.path,undefined,{locale,key});
      return res.status(200).json({ok:true,id:ref.id,status:'review'});
    }

    if(action==='recommend'){
      const contributor=await contributorFor(db,ctx.auth.uid);
      if(!ctx.isSuperAdmin&&!contributorActive(contributor||undefined,'reviewer'))throw new Error('Only an approved localization reviewer can recommend a proposal.');
      const proposalId=String(body.proposalId||'').trim();
      if(!/^[A-Za-z0-9]{1,80}$/.test(proposalId))throw new Error('A valid localization proposal is required.');
      const decision=body.decision==='approve'?'approve':body.decision==='changes'?'changes':'';
      if(!decision)throw new Error('Choose approve or request changes.');
      const proposalRef=db.doc('localizationProposals/'+proposalId);const proposalSnap=await proposalRef.get();
      if(!proposalSnap.exists)throw new Error('Localization proposal was not found.');
      const proposal=proposalSnap.data()||{};
      if(proposal.status==='published')return res.status(200).json({ok:true,status:'published',recommendationRate:Number(proposal.recommendationRate||100)});
      const allowedLocales=contributor&&!ctx.isSuperAdmin?locales(contributor.locales):[];
      if(allowedLocales.length&&!allowedLocales.includes(String(proposal.locale||'')))throw new Error('This proposal is outside your reviewer language scope.');
      const recommendationRef=proposalRef.collection('recommendations').doc(ctx.auth.uid);
      await recommendationRef.set({
        reviewerUid:ctx.auth.uid,decision,note:String(body.note||'').trim().slice(0,2000),
        updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      const [recommendations,contributors]=await Promise.all([
        proposalRef.collection('recommendations').get(),
        db.collection('localizationContributors').where('status','==','active').get(),
      ]);
      const reviewerPool=contributors.docs.filter(doc=>{
        const data=doc.data()||{};
        const approved=roles(data.roles).includes('reviewer');
        const scoped=locales(data.locales);
        return approved&&(!scoped.length||scoped.includes(String(proposal.locale||'')));
      }).length;
      const total=recommendations.size;
      const approvals=recommendations.docs.filter(doc=>doc.data().decision==='approve').length;
      const recommendationRate=total?Math.round((approvals/total)*10000)/100:0;
      const quorum=Math.max(1,Math.ceil(Math.max(1,reviewerPool)*0.5));
      await proposalRef.set({recommendationCount:total,approvalRecommendations:approvals,recommendationRate,reviewerPool,reviewQuorum:quorum,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      if(total>=quorum&&recommendationRate>=90){
        await publishApprovedProposal(db,proposalRef,{...proposal,id:proposalId},'review-consensus',true);
        return res.status(200).json({ok:true,status:'published',recommendationRate,recommendationCount:total,reviewQuorum:quorum});
      }
      return res.status(200).json({ok:true,status:'review',recommendationRate,recommendationCount:total,reviewQuorum:quorum});
    }

    if(action==='approveproposal'||action==='rejectproposal'){
      if(!ctx.isSuperAdmin)throw new Error('Only VOP Super Admin can make a manual final localization decision.');
      const proposalId=String(body.proposalId||'').trim();
      if(!/^[A-Za-z0-9]{1,80}$/.test(proposalId))throw new Error('A valid localization proposal is required.');
      const ref=db.doc('localizationProposals/'+proposalId);const snap=await ref.get();
      if(!snap.exists)throw new Error('Localization proposal was not found.');
      if(action==='rejectproposal'){
        await ref.set({status:'rejected',reviewedBy:ctx.auth.uid,reviewedAt:FieldValue.serverTimestamp(),reviewNote:String(body.note||'').trim().slice(0,2000)},{merge:true});
        return res.status(200).json({ok:true,status:'rejected'});
      }
      await publishApprovedProposal(db,ref,snap.data()||{},ctx.auth.uid,false);
      return res.status(200).json({ok:true,status:'published'});
    }

    // Canonical language translation CRUD remains a Super-Admin-only platform surface.
    if(action.startsWith('tenant'))throw new Error('Organization-specific localization has been retired. Use the platform localization application and review workflow.');
    const locale=(await resolveLocale(db,cleanLocale(body.locale))).code;
    if(action!=='list'&&!ctx.isSuperAdmin)throw new Error('Only VOP Super Admin may directly modify system locales and translations. Approved contributors must submit a proposal for review.');
    if(action==='bootstrap'){
      await requirePermission(ctx,'translations','update');
      const name=String(body.name||'').trim();const nativeName=String(body.nativeName||name).trim();if(!name)throw new Error('Language name is required.');
      const ref=db.doc(`locales/${locale}`);const current=await ref.get();
      await ref.set({code:locale,name,nativeName,enabled:body.enabled!==false,direction:String(body.direction||'ltr')==='rtl'?'rtl':'ltr',fallback:body.fallback?cleanLocale(body.fallback):'',version:Number(current.data()?.version||1),updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid},{merge:true});
      return res.status(200).json({ok:true,locale});
    }
    if(action==='list'){
      await requirePermission(ctx,'translations','view');
      const requestedNamespace=String(body.namespace||'').trim();
      const snap=await db.collection(`locales/${locale}/translations`).get();
      const items=snap.docs.map(doc=>({id:doc.id,...doc.data()})).filter(item=>!requestedNamespace||String(item.namespace||'')===requestedNamespace);
      return res.status(200).json({ok:true,items});
    }
    if(action==='bulksave'){
      await requirePermission(ctx,'translations','update');
      const values=body.values&&typeof body.values==='object'?body.values as Record<string,unknown>:{};
      const sources=body.sources&&typeof body.sources==='object'?body.sources as Record<string,unknown>:{};
      const status=String(body.status||'published');
      if(!['draft','review','published'].includes(status))throw new Error('Invalid translation status.');
      const count=await saveLocaleTranslations(ctx,locale,values,sources,status);
      await writeTenantAudit(ctx,'translation.bulkSave',`locales/${locale}`,undefined,{count});
      return res.status(200).json({ok:true,count});
    }
    const key=cleanKey(body.key);const ref=db.doc(`locales/${locale}/translations/${key}`);const existing=await ref.get();
    if(['save','publish','unpublish','delete'].includes(action)){
      await requirePermission(ctx,'translations',action==='delete'?'delete':'update');
      if(action==='delete'&&!existing.exists)return res.status(404).json({error:'Translation key not found.'});
      const value=String(body.value??existing.data()?.value??'');
      if((action==='save'||action==='publish')&&!value.trim())throw new Error('Translation value cannot be empty.');
      const status=action==='delete'?'deleted':action==='publish'?'published':action==='unpublish'?'draft':String(body.status||'draft');
      if(action==='save'&&!['draft','review','published'].includes(status))throw new Error('Invalid translation status.');
      await saveLocaleTranslations(ctx,locale,{[key]:value},{[key]:body.source??existing.data()?.source??''},status);
      await writeTenantAudit(ctx,`translation.${action}`,`locales/${locale}/translations/${key}`,undefined,{key,locale,status});
      return res.status(200).json({ok:true,item:{id:key,key,locale,namespace:namespaceOf(key),value,status}});
    }
    return res.status(400).json({error:'Unsupported localization action.'});
  }catch(error){
    const message=error instanceof Error?error.message:'Localization operation failed.';
    const status=/sign in/i.test(message)?401:/permission|Only|membership|forbidden|approved contributor|approved translator|approved localization|outside your reviewer|outside your approved/i.test(message)?403:/not found|available/i.test(message)?404:400;
    return res.status(status).json({error:message});
  }
}
