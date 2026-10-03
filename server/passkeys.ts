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

function readCborLength(data:Buffer,offset:number,additional:number){
  if(additional<24)return {length:additional,offset};
  if(additional===24){
    if(offset+1>data.length)throw new Error('Passkey attestation is truncated.');
    return {length:data.readUInt8(offset),offset:offset+1};
  }
  if(additional===25){
    if(offset+2>data.length)throw new Error('Passkey attestation is truncated.');
    return {length:data.readUInt16BE(offset),offset:offset+2};
  }
  if(additional===26){
    if(offset+4>data.length)throw new Error('Passkey attestation is truncated.');
    return {length:data.readUInt32BE(offset),offset:offset+4};
  }
  if(additional===27){
    if(offset+8>data.length)throw new Error('Passkey attestation is truncated.');
    const value=data.readBigUInt64BE(offset);
    if(value>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Passkey attestation contains an unsupported length.');
    return {length:Number(value),offset:offset+8};
  }
  throw new Error('Passkey attestation uses unsupported CBOR encoding.');
}
function parseCbor(data:Buffer,start=0):{value:unknown;offset:number}{
  if(start>=data.length)throw new Error('Passkey attestation is truncated.');
  const first=data[start];
  const major=first>>5;
  const additional=first&31;
  let offset=start+1;
  if(major===0||major===1){
    const result=readCborLength(data,offset,additional);offset=result.offset;
    return {value:major===0?result.length:-1-result.length,offset};
  }
  if(major===2||major===3){
    const result=readCborLength(data,offset,additional);offset=result.offset;
    if(result.length>data.length-offset)throw new Error('Passkey attestation is truncated.');
    const bytes=data.subarray(offset,offset+result.length);
    return {value:major===2?Buffer.from(bytes):bytes.toString('utf8'),offset:offset+result.length};
  }
  if(major===4){
    const result=readCborLength(data,offset,additional);offset=result.offset;
    const values:unknown[]=[];
    for(let index=0;index<result.length;index+=1){
      const item=parseCbor(data,offset);values.push(item.value);offset=item.offset;
    }
    return {value:values,offset};
  }
  if(major===5){
    const result=readCborLength(data,offset,additional);offset=result.offset;
    const map=new Map<unknown,unknown>();
    for(let index=0;index<result.length;index+=1){
      const key=parseCbor(data,offset);offset=key.offset;
      const value=parseCbor(data,offset);offset=value.offset;
      map.set(key.value,value.value);
    }
    return {value:map,offset};
  }
  if(major===6){
    const tag=readCborLength(data,offset,additional);offset=tag.offset;
    return parseCbor(data,offset);
  }
  if(major===7){
    if(additional===20)return {value:false,offset};
    if(additional===21)return {value:true,offset};
    if(additional===22||additional===23)return {value:null,offset};
  }
  throw new Error('Passkey attestation contains unsupported CBOR data.');
}
function mapValue(map:Map<unknown,unknown>,key:unknown){return map.get(key);}
function asMap(value:unknown){
  if(!(value instanceof Map))throw new Error('Passkey attestation structure is invalid.');
  return value as Map<unknown,unknown>;
}
function asBuffer(value:unknown,label:string){
  if(!Buffer.isBuffer(value))throw new Error(`Passkey ${label} is invalid.`);
  return value;
}
function validateAuthenticatorBuffer(data:Buffer,rpId:string,requireAttestedCredential=false){
  if(data.length<37)throw new Error('Passkey authenticator data is incomplete.');
  const expected=createHash('sha256').update(rpId).digest();
  const actual=data.subarray(0,32);
  if(!timingSafeEqual(actual,expected))throw new Error('Passkey is registered for a different site.');
  const flags=data[32];
  if((flags&0x01)===0)throw new Error('Passkey did not confirm user presence.');
  if((flags&0x04)===0)throw new Error('Passkey did not complete fingerprint, face, PIN, or device verification.');
  if(requireAttestedCredential&&(flags&0x40)===0)throw new Error('Passkey registration did not include attested credential data.');
  return {data,flags,signCount:data.readUInt32BE(33)};
}
export function validateAuthenticatorData(authenticatorData:string,rpId:string){
  return validateAuthenticatorBuffer(fromB64url(authenticatorData),rpId,false);
}
function cosePublicKey(coseValue:unknown){
  const cose=asMap(coseValue);
  const kty=Number(mapValue(cose,1));
  const algorithm=Number(mapValue(cose,3));
  if(kty===2&&algorithm===-7){
    const curve=Number(mapValue(cose,-1));
    const x=asBuffer(mapValue(cose,-2),'EC x-coordinate');
    const y=asBuffer(mapValue(cose,-3),'EC y-coordinate');
    if(curve!==1||x.length!==32||y.length!==32)throw new Error('Unsupported EC passkey credential.');
    const key=createPublicKey({
      key:{kty:'EC',crv:'P-256',x:b64url(x),y:b64url(y),ext:true},
      format:'jwk',
    });
    return {algorithm,publicKeyDer:b64url(key.export({format:'der',type:'spki'}) as Buffer)};
  }
  if(kty===3&&algorithm===-257){
    const modulus=asBuffer(mapValue(cose,-1),'RSA modulus');
    const exponent=asBuffer(mapValue(cose,-2),'RSA exponent');
    if(modulus.length<256||!exponent.length)throw new Error('Unsupported RSA passkey credential.');
    const key=createPublicKey({
      key:{kty:'RSA',n:b64url(modulus),e:b64url(exponent),ext:true},
      format:'jwk',
    });
    return {algorithm,publicKeyDer:b64url(key.export({format:'der',type:'spki'}) as Buffer)};
  }
  throw new Error('This passkey algorithm is not supported.');
}
export function parseRegistrationAttestation(attestationObject:string,rpId:string,expectedCredentialId:string){
  const encoded=fromB64url(attestationObject);
  if(encoded.length>65536)throw new Error('Passkey attestation is too large.');
  const root=asMap(parseCbor(encoded).value);
  const format=String(mapValue(root,'fmt')||'');
  if(format!=='none')throw new Error('This authenticator attestation format is not supported. Try another passkey provider.');
  const authData=asBuffer(mapValue(root,'authData'),'authenticator data');
  const validated=validateAuthenticatorBuffer(authData,rpId,true);
  let offset=37;
  if(offset+18>authData.length)throw new Error('Passkey credential data is incomplete.');
  offset+=16; // AAGUID
  const credentialLength=authData.readUInt16BE(offset);offset+=2;
  if(!credentialLength||offset+credentialLength>authData.length)throw new Error('Passkey credential ID is invalid.');
  const credentialId=b64url(authData.subarray(offset,offset+credentialLength));
  offset+=credentialLength;
  if(credentialId!==expectedCredentialId)throw new Error('Passkey credential ID does not match the attestation.');
  const cose=parseCbor(authData,offset);
  const publicKey=cosePublicKey(cose.value);
  return {...publicKey,signCount:validated.signCount};
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
