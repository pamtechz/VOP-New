import {createHash} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';

export const DEFAULT_ENGAGEMENT_POINTS={
  soloChallenge:1,
  duelChallenge:1,
  memoryDeck:1,
  practiceQuiz:1,
  chapterQuiz:1,
  finalExam:1,
} as const;

export type EngagementPointKey=keyof typeof DEFAULT_ENGAGEMENT_POINTS;
export type EngagementPointsConfig=Record<EngagementPointKey,number>;

function wholePoints(value:unknown,fallback:number){
  const parsed=Number(value);
  return Number.isInteger(parsed)&&parsed>=0&&parsed<=10000?parsed:fallback;
}
export function normalizeEngagementPoints(value:unknown):EngagementPointsConfig{
  const source=value&&typeof value==='object'&&!Array.isArray(value)
    ?value as Record<string,unknown>:{};
  return {
    soloChallenge:wholePoints(source.soloChallenge,DEFAULT_ENGAGEMENT_POINTS.soloChallenge),
    duelChallenge:wholePoints(source.duelChallenge,DEFAULT_ENGAGEMENT_POINTS.duelChallenge),
    memoryDeck:wholePoints(source.memoryDeck,DEFAULT_ENGAGEMENT_POINTS.memoryDeck),
    practiceQuiz:wholePoints(source.practiceQuiz,DEFAULT_ENGAGEMENT_POINTS.practiceQuiz),
    chapterQuiz:wholePoints(source.chapterQuiz,DEFAULT_ENGAGEMENT_POINTS.chapterQuiz),
    finalExam:wholePoints(source.finalExam,DEFAULT_ENGAGEMENT_POINTS.finalExam),
  };
}
function safeOrganizationId(value:unknown){
  const id=String(value||'').trim();
  return /^[A-Za-z0-9_-]{1,120}$/.test(id)?id:'';
}
export function engagementPointsConfigPath(organizationId:string){
  const id=safeOrganizationId(organizationId);
  if(!id)throw new Error('A valid organization is required for engagement points.');
  return `organizations/${id}/settings/engagementPoints`;
}
export async function effectiveEngagementPoints(
  db:FirebaseFirestore.Firestore,
  organizationId:string,
):Promise<EngagementPointsConfig>{
  const id=safeOrganizationId(organizationId);
  if(!id)return normalizeEngagementPoints({});
  const snapshot=await db.doc(engagementPointsConfigPath(id)).get();
  return normalizeEngagementPoints(snapshot.data()?.points);
}
export function pointKeyForAssessment(kind:unknown):EngagementPointKey{
  if(String(kind)==='final_exam')return 'finalExam';
  if(String(kind)==='chapter_quiz')return 'chapterQuiz';
  return 'practiceQuiz';
}
function ledgerId(sourceType:string,sourceId:string){
  return createHash('sha256').update(sourceType+':'+sourceId).digest('hex');
}

/**
 * Awards an activity exactly once. The deterministic ledger document and the
 * aggregate user increment live in one transaction, so retries cannot farm
 * points and no collection scan is needed.
 */
export async function awardEngagementPoints(
  db:FirebaseFirestore.Firestore,
  uid:string,
  organizationId:string,
  key:EngagementPointKey,
  sourceType:string,
  sourceId:string,
  metadata:Record<string,unknown>={},
){
  const userId=String(uid||'').trim();
  const orgId=safeOrganizationId(organizationId);
  const eventSource=String(sourceId||'').trim();
  if(!userId||!orgId||!eventSource)return {awarded:false,points:0,total:null};
  const config=await effectiveEngagementPoints(db,orgId);
  const points=config[key];
  const eventId=ledgerId(sourceType,eventSource);
  const userRef=db.doc('users/'+userId);
  const ledgerRef=userRef.collection('pointsLedger').doc(eventId);
  const result=await db.runTransaction(async transaction=>{
    const [ledger,user]=await Promise.all([transaction.get(ledgerRef),transaction.get(userRef)]);
    if(ledger.exists)return {awarded:false,points:Number(ledger.data()?.points||0),total:null};
    if(!user.exists||String(user.data()?.organizationId||'')!==orgId){
      throw new Error('Points cannot be awarded outside the learner organization.');
    }
    transaction.create(ledgerRef,{
      eventId,key,sourceType,sourceId:eventSource,points,organizationId:orgId,
      ...metadata,createdAt:FieldValue.serverTimestamp(),
    });
    transaction.set(userRef,{
      engagementPoints:FieldValue.increment(points),
      engagementPointsUpdatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    return {awarded:true,points,total:null};
  });
  return result;
}
