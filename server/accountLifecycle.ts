import { createHash } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, type DocumentData, type DocumentReference, type Firestore, type Query } from 'firebase-admin/firestore';
import { getAdminDb } from './tenant.js';

export const ACCOUNT_DELETION_GRACE_DAYS = 30;
const MAX_EXPORT_RECORDS_PER_QUERY = 500;
const DELETE_BATCH_SIZE = 150;

export const ACCOUNT_RETENTION_POLICY = {
  profile: 'Deleted after the account-deletion grace period.',
  settings: 'Deleted after the account-deletion grace period.',
  progress: 'Deleted after the account-deletion grace period.',
  assessmentAttempts: 'Deleted after the account-deletion grace period; aggregate non-identifying analytics may remain.',
  certificates: 'Official credential records are retained for verification integrity. Account identifiers and contact fields are pseudonymized; credential identity fields required to validate the issued certificate are retained.',
  baptismCandidateRecords: 'Candidate workflow records are deleted unless incorporated into a separately required organizational ministry record.',
  mentoring: 'Learner-owned assignments and conversations are deleted. A mentor account with active learner assignments must be reassigned before deletion.',
  conversations: 'Learner support conversations and learner-authored messages are deleted with the account; records required for another participant are de-identified.',
  support: 'Learner support requests are deleted after the grace period.',
  notifications: 'Deleted after the grace period.',
  engagement: 'Personal challenge, duel and Scripture-memory state is deleted or de-identified so another participant\'s history is not corrupted.',
  portfolio: 'Personal portfolio evidence and sharing links are deleted after the grace period.',
  prayerRequests: 'Deleted after the grace period.',
  invitations: 'Unused invitations linked to the account email are deleted after the grace period.',
  financialTransactions: 'Financial transactions, receipts and refund records are retained for seven years for reconciliation/accounting and are pseudonymized where possible.',
  auditLogs: 'Security and privileged audit records are retained for seven years with account identifiers pseudonymized.',
} as const;

type LifecycleStatus = 'none'|'requested'|'processing'|'completed'|'cancelled'|'blocked';
type LifecycleRecord = {
  uid:string;
  status:LifecycleStatus;
  requestedAt?:string;
  scheduledFor?:string;
  cancelledAt?:string;
  completedAt?:string;
  reason?:string;
  updatedAt?:unknown;
};

const forbiddenExportKeys = new Set([
  'correctanswer','correctoptionindex','answerkey','secret','password','authorization',
  'credential','privatekey','apikey','idtoken','accesstoken','refreshtoken','rawproviderevent',
]);

function dateString(value:unknown):string|null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'object') {
    const candidate=value as {toDate?:()=>Date;seconds?:number;_seconds?:number};
    if (typeof candidate.toDate === 'function') return candidate.toDate().toISOString();
    const seconds=Number(candidate.seconds ?? candidate._seconds);
    if (Number.isFinite(seconds)) return new Date(seconds*1000).toISOString();
  }
  return null;
}

function safeValue(value:unknown, depth=0):unknown {
  if (depth > 12) return '[nested data omitted]';
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value ?? null;
  const date=dateString(value);
  if (date) return date;
  if (Array.isArray(value)) return value.map(item=>safeValue(item,depth+1));
  if (typeof value === 'object') {
    const result:Record<string,unknown>={};
    for (const [key,item] of Object.entries(value as Record<string,unknown>)) {
      if (forbiddenExportKeys.has(key.toLowerCase())) continue;
      result[key]=safeValue(item,depth+1);
    }
    return result;
  }
  return String(value);
}

function documentPayload(document:FirebaseFirestore.DocumentSnapshot) {
  return { id:document.id, ...(safeValue(document.data()||{}) as Record<string,unknown>) };
}

function pseudonym(uid:string) {
  return 'deleted:'+createHash('sha256').update('vop-account-deletion:'+uid).digest('hex').slice(0,32);
}

function lifecycleRef(db:Firestore,uid:string) {
  return db.doc('accountLifecycle/'+uid);
}

function plusDays(days:number) {
  return new Date(Date.now()+days*86_400_000).toISOString();
}

async function queryOwned(db:Firestore, collection:string, field:string, uid:string, operator:'=='|'array-contains'='==') {
  const snapshot=await db.collection(collection).where(field,operator,uid).limit(MAX_EXPORT_RECORDS_PER_QUERY).get();
  return snapshot.docs;
}

