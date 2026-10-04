import { FieldValue } from 'firebase-admin/firestore';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getAdminDb } from '../../server/tenant.js';
import {
  credentialDocumentId, parseRegistrationAttestation, randomChallenge, requestOrigin, signPasskeyChallenge, userHandle,
  validateAuthenticatorData, validateClientData, verifyPasskeyAssertion, verifyPasskeyChallenge,
} from '../../server/passkeys.js';

type Request={
  method?:string;
  headers?:Record<string,string|string[]|undefined>;
  body?:unknown;
};
type Response={status:(code:number)=>Response;json:(body:unknown)=>void};

function body(req:Request){return req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};}
function header(req:Request,name:string){
  const raw=req.headers?.[name]??req.headers?.[name.toLowerCase()];
  return Array.isArray(raw)?String(raw[0]||''):String(raw||'');
}
async function authenticated(req:Request):Promise<DecodedIdToken>{
  getAdminDb();
  const authorization=header(req,'authorization');
  if(!authorization.startsWith('Bearer '))throw new Error('Sign in first.');
  return getAuth().verifyIdToken(authorization.slice(7).trim());
}
function requireRecentAuthentication(actor:DecodedIdToken){
  const authTime=Number(actor.auth_time||0);
  if(!authTime||Date.now()/1000-authTime>10*60){
    throw new Error('For security, sign in again before enabling a new passkey.');
  }
}
function clean(value:unknown,max:number){return String(value||'').trim().slice(0,max);}
function credentialId(value:unknown){
  const id=clean(value,2048);
  if(!id||!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('Passkey credential is invalid.');
  return id;
}
function b64(value:unknown,max=20000){
  const text=clean(value,max);
  if(!text||!/^[A-Za-z0-9_-]+$/.test(text))throw new Error('Passkey response data is invalid.');
  return text;
}
function timestampIso(value:unknown){
  const item=value as {toDate?:()=>Date}|undefined;
  if(item?.toDate)return item.toDate().toISOString();
  const date=new Date(String(value||''));
  return Number.isNaN(date.getTime())?'':date.toISOString();
}

export default async function handler(req:Request,res:Response){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
  try{
    const input=body(req);
    const action=clean(input.action,60);
    const site=requestOrigin(req.headers);
    const db=getAdminDb();

    if(action==='beginAuthentication'){
      const challenge=randomChallenge();
      const payload={
        v:1 as const,purpose:'authentication' as const,challenge,
        origin:site.origin,rpId:site.rpId,exp:Date.now()+5*60*1000,
      };
      return res.status(200).json({
        ok:true,challenge,challengeToken:signPasskeyChallenge(payload),
        rpId:site.rpId,timeout:60000,
      });
    }

    if(action==='finishAuthentication'){
      const payload=verifyPasskeyChallenge(clean(input.challengeToken,12000),'authentication');
      if(payload.origin!==site.origin||payload.rpId!==site.rpId)throw new Error('Passkey request site changed. Start again.');
      const id=credentialId(input.credentialId);
      const credentialRef=db.doc('passkeyCredentials/'+credentialDocumentId(id));
      const snapshot=await credentialRef.get();
      if(!snapshot.exists)throw new Error('This passkey is not registered with VOP.');
      const stored=snapshot.data()||{};
      if(String(stored.credentialId||'')!==id)throw new Error('Passkey credential does not match.');
      const clientDataJSON=b64(input.clientDataJSON);
      const authenticatorData=b64(input.authenticatorData);
      validateClientData(clientDataJSON,payload,'webauthn.get');
      const authData=validateAuthenticatorData(authenticatorData,payload.rpId);
      verifyPasskeyAssertion({
        authenticatorData,clientDataJSON,signature:b64(input.signature),
        publicKeyDer:b64(stored.publicKeyDer),algorithm:Number(stored.algorithm),
      });
      const previousCount=Math.max(0,Number(stored.signCount||0));
      if(previousCount>0&&authData.signCount>0&&authData.signCount<=previousCount)
        throw new Error('Passkey counter validation failed. Remove and re-enroll this passkey.');
      if(authData.signCount>0&&authData.signCount!==previousCount){
        await credentialRef.set({
          signCount:authData.signCount,
          lastUsedAt:FieldValue.serverTimestamp(),
        },{merge:true});
      }
      const uid=clean(stored.uid,180);
      if(!uid)throw new Error('Passkey account mapping is invalid.');
      const [authUser,profile]=await Promise.all([
        getAuth().getUser(uid),
        db.doc('users/'+uid).get(),
      ]);
      if(authUser.disabled)throw new Error('This VOP account is disabled.');
      if(!profile.exists)throw new Error('This VOP account no longer exists.');
      const customToken=await getAuth().createCustomToken(uid,{authMethod:'passkey'});
      return res.status(200).json({ok:true,customToken});
    }

    const actor=await authenticated(req);

    if(action==='status'){
      const snapshot=await db.collection('passkeyCredentials').where('uid','==',actor.uid).limit(20).get();
      const items=snapshot.docs.map(doc=>{
        const data=doc.data()||{};
        return {
          id:doc.id,
          label:clean(data.label,120)||'Passkey',
          transports:Array.isArray(data.transports)?data.transports.map(String).slice(0,10):[],
          createdAt:timestampIso(data.createdAt),
          lastUsedAt:timestampIso(data.lastUsedAt),
        };
      });
      return res.status(200).json({ok:true,available:true,items});
    }

    if(action==='beginRegistration'){
      requireRecentAuthentication(actor);
      const existing=await db.collection('passkeyCredentials').where('uid','==',actor.uid).limit(11).get();
      if(existing.size>=10)throw new Error('This account already has the maximum of 10 passkeys.');
      const challenge=randomChallenge();
      const payload={
        v:1 as const,purpose:'registration' as const,challenge,uid:actor.uid,
        origin:site.origin,rpId:site.rpId,exp:Date.now()+5*60*1000,
      };
      return res.status(200).json({
        ok:true,challenge,challengeToken:signPasskeyChallenge(payload),
        rpId:site.rpId,rpName:'Voice of Prophecy',timeout:60000,
        user:{id:userHandle(actor.uid),name:String(actor.email||actor.uid),displayName:String(actor.name||actor.email||'VOP account')},
      });
    }

    if(action==='finishRegistration'){
      requireRecentAuthentication(actor);
      const payload=verifyPasskeyChallenge(clean(input.challengeToken,12000),'registration');
      if(payload.uid!==actor.uid)throw new Error('Passkey challenge belongs to another account.');
      if(payload.origin!==site.origin||payload.rpId!==site.rpId)throw new Error('Passkey request site changed. Start again.');
      const id=credentialId(input.credentialId);
      const clientDataJSON=b64(input.clientDataJSON);
      const attestationObject=b64(input.attestationObject,90000);
      validateClientData(clientDataJSON,payload,'webauthn.create');
      const registration=parseRegistrationAttestation(attestationObject,payload.rpId,id);
      const publicKeyDer=registration.publicKeyDer;
      const algorithm=registration.algorithm;
      const ref=db.doc('passkeyCredentials/'+credentialDocumentId(id));
      const existing=await ref.get();
      if(existing.exists&&String(existing.data()?.uid||'')!==actor.uid)
        throw new Error('This passkey is already registered to another account.');
      const transports=Array.isArray(input.transports)
        ?input.transports.map(value=>clean(value,40)).filter(Boolean).slice(0,10):[];
      await ref.set({
        uid:actor.uid,credentialId:id,publicKeyDer,algorithm,
        signCount:registration.signCount,
        transports,label:clean(input.label,120)||'This device',
        rpId:payload.rpId,
        createdAt:existing.exists?existing.data()?.createdAt||FieldValue.serverTimestamp():FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      return res.status(201).json({ok:true,id:ref.id});
    }

    if(action==='deleteCredential'){
      const key=clean(input.credentialHash,180);
      if(!/^[A-Za-z0-9_-]{20,180}$/.test(key))throw new Error('Choose a valid passkey.');
      const ref=db.doc('passkeyCredentials/'+key);
      const snapshot=await ref.get();
      if(!snapshot.exists)return res.status(200).json({ok:true,deleted:false});
      if(String(snapshot.data()?.uid||'')!==actor.uid)throw new Error('You cannot remove another account passkey.');
      await ref.delete();
      return res.status(200).json({ok:true,deleted:true});
    }

    return res.status(400).json({error:'Unsupported passkey action.'});
  }catch(error){
    const message=error instanceof Error?error.message:'Passkey operation failed.';
    const status=/sign in|id token|auth\//i.test(message)?401
      :/another account|cannot remove/i.test(message)?403
      :400;
    return res.status(status).json({error:message});
  }
}
