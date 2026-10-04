import {FieldValue} from 'firebase-admin/firestore';

export type EngagementPointKind='soloChallenge'|'duelChallenge'|'memoryReview'|'practiceQuiz'|'chapterQuiz'|'finalExam';

export const DEFAULT_ENGAGEMENT_POINTS:Record<EngagementPointKind,number>={
  soloChallenge:10,
  duelChallenge:15,
  memoryReview:1,
  practiceQuiz:5,
  chapterQuiz:10,
  finalExam:25,
};

function clean(value:string,field:string){
  const normalized=String(value||'').trim();
  if(!normalized||normalized.length>180||normalized.includes('/'))throw new Error(`A valid ${field} is required.`);
  return normalized;
}
function pointValue(raw:unknown,fallback:number){
  const value=Number(raw);
  return Number.isInteger(value)&&value>=0&&value<=10000?value:fallback;
}

export async function organizationPointRules(db:FirebaseFirestore.Firestore,organizationId:string){
  if(!organizationId)return {...DEFAULT_ENGAGEMENT_POINTS};
  const settings=await db.doc(`organizations/${clean(organizationId,'organization')}/settings/settings`).get();
  const configured=settings.data()?.engagementPoints;
  const rows=configured&&typeof configured==='object'?configured as Record<string,unknown>:{};
  return {
    soloChallenge:pointValue(rows.soloChallenge,DEFAULT_ENGAGEMENT_POINTS.soloChallenge),
    duelChallenge:pointValue(rows.duelChallenge,DEFAULT_ENGAGEMENT_POINTS.duelChallenge),
    memoryReview:pointValue(rows.memoryReview,DEFAULT_ENGAGEMENT_POINTS.memoryReview),
    practiceQuiz:pointValue(rows.practiceQuiz,DEFAULT_ENGAGEMENT_POINTS.practiceQuiz),
    chapterQuiz:pointValue(rows.chapterQuiz,DEFAULT_ENGAGEMENT_POINTS.chapterQuiz),
    finalExam:pointValue(rows.finalExam,DEFAULT_ENGAGEMENT_POINTS.finalExam),
  };
}

export function pointKindForAssessment(value:unknown):EngagementPointKind{
  const kind=String(value||'').trim();
  if(kind==='final_exam')return 'finalExam';
  if(kind==='chapter_quiz')return 'chapterQuiz';
  return 'practiceQuiz';
}

export async function awardPointsInTransaction(
  transaction:FirebaseFirestore.Transaction,
  db:FirebaseFirestore.Firestore,
  uid:string,
  organizationId:string,
  kind:EngagementPointKind,
  eventId:string,
  points:number,
){
  const userId=clean(uid,'user');
  const id=`${kind}-${clean(eventId,'point event')}`;
  const ledger=db.doc(`users/${userId}/pointsLedger/${id}`);
  const existing=await transaction.get(ledger);
  if(existing.exists)return 0;
  transaction.create(ledger,{
    kind,eventId:clean(eventId,'point event'),points,organizationId,
    awardedAt:FieldValue.serverTimestamp(),
  });
  if(points>0)transaction.set(db.doc(`users/${userId}`),{
    engagementPoints:FieldValue.increment(points),
    updatedAt:FieldValue.serverTimestamp(),
  },{merge:true});
  return points;
}