async function multiOwned(db:Firestore, collection:string, uid:string, fields:string[]) {
  const snapshots=await Promise.all(fields.map(field=>queryOwned(db,collection,field,uid)));
  const byPath=new Map<string,FirebaseFirestore.QueryDocumentSnapshot>();
  snapshots.flat().forEach(document=>byPath.set(document.ref.path,document));
  return [...byPath.values()];
}

async function exportMessagesForParents(parents:FirebaseFirestore.QueryDocumentSnapshot[],uid:string) {
  const result:Array<Record<string,unknown>>=[];
  for (const parent of parents.slice(0,100)) {
    const snapshot=await parent.ref.collection('messages').where('senderId','==',uid).limit(MAX_EXPORT_RECORDS_PER_QUERY).get();
    result.push(...snapshot.docs.map(document=>({parentId:parent.id,...documentPayload(document)})));
  }
  return result;
}

export async function buildAccountExport(db:Firestore,uid:string) {
  const profileRef=db.doc('users/'+uid);
  const [profile,settings,progress,attempts,sessions,memoryState,memoryReviews,pointsLedger]=await Promise.all([
    profileRef.get(),
    profileRef.collection('settings').limit(MAX_EXPORT_RECORDS_PER_QUERY).get(),
    profileRef.collection('progress').limit(MAX_EXPORT_RECORDS_PER_QUERY).get(),
    profileRef.collection('assessmentAttempts').limit(MAX_EXPORT_RECORDS_PER_QUERY).get(),
    profileRef.collection('assessmentSessions').limit(MAX_EXPORT_RECORDS_PER_QUERY).get(),
    profileRef.collection('scriptureMemoryState').limit(MAX_EXPORT_RECORDS_PER_QUERY).get(),
    profileRef.collection('scriptureMemoryReviews').limit(MAX_EXPORT_RECORDS_PER_QUERY).get(),
    profileRef.collection('pointsLedger').limit(MAX_EXPORT_RECORDS_PER_QUERY).get(),
  ]);
  const [
    topLevelAttempts,graduations,certificates,prayers,notifications,supportRequests,
    conversations,transactions,receipts,refunds,courseEnrollments,programEnrollments,
    soloChallenges,soloResults,duels,duelResults,portfolio,portfolioShares,
  ]=await Promise.all([
    multiOwned(db,'assessmentAttempts',uid,['candidateId','userId']),
    queryOwned(db,'graduationRequests','candidateId',uid),
    queryOwned(db,'certificates','candidateId',uid),
    queryOwned(db,'prayerRequests','candidateId',uid),
    multiOwned(db,'notifications',uid,['recipientId','userId','uid']),
    queryOwned(db,'learningSupportRequests','candidateId',uid),
    multiOwned(db,'mentorConversations',uid,['studentId','mentorId']),
    queryOwned(db,'paymentTransactions','payerUid',uid),
    queryOwned(db,'paymentReceipts','payerUid',uid),
    queryOwned(db,'paymentRefunds','payerUid',uid),
    queryOwned(db,'courseEnrollments','uid',uid),
    queryOwned(db,'programEnrollments','uid',uid),
    queryOwned(db,'scriptureSoloChallenges','playerId',uid),
    queryOwned(db,'scriptureChallengeResults','playerId',uid),
    multiOwned(db,'scriptureDuels',uid,['playerA','playerB']),
    multiOwned(db,'scriptureDuelResults',uid,['playerA','playerB']),
    db.doc('masterGuidePortfolios/'+uid).get(),
    queryOwned(db,'masterGuidePortfolioShares','learnerId',uid),
  ]);
  const supportMessages=await exportMessagesForParents(supportRequests,uid);
  const conversationMessages=await exportMessagesForParents(conversations,uid);
  const collection=(documents:FirebaseFirestore.QueryDocumentSnapshot[])=>documents.map(documentPayload);
  return {
    schemaVersion:1,
    generatedAt:new Date().toISOString(),
    accountId:uid,
    retentionPolicy:ACCOUNT_RETENTION_POLICY,
    data:{
      profile:profile.exists?documentPayload(profile):null,
      settings:settings.docs.map(documentPayload),
      progress:progress.docs.map(documentPayload),
      assessmentAttempts:[...attempts.docs.map(documentPayload),...collection(topLevelAttempts)],
      assessmentSessions:sessions.docs.map(documentPayload),
      certificates:collection(certificates),
      graduationRequests:collection(graduations),
      prayerRequests:collection(prayers),
      notifications:collection(notifications),
      mentoringConversations:collection(conversations),
      sentMentoringMessages:conversationMessages,
      supportRequests:collection(supportRequests),
      sentSupportMessages:supportMessages,
      scriptureMemory:{state:memoryState.docs.map(documentPayload),reviews:memoryReviews.docs.map(documentPayload)},
      pointsLedger:pointsLedger.docs.map(documentPayload),
      engagement:{soloChallenges:collection(soloChallenges),soloResults:collection(soloResults),duels:collection(duels),duelResults:collection(duelResults)},
      portfolio:portfolio.exists?documentPayload(portfolio):null,
      portfolioShares:collection(portfolioShares),
      enrollments:{courses:collection(courseEnrollments),programs:collection(programEnrollments)},
      payments:{transactions:collection(transactions),receipts:collection(receipts),refunds:collection(refunds)},
    },
    limits:{perQuery:MAX_EXPORT_RECORDS_PER_QUERY,note:'Large categories are bounded per export response. Contact VOP administration for an archival export if any category exceeds this bound.'},
  };
}

