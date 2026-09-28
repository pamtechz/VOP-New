import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, requireOrgRole, organizationInHierarchyScope, writeTenantAudit } from '../../server/tenant.js';
import { requirePermission } from '../../server/permissions.js';

type Request = { method?: string; headers?: Record<string,string|string[]|undefined>; body?: unknown };
type Response = { status:(code:number)=>Response; json:(body:unknown)=>void };

export default async function handler(request:Request,response:Response){
  if(request.method!=='POST') return response.status(405).json({error:'Method not allowed.'});
  try{
    const body=request.body&&typeof request.body==='object'?request.body as Record<string,unknown>:{};
    const requestedOrganizationId=typeof body.organizationId==='string'?body.organizationId.trim():'';
    const ctx=await authenticateTenant(request,requestedOrganizationId||undefined);
    await requirePermission(ctx,'users','create');
    if(ctx.tenantType==='hierarchy'){
      if(!requestedOrganizationId || !(await organizationInHierarchyScope(ctx,requestedOrganizationId))) return response.status(403).json({error:'The selected organization is outside your hierarchy scope.'});
    }else requireOrgRole(ctx,['owner','admin']);

    const organizationId=ctx.organizationId||requestedOrganizationId;
    const displayName=typeof body.displayName==='string'?body.displayName.trim():'';
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    const phoneNumber=typeof body.phoneNumber==='string'?body.phoneNumber.trim():'';
    const password=typeof body.password==='string'?body.password:'';
    const guideId=typeof body.guideId==='string'?body.guideId.trim():'';
    if(!organizationId) throw new Error('An organization is required for candidate enrollment.');
    if(!displayName||!email||!guideId) return response.status(400).json({error:'Full name, email and course are required.'});
    if(password&&password.length<6) return response.status(400).json({error:'Password must contain at least 6 characters.'});

    const guideRef=ctx.db.doc(`guides/${guideId}`);
    const guide=await guideRef.get();
    if(!guide.exists) throw new Error('The selected course was not found.');
    const guideData=guide.data()||{};
    if(String(guideData.organizationId||'')!==organizationId) throw new Error('The selected course does not belong to this organization.');
    if(guideData.published!==true||guideData.archived===true) throw new Error('Only a published active course can be used for enrollment.');

    const authService=getAuth(getApps()[0]);
    let account;
    let created=false;
    try{ account=await authService.getUserByEmail(email); }
    catch(error){
      const code=String((error as {code?:unknown})?.code||'');
      if(code!=='auth/user-not-found') throw error;
      account=await authService.createUser({email,displayName,...(phoneNumber?{phoneNumber}:{}),...(password?{password}:{}) ,disabled:false});
      created=true;
    }

    const profileRef=ctx.db.doc(`users/${account.uid}`);
    const profileSnapshot=await profileRef.get();
    const profile=profileSnapshot.exists?profileSnapshot.data()||{}:{};
    const existingOrganizationId=String(profile.organizationId||'').trim();
    if(existingOrganizationId&&existingOrganizationId!==organizationId) throw new Error('This email already belongs to another organization.');
    const now=new Date().toISOString();
    const oldInfo=profile.information&&typeof profile.information==='object'?profile.information as Record<string,unknown>:{};
    const oldProgress=profile.progress&&typeof profile.progress==='object'?profile.progress as Record<string,unknown>:{};
    const information={...oldInfo,enrollmentDate:String(oldInfo.enrollmentDate||now),graduating:Boolean(oldInfo.graduating),graduated:Boolean(oldInfo.graduated),baptismCandidate:Boolean(oldInfo.baptismCandidate),baptized:Boolean(oldInfo.baptized)};
    const progress={...oldProgress,discoverProgress:Number(oldProgress.discoverProgress||0),completedGuidesCount:Number(oldProgress.completedGuidesCount||0),totalGuidesCount:Number(oldProgress.totalGuidesCount||0),guideScores:oldProgress.guideScores||{},completedLessons:Array.isArray(oldProgress.completedLessons)?oldProgress.completedLessons:[]};

    await ctx.db.runTransaction(async transaction=>{
      transaction.set(profileRef,{uid:account.uid,email,displayName:displayName||account.displayName||email.split('@')[0],...(phoneNumber?{phoneNumber}:{}),role:String(profile.role||'student'),userType:'learner',organizationId,organizationRole:'learner',information,progress,updatedAt:FieldValue.serverTimestamp(),createdAt:profile.createdAt||FieldValue.serverTimestamp()},{merge:true});
      transaction.set(ctx.db.doc(`organizations/${organizationId}/members/${account.uid}`),{uid:account.uid,organizationId,role:'learner',active:true,invitedBy:ctx.auth.uid,joinedAt:String(profile.joinedAt||now),updatedAt:now},{merge:true});
      transaction.set(ctx.db.doc(`courseEnrollments/${organizationId}_${account.uid}_${guideId}`),{uid:account.uid,organizationId,guideId,source:'admin',enrolledBy:ctx.auth.uid,enrolledAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),status:'active'},{merge:true});
    });
    await authService.setCustomUserClaims(account.uid,{role:String(profile.role||'student'),organizationId,organizationRole:'learner'});
    const resetLink=!password?await authService.generatePasswordResetLink(email).catch(()=>null):null;
    await writeTenantAudit(ctx,'candidate.enroll',`users/${account.uid}`,undefined,{organizationId,guideId,created});
    return response.status(200).json({ok:true,created,resetLink,candidate:{uid:account.uid,email,displayName:displayName||account.displayName||email.split('@')[0],organizationId,guideId}});
  }catch(error){
    const message=error instanceof Error?error.message:'Candidate enrollment failed.';
    if(message.includes('session')||message.includes('Sign in')) return response.status(401).json({error:message});
    if(message.includes('permission')||message.includes('authorized')||message.includes('outside')||message.includes('organization')) return response.status(403).json({error:message});
    console.error('VOP candidate enrollment failed',error);
    return response.status(500).json({error:message});
  }
}
