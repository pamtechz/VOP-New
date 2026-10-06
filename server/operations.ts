import { getApps } from 'firebase-admin/app';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { createNotification } from './notifications.js';
import { getAdminDb } from './tenant.js';

const BACKUP_RUN_COLLECTION='operationsBackupRuns';
const OPERATIONS_REF='system/operations';
const ALERT_COLLECTION='operationalAlerts';
const BACKUP_STALE_AFTER_MS=36*60*60*1000;
const ALERT_COOLDOWN_MS=24*60*60*1000;

type AccessTokenCredential={
  getAccessToken:()=>Promise<{access_token:string;expires_in?:number}>;
};

type FirestoreOperation={
  name?:unknown;
  done?:unknown;
  error?:{message?:unknown;code?:unknown};
  response?:{outputUriPrefix?:unknown};
  metadata?:Record<string,unknown>;
};

function text(value:unknown){return String(value??'').trim();}
function isoDay(now=new Date()){return now.toISOString().slice(0,10);}
function safeError(error:unknown){return (error instanceof Error?error.message:String(error||'Unknown failure.')).slice(0,800);}
function backupBucket(){
  const value=text(process.env.FIRESTORE_BACKUP_BUCKET).replace(/\/$/,'');
  if(!value)return '';
  if(!/^gs:\/\/[a-z0-9][a-z0-9._-]{1,221}[a-z0-9](?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+)?$/.test(value)){
    throw new Error('FIRESTORE_BACKUP_BUCKET must be a valid gs:// bucket or bucket/prefix URI.');
  }
  return value;
}

export function backupOutputPrefix(now=new Date()){
  const bucket=backupBucket();
  return bucket?bucket+'/vop-firestore/'+isoDay(now):'';
}

function projectId(){
  const value=text(process.env.FIREBASE_ADMIN_PROJECT_ID||process.env.FIREBASE_PROJECT_ID);
  if(!value)throw new Error('Firebase project configuration is missing.');
  return value;
}

function databaseId(){return text(process.env.FIRESTORE_DATABASE_ID)||'(default)';}

async function accessToken(){
  getAdminDb();
  const credential=getApps()[0]?.options.credential as AccessTokenCredential|undefined;
  if(!credential?.getAccessToken)throw new Error('Firebase Admin credential cannot issue a Google Cloud access token.');
  const result=await credential.getAccessToken();
  if(!result?.access_token)throw new Error('Google Cloud access token acquisition failed.');
  return result.access_token;
}

async function googleFirestoreRequest(path:string,init:RequestInit={}){
  const token=await accessToken();
  const response=await fetch('https://firestore.googleapis.com/v1/'+path,{
    ...init,
    headers:{
      Authorization:'Bearer '+token,
      Accept:'application/json',
      'Content-Type':'application/json',
      ...(init.headers||{}),
    },
  });
  const payload=await response.json().catch(()=>({})) as Record<string,unknown>;
  if(!response.ok){
    const nested=payload.error&&typeof payload.error==='object'?payload.error as Record<string,unknown>:{};
    throw new Error(text(nested.message||payload.message)||('Firestore Admin API failed with HTTP '+response.status+'.'));
  }
  return payload as FirestoreOperation;
}

