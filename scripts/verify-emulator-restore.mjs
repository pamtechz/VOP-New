import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// This isolated fixture drill cannot read production data or invoke a managed
// Firestore restore. The production backup/IAM drill is a separate release gate.
const project='demo-vop-security-rules';
if(process.env.FIREBASE_ADMIN_PROJECT_ID&&process.env.FIREBASE_ADMIN_PROJECT_ID!==project)
  throw new Error('Refusing recovery drill with a non-demo Firebase project.');
if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error('Run this drill outside another emulator session.');
const directory=await mkdtemp(join(tmpdir(),'vop-recovery-'));
const checkpoint=join(directory,'checkpoint');
await mkdir(checkpoint);
async function run(phase,options){
  const args=['node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec',
    '--project',project,'--only','firestore,auth',...options,
    'node tests/emulatorRestore.checkpoint.mjs '+phase];
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{stdio:'inherit',env:{...process.env,
      FIREBASE_ADMIN_PROJECT_ID:project,GCLOUD_PROJECT:project,VOP_RECOVERY_CHECKPOINT:checkpoint}});
    child.once('error',reject);child.once('exit',code=>resolve(code));
  });
  if(code!==0)throw new Error('Recovery '+phase+' failed (exit '+code+').');
}
try{
  await run('seed',[]);
  await run('verify',['--import',checkpoint]);
}finally{await rm(directory,{recursive:true,force:true});}
