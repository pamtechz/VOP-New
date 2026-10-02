import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { configuredPassThreshold } from '../shared/studyValidation.js';

export type CertificationAssessment={
  id:unknown;
  assessmentPassThreshold?:unknown;
};

export type AssessmentEvidenceRow={
  assessmentId:string;
  score:number;
  threshold:number;
  attemptId:string|null;
  attemptNumber:number|null;
  source:'verified_attempt'|'legacy_score';
};

export type AssessmentEvidence={
  averageScore:number;
  rows:AssessmentEvidenceRow[];
};

function text(value:unknown){return typeof value==='string'?value.trim():'';}
function timestampMs(value:unknown){
  if(!value)return 0;
  if(typeof value==='string'||typeof value==='number'){
    const parsed=Date.parse(String(value));
    return Number.isFinite(parsed)?parsed:0;
  }
  if(typeof value==='object'){
    const stamp=value as {toDate?:()=>Date;seconds?:number;_seconds?:number};
    if(typeof stamp.toDate==='function')return stamp.toDate().getTime();
    const seconds=Number(stamp.seconds??stamp._seconds);
    return Number.isFinite(seconds)?seconds*1000:0;
  }
  return 0;
}
function validScore(value:unknown):value is number{
  return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
}
function creditIsCurrent(value:Record<string,unknown>){
  const status=text(value.creditStatus);
  return !status||status==='active';
}
function latestAttempt<T extends {id:string;data:Record<string,unknown>}>(rows:T[]){
  return rows.sort((a,b)=>{
    const byNumber=Number(b.data.attemptNumber||0)-Number(a.data.attemptNumber||0);
    if(byNumber)return byNumber;
    return timestampMs(b.data.createdAt)-timestampMs(a.data.createdAt);
  })[0]||null;
}

/**
 * Resolve the learner's current assessment credit from immutable, server-written
 * attempts. Legacy score-only records remain supported during migration.
 *
 * A current guide score must match the chosen attempt score. Starting a retake
 * removes that score and revokes the old attempt credit atomically, so a stale
 * passed attempt can never satisfy certification.
 */
export async function verifiedAssessmentEvidence(
  db:Firestore,
  candidateId:string,
  assessments:readonly CertificationAssessment[],
  guideScores:Record<string,unknown>,
  organizationId:string,
  language:string,
  guideId:string,
  fallbackPassMark:number,
):Promise<AssessmentEvidence|null>{
  if(!candidateId||!assessments.length||!organizationId||!language||!guideId
    ||configuredPassThreshold(fallbackPassMark)===null)return null;

  const snapshot=await db.collection(`users/${candidateId}/assessmentAttempts`)
    .where('guideId','==',guideId).limit(500).get();
  const attempts=snapshot.docs.map(doc=>({id:doc.id,data:doc.data()||{}}));
  const rows:AssessmentEvidenceRow[]=[];
  const seen=new Set<string>();

  for(const assessment of assessments){
    const assessmentId=text(assessment.id);
    if(!assessmentId||assessmentId.includes('/')||seen.has(assessmentId))return null;
    seen.add(assessmentId);
    const scoreKey=`${organizationId}:${language}:${guideId}:${assessmentId}`;
    const currentScore=guideScores[scoreKey];
    if(!validScore(currentScore))return null;

    const matching=attempts.filter(row=>{
      const data=row.data;
      return text(data.organizationId)===organizationId
        &&text(data.language)===language
        &&text(data.guideId)===guideId
        &&text(data.lessonId)===assessmentId
        &&creditIsCurrent(data);
    });
    const attempt=latestAttempt(matching);
    if(attempt){
      const attemptScore=attempt.data.score;
      const threshold=configuredPassThreshold(attempt.data.threshold)
        ??configuredPassThreshold(assessment.assessmentPassThreshold)
        ??configuredPassThreshold(fallbackPassMark);
      if(threshold===null||!validScore(attemptScore)||attemptScore!==currentScore
        ||attempt.data.passed!==true||attemptScore<threshold)return null;
      rows.push({
        assessmentId,score:attemptScore,threshold,attemptId:attempt.id,
        attemptNumber:Number.isInteger(Number(attempt.data.attemptNumber))
          ?Number(attempt.data.attemptNumber):null,
        source:'verified_attempt',
      });
      continue;
    }

    // Migration compatibility: historical records created before detailed
    // attempts existed can use the authoritative server-written guide score.
    const legacyThreshold=configuredPassThreshold(assessment.assessmentPassThreshold)
      ??configuredPassThreshold(fallbackPassMark);
    if(legacyThreshold===null||currentScore<legacyThreshold)return null;
    rows.push({
      assessmentId,score:currentScore,threshold:legacyThreshold,
      attemptId:null,attemptNumber:null,source:'legacy_score',
    });
  }

  const averageScore=Math.round((rows.reduce((sum,row)=>sum+row.score,0)/rows.length)*100)/100;
  return {averageScore,rows};
}

export async function revalidateAssessmentEvidence(
  transaction:Transaction,
  userRef:DocumentReference,
  evidence:AssessmentEvidence,
  guideScores:Record<string,unknown>,
  organizationId:string,
  language:string,
  guideId:string,
){
  for(const row of evidence.rows){
    const scoreKey=`${organizationId}:${language}:${guideId}:${row.assessmentId}`;
    if(guideScores[scoreKey]!==row.score)return false;
    if(!row.attemptId)continue;
    const attempt=await transaction.get(userRef.collection('assessmentAttempts').doc(row.attemptId));
    const data=attempt.data()||{};
    if(!attempt.exists||!creditIsCurrent(data)
      ||text(data.organizationId)!==organizationId
      ||text(data.language)!==language
      ||text(data.guideId)!==guideId
      ||text(data.lessonId)!==row.assessmentId
      ||data.score!==row.score||data.threshold!==row.threshold||data.passed!==true)return false;
  }
  return true;
}
