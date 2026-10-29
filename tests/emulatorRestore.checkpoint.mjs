import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {basename,dirname,resolve,relative,isAbsolute,join} from 'node:path';
import {tmpdir} from 'node:os';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {getDownloadDetails} from 'firebase-tools/lib/emulator/downloadableEmulators.js';

const project='demo-vop-security-rules';
assert.equal(process.env.FIREBASE_ADMIN_PROJECT_ID,project,'Recovery drill must use the demo project.');
for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST']){
  assert.ok(process.env[key],key+' is required.');
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL('http://'+process.env[key]).hostname),
    'Recovery drill requires loopback emulators.');
}
const phase=process.argv[2];
assert.ok(['seed','verify'].includes(phase));
const app=initializeApp({projectId:project}),db=getFirestore(app),auth=getAuth(app);
const password='emulator-recovery-only';
const guide='guides/recovery-drill-guide';
const privatePath=guide+'/lessons/recovery-drill-lesson/private/instructorNotes';
const actors=[['recovery-learner-a','recovery-org-a'],['recovery-learner-b','recovery-org-b']];

if(phase==='seed'){
  for(const [uid,org] of actors){
    await auth.createUser({uid,email:uid+'@recovery.invalid',password});
    await db.doc('organizations/'+org).set({status:'active',name:'Recovery fixture'});
    await db.doc('users/'+uid).set({uid,role:'student',organizationId:org,organizationRole:'learner'});
    await db.doc('organizations/'+org+'/members/'+uid).set({uid,role:'learner',active:true});
  }
  await db.doc(guide).set({id:'recovery-drill-guide',title:'Recovery fixture study',
    organizationId:'recovery-org-a',ownerOrganizationId:'recovery-org-a',ownerUid:'recovery-author',
    sharingScope:'organization',published:true,canonical:true});
  await db.doc(guide+'/lessons/recovery-drill-lesson').set({title:'Recovery fixture lesson',published:true});
  await db.doc(privatePath).set({text:'Recovery fixture private instructor notes'});
  console.log('Recovery fixture: two authenticated tenants, canonical guide and private notes seeded.');
  const checkpoint=resolve(process.env.VOP_RECOVERY_CHECKPOINT||'');
  const location=relative(tmpdir(),checkpoint);
  assert.ok(location&&!location.startsWith('..')&&!isAbsolute(location));
  assert.equal(basename(checkpoint),'checkpoint');
  assert.match(basename(dirname(checkpoint)),/^vop-recovery-[A-Za-z0-9]+$/);
  // Use native fetch for strictly loopback emulator endpoints. The CLI's API
  // client forces an external proxy for these URLs and ignores NO_PROXY.
  const exported=await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+
    '/emulator/v1/projects/'+project+':export',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({database:'projects/'+project+'/databases/(default)',
      export_directory:checkpoint,export_name:'firestore_export'}),
  });
  assert.equal(exported.status,200,'The isolated emulator checkpoint must export successfully.');
  const authDirectory=join(checkpoint,'auth_export');
  await mkdir(authDirectory);
  for(const [file,path] of [
    ['accounts.json','/identitytoolkit.googleapis.com/v1/projects/'+project+'/accounts:batchGet?maxResults=-1'],
    ['config.json','/emulator/v1/projects/'+project+'/config'],
  ]){
    const result=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+path,
      {headers:{Authorization:'Bearer owner'}});
    assert.equal(result.status,200,'The isolated identities must export successfully.');
    await writeFile(join(authDirectory,file),JSON.stringify(await result.json()));
  }
  const cli=JSON.parse(await readFile('node_modules/firebase-tools/package.json','utf8'));
  await writeFile(join(checkpoint,'firebase-export-metadata.json'),JSON.stringify({
    version:cli.version,
    firestore:{version:getDownloadDetails('firestore').version,path:'firestore_export',
      metadata_file:'firestore_export/firestore_export.overall_export_metadata'},
    auth:{version:cli.version,path:'auth_export'},
  }));
}else{
  assert.equal((await db.doc(guide).get()).data()?.ownerUid,'recovery-author');
  assert.equal((await db.doc(privatePath).get()).data()?.text,'Recovery fixture private instructor notes');
  for(const [uid,org] of actors){
    assert.equal((await auth.getUser(uid)).email,uid+'@recovery.invalid');
    assert.equal((await db.doc('users/'+uid).get()).data()?.organizationId,org);
    const signIn=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
      '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:uid+'@recovery.invalid',password,returnSecureToken:true}),
    });
    assert.equal(signIn.status,200,'Restored identity must sign in.');
    const token=(await signIn.json()).idToken;
    const read=path=>fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+
      '/v1/projects/'+project+'/databases/(default)/documents/'+path,
      {headers:{Authorization:'Bearer '+token}});
    assert.equal((await read(guide)).status,org==='recovery-org-a'?200:403,
      'Restoring must preserve tenant isolation.');
    assert.equal((await read(privatePath)).status,403,
      'Restoring must not expose private instructor notes.');
  }
  console.log('Recovery checkpoint passed: data, identities, tenant isolation and private-note denial survived export/import.');
}
await deleteApp(app);