export async function getAccountLifecycleStatus(db:Firestore,uid:string) {
  const snapshot=await lifecycleRef(db,uid).get();
  if(!snapshot.exists)return {status:'none' as LifecycleStatus,retentionPolicy:ACCOUNT_RETENTION_POLICY};
  const data=snapshot.data()||{};
  return {
    status:String(data.status||'none') as LifecycleStatus,
    requestedAt:dateString(data.requestedAt),
    scheduledFor:dateString(data.scheduledFor),
    cancelledAt:dateString(data.cancelledAt),
    completedAt:dateString(data.completedAt),
    reason:String(data.reason||''),
    retentionPolicy:ACCOUNT_RETENTION_POLICY,
  };
}

export async function requestAccountDeletion(db:Firestore,uid:string,confirmation:string,reason='') {
  if(confirmation.trim()!=='DELETE MY ACCOUNT')throw new Error('Type DELETE MY ACCOUNT to confirm the deletion request.');
  const profile=await db.doc('users/'+uid).get();
  if(!profile.exists)throw new Error('Account profile was not found.');
  const data=profile.data()||{};
  const role=String(data.role||'');
  const organizationRole=String(data.organizationRole||'');
  if(role==='super_admin')throw new Error('A Super Admin account cannot be self-deleted. Transfer platform administration first.');
  if(organizationRole==='owner')throw new Error('An organization owner must transfer ownership before requesting account deletion.');
  if(role==='mentor'){
    const assignments=await db.collection('mentorAssignments').where('mentorId','==',uid).limit(25).get();
    if(assignments.docs.some(document=>String(document.data()?.status||'active')!=='inactive'))throw new Error('This mentor still has active learner assignments. Reassign them before deleting the account.');
  }
  const now=new Date().toISOString();
  const scheduledFor=plusDays(ACCOUNT_DELETION_GRACE_DAYS);
  await lifecycleRef(db,uid).set({
    uid,status:'requested',requestedAt:now,scheduledFor,
    reason:String(reason||'').trim().slice(0,500),
    requestedBy:uid,updatedAt:FieldValue.serverTimestamp(),
  },{merge:false});
  return {status:'requested' as const,requestedAt:now,scheduledFor,graceDays:ACCOUNT_DELETION_GRACE_DAYS};
}

