import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,getApps} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {createServer} from 'vite';

const projectId='demo-vop-security-rules';

function response(){
  return {code:200,payload:null,status(code){this.code=code;return this;},json(payload){this.payload=payload;return this;}};
}

async function emulatorSignUp(email,password='local-emulator-only'){
  const resp=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password,returnSecureToken:true}),
    });
  const data=await resp.json();
  assert.equal(resp.status,200,JSON.stringify(data));
  return {uid:data.localId,token:data.idToken};
}

test('registration policy is server authoritative and invitation aware',async t=>{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore emulator required; never run against production.');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST,'Auth emulator required; never run against production.');
  if(process.env.FIREBASE_ADMIN_PROJECT_ID&&process.env.FIREBASE_ADMIN_PROJECT_ID!==projectId){
    throw new Error('Refusing to test on a non-demo Firebase project.');
  }
  process.env.FIREBASE_ADMIN_PROJECT_ID=projectId;
  const app=getApps()[0]||initializeApp({projectId});
  const db=getFirestore(app);
  const auth=getAuth(app);
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try{
    const {default:register}=await vite.ssrLoadModule('/api_handlers/admin/auth.ts');
    const {default:users}=await vite.ssrLoadModule('/api_handlers/admin/users.ts');

    const callRegister=async(body,ip='203.0.113.20')=>{
      const res=response();
      await register({method:'POST',headers:{'x-forwarded-for':ip},body:{action:'register',...body}},res);
      return res;
    };
    const callProfile=async(identity,inviteToken='')=>{
      const res=response();
      await users({
        method:'POST',
        headers:{authorization:'Bearer '+identity.token},
        body:{action:'profile',inviteToken},
      },res);
      return res;
    };

    await db.doc('system/settings').set({systemOptions:{allowRegistrations:false,requireApproval:false}});

    await t.test('closed registration rejects public email account creation',async()=>{
      const res=await callRegister({email:'closed-registration@vop-test.invalid',password:'local-emulator-only'},'203.0.113.21');
      assert.equal(res.code,403,JSON.stringify(res.payload));
      assert.match(String(res.payload.error||''),/registration is currently closed/i);
      await assert.rejects(()=>auth.getUserByEmail('closed-registration@vop-test.invalid'));
    });

    await t.test('a valid pending organization invitation admits registration while public registration is closed',async()=>{
      const token='a'.repeat(64);
      await db.doc('organizations/org-invite').set({id:'org-invite',name:'Invite Org',status:'active'});
      await db.doc('organizationInvites/'+token).set({
        token,organizationId:'org-invite',role:'learner',email:'',
        status:'pending',expiresAt:new Date(Date.now()+86_400_000).toISOString(),
      });
      const res=await callRegister({
        email:'invited-registration@vop-test.invalid',
        password:'local-emulator-only',
        inviteToken:token,
      },'203.0.113.22');
      assert.equal(res.code,201,JSON.stringify(res.payload));
      assert.ok(res.payload.customToken);
      const account=await auth.getUserByEmail('invited-registration@vop-test.invalid');
      const profile=await db.doc('users/'+account.uid).get();
      assert.equal(profile.exists,true);
      assert.equal(profile.data()?.registration?.source,'organization_invitation');
    });

    await t.test('approval-required open registration creates a disabled pending account instead of a usable session',async()=>{
      await db.doc('system/settings').set({systemOptions:{allowRegistrations:true,requireApproval:true}});
      const res=await callRegister({
        email:'pending-approval@vop-test.invalid',
        password:'local-emulator-only',
      },'203.0.113.23');
      assert.equal(res.code,202,JSON.stringify(res.payload));
      assert.equal(res.payload.approvalRequired,true);
      assert.equal(res.payload.customToken,undefined);
      const account=await auth.getUserByEmail('pending-approval@vop-test.invalid');
      assert.equal(account.disabled,true);
      const profile=await db.doc('users/'+account.uid).get();
      assert.equal(profile.data()?.registration?.status,'pending_approval');
    });

    await t.test('raw Firebase signup cannot bootstrap a VOP profile when registration is closed',async()=>{
      await db.doc('system/settings').set({systemOptions:{allowRegistrations:false,requireApproval:false}});
      const identity=await emulatorSignUp('raw-bypass@vop-test.invalid');
      const res=await callProfile(identity);
      assert.equal(res.code,403,JSON.stringify(res.payload));
      assert.match(String(res.payload.error||''),/registration is currently closed/i);
      assert.equal((await db.doc('users/'+identity.uid).get()).exists,false);
    });

    await t.test('raw Firebase signup can bootstrap only when backed by a valid invitation',async()=>{
      const token='b'.repeat(64);
      const identity=await emulatorSignUp('raw-invited@vop-test.invalid');
      await db.doc('organizationInvites/'+token).set({
        token,organizationId:'org-invite',role:'learner',email:'raw-invited@vop-test.invalid',
        status:'pending',expiresAt:new Date(Date.now()+86_400_000).toISOString(),
      });
      const res=await callProfile(identity,token);
      assert.equal(res.code,200,JSON.stringify(res.payload));
      assert.equal(res.payload.profile.uid,identity.uid);
      assert.equal((await db.doc('users/'+identity.uid).get()).exists,true);
    });
  }finally{
    await vite.close();
  }
});
