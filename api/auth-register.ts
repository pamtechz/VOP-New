import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '../server/tenant.js';

type Request={method?:string;headers?:Record<string,string|string[]|undefined>;body?:unknown};
type Response={status:(code:number)=>Response;json:(body:unknown)=>void};

function header(req:Request,name:string){
  const raw=req.headers?.[name]??req.headers?.[name.toLowerCase()];
  return Array.isArray(raw)?String(raw[0]??''):String(raw??'');
}
function email(value:unknown){return String(value||'').trim().toLowerCase();}
function inviteToken(value:unknown){
  const token=String(value||'').trim();
  return /^[A-Za-z0-9]{32,128}$/.test(token)?token:'';
}
function clientKey(req:Request){
  const raw=header(req,'x-forwarded-for').split(',')[0]?.trim()||header(req,'x-real-ip').trim()||'unknown';
  return raw.replace(/[^A-Za-z0-9:._-]/g,'_').slice(0,120)||'unknown';
}
async function invitationAllowsRegistration(db:ReturnType<typeof getAdminDb>,token:string,address:string){
  if(!token)return false;
  const snapshot=await db.doc('organizationInvites/'+token).get();
  if(!snapshot.exists)return false;
  const data=snapshot.data()||{};
  const expiresAt=Date.parse(String(data.expiresAt||''));
  if(data.status!=='pending'||!Number.isFinite(expiresAt)||expiresAt<Date.now())return false;
  const bound=email(data.email);
  return !bound||bound===address;
}
async function enforceRateLimit(db:ReturnType<typeof getAdminDb>,key:string){
  const bucket=Math.floor(Date.now()/900_000);
  const ref=db.doc('authRateLimits/registration:'+key+':'+bucket);
  await db.runTransaction(async transaction=>{
    const snap=await transaction.get(ref);
    const count=Math.max(0,Number(snap.data()?.count||0));
    if(count>=8)throw new Error('Too many registration attempts. Try again later.');
    transaction.set(ref,{count:count+1,updatedAt:FieldValue.serverTimestamp(),expiresAt:new Date(Date.now()+3_600_000).toISOString()},{merge:true});
  });
}

export default async function handler(req:Request,res:Response){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
  const db=getAdminDb();
  let createdUid='';
  try{
    await enforceRateLimit(db,clientKey(req));
    const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};
    const address=email(body.email);
    const password=String(body.password||'');
    const token=inviteToken(body.inviteToken);
    if(!/^\S+@\S+\.\S+$/.test(address))return res.status(400).json({error:'Enter a valid email address.'});
    if(password.length<6||password.length>128)return res.status(400).json({error:'Password must contain between 6 and 128 characters.'});

    const settings=await db.doc('system/settings').get();
    const options=settings.data()?.systemOptions||{};
    const open=options.allowRegistrations===true;
    const invited=await invitationAllowsRegistration(db,token,address);
    if(!open&&!invited){
      return res.status(403).json({error:'New account registration is currently closed. Use a valid organization invitation or contact VOP administration.'});
    }

    const auth=getAuth();
    const record=await auth.createUser({email:address,password,emailVerified:false,disabled:false});
    createdUid=record.uid;
    const now=new Date().toISOString();
    await db.doc('users/'+record.uid).set({
      uid:record.uid,email:address,displayName:address.split('@')[0]||'VOP Student',
      photoURL:null,role:'student',organizationId:'',organizationRole:'',
      adminNodeType:null,adminNodeId:null,
      privileges:{admin:false,superAdmin:false,guardian:false,editor:false,manager:false,developer:false,coordinator:false},
      information:{enrollmentDate:now,graduating:false,graduated:false,baptismCandidate:false,baptized:false},
      progress:{discoverProgress:0,completedGuidesCount:0,totalGuidesCount:0,guideScores:{},completedLessons:[]},
      registration:{source:invited?'organization_invitation':'open_registration',inviteToken:invited?token:'',approvalRequired:options.requireApproval===true,status:options.requireApproval===true?'pending_approval':'active'},
      createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    },{merge:false});
    if(options.requireApproval===true)await auth.updateUser(record.uid,{disabled:true});
    if(options.requireApproval===true){
      return res.status(202).json({ok:true,approvalRequired:true,message:'Your account has been created and is awaiting approval.'});
    }
    const customToken=await auth.createCustomToken(record.uid);
    return res.status(201).json({ok:true,approvalRequired:false,customToken});
  }catch(error){
    if(createdUid){
      try{await getAuth().deleteUser(createdUid);}catch{/* rollback best effort */}
      try{await db.doc('users/'+createdUid).delete();}catch{/* rollback best effort */}
    }
    const message=error instanceof Error?error.message:'Registration failed.';
    const status=/too many/i.test(message)?429:/already exists|email-already-exists/i.test(message)?409:400;
    return res.status(status).json({error:message});
  }
}
