import { signInWithCustomToken } from 'firebase/auth';
import { auth, authPersistenceReady } from '../lib/firebase';

type BeginRegistration={
  challenge:string;challengeToken:string;rpId:string;rpName:string;timeout:number;
  user:{id:string;name:string;displayName:string};
};
type BeginAuthentication={challenge:string;challengeToken:string;rpId:string;timeout:number};
export type PasskeyRecord={id:string;label:string;transports:string[];createdAt?:string;lastUsedAt?:string};

function encode(buffer:ArrayBuffer){
  const bytes=new Uint8Array(buffer);
  let binary='';
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decode(value:string){
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(normalized+'='.repeat((4-normalized.length%4)%4));
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}
async function api<T>(action:string,data:Record<string,unknown>={},authenticated=false):Promise<T>{
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(authenticated){
    if(!auth?.currentUser)throw new Error('Sign in before managing passkeys.');
    headers.Authorization='Bearer '+await auth.currentUser.getIdToken();
  }
  const response=await fetch('/api/passkeys',{
    method:'POST',headers,body:JSON.stringify({action,...data}),
  });
  const payload=await response.json().catch(()=>({})) as T&{error?:string};
  if(!response.ok)throw new Error(payload.error||'Passkey request failed.');
  return payload;
}

export function passkeysSupported(){
  return typeof window!=='undefined'
    &&window.isSecureContext
    &&typeof PublicKeyCredential!=='undefined'
    &&Boolean(navigator.credentials);
}
export async function platformPasskeyAvailable(){
  if(!passkeysSupported())return false;
  try{return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();}
  catch{return false;}
}
export async function listPasskeys(){
  const result=await api<{items?:PasskeyRecord[]}>('status',{},true);
  return result.items||[];
}

type AttestationResponseWithKey=AuthenticatorAttestationResponse&{
  getPublicKey?:()=>ArrayBuffer|null;
  getPublicKeyAlgorithm?:()=>number;
  getAuthenticatorData?:()=>ArrayBuffer;
  getTransports?:()=>string[];
};

export async function registerPasskey(label='This device'){
  if(!passkeysSupported())throw new Error('Passkeys are not supported in this browser or connection.');
  const begin=await api<BeginRegistration>('beginRegistration',{},true);
  const credential=await navigator.credentials.create({
    publicKey:{
      challenge:decode(begin.challenge),
      rp:{name:begin.rpName,id:begin.rpId},
      user:{id:decode(begin.user.id),name:begin.user.name,displayName:begin.user.displayName},
      pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
      authenticatorSelection:{residentKey:'required',requireResidentKey:true,userVerification:'required'},
      attestation:'none',
      timeout:begin.timeout,
    },
  }) as PublicKeyCredential|null;
  if(!credential)throw new Error('Passkey creation was cancelled.');
  const response=credential.response as AttestationResponseWithKey;
  const publicKey=response.getPublicKey?.();
  const authenticatorData=response.getAuthenticatorData?.();
  const algorithm=response.getPublicKeyAlgorithm?.();
  if(!publicKey||!authenticatorData||!Number.isFinite(Number(algorithm))){
    throw new Error('This browser cannot export the passkey public key required by VOP. Update the browser or use another supported device.');
  }
  await api('finishRegistration',{
    challengeToken:begin.challengeToken,
    credentialId:credential.id,
    clientDataJSON:encode(response.clientDataJSON),
    authenticatorData:encode(authenticatorData),
    publicKeyDer:encode(publicKey),
    algorithm:Number(algorithm),
    transports:response.getTransports?.()||[],
    label,
  },true);
}

export async function signInWithPasskey(){
  if(!auth)throw new Error('Firebase authentication is not configured.');
  if(!passkeysSupported())throw new Error('Passkeys are not supported in this browser or connection.');
  const begin=await api<BeginAuthentication>('beginAuthentication');
  const credential=await navigator.credentials.get({
    publicKey:{
      challenge:decode(begin.challenge),
      rpId:begin.rpId,
      allowCredentials:[],
      userVerification:'required',
      timeout:begin.timeout,
    },
  }) as PublicKeyCredential|null;
  if(!credential)throw new Error('Passkey sign-in was cancelled.');
  const response=credential.response as AuthenticatorAssertionResponse;
  const finish=await api<{customToken:string}>('finishAuthentication',{
    challengeToken:begin.challengeToken,
    credentialId:credential.id,
    clientDataJSON:encode(response.clientDataJSON),
    authenticatorData:encode(response.authenticatorData),
    signature:encode(response.signature),
  });
  if(!finish.customToken)throw new Error('VOP did not return a Firebase sign-in token.');
  await authPersistenceReady;
  return signInWithCustomToken(auth,finish.customToken);
}

export async function deletePasskey(credentialHash:string){
  await api('deleteCredential',{credentialHash},true);
}
