import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant } from '../server/tenant.js';
import { translationKey } from '../server/localization.js';
import { isEnglishLocale } from '../shared/locales.js';

type Request={method?:string;headers?:Record<string,string|string[]|undefined>;body?:unknown};
type Response={status:(code:number)=>Response;json:(body:unknown)=>void};
type ContributorRole='translator'|'reviewer';

const LOCALE=/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
const text=(value:unknown)=>String(value??'').trim();
const locale=(value:unknown)=>{
  const code=text(value).toLowerCase();
  if(!LOCALE.test(code)||isEnglishLocale(code))throw new Error('Choose a valid non-English language.');
  return code;
};
const roles=(value:unknown):ContributorRole[]=>{
  const input=Array.isArray(value)?value:[];
  return [...new Set(input.map(item=>text(item)).filter((item):item is ContributorRole=>item==='translator'||item==='reviewer'))];
};
const languages=(value:unknown)=>[...new Set((Array.isArray(value)?value:[]).map(item=>locale(item)))].slice(0,50);

async function contributorFor(db:FirebaseFirestore.Firestore,uid:string){
  const snapshot=await db.doc('localizationContributors/'+uid).get();
  return snapshot.exists?{id:snapshot.id,...snapshot.data()} as Record<string,unknown>&{id:string}:null;
}
function contributorRoles(data:Record<string,unknown>|null){
  return roles(data?.roles);
}
function contributorLanguages(data:Record<string,unknown>|null){
  const raw=Array.isArray(data?.languages)?data?.languages as unknown[]:[];
  return raw.map(item=>text(item).toLowerCase()).filter(Boolean);
}
async function assertLanguageEnabled(db:FirebaseFirestore.Firestore,code:string){
  const record=await db.doc('languages/'+code).get();
  if(!record.exists||record.data()?.enabled===false)throw new Error('The selected language is not enabled by the VOP Super Admin.');
}
async function profileSummary(db:FirebaseFirestore.Firestore,uid:string){
  const snapshot=await db.doc('users/'+uid).get();
  const data=snapshot.data()||{};
  return {uid,email:text(data.email),displayName:text(data.displayName||data.name),organizationId:text(data.organizationId)};
}
async function governancePolicy(db:FirebaseFirestore.Firestore){
  const snapshot=await db.doc('system/localizationGovernance').get();
  const data=snapshot.data()||{};
  const approvalThreshold=Math.min(100,Math.max(50,Number(data.approvalThreshold||90)));
  const minimumRecommendations=Math.min(20,Math.max(1,Math.trunc(Number(data.minimumRecommendations||2))));
  return {approvalThreshold,minimumRecommendations};
}
function proposalRef(db:FirebaseFirestore.Firestore,languageId:string,proposalId:string){
  const id=text(proposalId);
  if(!id||id.includes('/')||id.length>180)throw new Error('A valid proposal is required.');
  return db.doc(`translations/${languageId}/proposals/${id}`);
}
async function publishProposal(
  db:FirebaseFirestore.Firestore,
  languageId:string,
  proposalId:string,
  actorUid:string,
  source:'automatic_consensus'|'super_admin',
){
  const pRef=proposalRef(db,languageId,proposalId);
  const translationRef=db.doc('translations/'+languageId);
  await db.runTransaction(async transaction=>{
    const [proposal,translation,language]=await Promise.all([
      transaction.get(pRef),transaction.get(translationRef),transaction.get(db.doc('languages/'+languageId)),
    ]);
    if(!proposal.exists)throw new Error('Translation proposal was not found.');
    if(!language.exists||language.data()?.enabled===false)throw new Error('The language is not available.');
    const proposalData=proposal.data()||{};
    if(text(proposalData.status)!=='pending')return;
    const key=translationKey(proposalData.key);
    const requested=text(proposalData.proposedValue);
    if(!requested||requested.length>12000)throw new Error('The proposed translation is invalid.');
    const current=translation.data()||{};
    const values=current.values&&typeof current.values==='object'
      ?{...(current.values as Record<string,unknown>)}:{};
    values[key]=requested;
    transaction.set(db.doc(`locales/${languageId}/translations/${key}`),{
      key,locale:languageId,namespace:key.split('.')[0],value:requested,
      source:text(proposalData.source),status:'published',version:FieldValue.increment(1),
      updatedAt:FieldValue.serverTimestamp(),updatedBy:actorUid,
    },{merge:true});
    transaction.set(db.doc(`locales/${languageId}`),{
      version:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    transaction.set(translationRef,{
      id:languageId,languageCode:languageId,code:languageId,
      sharingScope:'shared',scope:'platform',platformOwned:true,
      organizationId:'',ownerOrganizationId:'',values,
      translationRevision:Number(current.translationRevision||0)+1,
      lastReviewedBy:actorUid,lastReviewedAt:FieldValue.serverTimestamp(),
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    transaction.update(pRef,{
      status:'approved',published:true,publishSource:source,
      reviewedBy:actorUid,reviewedAt:FieldValue.serverTimestamp(),
      updatedAt:FieldValue.serverTimestamp(),
    });
  });
}

export default async function handler(req:Request,res:Response){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
  try{
    const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};
    const action=text(body.action);
    const ctx=await authenticateTenant(req,undefined,true);
    const db=ctx.db;
    const actorUid=ctx.auth.uid;
    const actor=await profileSummary(db,actorUid);
    const contributor=await contributorFor(db,actorUid);
    const actorRoles=contributorRoles(contributor);
    const activeContributor=Boolean(contributor&&contributor.active!==false);
    const superAdmin=ctx.isSuperAdmin;

    if(action==='status'){
      const application=await db.doc('localizationApplications/'+actorUid).get();
      return res.status(200).json({
        ok:true,
        application:application.exists?{id:application.id,...application.data()}:null,
        contributor,
        policy:await governancePolicy(db),
      });
    }

    if(action==='apply'){
      if(superAdmin)throw new Error('Super Admin already has platform localization authority.');
      if(activeContributor)throw new Error('You already have an active localization contributor role.');
      const requestedRoles=roles(body.roles);
      const requestedLanguages=languages(body.languages);
      const motivation=text(body.motivation).slice(0,4000);
      const experience=text(body.experience).slice(0,4000);
      if(!requestedRoles.length)throw new Error('Choose Translator, Reviewer, or both.');
      if(!requestedLanguages.length)throw new Error('Choose at least one language.');
      await Promise.all(requestedLanguages.map(code=>assertLanguageEnabled(db,code)));
      const ref=db.doc('localizationApplications/'+actorUid);
      const existing=await ref.get();
      if(existing.exists&&text(existing.data()?.status)==='pending')throw new Error('Your localization application is already under review.');
      const now=new Date().toISOString();
      await ref.set({
        uid:actorUid,email:actor.email,displayName:actor.displayName,
        organizationId:actor.organizationId,roles:requestedRoles,languages:requestedLanguages,
        motivation,experience,status:'pending',submittedAt:now,updatedAt:now,
        reviewedAt:FieldValue.delete(),reviewedBy:FieldValue.delete(),decisionNote:FieldValue.delete(),
      },{merge:true});
      return res.status(200).json({ok:true,status:'pending'});
    }

    if(action==='withdrawApplication'){
      const ref=db.doc('localizationApplications/'+actorUid);
      const current=await ref.get();
      if(!current.exists||text(current.data()?.status)!=='pending')throw new Error('No pending localization application was found.');
      await ref.set({status:'withdrawn',updatedAt:new Date().toISOString()},{merge:true});
      return res.status(200).json({ok:true,status:'withdrawn'});
    }

    if(action==='propose'){
      if(!superAdmin&&(!activeContributor||!actorRoles.includes('translator')))
        throw new Error('An active translator invitation is required.');
      const languageId=locale(body.languageId);
      if(!superAdmin&&!contributorLanguages(contributor).includes(languageId))
        throw new Error('Your translator invitation does not include this language.');
      await assertLanguageEnabled(db,languageId);
      const key=translationKey(body.key);
      const proposedValue=text(body.proposedValue);
      const source=text(body.source).slice(0,12000);
      const reason=text(body.reason).slice(0,4000);
      if(!proposedValue||proposedValue.length>12000)throw new Error('Enter a translated value (maximum 12,000 characters).');
      const [canonical,legacy]=await Promise.all([
        db.doc(`locales/${languageId}/translations/${key}`).get(),
        db.doc('translations/'+languageId).get(),
      ]);
      const legacyValues=legacy.data()?.values&&typeof legacy.data()?.values==='object'
        ?legacy.data()?.values as Record<string,unknown>:{};
      const currentValue=text(canonical.data()?.value||legacyValues[key]);
      if(currentValue===proposedValue)throw new Error('This wording is already published.');
      const existing=await db.collection(`translations/${languageId}/proposals`)
        .where('proposerUid','==',actorUid).limit(100).get();
      if(existing.docs.some(doc=>text(doc.data()?.key)===key&&text(doc.data()?.status)==='pending'))
        throw new Error('You already have a pending proposal for this text.');
      const ref=db.collection(`translations/${languageId}/proposals`).doc();
      const now=new Date().toISOString();
      await ref.set({
        id:ref.id,languageId,key,source,currentValue,proposedValue,reason,
        proposerUid:actorUid,proposerEmail:actor.email,proposerName:actor.displayName,
        proposerOrganizationId:actor.organizationId,contributorSource:superAdmin?'super_admin':'invited_translator',
        status:'pending',reviewRecommendations:{},recommendationCount:0,approvalPercentage:0,
        createdAt:now,updatedAt:now,
      });
      return res.status(200).json({ok:true,item:{id:ref.id,languageId,key,status:'pending'}});
    }

    if(action==='myProposals'){
      const items:Array<Record<string,unknown>>=[];
      const allowed=superAdmin?null:contributorLanguages(contributor);
      const languageDocs=await db.collection('languages').where('enabled','==',true).get();
      for(const language of languageDocs.docs){
        if(isEnglishLocale(language.id))continue;
        if(allowed&&!allowed.includes(language.id))continue;
        const proposals=await db.collection(`translations/${language.id}/proposals`)
          .where('proposerUid','==',actorUid).limit(100).get();
        proposals.docs.forEach(doc=>items.push({id:doc.id,languageId:language.id,...doc.data()}));
      }
      return res.status(200).json({ok:true,items});
    }

    if(action==='reviewQueue'){
      if(!superAdmin&&(!activeContributor||!actorRoles.includes('reviewer')))
        throw new Error('An active reviewer invitation is required.');
      const allowed=superAdmin?null:contributorLanguages(contributor);
      const items:Array<Record<string,unknown>>=[];
      const languageDocs=await db.collection('languages').where('enabled','==',true).get();
      for(const language of languageDocs.docs){
        if(isEnglishLocale(language.id))continue;
        if(allowed&&!allowed.includes(language.id))continue;
        const proposals=await db.collection(`translations/${language.id}/proposals`)
          .where('status','==','pending').limit(100).get();
        for(const proposal of proposals.docs){
          const data=proposal.data()||{};
          if(text(data.proposerUid)===actorUid&&!superAdmin)continue;
          items.push({id:proposal.id,languageId:language.id,...data});
        }
      }
      items.sort((a,b)=>text(b.createdAt).localeCompare(text(a.createdAt)));
      return res.status(200).json({ok:true,items,policy:await governancePolicy(db)});
    }

    if(action==='recommend'){
      if(!superAdmin&&(!activeContributor||!actorRoles.includes('reviewer')))
        throw new Error('An active reviewer invitation is required.');
      const languageId=locale(body.languageId);
      if(!superAdmin&&!contributorLanguages(contributor).includes(languageId))
        throw new Error('Your reviewer invitation does not include this language.');
      const proposalId=text(body.proposalId);
      const decision=body.decision==='approve'?'approve':body.decision==='changes_requested'?'changes_requested':'';
      if(!decision)throw new Error('Choose Approve or Request changes.');
      const note=text(body.note).slice(0,4000);
      const ref=proposalRef(db,languageId,proposalId);
      const policy=await governancePolicy(db);
      let approvalPercentage=0;
      let recommendationCount=0;
      let shouldPublish=false;
      await db.runTransaction(async transaction=>{
        const snapshot=await transaction.get(ref);
        if(!snapshot.exists)throw new Error('Translation proposal was not found.');
        const data=snapshot.data()||{};
        if(text(data.status)!=='pending')throw new Error('This proposal is no longer pending.');
        if(text(data.proposerUid)===actorUid&&!superAdmin)throw new Error('You cannot review your own translation proposal.');
        const current=data.reviewRecommendations&&typeof data.reviewRecommendations==='object'
          ?{...(data.reviewRecommendations as Record<string,unknown>)}:{};
        current[actorUid]={decision,note,reviewerName:actor.displayName,reviewerEmail:actor.email,reviewedAt:new Date().toISOString()};
        const rows=Object.values(current).filter(item=>item&&typeof item==='object') as Array<Record<string,unknown>>;
        recommendationCount=rows.length;
        const approvals=rows.filter(item=>text(item.decision)==='approve').length;
        approvalPercentage=recommendationCount?Math.round(approvals*100/recommendationCount):0;
        shouldPublish=recommendationCount>=policy.minimumRecommendations&&approvalPercentage>=policy.approvalThreshold;
        transaction.update(ref,{
          reviewRecommendations:current,recommendationCount,approvalPercentage,
          reviewState:shouldPublish?'consensus_reached':decision,
          updatedAt:FieldValue.serverTimestamp(),
        });
      });
      if(shouldPublish)await publishProposal(db,languageId,proposalId,actorUid,'automatic_consensus');
      return res.status(200).json({ok:true,recommendationCount,approvalPercentage,published:shouldPublish});
    }

    if(action==='listApplications'||action==='listContributors'){
      if(!superAdmin)throw new Error('Only VOP Super Admin can manage localization contributors.');
      const collection=action==='listApplications'?'localizationApplications':'localizationContributors';
      const snapshot=await db.collection(collection).get();
      return res.status(200).json({ok:true,items:snapshot.docs.map(doc=>({id:doc.id,...doc.data()}))});
    }

    if(action==='decideApplication'){
      if(!superAdmin)throw new Error('Only VOP Super Admin can review localization applications.');
      const uid=text(body.uid);
      if(!uid||uid.includes('/'))throw new Error('A valid applicant is required.');
      const decision=body.decision==='approve'?'approved':body.decision==='reject'?'rejected':'';
      if(!decision)throw new Error('Choose Approve or Reject.');
      const ref=db.doc('localizationApplications/'+uid);
      const application=await ref.get();
      if(!application.exists)throw new Error('Localization application was not found.');
      const data=application.data()||{};
      const approvedRoles=roles(body.roles).length?roles(body.roles):roles(data.roles);
      const approvedLanguages=languages(body.languages).length?languages(body.languages):languages(data.languages);
      const note=text(body.note).slice(0,4000);
      if(decision==='approved'){
        await Promise.all(approvedLanguages.map(code=>assertLanguageEnabled(db,code)));
        await db.doc('localizationContributors/'+uid).set({
          uid,email:text(data.email),displayName:text(data.displayName),
          roles:approvedRoles,languages:approvedLanguages,active:true,
          source:'application',approvedBy:actorUid,approvedAt:FieldValue.serverTimestamp(),
          updatedAt:FieldValue.serverTimestamp(),
        },{merge:true});
      }
      await ref.set({status:decision,decisionNote:note,reviewedBy:actorUid,reviewedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      return res.status(200).json({ok:true,status:decision});
    }

    if(action==='invite'){
      if(!superAdmin)throw new Error('Only VOP Super Admin can invite localization contributors.');
      const email=text(body.email).toLowerCase();
      const requestedRoles=roles(body.roles);
      const requestedLanguages=languages(body.languages);
      if(!email||!requestedRoles.length||!requestedLanguages.length)
        throw new Error('Email, contributor role and language are required.');
      await Promise.all(requestedLanguages.map(code=>assertLanguageEnabled(db,code)));
      const users=await db.collection('users').where('email','==',email).limit(2).get();
      if(users.empty)throw new Error('No VOP account was found for this email. Ask the person to create an account first.');
      const user=users.docs[0];
      await db.doc('localizationContributors/'+user.id).set({
        uid:user.id,email,displayName:text(user.data()?.displayName||user.data()?.name),
        roles:requestedRoles,languages:requestedLanguages,active:true,
        source:'super_admin_invite',invitedBy:actorUid,invitedAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      return res.status(200).json({ok:true,email,roles:requestedRoles,languages:requestedLanguages});
    }

    if(action==='updateContributor'){
      if(!superAdmin)throw new Error('Only VOP Super Admin can manage localization contributors.');
      const uid=text(body.uid);
      const requestedRoles=roles(body.roles);
      const requestedLanguages=languages(body.languages);
      if(!uid||!requestedRoles.length||!requestedLanguages.length)throw new Error('Contributor, role and language are required.');
      await Promise.all(requestedLanguages.map(code=>assertLanguageEnabled(db,code)));
      await db.doc('localizationContributors/'+uid).set({
        roles:requestedRoles,languages:requestedLanguages,active:body.active!==false,
        updatedBy:actorUid,updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      return res.status(200).json({ok:true});
    }

    if(action==='updatePolicy'){
      if(!superAdmin)throw new Error('Only VOP Super Admin can change localization review policy.');
      const approvalThreshold=Math.min(100,Math.max(50,Number(body.approvalThreshold||90)));
      const minimumRecommendations=Math.min(20,Math.max(1,Math.trunc(Number(body.minimumRecommendations||2))));
      await db.doc('system/localizationGovernance').set({
        approvalThreshold,minimumRecommendations,updatedBy:actorUid,updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      return res.status(200).json({ok:true,policy:{approvalThreshold,minimumRecommendations}});
    }

    return res.status(400).json({error:'Unsupported localization governance action.'});
  }catch(error){
    const message=error instanceof Error?error.message:'Localization governance operation failed.';
    const status=/sign in|profile/i.test(message)?401:/Only|invitation|required|cannot|outside|authority|role/i.test(message)?403:/not found/i.test(message)?404:400;
    return res.status(status).json({error:message});
  }
}
