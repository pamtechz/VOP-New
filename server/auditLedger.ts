import { createHash } from 'node:crypto';
import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore';

export type ImmutableAuditScope =
  | { kind:'platform' }
  | { kind:'organization'; organizationId:string }
  | { kind:'hierarchy'; tenantId:string };

export type ImmutableAuditInput = {
  actorUid:string;
  actorEmail?:string;
  action:string;
  target:string;
  organizationId?:string;
  tenantType?:string;
  tenantId?:string;
  before?:DocumentData|null;
  after?:DocumentData|null;
  [key:string]:unknown;
};

function scopeKey(scope:ImmutableAuditScope){
  if(scope.kind==='platform')return 'platform';
  if(scope.kind==='organization')return 'organization:'+scope.organizationId;
  return 'hierarchy:'+scope.tenantId;
}

function collectionForScope(db:Firestore,scope:ImmutableAuditScope){
  if(scope.kind==='platform')return db.collection('platformAudit');
  if(scope.kind==='organization')return db.collection('organizations/'+scope.organizationId+'/audit');
  return db.collection('tenantAudit').doc(scope.tenantId).collection('entries');
}

function stable(value:unknown,seen=new WeakSet<object>()):unknown{
  if(value===null||value===undefined||typeof value==='string'||typeof value==='number'||typeof value==='boolean')return value??null;
  if(typeof value==='bigint')return value.toString();
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value))return value.map(item=>stable(item,seen));
  if(typeof value==='object'){
    const object=value as Record<string,unknown>;
    if(seen.has(object))return '[Circular]';
    seen.add(object);
    const toMillis=(value as {toMillis?:()=>number}).toMillis;
    if(typeof toMillis==='function'){
      try{return {__timestampMillis:toMillis.call(value)};}catch{/* fall through */}
    }
    const result:Record<string,unknown>={};
    for(const key of Object.keys(object).sort()){
      if(key==='timestamp')continue;
      result[key]=stable(object[key],seen);
    }
    seen.delete(object);
    return result;
  }
  return String(value);
}

function digest(value:unknown){
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function headId(scope:ImmutableAuditScope){
  return createHash('sha256').update(scopeKey(scope)).digest('hex');
}

export async function appendImmutableAudit(
  db:Firestore,
  scope:ImmutableAuditScope,
  raw:ImmutableAuditInput,
){
  const collection=collectionForScope(db,scope);
  const recordRef=collection.doc();
  const headRef=db.doc('auditIntegrityHeads/'+headId(scope));
  const occurredAt=new Date().toISOString();
  return db.runTransaction(async transaction=>{
    const head=await transaction.get(headRef);
    const previous=head.exists?head.data()||{}:{};
    const sequence=Math.max(0,Math.trunc(Number(previous.sequence||0)))+1;
    const previousHash=String(previous.entryHash||'');
    const base={
      ...raw,
      actorUid:String(raw.actorUid||''),
      actorEmail:String(raw.actorEmail||''),
      action:String(raw.action||'').slice(0,160),
      target:String(raw.target||'').slice(0,500),
      organizationId:String(raw.organizationId||''),
      tenantType:String(raw.tenantType||scope.kind),
      tenantId:String(raw.tenantId||''),
      before:raw.before??null,
      after:raw.after??null,
      immutable:true,
      integrityVersion:1,
      scopeKey:scopeKey(scope),
      sequence,
      previousHash,
      occurredAt,
    };
    const entryHash=digest({...base,recordId:recordRef.id});
    transaction.create(recordRef,{
      ...base,
      entryHash,
      timestamp:FieldValue.serverTimestamp(),
    });
    transaction.set(headRef,{
      scopeKey:scopeKey(scope),
      sequence,
      entryHash,
      recordPath:recordRef.path,
      recordId:recordRef.id,
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:false});
    return {id:recordRef.id,entryHash,sequence,previousHash,occurredAt};
  });
}

function timestampMillis(value:unknown){
  if(!value)return 0;
  if(typeof value==='string')return Date.parse(value)||0;
  if(typeof value==='number')return value;
  if(typeof value==='object'){
    const candidate=value as {toMillis?:()=>number;seconds?:number;_seconds?:number};
    if(typeof candidate.toMillis==='function'){
      try{return candidate.toMillis();}catch{return 0;}
    }
    const seconds=Number(candidate.seconds??candidate._seconds);
    if(Number.isFinite(seconds))return seconds*1000;
  }
  return 0;
}

export async function applyOrganizationAuditVisibility(
  db:Firestore,
  organizationId:string,
  documents:FirebaseFirestore.QueryDocumentSnapshot[],
){
  const cutoffRef=db.doc('organizations/'+organizationId+'/auditVisibility/__cutoff');
  const [cutoff,...overlays]=await Promise.all([
    cutoffRef.get(),
    ...documents.map(document=>db.doc('organizations/'+organizationId+'/auditVisibility/'+document.id).get()),
  ]);
  const cutoffMillis=Date.parse(String(cutoff.data()?.hiddenBefore||''))||0;
  return documents.map((document,index)=>{
    const data=document.data()||{};
    const overlay=overlays[index];
    const occurredAt=timestampMillis(data.occurredAt||data.timestamp);
    const hiddenByCutoff=cutoffMillis>0&&occurredAt>0&&occurredAt<=cutoffMillis;
    const hiddenById=overlay?.exists&&overlay.data()?.hidden===true;
    return {
      id:document.id,
      ...data,
      hiddenFromOrganizationView:hiddenByCutoff||hiddenById,
      visibilityReason:hiddenById?'selected':hiddenByCutoff?'clear_before':'',
    };
  });
}
