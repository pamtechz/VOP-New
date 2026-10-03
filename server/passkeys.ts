import {
  createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature,
} from 'node:crypto';

export type PasskeyPurpose='registration'|'authentication';
export type PasskeyChallengePayload={
  v:1;
  purpose:PasskeyPurpose;
  challenge:string;
  uid?:string;
  origin:string;
  rpId:string;
  exp:number;
};

function b64url(input:Buffer|string){
  const data=Buffer.isBuffer(input)?input:Buffer.from(input,'utf8');
  return data.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function fromB64url(value:string){
  const safe=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const padding='='.repeat((4-safe.length%4)%4);
  return Buffer.from(safe+padding,'base64');
}
export function randomChallenge(){return b64url(randomBytes(32));}
export function credentialDocumentId(credentialId:string){
  return b64url(createHash('sha256').update(String(credentialId||'')).digest());
}
export function userHandle(uid:string){
  return b64url(createHash('sha256').update(String(uid||'')).digest());
}
function signingSecret(){
  const secret=String(process.env.PASSKEY_CHALLENGE_SECRET||process.env.FIREBASE_ADMIN_PRIVATE_KEY||'')
    .replace(/\\n/g,'\n');
  if(secret.length<32)throw new Error('Server passkey signing configuration is missing.');
  return secret;
}
export function signPasskeyChallenge(payload:PasskeyChallengePayload){
  const encoded=b64url(JSON.stringify(payload));
  const signature=b64url(createHmac('sha256',signingSecret()).update(encoded).digest());
  return encoded+'.'+signature;
}
export function verifyPasskeyChallenge(token:string,purpose:PasskeyPurpose){
  const [encoded,signature,extra]=String(token||'').split('.');
  if(!encoded||!signature||extra)throw new Error('Passkey challenge is invalid.');
  const expected=createHmac('sha256',signingSecret()).update(encoded).digest();
  const actual=fromB64url(signature);
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('Passkey challenge is invalid.');
  let payload:PasskeyChallengePayload;
  try{payload=JSON.parse(fromB64url(encoded).toString('utf8')) as PasskeyChallengePayload;}
  catch{throw new Error('Passkey challenge is invalid.');}
  if(payload.v!==1||payload.purpose!==purpose||!payload.challenge||!payload.origin||!payload.rpId)
    throw new Error('Passkey challenge is invalid.');
  if(!Number.isFinite(payload.exp)||Date.now()>payload.exp)throw new Error('Passkey challenge expired. Start again.');
  return payload;
}
export function requestOrigin(headers:Record<string,string|string[]|undefined>|undefined){
  const first=(name:string)=>{
    const raw=headers?.[name]??headers?.[name.toLowerCase()];
    return Array.isArray(raw)?String(raw[0]||''):String(raw||'');
  };
  const host=(first('x-forwarded-host')||first('host')).split(',')[0].trim();
  const forwardedProto=first('x-forwarded-proto').split(',')[0].trim();
  const proto=forwardedProto||(host.startsWith('localhost')||host.startsWith('127.0.0.1')?'http':'https');
  const headerOrigin=first('origin').trim();
  const derived=host?`${proto}://${host}`:'';
  const origin=headerOrigin||derived;
  if(!origin)throw new Error('Passkey origin could not be determined.');
  let parsed:URL;
  try{parsed=new URL(origin);}catch{throw new Error('Passkey origin is invalid.');}
  if(derived){
    const expected=new URL(derived);
    if(parsed.hostname!==expected.hostname)throw new Error('Passkey origin does not match this VOP site.');
  }
  if(parsed.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(parsed.hostname))
    throw new Error('Passkeys require a secure HTTPS connection.');
  return {origin:parsed.origin,rpId:parsed.hostname};
}
export function parseClientData(clientDataJSON:string){
  let value:Record<string,unknown>;
  try{value=JSON.parse(fromB64url(clientDataJSON).toString('utf8')) as Record<string,unknown>;}
  catch{throw new Error('Passkey client data is invalid.');}
  return value;
}
export function validateClientData(
  clientDataJSON:string,
  payload:PasskeyChallengePayload,
  expectedType:'webauthn.create'|'webauthn.get',
){
  const client=parseClientData(clientDataJSON);
  if(String(client.type||'')!==expectedType)throw new Error('Passkey ceremony type is invalid.');
  if(String(client.challenge||'')!==payload.challenge)throw new Error('Passkey challenge does not match.');
  if(String(client.origin||'')!==payload.origin)throw new Error('Passkey origin does not match this VOP site.');
}
export function validateAuthenticatorData(authenticatorData:string,rpId:string){
  const data=fromB64url(authenticatorData);
  if(data.length<37)throw new Error('Passkey authenticator data is incomplete.');
  const expected=createHash('sha256').update(rpId).digest();
  const actual=data.subarray(0,32);
  if(!timingSafeEqual(actual,expected))throw new Error('Passkey is registered for a different site.');
  const flags=data[32];
  if((flags&0x01)===0)throw new Error('Passkey did not confirm user presence.');
  if((flags&0x04)===0)throw new Error('Passkey did not complete fingerprint, face, PIN, or device verification.');
  return {data,signCount:data.readUInt32BE(33)};
}
export function verifyPasskeyAssertion(input:{
  authenticatorData:string;
  clientDataJSON:string;
  signature:string;
  publicKeyDer:string;
  algorithm:number;
}){
  if(![-7,-257].includes(Number(input.algorithm)))throw new Error('This passkey algorithm is not supported.');
  const authenticator=fromB64url(input.authenticatorData);
  const client=fromB64url(input.clientDataJSON);
  const signed=Buffer.concat([authenticator,createHash('sha256').update(client).digest()]);
  const key=createPublicKey({key:fromB64url(input.publicKeyDer),format:'der',type:'spki'});
  const valid=verifySignature('sha256',signed,key,fromB64url(input.signature));
  if(!valid)throw new Error('Passkey signature verification failed.');
}