async function requestManagedExport(db:Firestore,now:Date){
  const day=isoDay(now);
  const ref=db.doc(BACKUP_RUN_COLLECTION+'/'+day);
  const existing=await ref.get();
  if(existing.exists&&['requested','running','completed'].includes(text(existing.data()?.status))){
    return {requested:false,status:text(existing.data()?.status),runId:day,operationName:text(existing.data()?.operationName)};
  }
  const outputUriPrefix=backupOutputPrefix(now);
  if(!outputUriPrefix)return {requested:false,status:'not_configured',runId:day,operationName:''};
  await ref.set({
    runId:day,status:'requesting',outputUriPrefix,
    requestedAt:now.toISOString(),updatedAt:FieldValue.serverTimestamp(),
  },{merge:false});
  try{
    const name='projects/'+encodeURIComponent(projectId())+'/databases/'+encodeURIComponent(databaseId());
    const operation=await googleFirestoreRequest(name+':exportDocuments',{
      method:'POST',
      body:JSON.stringify({outputUriPrefix}),
    });
    const operationName=text(operation.name);
    if(!operationName)throw new Error('Firestore export did not return a long-running operation identifier.');
    await ref.set({
      status:'requested',operationName,requestedAt:now.toISOString(),
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    return {requested:true,status:'requested',runId:day,operationName};
  }catch(error){
    await ref.set({
      status:'failed',failure:safeError(error),failedAt:now.toISOString(),
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    throw error;
  }
}

async function refreshManagedExports(db:Firestore,now:Date){
  const snapshot=await db.collection(BACKUP_RUN_COLLECTION).where('status','in',['requesting','requested','running']).limit(10).get();
  let completed=0,failed=0,running=0;
  for(const document of snapshot.docs){
    const data=document.data()||{};
    const operationName=text(data.operationName);
    if(!operationName){
      if(text(data.status)==='requesting'&&Date.parse(text(data.requestedAt))<now.getTime()-60*60*1000){
        await document.ref.set({status:'failed',failure:'Backup request did not persist an operation identifier.',failedAt:now.toISOString(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
        failed+=1;
      }
      continue;
    }
    try{
      const operation=await googleFirestoreRequest(operationName);
      if(operation.done===true){
        if(operation.error){
          await document.ref.set({
            status:'failed',failure:text(operation.error.message)||'Firestore export operation failed.',
            failedAt:now.toISOString(),updatedAt:FieldValue.serverTimestamp(),
          },{merge:true});
          failed+=1;
        }else{
          await document.ref.set({
            status:'completed',completedAt:now.toISOString(),
            outputUriPrefix:text(operation.response?.outputUriPrefix)||text(data.outputUriPrefix),
            updatedAt:FieldValue.serverTimestamp(),
          },{merge:true});
          completed+=1;
        }
      }else{
        await document.ref.set({status:'running',lastCheckedAt:now.toISOString(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
        running+=1;
      }
    }catch(error){
      await document.ref.set({
        lastCheckFailure:safeError(error),lastCheckedAt:now.toISOString(),updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
    }
  }
  return {checked:snapshot.size,completed,failed,running};
}

async function latestCompletedBackup(db:Firestore){
  const snapshot=await db.collection(BACKUP_RUN_COLLECTION).where('status','==','completed').limit(50).get();
  let best:FirebaseFirestore.QueryDocumentSnapshot|null=null;
  let bestTime=Number.NEGATIVE_INFINITY;
  for(const document of snapshot.docs){
    const completedAt=Date.parse(text(document.data()?.completedAt));
    if(Number.isFinite(completedAt)&&completedAt>bestTime){best=document;bestTime=completedAt;}
  }
  if(!best)return null;
  const data=best.data()||{};
  return {
    runId:best.id,
    completedAt:text(data.completedAt),
    outputUriPrefix:text(data.outputUriPrefix),
    operationName:text(data.operationName),
  };
}

async function notifySuperAdminsOnce(db:Firestore,key:string,title:string,body:string,now:Date){
  const safeKey=key.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,160);
  const ref=db.doc(ALERT_COLLECTION+'/'+safeKey);
  const previous=await ref.get();
  const last=Date.parse(text(previous.data()?.lastNotifiedAt));
  if(Number.isFinite(last)&&now.getTime()-last<ALERT_COOLDOWN_MS)return {sent:0,suppressed:true};
  await ref.set({
    key:safeKey,title,body,lastNotifiedAt:now.toISOString(),
    updatedAt:FieldValue.serverTimestamp(),
  },{merge:true});
  const admins=await db.collection('users').where('role','==','super_admin').limit(25).get();
  let sent=0;
  for(const admin of admins.docs){
    try{
      await createNotification(db,{
        recipientId:admin.id,type:'security',title,body,
        actionUrl:'/?route=admin',createdBy:'system',mandatory:true,
        metadata:{source:'operational-readiness',alertKey:safeKey},
      });
      sent+=1;
    }catch{/* one broken recipient must not block platform maintenance */}
  }
  return {sent,suppressed:false};
}

export async function operationalHealth(db=getAdminDb(),now=new Date()){
  const started=Date.now();
  const operations=await db.doc(OPERATIONS_REF).get();
  const state=operations.data()||{};
  const latest=await latestCompletedBackup(db);
  let configured=false,configurationError='';
  try{configured=Boolean(backupBucket());}catch(error){configurationError=safeError(error);}
  const completedAt=latest?.completedAt||'';
  const ageMs=completedAt?now.getTime()-Date.parse(completedAt):Number.POSITIVE_INFINITY;
  const storedBackup=state.backup&&typeof state.backup==='object'?state.backup as Record<string,unknown>:{};
  const currentStatus=text(storedBackup.currentStatus);
  const backupStatus=configurationError?'configuration_error'
    :!configured?'not_configured'
    :latest&&Number.isFinite(ageMs)&&ageMs<=BACKUP_STALE_AFTER_MS?'ok'
    :latest?'stale'
    :['requesting','requested','running'].includes(currentStatus)?'pending':'missing';
  const maintenanceAt=text(state.lastMaintenanceAt);
  const maintenanceAge=maintenanceAt?now.getTime()-Date.parse(maintenanceAt):Number.POSITIVE_INFINITY;
  const maintenanceStatus=Number.isFinite(maintenanceAge)&&maintenanceAge<=48*60*60*1000?'ok':'stale';
  return {
    status:backupStatus==='ok'&&maintenanceStatus==='ok'?'ok':'degraded',
    database:'ok',
    latencyMs:Date.now()-started,
    maintenance:{status:maintenanceStatus,lastRunAt:maintenanceAt},
    backup:{
      status:backupStatus,
      configured,
      configurationError:configurationError||null,
      lastCompletedAt:completedAt||null,
      lastRunId:latest?.runId||null,
      currentStatus:currentStatus||null,
      staleAfterHours:36,
    },
    deployment:{sha:text(process.env.VERCEL_GIT_COMMIT_SHA)||null},
  };
}

async function purgeExpiredServerRecords(
  db:Firestore,
  collection:string,
  now:Date,
  limit=250,
){
  const snapshot=await db.collection(collection)
    .where('expiresAt','<',now.toISOString())
    .limit(Math.max(1,Math.min(450,limit)))
    .get();
  if(snapshot.empty)return 0;
  const batch=db.batch();
  snapshot.docs.forEach(document=>batch.delete(document.ref));
  await batch.commit();
  return snapshot.size;
}

export async function runDailyOperationalMaintenance(db=getAdminDb(),now=new Date()){
  const [expiredPasskeyChallenges,expiredAuthRateLimits]=await Promise.all([
    purgeExpiredServerRecords(db,'passkeyChallenges',now),
    purgeExpiredServerRecords(db,'authRateLimits',now),
  ]);
  let bucket='',configurationError='';
  try{bucket=backupBucket();}catch(error){configurationError=safeError(error);}
  const configured=Boolean(bucket)&&!configurationError;
  const refresh=configured?await refreshManagedExports(db,now):{checked:0,completed:0,failed:0,running:0};
  let requested:{requested:boolean;status:string;runId:string;operationName:string}={
    requested:false,status:configurationError?'configuration_error':'not_configured',runId:isoDay(now),operationName:'',
  };
  let backupFailure=configurationError;
  if(configured){
    try{requested=await requestManagedExport(db,now);}
    catch(error){backupFailure=safeError(error);requested={requested:false,status:'failed',runId:isoDay(now),operationName:''};}
  }
  const latest=await latestCompletedBackup(db);
  const latestAt=Date.parse(latest?.completedAt||'');
  const stale=Boolean(latest)&&Number.isFinite(latestAt)&&now.getTime()-latestAt>BACKUP_STALE_AFTER_MS;
  const backupStatus=configurationError?'configuration_error'
    :!configured?'not_configured'
    :backupFailure?'failed'
    :stale?'stale'
    :latest?'ok'
    :['requesting','requested','running'].includes(requested.status)?'pending':'missing';
  await db.doc(OPERATIONS_REF).set({
    lastMaintenanceAt:now.toISOString(),
    lastMaintenanceDeploymentSha:text(process.env.VERCEL_GIT_COMMIT_SHA)||null,
    securityCleanup:{
      expiredPasskeyChallenges,
      expiredAuthRateLimits,
    },
    backup:{
      status:backupStatus,
      configured,
      bucketConfigured:Boolean(bucket),
      configurationError:configurationError||null,
      lastCompletedAt:latest?.completedAt||null,
      lastRunId:latest?.runId||null,
      currentRunId:requested.runId,
      currentStatus:requested.status,
      failure:backupFailure||null,
    },
    updatedAt:FieldValue.serverTimestamp(),
  },{merge:true});

  let alert={sent:0,suppressed:false};
  if(configurationError){
    alert=await notifySuperAdminsOnce(
      db,'firestore-backup-configuration-invalid',
      'Production Firestore backup configuration is invalid',
      'VOP rejected the configured FIRESTORE_BACKUP_BUCKET value. Correct the Google Cloud Storage URI before the next scheduled maintenance run.',
      now,
    );
  }else if(!configured){
    alert=await notifySuperAdminsOnce(
      db,'firestore-backup-not-configured',
      'Production Firestore backups are not configured',
      'VOP cannot create managed Firestore exports until FIRESTORE_BACKUP_BUCKET and the required Google Cloud IAM permissions are configured.',
      now,
    );
  }else if(backupFailure){
    alert=await notifySuperAdminsOnce(
      db,'firestore-backup-request-failed',
      'Production Firestore backup request failed',
      'The scheduled Firestore export could not be started. Open the operational runbook and verify backup bucket access and Firestore import/export permissions.',
      now,
    );
  }else if(stale){
    alert=await notifySuperAdminsOnce(
      db,'firestore-backup-stale',
      'Production Firestore backup is stale',
      'No completed Firestore export is within the 36-hour recovery-point window. Check the managed export operation and Cloud Storage destination.',
      now,
    );
  }
  return {
    status:backupStatus,
    securityCleanup:{expiredPasskeyChallenges,expiredAuthRateLimits},
    backup:{...requested,refresh,latest,stale,configured,configurationError:configurationError||null,failure:backupFailure||null},
    alert,
  };
}

export const OPERATIONS_POLICY={
  backupRpoHours:24,
  backupStaleAfterHours:36,
  maintenanceStaleAfterHours:48,
  alertCooldownHours:24,
} as const;