export async function cancelAccountDeletion(db:Firestore,uid:string) {
  const ref=lifecycleRef(db,uid);
  const snapshot=await ref.get();
  if(!snapshot.exists||!['requested','blocked'].includes(String(snapshot.data()?.status||'')))throw new Error('There is no cancellable account-deletion request.');
  const cancelledAt=new Date().toISOString();
  await ref.set({status:'cancelled',cancelledAt,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  return {status:'cancelled' as const,cancelledAt};
}

async function deleteDocumentTree(ref:DocumentReference) {
  const collections=await ref.listCollections();
  for(const collection of collections){
    while(true){
      const snapshot=await collection.limit(DELETE_BATCH_SIZE).get();
      if(snapshot.empty)break;
      for(const document of snapshot.docs)await deleteDocumentTree(document.ref);
      const batch=ref.firestore.batch();
      snapshot.docs.forEach(document=>batch.delete(document.ref));
      await batch.commit();
      if(snapshot.size<DELETE_BATCH_SIZE)break;
    }
  }
  await ref.delete().catch(()=>undefined);
}

async function deleteWhere(db:Firestore,collection:string,field:string,uid:string,operator:'=='|'array-contains'='==') {
  let deleted=0;
  for(let round=0;round<20;round++){
    const snapshot=await db.collection(collection).where(field,operator,uid).limit(DELETE_BATCH_SIZE).get();
    if(snapshot.empty)return {deleted,pending:false};
    for(const document of snapshot.docs)await deleteDocumentTree(document.ref);
    deleted+=snapshot.size;
    if(snapshot.size<DELETE_BATCH_SIZE)return {deleted,pending:false};
  }
  return {deleted,pending:true};
}

async function anonymizeQuery(query:Query,uid:string,patch:Record<string,unknown>) {
  let updated=0;
  for(let round=0;round<20;round++){
    const snapshot=await query.limit(DELETE_BATCH_SIZE).get();
    if(snapshot.empty)return {updated,pending:false};
    const batch=snapshot.docs[0]?.ref.firestore.batch();
    if(!batch)return {updated,pending:false};
    snapshot.docs.forEach(document=>batch.update(document.ref,patch));
    await batch.commit();
    updated+=snapshot.size;
    if(snapshot.size<DELETE_BATCH_SIZE)return {updated,pending:false};
  }
  return {updated,pending:true};
}

async function anonymizeRetainedRecords(db:Firestore,uid:string,deletedAt:string) {
  const anonymousId=pseudonym(uid);
  const common={accountDeletedAt:deletedAt,accountDeletionPseudonym:anonymousId};
  const results=await Promise.all([
    anonymizeQuery(db.collection('certificates').where('candidateId','==',uid),uid,{
      ...common,candidateId:anonymousId,candidateEmail:FieldValue.delete(),email:FieldValue.delete(),
    }),
    anonymizeQuery(db.collection('paymentTransactions').where('payerUid','==',uid),uid,{
      ...common,payerUid:anonymousId,payerEmail:FieldValue.delete(),payerName:'Deleted VOP account',
    }),
    anonymizeQuery(db.collection('paymentReceipts').where('payerUid','==',uid),uid,{
      ...common,payerUid:anonymousId,payerEmail:FieldValue.delete(),payerName:'Deleted VOP account',
    }),
    anonymizeQuery(db.collection('paymentRefunds').where('payerUid','==',uid),uid,{
      ...common,payerUid:anonymousId,payerEmail:FieldValue.delete(),payerName:'Deleted VOP account',
    }),
    anonymizeQuery(db.collection('platformAudit').where('actorUid','==',uid),uid,{
      ...common,actorUid:anonymousId,actorEmail:FieldValue.delete(),
    }),
    anonymizeQuery(db.collectionGroup('audit').where('actorUid','==',uid),uid,{
      ...common,actorUid:anonymousId,actorEmail:FieldValue.delete(),
    }),
    anonymizeQuery(db.collectionGroup('entries').where('actorUid','==',uid),uid,{
      ...common,actorUid:anonymousId,actorEmail:FieldValue.delete(),
    }),
  ]);
  return {anonymousId,pending:results.some(result=>result.pending)};
}

async function anonymizeSharedEngagement(db:Firestore,uid:string,deletedAt:string) {
  const anonymousId=pseudonym(uid);
  let pending=false;
  for(const collection of ['scriptureDuels','scriptureDuelResults']){
    for(const field of ['playerA','playerB']){
      const result=await anonymizeQuery(db.collection(collection).where(field,'==',uid),uid,{
        [field]:anonymousId,accountDeletedAt:deletedAt,
      });
      pending ||= result.pending;
    }
  }
  const mentorConversations=await db.collection('mentorConversations').where('mentorId','==',uid).limit(DELETE_BATCH_SIZE).get();
  for(const document of mentorConversations.docs){
    const messages=await document.ref.collection('messages').where('senderId','==',uid).limit(DELETE_BATCH_SIZE).get();
    for(const message of messages.docs)await message.ref.delete();
    await document.ref.set({mentorId:anonymousId,mentorName:'Deleted mentor',accountDeletedAt:deletedAt},{merge:true});
    if(messages.size===DELETE_BATCH_SIZE)pending=true;
  }
  return pending;
}

async function deletePersonalRecords(db:Firestore,uid:string,email:string) {
  const operations=[
    ['assessmentAttempts','candidateId','=='],['assessmentAttempts','userId','=='],
    ['graduationRequests','candidateId','=='],['prayerRequests','candidateId','=='],
    ['notifications','recipientId','=='],['notifications','userId','=='],['notifications','uid','=='],
    ['notificationDeliveries','recipientId','=='],['learningSupportRequests','candidateId','=='],
    ['scriptureSoloChallenges','playerId','=='],['scriptureChallengeResults','playerId','=='],
    ['masterGuidePortfolioShares','learnerId','=='],['courseEnrollments','uid','=='],
    ['programEnrollments','uid','=='],['eventRegistrations','uid','=='],
  ] as const;
  let pending=false;
  for(const [collection,field,operator] of operations){
    const result=await deleteWhere(db,collection,field,uid,operator);
    pending ||= result.pending;
  }
  if(email){
    const invitations=await deleteWhere(db,'organizationInvites','email',email.toLowerCase());
    pending ||= invitations.pending;
  }
  const studentConversations=await deleteWhere(db,'mentorConversations','studentId',uid);
  pending ||= studentConversations.pending;
  const portfolio=db.doc('masterGuidePortfolios/'+uid);
  if((await portfolio.get()).exists)await deleteDocumentTree(portfolio);
  const assignment=db.doc('mentorAssignments/'+uid);
  if((await assignment.get()).exists)await deleteDocumentTree(assignment);
  const candidate=db.doc('candidates/'+uid);
  if((await candidate.get()).exists)await deleteDocumentTree(candidate);
  return pending;
}

export async function processAccountDeletion(db:Firestore,uid:string,now=new Date()) {
  const ref=lifecycleRef(db,uid);
  const lifecycle=await ref.get();
  if(!lifecycle.exists)return {processed:false,status:'none' as const};
  const record=lifecycle.data()||{};
  const status=String(record.status||'');
  if(!['requested','processing','blocked'].includes(status))return {processed:false,status};
  const scheduled=Date.parse(String(record.scheduledFor||''));
  if(!Number.isFinite(scheduled)||scheduled>now.getTime())return {processed:false,status:'requested' as const};

  const profileRef=db.doc('users/'+uid);
  const profile=await profileRef.get();
  if(!profile.exists){
    await ref.set({status:'completed',completedAt:now.toISOString(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return {processed:true,status:'completed' as const};
  }
  const profileData=profile.data()||{};
  if(String(profileData.role||'')==='super_admin'||String(profileData.organizationRole||'')==='owner'){
    await ref.set({status:'blocked',reason:'Administrative ownership must be transferred before deletion.',updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return {processed:false,status:'blocked' as const};
  }
  const mentorAssignments=await db.collection('mentorAssignments').where('mentorId','==',uid).limit(25).get();
  if(mentorAssignments.docs.some(document=>String(document.data()?.status||'active')!=='inactive')){
    await ref.set({status:'blocked',reason:'Active mentor assignments must be reassigned before deletion.',updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return {processed:false,status:'blocked' as const};
  }

  const deletedAt=now.toISOString();
  await ref.set({status:'processing',processingStartedAt:record.processingStartedAt||deletedAt,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  const retained=await anonymizeRetainedRecords(db,uid,deletedAt);
  const sharedPending=await anonymizeSharedEngagement(db,uid,deletedAt);
  const personalPending=await deletePersonalRecords(db,uid,String(profileData.email||'').trim().toLowerCase());
  if(retained.pending||sharedPending||personalPending){
    await ref.set({status:'processing',lastPassAt:deletedAt,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return {processed:true,status:'processing' as const};
  }

  const organizationId=String(profileData.organizationId||'').trim();
  if(organizationId)await db.doc('organizations/'+organizationId+'/members/'+uid).delete().catch(()=>undefined);
  await deleteDocumentTree(profileRef);

  const anonymousId=retained.anonymousId;
  await db.doc('accountDeletionTombstones/'+anonymousId).set({
    pseudonym:anonymousId,status:'completed',completedAt:deletedAt,
    retentionPolicyVersion:1,source:'account-lifecycle',
  },{merge:false});
  await getAuth().deleteUser(uid).catch(error=>{
    const code=String((error as {code?:string})?.code||'');
    if(!code.includes('user-not-found'))throw error;
  });
  await ref.delete();
  return {processed:true,status:'completed' as const,pseudonym:anonymousId};
}

export async function processDueAccountDeletions(db=getAdminDb(),now=new Date(),limit=10) {
  const snapshot=await db.collection('accountLifecycle')
    .where('status','in',['requested','processing','blocked'])
    .limit(Math.max(1,Math.min(25,limit))).get();
  const due=snapshot.docs.filter(document=>{
    const data=document.data()||{};
    const scheduled=Date.parse(String(data.scheduledFor||''));
    return Number.isFinite(scheduled)&&scheduled<=now.getTime();
  });
  const results=[];
  for(const document of due){
    try{results.push({uid:document.id,...await processAccountDeletion(db,document.id,now)});}
    catch(error){
      await document.ref.set({status:'blocked',reason:error instanceof Error?error.message:'Deletion processing failed.',lastFailureAt:now.toISOString(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      results.push({uid:document.id,processed:false,status:'blocked',error:error instanceof Error?error.message:'Deletion processing failed.'});
    }
  }
  return {checked:snapshot.size,due:due.length,results};
}
