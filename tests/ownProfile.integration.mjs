import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createServer} from 'vite';

const projectId='demo-vop-security-rules';

test('personal profile edits are authenticated, scoped, and never change permissions', async()=>{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore emulator required.');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST,'Auth emulator required.');
  if(process.env.FIREBASE_ADMIN_PROJECT_ID&&process.env.FIREBASE_ADMIN_PROJECT_ID!==projectId)
    throw new Error('Refusing to execute against a non-demo project.');
  process.env.FIREBASE_ADMIN_PROJECT_ID=projectId;
  const app=getApps()[0]||initializeApp({projectId});
  const db=getFirestore(app);
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  const signup=async(name)=>{
    const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
      '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:name+'@vop-profile.invalid',password:'local-emulator-only',returnSecureToken:true}),
      });
    const data=await response.json();
    assert.equal(response.status,200,JSON.stringify(data));
    await db.doc('users/'+data.localId).set({
      uid:data.localId,email:name+'@vop-profile.invalid',displayName:'Original User',
      phoneNumber:'',role:'student',organizationId:'',organizationRole:'',
      privileges:{admin:false,superAdmin:false},
    });
    return {uid:data.localId,token:data.idToken};
  };
  try{
    const {default:handler}=await vite.ssrLoadModule('/api_handlers/admin/users.ts');
    const call=async(user,action,profile)=>{
      let status=200,body;
      await handler({
        method:'POST',headers:user?{authorization:'Bearer '+user.token}:{},
        body:{action,...(profile?{profile}:{})},
      },{
        status(code){status=code;return this;},
        json(data){body=data;return this;},
      });
      return {status,...body};
    };
    const learner=await signup('profile-learner');
    const other=await signup('profile-other');

    const updated=await call(learner,'updateOwnProfile',{
      displayName:'Updated Learner',phoneNumber:'+260 970 000 000',
      whatsappNumber:'+260 970 000 001',bio:'Learning Bible studies',
      photoURL:'https://cdn.example.org/avatar.png',
    });
    assert.equal(updated.status,200,JSON.stringify(updated));
    assert.equal(updated.profile.displayName,'Updated Learner');
    assert.equal(updated.profile.photoURL,'https://cdn.example.org/avatar.png');
    const profile=await call(learner,'profile');
    assert.equal(profile.status,200,JSON.stringify(profile));
    assert.equal(profile.profile.displayName,'Updated Learner');
    assert.equal(profile.profile.bio,'Learning Bible studies');
    assert.equal(profile.profile.photoURL,'https://cdn.example.org/avatar.png');

    const partial=await call(learner,'updateOwnProfile',{address:'Lusaka'});
    assert.equal(partial.status,200);
    assert.equal(partial.profile.phoneNumber,'+260 970 000 000');
    assert.equal(partial.profile.address,'Lusaka');

    for(const bad of [
      {role:'super_admin'}, {organizationId:'org-admin'},
      {privileges:{admin:true}}, {email:'attacker@example.invalid'},
      {displayName:'  '}, {bio:'x'.repeat(1001)},
      {photoURL:'javascript:alert(1)'}, {photoURL:'https://localhost/a.png'},
      {photoURL:'https://127.0.0.1/a.png'}, {phoneNumber:1234},
    ]){
      const rejected=await call(learner,'updateOwnProfile',bad);
      assert.equal(rejected.status,400,JSON.stringify({bad,rejected}));
    }
    const anonymous=await call(null,'updateOwnProfile',{displayName:'Anonymous'});
    assert.notEqual(anonymous.status,200);

    const stored=(await db.doc('users/'+learner.uid).get()).data();
    assert.equal(stored.role,'student');
    assert.equal(stored.privileges.admin,false);
    assert.equal(stored.organizationId,'');
    assert.equal((await db.doc('users/'+other.uid).get()).data().displayName,'Original User');
  }finally{await vite.close();}
});
