import {createHash} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import {configuredPassThreshold} from '../shared/studyValidation.js';
import {hasRequiredFinalExam} from '../shared/curriculumStructure.js';
import {
  revalidateAssessmentEvidence,verifiedAssessmentEvidence,
  type AssessmentEvidence,
} from './assessmentEvidence.js';
import {createNotification} from './notifications.js';
import {organizationSubscriptionFeatureBlockReason} from './permissions.js';

type ApprovalStage={id:string;label:string;approverRoles:string[]};
export type ProgramGuideEvidence={
  guideId:string;
  guideTitle:string;
  language:string;
  studyLessonIds:string[];
  assessmentEvidence:AssessmentEvidence;
};
export type ProgramCompletionEvidence={
  programId:string;
  programTitle:string;
  organizationId:string;
  averageScore:number;
  guides:ProgramGuideEvidence[];
};
type ProgramReviewResult={
  eligible:boolean;created:boolean;requestId?:string;programId?:string;status?:string;averageScore?:number;reason?:string;
};

function text(value:unknown){return typeof value==='string'?value.trim():'';}
function requestId(organizationId:string,candidateId:string,programId:string){
  return 'grad-program-'+createHash('sha256')
    .update([organizationId,candidateId,programId].join(':')).digest('hex').slice(0,44);
}
async function certificationConfigFor(db:FirebaseFirestore.Firestore,organizationId:string){
  const [platform,scoped]=await Promise.all([
    db.doc('system/certification').get(),
    db.doc(`organizations/${organizationId}/settings/certification`).get(),
  ]);
  return {...(platform.data()||{}),...(scoped.data()||{})} as Record<string,unknown>;
}
function stagesFromConfig(data:Record<string,unknown>):ApprovalStage[]{
  const rows=Array.isArray(data.approvalStages)?data.approvalStages:[];
  if(!rows.length)return [{id:'organization',label:'Organization review',approverRoles:['owner','admin','mentor']}];
  return rows.map(row=>row&&typeof row==='object'?row as Record<string,unknown>:null)
    .map(row=>row?{
      id:text(row.id),label:text(row.label)||text(row.id),
      approverRoles:Array.isArray(row.approverRoles)
        ?row.approverRoles.map(String).map(value=>value.trim()).filter(Boolean):[],
      enabled:row.enabled!==false,
    }:null)
    .filter((row):row is ApprovalStage&{enabled:boolean}=>Boolean(row?.enabled&&row.id&&row.approverRoles.length))
    .map(({id,label,approverRoles})=>({id,label,approverRoles})).slice(0,20);
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
  const members=await db.collection(`organizations/${organizationId}/members`).where('active','==',true).get();
  for(const member of members.docs){
    const role=text(member.data()?.role);
    if(role!=='mentor'&&stage.approverRoles.includes(role))recipients.add(member.id);
  }
  if(stage.approverRoles.includes('mentor')){
    const assignment=await db.doc(`mentorAssignments/${text(request.candidateId)}`).get();
    if(assignment.exists&&assignment.data()?.status==='active'){
      const mentorId=text(assignment.data()?.mentorId);
      if(mentorId)recipients.add(mentorId);
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
    const nodeId=scopeField?text(request[scopeField]):'';
    if(!scopeField||!nodeId)continue;
    const admins=await db.collection('users').where('role','==',role).limit(100).get();
    admins.docs.filter(doc=>text(doc.data()?.adminNodeId)===nodeId).forEach(doc=>recipients.add(doc.id));
  }
  await Promise.all([...recipients].filter(Boolean).map(recipientId=>createNotification(db,{
    organizationId,recipientId,type:'certificate',title:'Program certificate review required',
    body:`${text(request.candidateName)||'A learner'} completed ${text(request.programTitle)||'a VOP program'} and is ready for ${stage.label||stage.id} review.`,
    actionUrl:'/admin/certification',
    metadata:{source:'automatic-program-certificate-review',requestId:text(request.id),stageId:stage.id},
    createdBy,
  })));
}

export async function programCompletionEvidence(
  db:FirebaseFirestore.Firestore,
  candidateId:string,
  programId:string,
):Promise<{evidence:ProgramCompletionEvidence|null;reason:string}>{
  if(!candidateId||!programId)return {evidence:null,reason:'missing_candidate_or_program'};
  const [candidateSnapshot,programSnapshot]=await Promise.all([
    db.doc(`users/${candidateId}`).get(),
    db.doc(`programs/${programId}`).get(),
  ]);
  if(!candidateSnapshot.exists||!programSnapshot.exists)return {evidence:null,reason:'missing_record'};
  const candidate=candidateSnapshot.data()||{};
  const program=programSnapshot.data()||{};
  const organizationId=text(candidate.organizationId);
  if(!organizationId||text(candidate.role)!=='student')return {evidence:null,reason:'not_organization_learner'};
  const programOrganizationId=text(program.organizationId);
  const systemWide=program.sharingScope==='shared'||String(program.scope||'')==='platform'||!programOrganizationId;
  if(programOrganizationId!==organizationId&&!systemWide)return {evidence:null,reason:'program_outside_organization'};
  if(program.published!==true||program.archived===true||program.certificateEligible!==true){
    return {evidence:null,reason:'program_not_certificate_eligible'};
  }
  const guideIds=Array.isArray(program.guideIds)
    ?program.guideIds.map(String).filter(id=>/^[A-Za-z0-9_-]{1,120}$/.test(id)).slice(0,100):[];
  if(!guideIds.length)return {evidence:null,reason:'program_has_no_guides'};

  const [config,settingsSnapshot,...guideSnapshots]=await Promise.all([
    certificationConfigFor(db,organizationId),
    db.doc(`organizations/${organizationId}/settings/settings`).get(),
    ...guideIds.map(guideId=>db.doc(`guides/${guideId}`).get()),
  ]);
  if(config.enabled!==true)return {evidence:null,reason:'certification_disabled'};
  const threshold=configuredPassThreshold(config.minimumScore)
    ??configuredPassThreshold(settingsSnapshot.data()?.quizPassThreshold);
  if(threshold===null)return {evidence:null,reason:'pass_mark_not_configured'};

  const progress=candidate.progress&&typeof candidate.progress==='object'
    ?candidate.progress as Record<string,unknown>:{};
  const completed=new Set(Array.isArray(progress.completedLessons)?progress.completedLessons.map(String):[]);
  const scores=progress.guideScores&&typeof progress.guideScores==='object'
    ?progress.guideScores as Record<string,unknown>:{};
  const guideEvidence:ProgramGuideEvidence[]=[];

  for(let index=0;index<guideSnapshots.length;index+=1){
    const guideSnapshot=guideSnapshots[index];
    const guideId=guideIds[index];
    if(!guideSnapshot.exists)return {evidence:null,reason:'program_guide_missing'};
    const guide=guideSnapshot.data()||{};
    const guideOrganizationId=text(guide.organizationId||guide.ownerOrganizationId);
    const guideSystemWide=guide.sharingScope==='shared'||String(guide.scope||'')==='platform'||!guideOrganizationId;
    if(guideOrganizationId!==organizationId&&!guideSystemWide)return {evidence:null,reason:'program_guide_outside_organization'};
    if(guide.published!==true||guide.archived===true)return {evidence:null,reason:'program_guide_unpublished'};
    const language=text(guide.language);
    if(!language)return {evidence:null,reason:'guide_language_missing'};
    const lessonSnapshot=await guideSnapshot.ref.collection('lessons').get();
    const records=lessonSnapshot.docs.map(document=>({...document.data(),id:document.id} as Record<string,unknown>&{id:string}));
    if(!records.length||records.some(record=>record.published!==true||record.archived===true)){
      return {evidence:null,reason:'curriculum_not_fully_published'};
    }
    const study=records.filter(record=>String(record.type??'Lesson')==='Lesson');
    const tests=records.filter(record=>String(record.type??'')==='Test');
    if(!study.length||!tests.length||!hasRequiredFinalExam(guide,records)){
      return {evidence:null,reason:'requirements_incomplete'};
    }
    if(study.some(lesson=>!completed.has(`${language}:${guideId}:${String(lesson.id)}`))){
      return {evidence:null,reason:'lessons_incomplete'};
    }
    if(tests.some(test=>!Array.isArray(test.questions)||!test.questions.length)){
      return {evidence:null,reason:'assessment_configuration_invalid'};
    }
    const assessmentEvidence=await verifiedAssessmentEvidence(
      db,candidateId,tests,scores,organizationId,language,guideId,threshold,
    );
    if(!assessmentEvidence)return {evidence:null,reason:'assessments_incomplete_or_failed'};
    guideEvidence.push({
      guideId,guideTitle:text(guide.title),language,
      studyLessonIds:study.map(lesson=>String(lesson.id)),assessmentEvidence,
    });
  }
  const assessmentRows=guideEvidence.flatMap(item=>item.assessmentEvidence.rows);
  const averageScore=assessmentRows.length
    ?Math.round((assessmentRows.reduce((sum,row)=>sum+row.score,0)/assessmentRows.length)*100)/100:0;
  return {evidence:{programId,programTitle:text(program.title),organizationId,averageScore,guides:guideEvidence},reason:''};
}

export async function revalidateProgramCompletion(
  transaction:FirebaseFirestore.Transaction,
  userRef:FirebaseFirestore.DocumentReference,
  evidence:ProgramCompletionEvidence,
){
  const candidate=await transaction.get(userRef);
  if(!candidate.exists||text(candidate.data()?.organizationId)!==evidence.organizationId)return false;
  const progress=candidate.data()?.progress&&typeof candidate.data()?.progress==='object'
    ?candidate.data()?.progress as Record<string,unknown>:{};
  const completed=new Set(Array.isArray(progress.completedLessons)?progress.completedLessons.map(String):[]);
  const scores=progress.guideScores&&typeof progress.guideScores==='object'
    ?progress.guideScores as Record<string,unknown>:{};
  for(const guide of evidence.guides){
    if(guide.studyLessonIds.some(lessonId=>!completed.has(`${guide.language}:${guide.guideId}:${lessonId}`)))return false;
    if(!(await revalidateAssessmentEvidence(
      transaction,userRef,guide.assessmentEvidence,scores,evidence.organizationId,guide.language,guide.guideId,
    )))return false;
  }
  return true;
}

export async function ensureAutomaticProgramGraduationReviews(
  db:FirebaseFirestore.Firestore,
  candidateId:string,
  completedGuideId:string,
  createdBy='system:completion',
):Promise<ProgramReviewResult[]>{
  if(!candidateId||!completedGuideId)return [];
  const candidate=await db.doc(`users/${candidateId}`).get();
  const organizationId=text(candidate.data()?.organizationId);
  if(!candidate.exists||!organizationId||text(candidate.data()?.role)!=='student')return [];
  if(await organizationSubscriptionFeatureBlockReason(db,'certification',organizationId))return [];
  const programs=await db.collection('programs').where('guideIds','array-contains',completedGuideId).limit(50).get();
  const results:ProgramReviewResult[]=[];
  for(const programDocument of programs.docs){
    const program=programDocument.data()||{};
    if(program.published!==true||program.archived===true||program.certificateEligible!==true)continue;
    const checked=await programCompletionEvidence(db,candidateId,programDocument.id);
    if(!checked.evidence){results.push({eligible:false,created:false,reason:checked.reason});continue;}
    const evidence=checked.evidence;
    const config=await certificationConfigFor(db,organizationId);
    if(config.enabled!==true){results.push({eligible:false,created:false,reason:'certification_disabled'});continue;}
    const releaseMode=text(config.releaseMode)==='review'?'review':'automatic';
    const stages=releaseMode==='review'?stagesFromConfig(config):[];
    if(releaseMode==='review'&&!stages.length){results.push({eligible:false,created:false,reason:'approval_workflow_not_configured'});continue;}
    const firstStage=stages[0]||{id:'automatic',label:'Automatic release',approverRoles:[]};
    const ref=db.doc(`graduationRequests/${requestId(organizationId,candidateId,evidence.programId)}`);
    const userRef=db.doc(`users/${candidateId}`);
    const result=await db.runTransaction(async transaction=>{
      const existing=await transaction.get(ref);
      const current=existing.data()||{};
      const currentStatus=text(current.status);
      if(existing.exists&&currentStatus!=='rejected'){
        return {created:false,status:currentStatus||pendingStatus(firstStage),data:{id:ref.id,...current}};
      }
      if(!(await revalidateProgramCompletion(transaction,userRef,evidence))){
        throw new Error('The learner no longer satisfies all program completion requirements.');
      }
      const fresh=await transaction.get(userRef);
      const freshData=fresh.data()||{};
      const now=FieldValue.serverTimestamp();
      const data={
        targetKind:'program',candidateId,candidateName:text(freshData.displayName),candidateEmail:text(freshData.email),
        organizationId,programId:evidence.programId,programTitle:evidence.programTitle,
        guideId:'',guideTitle:evidence.programTitle,
        churchId:text(freshData.churchId),districtId:text(freshData.districtId),
        conferenceId:text(freshData.conferenceId),unionId:text(freshData.unionId),
        averageScore:evidence.averageScore,status:releaseMode==='automatic'?'approved':pendingStatus(firstStage),
        workflowStageId:firstStage.id,workflowStageIndex:releaseMode==='automatic'?-1:0,
        revision:existing.exists?Math.max(1,Number(current.revision||0)+1):1,
        submittedAt:now,approvedAt:releaseMode==='automatic'?now:null,
        approverNotes:releaseMode==='automatic'?'Automatically verified from server-side program completion evidence.':'',
        decisions:releaseMode==='automatic'?[{
          stageId:'automatic',stageLabel:'Automatic release',decision:'approve',
          notes:'Server-side program completion and assessment evidence verified.',
          approverUid:'system',approverRole:'system',decidedAt:new Date().toISOString(),
        }]:[],
        automatic:true,source:'program_completion',updatedAt:now,
      };
      transaction.set(ref,data,{merge:false});
      const information=freshData.information&&typeof freshData.information==='object'
        ?freshData.information as Record<string,unknown>:{};
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
        organizationId,recipientId:candidateId,type:'certificate',
        title:'Program certificate earned — review pending',
        body:`You completed ${evidence.programTitle||'your VOP program'}. Your program certificate is being withheld until the required organization review is approved.`,
        actionUrl:'/certificates',
        metadata:{source:'automatic-program-certificate-review',requestId:ref.id,status:result.status,programId:evidence.programId},
        createdBy,
      });
    }
    results.push({eligible:true,created:result.created,requestId:ref.id,programId:evidence.programId,status:result.status,averageScore:evidence.averageScore});
  }
  return results;
}
