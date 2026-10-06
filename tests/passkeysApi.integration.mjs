import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomBytes,sign as signPayload} from 'node:crypto';
import {initializeApp,getApps,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {createServer} from 'vite';

const projectId='demo-vop-security-rules';
const origin='http://localhost:5173';
const rpId='localhost';

function response(){
  return {
    code:200,payload:null,
    status(code){this.code=code;return this;},
    json(payload){this.payload=payload;return this;},
  };
}
function b64url(value){
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(value);
  return bytes.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function credentialDocumentId(credentialId){
  return b64url(createHash('sha256').update(String(credentialId||'')).digest());
}
function assertionFor(challenge,credentialId,privateKey,signCount=0){
  const clientBytes=Buffer.from(JSON.stringify({
    type:'webauthn.get',challenge,origin,crossOrigin:false,
  }),'utf8');
  const authenticatorData=Buffer.alloc(37);
  createHash('sha256').update(rpId).digest().copy(authenticatorData,0);
  authenticatorData[32]=0x05; // user presence + user verification
  authenticatorData.writeUInt32BE(signCount,33);
  const signed=Buffer.concat([
    authenticatorData,
    createHash('sha256').update(clientBytes).digest(),
  ]);
  return {
    credentialId,
    clientDataJSON:b64url(clientBytes),
    authenticatorData:b64url(authenticatorData),
    signature:b64url(signPayload('sha256',signed,privateKey)),
  };
}

test('passkey authentication is one-time, server-verified and replay resistant',async t=>{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore emulator required; never run against production.');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST,'Auth emulator required; never run against production.');
  if(process.env.FIREBASE_ADMIN_PROJECT_ID&&process.env.FIREBASE_ADMIN_PROJECT_ID!==projectId){
    throw new Error('Refusing to test on a non-demo Firebase project.');
  }
  process.env.FIREBASE_ADMIN_PROJECT_ID=projectId;
  process.env.PASSKEY_CHALLENGE_SECRET='passkey-emulator-secret-that-is-longer-than-32-bytes';
  const app=getApps()[0]||initializeApp({projectId});
  const db=getFirestore(app);
  const auth=getAuth(app);
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try{
    const {default:admin}=await vite.ssrLoadModule('/api/admin.ts');
    const account=await auth.createUser({email:'passkey-replay@vop-test.invalid',disabled:false});
    await db.doc('users/'+account.uid).set({
      uid:account.uid,email:account.email,role:'student',organizationId:'',
    });

    const credentialId=b64url(randomBytes(32));
    const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
    const publicKeyDer=b64url(publicKey.export({format:'der',type:'spki'}));
    const credentialRef=db.doc('passkeyCredentials/'+credentialDocumentId(credentialId));
    await credentialRef.set({
      uid:account.uid,credentialId,publicKeyDer,algorithm:-7,signCount:0,
      rpId,label:'Emulator passkey',
    });

    const call=async(body,headers={})=>{
      const res=response();
      await admin({
        method:'POST',
        query:{__vopRoute:'passkeys'},
        headers:{host:'localhost:5173',origin,'x-forwarded-for':'127.0.0.44',...headers},
        body,
      },res);
      return res;
    };

    await t.test('a valid zero-counter assertion signs in and updates last-used telemetry',async()=>{
      const begin=await call({action:'beginAuthentication'});
      assert.equal(begin.code,200,JSON.stringify(begin.payload));
      assert.ok(begin.payload.challenge);
      assert.ok(begin.payload.challengeToken);
      const assertion=assertionFor(begin.payload.challenge,credentialId,privateKey,0);
      const finishBody={action:'finishAuthentication',challengeToken:begin.payload.challengeToken,...assertion};
      const finish=await call(finishBody);
      assert.equal(finish.code,200,JSON.stringify(finish.payload));
      assert.ok(finish.payload.customToken);
      const stored=(await credentialRef.get()).data();
      assert.ok(stored?.lastUsedAt,'lastUsedAt must update even when an authenticator reports signCount 0');

      const replay=await call(finishBody);
      assert.equal(replay.code,400,JSON.stringify(replay.payload));
      assert.match(String(replay.payload.error||''),/already used|expired/i);
      const challenges=await db.collection('passkeyChallenges').get();
      assert.equal(challenges.size,0,'consumed challenges must be deleted');
    });

    await t.test('origin mismatch is rejected before a ceremony can be issued',async()=>{
      const res=await call(
        {action:'beginAuthentication'},
        {origin:'https://evil.example'},
      );
      assert.equal(res.code,400,JSON.stringify(res.payload));
      assert.match(String(res.payload.error||''),/origin/i);
    });

    await auth.deleteUser(account.uid);
    await credentialRef.delete();
  }finally{
    await vite.close();
    delete process.env.PASSKEY_CHALLENGE_SECRET;
    if(getApps().includes(app))await deleteApp(app);
  }
});
