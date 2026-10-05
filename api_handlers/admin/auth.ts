import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '../../server/tenant.js';

type Request={method?:string;headers?:Record<string,string|string[]|undefined>;body?:unknown;query?:Record<string,unknown>};
type Response={status:(code:number)=>Response;json:(body:unknown)=>void};

function header(req:Request,name:string){
  const raw=req.headers?.[name]??req.headers?.[name.toLowerCase()];
  return Array.isArray(raw)?String(raw[0]??''):String(raw??'');
}
function requestedAction(req:Request){
  const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};
  const query=req.query&&typeof req.query==='object'?req.query:{};
  const raw=body.action??query.action;
  return Array.isArray(raw)?String(raw[0]||''):String(raw||'');
}
function address(value:unknown){return String(value||'').trim().toLowerCase();}
function invitationToken(value:unknown){
  const token=String(value||'').trim();
  return /^[A-Za-z0-9]{32,128}$/.test(token)?token:'';
}
function clientKey(req:Request){
  const raw=header(req,'x-forwarded-for').split(',')[0]?.trim()||header(req,'x-real-ip').trim()||'unknown';
  return raw.replace(/[^A-Za-z0-9:._-]/g,'_').slice(0,120)||'unknown';
}
async function invitationAllowsRegistration(db:ReturnType<typeof getAdminDb>,token:string,email:string){
  if(!token)return false;
  const snapshot=await db.doc('organizationInvites/'+token).get();
  if(!snapshot.exists)return false;
  const data=snapshot.data()||{};
  const expiresAt=Date.parse(String(data.expiresAt||''));
  if(data.status!=='pending'||!Number.isFinite(expiresAt)||expiresAt<Date.now())return false;
  const bound=address(data.email);
  return !bound||bound===email;
}
async function enforceRateLimit(db:ReturnType<typeof getAdminDb>,key:string){
  const bucket=Math.floor(Date.now()/900_000);
  const ref=db.doc('authRateLimits/registration:'+key+':'+bucket);
  await db.runTransaction(async transaction=>{
    const snap=await transaction.get(ref);
    const count=Math.max(0,Number(snap.data()?.count||0));
    if(count>=8)throw new Error('Too many registration attempts. Try again later.');
    transaction.set(ref,{
      count:count+1,updatedAt:FieldValue.serverTimestamp(),
      expiresAt:new Date(Date.now()+3_600_000).toISOString(),
    },{merge:true});
  });
}
async function publicPolicy(){
  try{
    const snapshot=await getAdminDb().doc('system/settings').get();
    const settings=snapshot.data()||{};
    const options=settings.systemOptions&&typeof settings.systemOptions==='object'
      ?settings.systemOptions as Record<string,unknown>:{};
    return {
      registration:{
        allowRegistrations:options.allowRegistrations===true,
        requireApproval:options.requireApproval===true,
      },
      pwa:{enabled:options.enablePwa===true},
      maintenanceMode:options.maintenanceMode===true,
    };
  }catch{
    return {
      registration:{allowRegistrations:false,requireApproval:false},
      pwa:{enabled:false},maintenanceMode:false,
    };
  }
}

export default async function handler(req:Request,res:Response){
  const action=requestedAction(req)||(req.method==='GET'?'policy':'');
  if(action==='policy'){
    if(req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
    return res.status(200).json({ok:true,...await publicPolicy()});
  }
  if(action!=='register'||req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});

  const db=getAdminDb();
  let createdUid='';
  try{
    await enforceRateLimit(db,clientKey(req));
    const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};
    const email=address(body.email);
    const password=String(body.password||'');
    const token=invitationToken(body.inviteToken);
    if(!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'Enter a valid email address.'});
    if(password.length<6||password.length>128)return res.status(400).json({error:'Password must contain between 6 and 128 characters.'});

    const settings=await db.doc('system/settings').get();
    const options=settings.data()?.systemOptions||{};
    const invited=await invitationAllowsRegistration(db,token,email);
    if(options.allowRegistrations!==true&&!invited){
      return res.status(403).json({error:'New account registration is currently closed. Use a valid organization invitation or contact VOP administration.'});
    }

    const auth=getAuth();
    const record=await auth.createUser({email,password,emailVerified:false,disabled:false});
    createdUid=record.uid;
    const now=new Date().toISOString();
    await db.doc('users/'+record.uid).set({
      uid:record.uid,email,displayName:email.split('@')[0]||'VOP Student',
      photoURL:null,role:'student',organizationId:'',organizationRole:'',
      adminNodeType:null,adminNodeId:null,
      privileges:{admin:false,superAdmin:false,guardian:false,editor:false,manager:false,developer:false,coordinator:false},
      information:{enrollmentDate:now,graduating:false,graduated:false,baptismCandidate:false,baptized:false},
      progress:{discoverProgress:0,completedGuidesCount:0,totalGuidesCount:0,guideScores:{},completedLessons:[]},
      registration:{
        source:invited?'organization_invitation':'open_registration',
        inviteToken:invited?token:'',approvalRequired:options.requireApproval===true&&!invited,
        status:options.requireApproval===true&&!invited?'pending_approval':'active',
      },
      createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    },{merge:false});
    if(options.requireApproval===true&&!invited){
      await auth.updateUser(record.uid,{disabled:true});
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
