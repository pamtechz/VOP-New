import { randomUUID } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { createNotification } from './notifications.js';

export const SYSTEM_JOB_IDS=['mentorship-automation','payment-reconciliation'] as const;
export type SystemJobId=typeof SYSTEM_JOB_IDS[number];
export type SystemJobSource='cron'|'manual';

export class SystemJobAlreadyRunningError extends Error {
  constructor(public readonly jobId:SystemJobId,public readonly executionId:string){
    super('This automation job is already running.');
    this.name='SystemJobAlreadyRunningError';
  }
}

export interface SystemJobRunContext{
  executionId:string;
  jobId:SystemJobId;
  source:SystemJobSource;
  requestedBy:string;
}

export interface SystemJobRunResult<T=unknown>{
  executionId:string;
  jobId:SystemJobId;
  state:'success';
  summary:T;
}

function executionId(jobId:SystemJobId){
  return jobId+'-'+new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)+'-'+randomUUID().slice(0,8);
}
function safeSummary(value:unknown){
  if(value==null)return null;
  return JSON.parse(JSON.stringify(value)) as unknown;
}
function timestampIso(value:unknown){
  if(!value)return '';
  if(typeof value==='object'){
    const item=value as {toDate?:()=>Date;toMillis?:()=>number;seconds?:number};
    if(typeof item.toDate==='function')return item.toDate().toISOString();
    if(typeof item.toMillis==='function')return new Date(item.toMillis()).toISOString();
    if(Number.isFinite(Number(item.seconds)))return new Date(Number(item.seconds)*1000).toISOString();
  }
  const date=new Date(String(value));
  return Number.isNaN(date.getTime())?'':date.toISOString();
}
function healthState(data:Record<string,unknown>){
  const state=String(data.state||'never_run');
  if(state==='running')return 'running';
  if(state==='failed')return 'failed';
  const lastSuccess=Date.parse(timestampIso(data.lastSuccessAt));
  if(!Number.isFinite(lastSuccess))return 'never_run';
  return Date.now()-lastSuccess>36*60*60*1000?'stale':'healthy';
}

async function repeatedFailureAlert(
  db:Firestore,
  jobId:SystemJobId,
  consecutiveFailures:number,
  errorMessage:string,
){
  if(consecutiveFailures<2||!(consecutiveFailures===2||consecutiveFailures%5===0))return;
  const admins=await db.collection('users').where('role','==','super_admin').limit(25).get();
  await Promise.all(admins.docs.map(document=>createNotification(db,{
    recipientId:document.id,
    title:'VOP automation needs attention',
    body:`${jobId} has failed ${consecutiveFailures} consecutive times. Latest error: ${errorMessage.slice(0,300)}`,
    type:'system',
    channel:'in_app',
    actionUrl:'/?admin=dashboard',
    metadata:{kind:'system-job-failure',jobId,consecutiveFailures},
    createdBy:'system:automation-health',
    mandatory:true,
  }).catch(()=>undefined)));
}

export async function runTrackedSystemJob<T>(
  db:Firestore,
  jobId:SystemJobId,
  source:SystemJobSource,
  requestedBy:string,
  runner:(context:SystemJobRunContext)=>Promise<T>,
  leaseMinutes=30,
):Promise<SystemJobRunResult<T>>{
  const id=executionId(jobId);
  const statusRef=db.doc('systemJobs/'+jobId);
  const runRef=statusRef.collection('executions').doc(id);
  const leaseUntil=new Date(Date.now()+Math.max(5,leaseMinutes)*60_000).toISOString();

  await db.runTransaction(async transaction=>{
    const status=await transaction.get(statusRef);
    const existing=status.data()||{};
    const existingLease=Date.parse(String(existing.leaseUntil||''));
    if(existing.state==='running'&&Number.isFinite(existingLease)&&existingLease>Date.now()){
      throw new SystemJobAlreadyRunningError(jobId,String(existing.runningExecutionId||''));
    }
    transaction.set(statusRef,{
      jobId,state:'running',runningExecutionId:id,leaseUntil,
      lastStartedAt:FieldValue.serverTimestamp(),lastSource:source,lastRequestedBy:requestedBy,
      totalRuns:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    transaction.create(runRef,{
      id,jobId,state:'running',source,requestedBy,leaseUntil,
      startedAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp(),
    });
  });

  const started=Date.now();
  try{
    const summary=await runner({executionId:id,jobId,source,requestedBy});
    const durationMs=Date.now()-started;
    const safe=safeSummary(summary);
    const batch=db.batch();
    batch.set(runRef,{
      state:'success',summary:safe,durationMs,
      completedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    batch.set(statusRef,{
      state:'success',runningExecutionId:null,leaseUntil:null,
      lastSuccessAt:FieldValue.serverTimestamp(),lastCompletedAt:FieldValue.serverTimestamp(),
      lastDurationMs:durationMs,lastSummary:safe,consecutiveFailures:0,
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    await batch.commit();
    return {executionId:id,jobId,state:'success',summary};
  }catch(error){
    const durationMs=Date.now()-started;
    const message=(error instanceof Error?error.message:'Automation job failed.').slice(0,500);
    let consecutiveFailures=1;
    await db.runTransaction(async transaction=>{
      const status=await transaction.get(statusRef);
      consecutiveFailures=Math.max(0,Number(status.data()?.consecutiveFailures||0))+1;
      transaction.set(runRef,{
        state:'failed',error:message,durationMs,
        completedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      transaction.set(statusRef,{
        state:'failed',runningExecutionId:null,leaseUntil:null,
        lastFailureAt:FieldValue.serverTimestamp(),lastCompletedAt:FieldValue.serverTimestamp(),
        lastDurationMs:durationMs,lastError:message,consecutiveFailures,
        updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
    });
    await repeatedFailureAlert(db,jobId,consecutiveFailures,message).catch(()=>undefined);
    throw error;
  }
}

export async function systemJobHealth(db:Firestore,historyLimit=10){
  const items=await Promise.all(SYSTEM_JOB_IDS.map(async jobId=>{
    const status=await db.doc('systemJobs/'+jobId).get();
    const data=status.data()||{};
    const history=await db.collection('systemJobs/'+jobId+'/executions')
      .orderBy('createdAt','desc').limit(Math.max(1,Math.min(25,historyLimit))).get();
    return {
      jobId,
      state:String(data.state||'never_run'),
      health:healthState(data),
      consecutiveFailures:Math.max(0,Number(data.consecutiveFailures||0)),
      totalRuns:Math.max(0,Number(data.totalRuns||0)),
      runningExecutionId:String(data.runningExecutionId||''),
      lastStartedAt:timestampIso(data.lastStartedAt),
      lastCompletedAt:timestampIso(data.lastCompletedAt),
      lastSuccessAt:timestampIso(data.lastSuccessAt),
      lastFailureAt:timestampIso(data.lastFailureAt),
      lastDurationMs:Math.max(0,Number(data.lastDurationMs||0)),
      lastError:String(data.lastError||''),
      lastSummary:data.lastSummary??null,
      history:history.docs.map(document=>{
        const item=document.data()||{};
        return {
          id:document.id,
          state:String(item.state||''),
          source:String(item.source||''),
          requestedBy:String(item.requestedBy||''),
          startedAt:timestampIso(item.startedAt),
          completedAt:timestampIso(item.completedAt),
          durationMs:Math.max(0,Number(item.durationMs||0)),
          error:String(item.error||''),
          summary:item.summary??null,
        };
      }),
    };
  }));
  return {items,generatedAt:new Date().toISOString()};
}
