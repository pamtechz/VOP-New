#!/usr/bin/env node
import { applicationDefault } from 'firebase-admin/app';

function text(value){return String(value??'').trim();}
function arg(name){
  const index=process.argv.indexOf(name);
  return index>=0?text(process.argv[index+1]):'';
}
function fail(message){console.error('ERROR: '+message);process.exit(1);}

const projectId=text(process.env.VOP_FIRESTORE_RESTORE_PROJECT_ID);
const databaseId=text(process.env.VOP_FIRESTORE_RESTORE_DATABASE_ID)||'(default)';
const inputUri=text(process.env.VOP_FIRESTORE_RESTORE_INPUT_URI).replace(/\/$/,'');
const collectionIds=text(process.env.VOP_FIRESTORE_RESTORE_COLLECTIONS)
  .split(',').map(value=>value.trim()).filter(Boolean);
const apply=process.argv.includes('--apply');
const statusOperation=arg('--status');

if(!projectId)fail('VOP_FIRESTORE_RESTORE_PROJECT_ID is required.');
if(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId))fail('The restore project ID is invalid.');

const credential=applicationDefault();
async function token(){
  const result=await credential.getAccessToken();
  if(!result?.access_token)fail('Google application-default credentials could not issue an access token.');
  return result.access_token;
}
async function request(path,init={}){
  const accessToken=await token();
  const response=await fetch('https://firestore.googleapis.com/v1/'+path,{
    ...init,
    headers:{
      Authorization:'Bearer '+accessToken,
      Accept:'application/json',
      'Content-Type':'application/json',
      ...(init.headers||{}),
    },
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){
    const message=payload?.error?.message||payload?.message||('HTTP '+response.status);
    fail('Firestore Admin API: '+String(message));
  }
  return payload;
}

if(statusOperation){
  const prefix='projects/'+projectId+'/databases/'+databaseId+'/operations/';
  if(!statusOperation.startsWith(prefix))fail('The operation does not belong to the configured restore project/database.');
  const result=await request(statusOperation);
  console.log(JSON.stringify(result,null,2));
  process.exit(0);
}

if(!/^gs:\/\/[a-z0-9][a-z0-9._-]{1,221}[a-z0-9](?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+)?$/.test(inputUri)){
  fail('VOP_FIRESTORE_RESTORE_INPUT_URI must be the exact gs:// outputUriPrefix of a completed Firestore export.');
}

const plan={
  targetProjectId:projectId,
  targetDatabaseId:databaseId,
  inputUriPrefix:inputUri,
  collectionIds:collectionIds.length?collectionIds:'ALL EXPORTED COLLECTIONS',
  mode:apply?'APPLY':'DRY RUN',
};
console.log(JSON.stringify(plan,null,2));

if(!apply){
  console.log('Dry run only. Re-run with --apply after restoring into a non-production verification environment and reviewing the result.');
  process.exit(0);
}

const expected='RESTORE '+projectId;
if(text(process.env.VOP_FIRESTORE_RESTORE_CONFIRM)!==expected){
  fail('Set VOP_FIRESTORE_RESTORE_CONFIRM exactly to "'+expected+'" before --apply.');
}
if(text(process.env.VOP_FIRESTORE_RESTORE_SOURCE_CONFIRMED)!=='YES'){
  fail('Set VOP_FIRESTORE_RESTORE_SOURCE_CONFIRMED=YES only after verifying the export completed successfully and the input URI is exact.');
}

const name='projects/'+encodeURIComponent(projectId)+'/databases/'+encodeURIComponent(databaseId);
const body={inputUriPrefix:inputUri};
if(collectionIds.length)body.collectionIds=collectionIds;
const operation=await request(name+':importDocuments',{method:'POST',body:JSON.stringify(body)});
if(!operation?.name)fail('Firestore import did not return an operation identifier.');
console.log('Restore operation started: '+operation.name);
console.log('Monitor with: npm run ops:firestore-restore -- --status "'+operation.name+'"');
