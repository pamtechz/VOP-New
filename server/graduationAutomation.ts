import {createHash} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import {configuredPassThreshold} from '../shared/studyValidation.js';
import {revalidateAssessmentEvidence, verifiedAssessmentEvidence} from './assessmentEvidence.js';
import {hasRequiredFinalExam} from '../shared/curriculumStructure.js';
import {createNotification} from './notifications.js';
import {certificationPortfolioEvidence} from './certificateAward.js';
import {organizationSubscriptionFeatureBlockReason} from './permissions.js';

type ApprovalStage={id:string;label:string;approverRoles:string[]};
type AutoReviewResult={
  eligible:boolean;
  created:boolean;
  requestId?:string;
  status?:string;
  averageScore?:number;
  reason?:string;
};

function text(value:unknown){return typeof value==='string'?value.trim():'';}
async function certificationConfigFor(db:FirebaseFirestore.Firestore,organizationId:string){
  const [platform,scoped]=await Promise.all([
    db.doc('system/certification').get(),
    organizationId?db.doc(`organizations/${organizationId}/settings/certification`).get():Promise.resolve(null),
  ]);
  return {
    ...(platform.data()||{}),
    ...(scoped?.data()||{}),
    scope:scoped?.exists?'organization':'platform',
    inherited:!scoped?.exists,
  } as Record<string,unknown>;
}
function requestId(organizationId:string,candidateId:string,guideId:string){
  return 'grad-'+createHash('sha256').update(organizationId+':'+candidateId+':'+guideId).digest('hex').slice(0,48);
}
function stagesFromConfig(data:Record<string,unknown>):ApprovalStage[]{
  const rows=Array.isArray(data.approvalStages)?data.approvalStages:[];
  if(!rows.length)return [{id:'organization',label:'Organization review',approverRoles:['owner','admin','mentor']}];
  return rows.map(row=>row&&typeof row==='object'?row as Record<string,unknown>:null)
    .map(row=>row?{
      id:text(row.id),
      label:text(row.label)||text(row.id),
      approverRoles:Array.isArray(row.approverRoles)
        ?row.approverRoles.map(String).map(value=>value.trim()).filter(Boolean):[],
      enabled:row.enabled!==false,
    }:null)
    .filter((row):row is ApprovalStage&{enabled:boolean}=>Boolean(row?.enabled&&row.id&&row.approverRoles.length))
    .map(({id,label,approverRoles})=>({id,label,approverRoles}))
    .slice(0,20);
}
function pendingStatus(stage:ApprovalStage){
  const id=stage.id.toLowerCase().replace(/[^a-z0-9_-]/g,'_').replace(/^_+|_+$/g,'');
  return id?('pending_'+id).slice(0,80):'pending';
}

async function notifyApprovers(
  db:FirebaseFirestore.Firestore,
  request:Record<string,unknown>,
  stage:ApprovalStage,
  createdBy:string,
){
  const recipients=new Set<string>();
  const organizationId=text(request.organizationId);
  if(organizationId){
    const members=await db.collection(`organizations/${organizationId}/members`).where('active','==',true).get();
    for(const member of members.docs){
      const memberRole=text(member.data()?.role);
      if(memberRole!=='mentor'&&stage.approverRoles.includes(memberRole))recipients.add(member.id);
    }
    if(stage.approverRoles.includes('mentor')){
      const candidateId=text(request.candidateId);
      if(candidateId){
        const assignment=await db.doc(`mentorAssignments/${candidateId}`).get();
        if(assignment.exists&&assignment.data()?.status==='active'){
          const mentorId=text(assignment.data()?.mentorId);
          if(mentorId)recipients.add(mentorId);
        }
      }
    }
  }
  const hierarchyRoleField:Record<string,string>={
    union_admin:'unionId',conference_admin:'conferenceId',district_admin:'districtId',church_admin:'churchId',
  };
  for(const role of stage.approverRoles){
    if(role==='super_admin'){
      const admins=await db.collection('users').where('role','==','super_admin').limit(50).get();
      admins.docs.forEach(doc=>recipients.add(doc.id));
      continue;
    }
    const scopeField=hierarchyRoleField[role];
    if(!scopeField)continue;
    const nodeId=text(request[scopeField]);
    if(!nodeId)continue;
    const admins=await db.collection('users').where('role','==',role).limit(100).get();
    admins.docs.filter(doc=>text(doc.data()?.adminNodeId)===nodeId).forEach(doc=>recipients.add(doc.id));
  }
  await Promise.all([...recipients].filter(Boolean).map(recipientId=>createNotification(db,{
    organizationId,
    recipientId,
    type:'certificate',
    title:'Certificate review required',
    body:`${text(request.candidateName)||'A learner'} completed ${text(request.guideTitle)||'a VOP course'} and is ready for ${stage.label||stage.id} review.`,
    actionUrl:'/admin/certification',
    metadata:{source:'automatic-certificate-review',requestId:text(request.id),stageId:stage.id},
    createdBy,
  })));
}

