import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer } from 'vite';

const projectId='demo-vop-security-rules';

function response(){
  return {
    code:200,payload:null,headers:{},
    status(code){this.code=code;return this;},
    json(payload){this.payload=payload;return this;},
    setHeader(name,value){this.headers[String(name).toLowerCase()]=String(value);},
  };
}

async function emulatorSignUp(email,password='local-emulator-only'){
  const resp=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password,returnSecureToken:true}),
    });
  const data=await resp.json();
  assert.equal(resp.status,200,JSON.stringify(data));
  return {uid:data.localId,token:data.idToken,email};
}

test('operational health exposes public liveness and protects detailed readiness',async t=>{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore emulator required; never run against production.');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST,'Auth emulator required; never run against production.');
  if(process.env.FIREBASE_ADMIN_PROJECT_ID&&process.env.FIREBASE_ADMIN_PROJECT_ID!==projectId){
    throw new Error('Refusing to test on a non-demo Firebase project.');
  }
  process.env.FIREBASE_ADMIN_PROJECT_ID=projectId;
  delete process.env.FIRESTORE_BACKUP_BUCKET;
  const app=getApps()[0]||initializeApp({projectId});
  const db=getFirestore(app);
  const auth=getAuth(app);
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try{
    const {default:admin}=await vite.ssrLoadModule('/api/admin.ts');

    const call=async({method='GET',headers={},query={}}={})=>{
      const res=response();
      await admin({method,headers,query:{__vopRoute:'health',...query}},res);
      return res;
    };

    await t.test('public liveness confirms database availability without exposing backup details',async()=>{
      const res=await call();
      assert.equal(res.code,200,JSON.stringify(res.payload));
      assert.equal(res.payload.ok,true);
      assert.equal(res.payload.database,'ok');
      assert.equal(Object.hasOwn(res.payload,'backup'),false);
      assert.ok(res.headers['x-request-id']);
    });

    await t.test('unsupported methods are rejected',async()=>{
      const res=await call({method:'POST'});
      assert.equal(res.code,405);
    });

    await t.test('detailed readiness requires authentication',async()=>{
      const res=await call({query:{detail:'1'}});
      assert.equal(res.code,401,JSON.stringify(res.payload));
    });

    await t.test('Super Admin sees degraded readiness when managed backups are not configured',async()=>{
      const superAdmin=await emulatorSignUp('operations-super@vop-test.invalid');
      await db.doc('users/'+superAdmin.uid).set({
        uid:superAdmin.uid,email:superAdmin.email,role:'super_admin',organizationId:'',
      });
      const res=await call({
        headers:{authorization:'Bearer '+superAdmin.token},
        query:{detail:'1'},
      });
      assert.equal(res.code,200,JSON.stringify(res.payload));
      assert.equal(res.payload.status,'degraded');
      assert.equal(res.payload.database,'ok');
      assert.equal(res.payload.backup.status,'not_configured');
      assert.equal(res.payload.backup.configured,false);
      await auth.deleteUser(superAdmin.uid);
      await db.doc('users/'+superAdmin.uid).delete();
    });
  }finally{
    await vite.close();
  }
});
