import { FieldValue } from 'firebase-admin/firestore';
import { createNotification } from '../../server/notifications.js';
import { authenticateTenant } from '../../server/tenant.js';
import { translationKey } from '../../server/localization.js';
import { isEnglishLocale } from '../../shared/locales.js';

type Request={method?:string;headers?:Record<string,string|string[]|undefined>;body?:unknown};
type Response={status:(code:number)=>Response;json:(body:unknown)=>void};
type Role='translator'|'reviewer';

const clean=(value:unknown,max=500)=>String(value||'').trim().slice(0,max);
const languageCode=(value:unknown)=>{
  const code=clean(value,40).toLowerCase();
  if(!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(code)||isEnglishLocale(code))throw new Error('Choose a valid non-English language.');
  return code;
};
const roles=(value:unknown):Role[]=>{
  const input=Array.isArray(value)?value:[];
  return [...new Set(input.filter((item):item is Role=>item==='translator'||item==='reviewer'))];
};
const languages=(value:unknown)=>[...new Set((Array.isArray(value)?value:[])
  .map(item=>clean(item,40).toLowerCase()).filter(item=>item==='*'||/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(item)&&!isEnglishLocale(item)))].slice(0,50);

async function collaborator(db:FirebaseFirestore.Firestore,uid:string){
  const snap=await db.doc('localizationCollaborators/'+uid).get();
  return snap.exists?{id:snap.id,...snap.data()} as Record<string,unknown>:null;
}
function collaboratorAllows(item:Record<string,unknown>|null,role:Role,language:string){
  if(!item||item.status!=='active')return false;
  const assignedRoles=roles(item.roles);
  const assignedLanguages=languages(item.languages);
  return assignedRoles.includes(role)&&(assignedLanguages.includes('*')||assignedLanguages.includes(language));
}
async function enabledLanguage(db:FirebaseFirestore.Firestore,code:string){
  const snap=await db.doc('languages/'+code).get();
  return snap.exists&&snap.data()?.enabled!==false;
}
async function reviewerPool(db:FirebaseFirestore.Firestore,code:string){
  const snap=await db.collection('localizationCollaborators').where('status','==','active').get();
  return snap.docs.filter(doc=>collaboratorAllows(doc.data()||{},'reviewer',code)).map(doc=>doc.id);
}
async function publishProposal(
  db:FirebaseFirestore.Firestore,languageId:string,proposalId:string,reviewerUid:string,mode:'automatic'|'manual'
){
  const proposalRef=db.doc(`translations/${languageId}/proposals/${proposalId}`);
  const translationRef=db.doc('translations/'+languageId);
  await db.runTransaction(async transaction=>{
    const [proposalSnapshot,translationSnapshot,languageSnapshot]=await Promise.all([
      transaction.get(proposalRef),transaction.get(translationRef),transaction.get(db.doc('languages/'+languageId)),
    ]);
    if(!proposalSnapshot.exists)throw new Error('The translation proposal was not found.');
    if(!languageSnapshot.exists||languageSnapshot.data()?.enabled===false)throw new Error('The platform language is not available.');
    const proposal=proposalSnapshot.data()||{};
    if(!['pending','reviewing'].includes(String(proposal.status||'')))throw new Error('This proposal is no longer awaiting publication.');
    const key=translationKey(proposal.key);
    const value=clean(proposal.proposedValue,12000);
    if(!key||!value)throw new Error('The proposal is incomplete.');
    const translation=translationSnapshot.data()||{};
    const values=translation.values&&typeof translation.values==='object'
      ?{...(translation.values as Record<string,unknown>)}:{};
    values[key]=value;
    transaction.set(db.doc(`locales/${languageId}/translations/${key}`),{
      key,locale:languageId,namespace:key.split('.')[0],value,status:'published',
      version:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp(),updatedBy:reviewerUid,
    },{merge:true});
    transaction.set(db.doc(`locales/${languageId}`),{
      version:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    transaction.set(translationRef,{
      id:languageId,languageCode:languageId,code:languageId,sharingScope:'shared',
      scope:'platform',platformOwned:true,organizationId:'',ownerOrganizationId:'',
      values,translationRevision:Number(translation.translationRevision||0)+1,
      lastReviewedBy:reviewerUid,lastReviewedAt:FieldValue.serverTimestamp(),
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    transaction.update(proposalRef,{
      status:'approved',publicationMode:mode,publishedBy:reviewerUid,
      publishedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    });
  });
}
async function safeUser(db:FirebaseFirestore.Firestore,uid:string){
  const snap=await db.doc('users/'+uid).get();
  const data=snap.data()||{};
  return {uid,email:clean(data.email,320),displayName:clean(data.displayName||data.name,200)};
}

export default async function handler(req:Request,res:Response){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
  try{
    const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};
    const action=clean(body.action,80);
    const ctx=await authenticateTenant(req,undefined,true);
    const db=ctx.db;
    const uid=ctx.auth.uid;
    const profile=await safeUser(db,uid);

    if(action==='status'){
      const [application,collab,languageSnap]=await Promise.all([
        db.doc('localizationApplications/'+uid).get(),collaborator(db,uid),
        db.collection('languages').where('enabled','==',true).get(),
      ]);
      return res.status(200).json({ok:true,
        application:application.exists?{id:application.id,...application.data()}:null,
        collaborator:collab,
        languages:languageSnap.docs.map(doc=>({code:doc.id,name:clean(doc.data()?.name||doc.id,120),nativeName:clean(doc.data()?.nativeName,120)}))
          .filter(item=>!isEnglishLocale(item.code)).sort((a,b)=>a.name.localeCompare(b.name)),
      });
    }

    if(action==='apply'){
      const requestedLanguages=languages(body.languages).filter(item=>item!=='*');
      if(!requestedLanguages.length)throw new Error('Choose at least one language you can help localize.');
      const requestedRoles=roles(body.roles);
      if(!requestedRoles.length)requestedRoles.push('translator');
      const note=clean(body.note,3000);
      const ref=db.doc('localizationApplications/'+uid);
      const old=await ref.get();
      if(old.exists&&String(old.data()?.status||'')==='approved')throw new Error('Your localization application is already approved.');
      await ref.set({
        uid,email:profile.email,displayName:profile.displayName,
        languages:requestedLanguages,roles:requestedRoles,note,status:'pending',
        submittedAt:old.data()?.submittedAt||FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      const superAdmins=await db.collection('users').where('role','==','super_admin').limit(25).get();
      await Promise.all(superAdmins.docs.filter(doc=>doc.id!==uid).map(doc=>createNotification(db,{
        recipientId:doc.id,type:'invitation',
        title:'Localization application',
        body:`${profile.displayName||profile.email||'A VOP member'} applied to help with ${requestedLanguages.join(', ').toUpperCase()} localization.`,
        actionUrl:'/admin/translations',
        metadata:{source:'localization-application',applicantUid:uid,languages:requestedLanguages,roles:requestedRoles},
        createdBy:uid,
      })));
      return res.status(200).json({ok:true,status:'pending'});
    }

    if(action==='listApplications'){
      if(!ctx.isSuperAdmin)throw new Error('Only Super Admin can review localization applications.');
      const snap=await db.collection('localizationApplications').orderBy('updatedAt','desc').limit(300).get();
      return res.status(200).json({ok:true,items:snap.docs.map(doc=>({id:doc.id,...doc.data()}))});
    }

    if(action==='setApplication'){
      if(!ctx.isSuperAdmin)throw new Error('Only Super Admin can review localization applications.');
      const applicantUid=clean(body.uid,160);
      const decision=body.decision==='approve'?'approved':body.decision==='reject'?'rejected':'';
      if(!applicantUid||!decision)throw new Error('Applicant and decision are required.');
      const ref=db.doc('localizationApplications/'+applicantUid);
      const snap=await ref.get();
      if(!snap.exists)throw new Error('Localization application was not found.');
      const data=snap.data()||{};
      await ref.set({status:decision,reviewedBy:uid,reviewedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      if(decision==='approved'){
        await db.doc('localizationCollaborators/'+applicantUid).set({
          uid:applicantUid,email:clean(data.email,320),displayName:clean(data.displayName,200),
          roles:roles(data.roles).length?roles(data.roles):['translator'],
          languages:languages(data.languages),status:'active',source:'application',
          invitedBy:uid,approvedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
        },{merge:true});
      }
      await createNotification(db,{
        recipientId:applicantUid,type:'invitation',
        title:decision==='approved'?'Localization application approved':'Localization application update',
        body:decision==='approved'
          ?'Your localization application was approved. Open Personal Settings to access your assigned translation/review work.'
          :'Your localization application was reviewed and was not approved at this time.',
        actionUrl:'/personal-settings',
        metadata:{source:'localization-application-decision',status:decision},
        createdBy:uid,
      });
      return res.status(200).json({ok:true,status:decision});
    }

    if(action==='listCollaborators'){
      if(!ctx.isSuperAdmin)throw new Error('Only Super Admin can manage localization collaborators.');
      const snap=await db.collection('localizationCollaborators').limit(300).get();
      return res.status(200).json({ok:true,items:snap.docs.map(doc=>({id:doc.id,...doc.data()}))});
    }

    if(action==='setCollaborator'){
      if(!ctx.isSuperAdmin)throw new Error('Only Super Admin can invite localization collaborators.');
      const email=clean(body.email,320).toLowerCase();
      let collaboratorUid=clean(body.uid,160);
      if(!collaboratorUid&&email){
        const userSnap=await db.collection('users').where('email','==',email).limit(1).get();
        collaboratorUid=userSnap.docs[0]?.id||'';
      }
      if(!collaboratorUid)throw new Error('The collaborator must already have a VOP account. Enter their account email.');
      const user=await safeUser(db,collaboratorUid);
      const assignedRoles=roles(body.roles);
      const assignedLanguages=languages(body.languages);
      if(!assignedRoles.length)throw new Error('Choose translator, reviewer, or both.');
      if(!assignedLanguages.length)throw new Error('Assign at least one language or all languages.');
      const status=body.status==='inactive'?'inactive':'active';
      await db.doc('localizationCollaborators/'+collaboratorUid).set({
        uid:collaboratorUid,email:user.email,displayName:user.displayName,
        roles:assignedRoles,languages:assignedLanguages,status,source:'invite',
        invitedBy:uid,updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      if(status==='active'){
        await createNotification(db,{
          recipientId:collaboratorUid,type:'invitation',
          title:'Localization role assigned',
          body:`You were assigned as ${assignedRoles.join(' and ')} for ${assignedLanguages.includes('*')?'all enabled languages':assignedLanguages.join(', ').toUpperCase()}.`,
          actionUrl:'/personal-settings',
          metadata:{source:'localization-role',roles:assignedRoles,languages:assignedLanguages},
          createdBy:uid,
        });
      }
      return res.status(200).json({ok:true,item:{uid:collaboratorUid,email:user.email,displayName:user.displayName,roles:assignedRoles,languages:assignedLanguages,status}});
    }

    if(action==='listProposals'){
      const collab=await collaborator(db,uid);
      if(!ctx.isSuperAdmin&&(!collab||collab.status!=='active'))throw new Error('You are not an active localization collaborator.');
      const requested=clean(body.languageId,40).toLowerCase();
      const allowed=ctx.isSuperAdmin?['*']:languages(collab?.languages);
      const languageDocs=requested
        ?[requested]
        :allowed.includes('*')
          ?(await db.collection('languages').where('enabled','==',true).get()).docs.map(doc=>doc.id).filter(code=>!isEnglishLocale(code))
          :allowed;
      const items:Record<string,unknown>[]=[];
      for(const code of languageDocs.slice(0,50)){
        if(isEnglishLocale(code))continue;
        if(!ctx.isSuperAdmin&&!allowed.includes('*')&&!allowed.includes(code))continue;
        const snap=await db.collection(`translations/${code}/proposals`).where('status','in',['pending','reviewing']).limit(100).get();
        for(const doc of snap.docs)items.push({id:doc.id,languageId:code,...doc.data()});
      }
      return res.status(200).json({ok:true,items});
    }

    if(action==='submitProposal'){
      const code=languageCode(body.languageId);
      const collab=await collaborator(db,uid);
      if(!ctx.isSuperAdmin&&!collaboratorAllows(collab,'translator',code))throw new Error('You are not assigned as a translator for this language.');
      if(!(await enabledLanguage(db,code)))throw new Error('This language is not currently enabled.');
      const key=translationKey(body.key);
      const proposedValue=clean(body.proposedValue,12000);
      if(!key||!proposedValue)throw new Error('Translation key and proposed value are required.');
      const canonical=await db.doc(`locales/${code}/translations/${key}`).get();
      const currentValue=clean(canonical.data()?.value,12000);
      if(currentValue===proposedValue)throw new Error('The proposed translation is identical to the current translation.');
      const existing=await db.collection(`translations/${code}/proposals`).where('proposerUid','==',uid).limit(100).get();
      if(existing.docs.some(doc=>String(doc.data()?.key||'')===key&&['pending','reviewing'].includes(String(doc.data()?.status||''))))throw new Error('You already have an open proposal for this key.');
      const ref=db.collection(`translations/${code}/proposals`).doc();
      await ref.set({
        id:ref.id,languageId:code,key,currentValue,proposedValue,reason:clean(body.reason,3000),
        proposerUid:uid,proposerEmail:profile.email,proposerName:profile.displayName,
        status:'pending',recommendationPercent:0,positiveRecommendations:0,totalReviewers:0,
        createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
      });
      return res.status(200).json({ok:true,item:{id:ref.id,languageId:code,key,status:'pending'}});
    }

    if(action==='recommend'){
      const code=languageCode(body.languageId);
      const proposalId=clean(body.proposalId,160);
      const decision=body.decision==='recommend'?'recommend':body.decision==='reject'?'reject':'';
      if(!proposalId||!decision)throw new Error('Proposal and recommendation are required.');
      const collab=await collaborator(db,uid);
      if(!ctx.isSuperAdmin&&!collaboratorAllows(collab,'reviewer',code))throw new Error('You are not assigned as a reviewer for this language.');
      const proposalRef=db.doc(`translations/${code}/proposals/${proposalId}`);
      const proposal=await proposalRef.get();
      if(!proposal.exists)throw new Error('The translation proposal was not found.');
      if(!['pending','reviewing'].includes(String(proposal.data()?.status||'')))throw new Error('This proposal is no longer open for review.');
      if(String(proposal.data()?.proposerUid||'')===uid&&!ctx.isSuperAdmin)throw new Error('Translators cannot review their own proposal.');
      await proposalRef.collection('recommendations').doc(uid).set({
        reviewerUid:uid,decision,reviewedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      const [pool,recommendations]=await Promise.all([reviewerPool(db,code),proposalRef.collection('recommendations').get()]);
      const eligible=new Set(pool);
      if(ctx.isSuperAdmin)eligible.add(uid);
      const votes=recommendations.docs.filter(doc=>eligible.has(doc.id));
      const positive=votes.filter(doc=>doc.data()?.decision==='recommend').length;
      const total=Math.max(1,pool.length);
      const percent=Math.round((positive/total)*10000)/100;
      await proposalRef.set({
        status:'reviewing',positiveRecommendations:positive,totalReviewers:pool.length,
        recommendationPercent:percent,updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      if(percent>=90){
        await publishProposal(db,code,proposalId,uid,'automatic');
        return res.status(200).json({ok:true,status:'approved',recommendationPercent:percent,autoPublished:true});
      }
      return res.status(200).json({ok:true,status:'reviewing',recommendationPercent:percent,autoPublished:false});
    }

    if(action==='approveProposal'){
      if(!ctx.isSuperAdmin)throw new Error('Only Super Admin can force-publish a localization proposal.');
      const code=languageCode(body.languageId);
      const proposalId=clean(body.proposalId,160);
      if(!proposalId)throw new Error('Proposal is required.');
      await publishProposal(db,code,proposalId,uid,'manual');
      return res.status(200).json({ok:true,status:'approved'});
    }

    return res.status(400).json({error:'Unsupported localization action.'});
  }catch(error){
    const message=error instanceof Error?error.message:'Localization request failed.';
    const forbidden=/only|not assigned|not active|cannot|permission/i.test(message);
    return res.status(forbidden?403:400).json({error:message});
  }
}
