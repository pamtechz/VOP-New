import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign as signPayload} from 'node:crypto';
import {
  requestOrigin,signPasskeyChallenge,validateAuthenticatorData,validateClientData,
  verifyPasskeyAssertion,verifyPasskeyChallenge,
} from '../server/passkeys.ts';

function b64url(value:Buffer|string){
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(value,'utf8');
  return bytes.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

test('signed passkey challenges are origin-bound, purpose-bound and expire',()=>{
  const previous=process.env.PASSKEY_CHALLENGE_SECRET;
  process.env.PASSKEY_CHALLENGE_SECRET='unit-passkey-secret-that-is-longer-than-32-bytes';
  try{
    const payload={
      v:1 as const,purpose:'authentication' as const,
      challenge:'challenge-123',origin:'https://vop.example',rpId:'vop.example',
      exp:Date.now()+60_000,
    };
    const token=signPasskeyChallenge(payload);
    assert.deepEqual(verifyPasskeyChallenge(token,'authentication'),payload);
    assert.throws(()=>verifyPasskeyChallenge(token,'registration'),/invalid/i);
    const [body,signature]=token.split('.');
    const tampered=body.slice(0,-1)+(body.endsWith('A')?'B':'A')+'.'+signature;
    assert.throws(()=>verifyPasskeyChallenge(tampered,'authentication'),/invalid/i);
    const expired=signPasskeyChallenge({...payload,exp:Date.now()-1});
    assert.throws(()=>verifyPasskeyChallenge(expired,'authentication'),/expired/i);
  }finally{
    if(previous===undefined)delete process.env.PASSKEY_CHALLENGE_SECRET;
    else process.env.PASSKEY_CHALLENGE_SECRET=previous;
  }
});

test('passkey origins require the request host and HTTPS outside localhost',()=>{
  assert.deepEqual(
    requestOrigin({host:'localhost:5173',origin:'http://localhost:5173'}),
    {origin:'http://localhost:5173',rpId:'localhost'},
  );
  assert.deepEqual(
    requestOrigin({'x-forwarded-host':'vop.example','x-forwarded-proto':'https',origin:'https://vop.example'}),
    {origin:'https://vop.example',rpId:'vop.example'},
  );
  assert.throws(
    ()=>requestOrigin({'x-forwarded-host':'vop.example','x-forwarded-proto':'https',origin:'https://evil.example'}),
    /does not match/i,
  );
  assert.throws(
    ()=>requestOrigin({host:'vop.example',origin:'http://vop.example'}),
    /secure HTTPS/i,
  );
});

test('server verifies user presence, user verification and P-256 assertion signatures',()=>{
  const rpId='vop.example';
  const challenge='assertion-challenge';
  const origin='https://vop.example';
  const clientBytes=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin}),'utf8');
  const clientDataJSON=b64url(clientBytes);
  validateClientData(clientDataJSON,{
    v:1,purpose:'authentication',challenge,origin,rpId,exp:Date.now()+60_000,
  },'webauthn.get');

  const authenticator=Buffer.alloc(37);
  createHash('sha256').update(rpId).digest().copy(authenticator,0);
  authenticator[32]=0x05;
  authenticator.writeUInt32BE(7,33);
  assert.equal(validateAuthenticatorData(b64url(authenticator),rpId).signCount,7);

  const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const signed=Buffer.concat([
    authenticator,
    createHash('sha256').update(clientBytes).digest(),
  ]);
  const signature=signPayload('sha256',signed,privateKey);
  assert.doesNotThrow(()=>verifyPasskeyAssertion({
    authenticatorData:b64url(authenticator),
    clientDataJSON,
    signature:b64url(signature),
    publicKeyDer:b64url(publicKey.export({format:'der',type:'spki'})),
    algorithm:-7,
  }));

  const noUv=Buffer.from(authenticator);
  noUv[32]=0x01;
  assert.throws(()=>validateAuthenticatorData(b64url(noUv),rpId),/fingerprint, face, PIN, or device verification/i);
});