/**
 * Resolves certificate eligibility automatically once a learner has completed
 * every published study lesson and passed every required assessment. Depending
 * on the organization's release policy it either creates a review gate or an
 * already-approved issuance record. Repeated progress writes are idempotent.
 */
export async function ensureAutomaticGraduationReview(
  db:FirebaseFirestore.Firestore,
  candidateId:string,
  guideId:string,
  createdBy='system:completion',
):Promise<AutoReviewResult>{
  if(!candidateId||!guideId)return {eligible:false,created:false,reason:'missing_candidate_or_guide'};
  const [candidateSnapshot,guideSnapshot]=await Promise.all([
    db.doc(`users/${candidateId}`).get(),
    db.doc(`guides/${guideId}`).get(),
  ]);
  if(!candidateSnapshot.exists||!guideSnapshot.exists)return {eligible:false,created:false,reason:'missing_record'};
  const candidate=candidateSnapshot.data()||{};
  const guide=guideSnapshot.data()||{};
  const organizationId=text(candidate.organizationId);
  if(!organizationId||text(candidate.role)!=='student')return {eligible:false,created:false,reason:'not_organization_learner'};
  const organization=await db.doc(`organizations/${organizationId}`).get();
  if(!organization.exists||organization.data()?.status!=='active')return {eligible:false,created:false,reason:'inactive_organization'};
  if(await organizationSubscriptionFeatureBlockReason(db,'certification',organizationId)){
    return {eligible:false,created:false,reason:'certification_subscription_unavailable'};
  }
  const guideOrganizationId=text(guide.organizationId||guide.ownerOrganizationId);
  const systemWide=guide.sharingScope==='shared'
    || String(guide.scope||'')==='platform'
    || !guideOrganizationId;
  if(guideOrganizationId!==organizationId&&!systemWide)return {eligible:false,created:false,reason:'guide_outside_organization'};
  if(guide.published!==true||guide.archived===true||guide.certificateEligible!==true){
    return {eligible:false,created:false,reason:'guide_not_certificate_eligible'};
  }
  const config=await certificationConfigFor(db,organizationId);
  if(config.enabled!==true)return {eligible:false,created:false,reason:'certification_disabled'};
  const releaseMode=text(config.releaseMode)==='review'?'review':'automatic';
  const stages=releaseMode==='review'?stagesFromConfig(config):[];
  if(releaseMode==='review'&&!stages.length)return {eligible:false,created:false,reason:'approval_workflow_not_configured'};

  const [lessonsSnapshot,settingsSnapshot]=await Promise.all([
    guideSnapshot.ref.collection('lessons').get(),
    db.doc(`organizations/${organizationId}/settings/settings`).get(),
  ]);
  const records=lessonsSnapshot.docs.map(document=>({...document.data(),id:document.id} as Record<string,unknown>&{id:string}));
  if(!records.length||records.some(record=>record.published!==true||record.archived===true)){
    return {eligible:false,created:false,reason:'curriculum_not_fully_published'};
  }
  const study=records.filter(record=>String(record.type??'Lesson')==='Lesson');
  const tests=records.filter(record=>String(record.type??'')==='Test');
  if(!study.length||!tests.length||!hasRequiredFinalExam(guide,records)){
    return {eligible:false,created:false,reason:'requirements_incomplete'};
  }
  if(tests.some(test=>!Array.isArray(test.questions)||!test.questions.length)){
    return {eligible:false,created:false,reason:'assessment_configuration_invalid'};
  }
  const threshold=configuredPassThreshold(config.minimumScore)
    ??configuredPassThreshold(settingsSnapshot.data()?.quizPassThreshold);
  if(threshold===null)return {eligible:false,created:false,reason:'pass_mark_not_configured'};
  const language=text(guide.language);
  if(!language)return {eligible:false,created:false,reason:'guide_language_missing'};

  const progress=candidate.progress&&typeof candidate.progress==='object'
    ?candidate.progress as Record<string,unknown>:{};
  const completed=new Set(Array.isArray(progress.completedLessons)?progress.completedLessons.map(String):[]);
  if(study.some(lesson=>!completed.has(`${language}:${guideId}:${String(lesson.id)}`))){
    return {eligible:false,created:false,reason:'lessons_incomplete'};
  }
  const scores=progress.guideScores&&typeof progress.guideScores==='object'
    ?progress.guideScores as Record<string,unknown>:{};
  const evidence=await verifiedAssessmentEvidence(
    db,candidateId,tests,scores,organizationId,language,guideId,threshold,
  );
  if(!evidence)return {eligible:false,created:false,reason:'assessments_incomplete_or_failed'};
  const average=evidence.averageScore;
  if(releaseMode==='automatic'){
    const requirementIds=Array.isArray(guide.certificationRequirementIds)
      ?guide.certificationRequirementIds.map(String).filter(value=>/^[A-Za-z0-9_-]{1,120}$/.test(value)):[];
    const portfolio=await certificationPortfolioEvidence(db,candidateId,organizationId,requirementIds);
    if(portfolio.reasons.length)return {eligible:false,created:false,reason:'certification_requirements_incomplete'};
  }

  const ref=db.doc(`graduationRequests/${requestId(organizationId,candidateId,guideId)}`);
  const userRef=db.doc(`users/${candidateId}`);
  const firstStage=stages[0]||{id:'automatic',label:'Automatic release',approverRoles:[]};
  const result=await db.runTransaction(async transaction=>{
    const [existing,freshCandidate]=await Promise.all([transaction.get(ref),transaction.get(userRef)]);
    if(!freshCandidate.exists)throw new Error('The learner account no longer exists.');
    const fresh=freshCandidate.data()||{};
    if(text(fresh.organizationId)!==organizationId)throw new Error('The learner organization changed before certificate review was created.');
    const current=existing.data()||{};
    const currentStatus=text(current.status);
    if(existing.exists&&currentStatus!=='rejected'){
      return {created:false,status:currentStatus||pendingStatus(firstStage),data:{id:ref.id,...current}};
    }
    const freshProgress=fresh.progress&&typeof fresh.progress==='object'
      ?fresh.progress as Record<string,unknown>:{};
    const freshCompleted=new Set(Array.isArray(freshProgress.completedLessons)?freshProgress.completedLessons.map(String):[]);
    if(study.some(lesson=>!freshCompleted.has(`${language}:${guideId}:${String(lesson.id)}`))){
      throw new Error('The learner no longer has all required completed lessons.');
    }
    const freshScores=freshProgress.guideScores&&typeof freshProgress.guideScores==='object'
      ?freshProgress.guideScores as Record<string,unknown>:{};
    if(!(await revalidateAssessmentEvidence(
      transaction,userRef,evidence,freshScores,organizationId,language,guideId,
    )))throw new Error('The learner no longer has all required passing assessments.');
    const verifiedAverage=evidence.averageScore;
    const now=FieldValue.serverTimestamp();
    const information=fresh.information&&typeof fresh.information==='object'
      ?fresh.information as Record<string,unknown>:{};
    const data={
      candidateId,
      candidateName:text(fresh.displayName),
      candidateEmail:text(fresh.email),
      organizationId,
      guideId,
      guideTitle:text(guide.title),
      churchId:text(fresh.churchId),
      districtId:text(fresh.districtId),
      conferenceId:text(fresh.conferenceId),
      unionId:text(fresh.unionId),
      averageScore:verifiedAverage,
      status:releaseMode==='automatic'?'approved':pendingStatus(firstStage),
      workflowStageId:firstStage.id,
      workflowStageIndex:releaseMode==='automatic'?-1:0,
      revision:existing.exists?Math.max(1,Number(current.revision||0)+1):1,
      submittedAt:now,
      approvedAt:releaseMode==='automatic'?now:null,
      approverNotes:releaseMode==='automatic'?'Automatically verified from server-side completion evidence.':'',
      decisions:releaseMode==='automatic'?[{
        stageId:'automatic',stageLabel:'Automatic release',decision:'approve',
        notes:'Server-side completion and assessment evidence verified.',
        approverUid:'system',approverRole:'system',decidedAt:new Date().toISOString(),
      }]:[],
      automatic:true,
      source:'completion',
      updatedAt:now,
    };
    transaction.set(ref,data,{merge:false});
    transaction.set(userRef,{
      information:{
        ...information,
        graduating:releaseMode!=='automatic',
        graduated:releaseMode==='automatic'?true:information.graduated===true,
        decisionDate:releaseMode==='automatic'?new Date().toISOString():(information.decisionDate??null),
        graduationDate:releaseMode==='automatic'?new Date().toISOString():(information.graduationDate??null),
        completionDate:text(information.completionDate)||new Date().toISOString(),
      },
      updatedAt:now,
    },{merge:true});
    return {created:true,status:String(data.status),data:{id:ref.id,...data}};
  });

  if(result.created&&releaseMode==='review'){
    await notifyApprovers(db,result.data as Record<string,unknown>,firstStage,createdBy);
    await createNotification(db,{
      organizationId,
      recipientId:candidateId,
      type:'certificate',
      title:'Certificate earned — review pending',
      body:`You completed ${text(guide.title)||'your VOP course'}. Your certificate has been earned and is being withheld until the required organization review is approved.`,
      actionUrl:'/certificates',
      metadata:{source:'automatic-certificate-review',requestId:ref.id,status:result.status,guideId},
      createdBy,
    });
  }
  return {eligible:true,created:result.created,requestId:ref.id,status:result.status,averageScore:average};
}
