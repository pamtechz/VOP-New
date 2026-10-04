import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, writeTenantAudit, organizationInHierarchyScope } from '../../server/tenant.js';
import { requirePermission, requireSubscriptionFeature } from '../../server/permissions.js';
import { configuredPassThreshold } from '../../shared/studyValidation.js';
import { revalidateAssessmentEvidence, verifiedAssessmentEvidence, type AssessmentEvidence } from '../../server/assessmentEvidence.js';
import { hasRequiredFinalExam } from '../../shared/curriculumStructure.js';
import { createNotification } from '../../server/notifications.js';
import { awardApprovedCertificate, certificationPortfolioEvidence } from '../../server/certificateAward.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };
type ApprovalStage = { id: string; label?: string; approverRoles?: string[]; enabled?: boolean };

function bodyOf(req: Request) { return req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }

function stageConfig(data: Record<string, unknown>): ApprovalStage[] {
  const raw = Array.isArray(data.approvalStages) ? data.approvalStages : [];
  if(!raw.length)return [{
    id:'organization',label:'Organization review',
    approverRoles:['owner','admin','mentor'],enabled:true,
  }];
  return raw.map(item => item && typeof item === 'object' ? item as Record<string, unknown> : null)
    .map(item => item ? ({
      id: text(item.id),
      label: text(item.label),
      approverRoles: Array.isArray(item.approverRoles) ? item.approverRoles.map(String).map(value => value.trim()).filter(Boolean) : [],
      enabled: item.enabled !== false,
    }) : null)
    .filter((item): item is ApprovalStage => Boolean(item?.id && item.enabled && item.approverRoles?.length))
    .slice(0, 20);
}

function requestStatus(stage: ApprovalStage | undefined) {
  if (!stage) return 'pending';
  const id = stage.id.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
  return id ? `pending_${id}`.slice(0, 80) : 'pending';
}

function requestId(organizationId: string, candidateId: string, guideId: string) {
  return 'grad-' + createHash('sha256').update(organizationId + ':' + candidateId + ':' + guideId).digest('hex').slice(0, 48);
}

function safeRequest(id: string, data: Record<string, unknown>) {
  return {
    id, candidateId: text(data.candidateId), candidateName: text(data.candidateName), candidateEmail: text(data.candidateEmail),
    organizationId: text(data.organizationId), guideId: text(data.guideId), guideTitle: text(data.guideTitle),
    churchId: text(data.churchId), districtId: text(data.districtId), conferenceId: text(data.conferenceId), unionId: text(data.unionId),
    averageScore: Number(data.averageScore), status: text(data.status), workflowStageId: text(data.workflowStageId),
    workflowStageIndex: Number(data.workflowStageIndex ?? 0), revision: Number(data.revision ?? 0),
    submittedAt: data.submittedAt ?? null, approvedAt: data.approvedAt ?? null, approverNotes: text(data.approverNotes),
    decisions: Array.isArray(data.decisions) ? data.decisions : [],
  };
}

async function loadCertificationConfig(
  ctx:Awaited<ReturnType<typeof authenticateTenant>>,
  organizationId:string,
){
  const [platform,scoped]=await Promise.all([
    ctx.db.doc('system/certification').get(),
    organizationId?ctx.db.doc(`organizations/${organizationId}/settings/certification`).get():Promise.resolve(null),
  ]);
  return {...(platform.data()||{}),...(scoped?.data()||{})} as Record<string,unknown>;
}
async function loadWorkflow(
  ctx:Awaited<ReturnType<typeof authenticateTenant>>,
  organizationId=ctx.organizationId,
) {
  const config=await loadCertificationConfig(ctx,organizationId);
  const stages=stageConfig(config);
  if(!stages.length)throw new Error('Graduation approval stages are not configured. Configure at least one enabled approval stage before accepting graduation requests.');
  return stages;
}

async function notifyStageApprovers(
  ctx: Awaited<ReturnType<typeof authenticateTenant>>,
  request: Record<string, unknown>,
  stage: ApprovalStage | undefined,
  createdBy: string,
) {
  if (!stage) return;
  const recipients=new Set<string>();
  const organizationId=text(request.organizationId);
  if(organizationId){
    const members=await ctx.db.collection(`organizations/${organizationId}/members`).where('active','==',true).get();
    for(const member of members.docs){
      const memberRole=text(member.data()?.role);
      // Mentor approval is assignment-specific; do not notify every mentor in
      // the organization for one learner's certificate review.
      if(memberRole!=='mentor'&&stage.approverRoles?.includes(memberRole))recipients.add(member.id);
    }
    if(stage.approverRoles?.includes('mentor')){
      const candidateId=text(request.candidateId);
      if(candidateId){
        const assignment=await ctx.db.doc(`mentorAssignments/${candidateId}`).get();
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
  for(const role of stage.approverRoles||[]){
    if(role==='super_admin'){
      const admins=await ctx.db.collection('users').where('role','==','super_admin').limit(50).get();
      admins.docs.forEach(doc=>recipients.add(doc.id));
      continue;
    }
    const scopeField=hierarchyRoleField[role];
    if(!scopeField)continue;
    const nodeId=text(request[scopeField]);
    if(!nodeId)continue;
    const admins=await ctx.db.collection('users').where('role','==',role).limit(100).get();
    admins.docs.filter(doc=>text(doc.data()?.adminNodeId)===nodeId).forEach(doc=>recipients.add(doc.id));
  }
  await Promise.all([...recipients].filter(uid=>uid&&uid!==createdBy).map(recipientId=>createNotification(ctx.db,{
    organizationId,recipientId,type:'certificate',
    title:'Graduation approval required',
    body:`${text(request.candidateName)||'A learner'} submitted ${text(request.guideTitle)||'a VOP course'} for ${stage.label||stage.id} review.`,
    actionUrl:'/admin/certification',
    metadata:{source:'graduation-approval',requestId:text(request.id),stageId:stage.id},
    createdBy,
  })));
}

async function submit(req: Request, res: Response) {
  const ctx = await authenticateTenant(req);
  // Learners submit their own requests through this authenticated self-service
  // endpoint. They must not need the certificate issuance/create permission.
  if (ctx.isSuperAdmin) return res.status(403).json({ error: 'Super administrators do not submit candidate graduation requests.' });
  const body = bodyOf(req);
  const guideId = text(body.guideId);
  if (!guideId || guideId.includes('/') || guideId.length > 160) return res.status(400).json({ error: 'A valid guide ID is required.' });
  const candidate = ctx.profile;
  if (text(candidate.role) !== 'student') return res.status(403).json({ error: 'Only learner accounts can submit graduation requests.' });
  await requireSubscriptionFeature(ctx,'certification',ctx.organizationId);

  const [guideSnapshot, organizationSnapshot] = await Promise.all([
    ctx.db.doc(`guides/${guideId}`).get(), ctx.db.doc(`organizations/${ctx.organizationId}`).get(),
  ]);
  if (!guideSnapshot.exists) return res.status(404).json({ error: 'The selected guide was not found.' });
  const guide = guideSnapshot.data() || {};
  const ownerOrganizationId = text(guide.organizationId || guide.ownerOrganizationId);
  const shared = guide.sharingScope === 'shared' && guide.published === true;
  if (ownerOrganizationId !== ctx.organizationId && !shared) return res.status(403).json({ error: 'The selected guide is not available to your organization.' });
  if (guide.published !== true || guide.archived === true || guide.certificateEligible !== true) return res.status(409).json({ error: 'The selected guide is not currently eligible for graduation.' });
  if (organizationSnapshot.data()?.status !== 'active') return res.status(409).json({ error: 'The candidate organization is not active.' });

  const stages = await loadWorkflow(ctx,ctx.organizationId);
  const lessonsSnapshot = await guideSnapshot.ref.collection('lessons').get();
  const lessons = lessonsSnapshot.docs.map(item => ({ ...item.data(), id: item.id }));
  const publishedLessons = lessons.filter(item => item.published === true);
  const studyLessons = publishedLessons.filter(item => String(item.type ?? 'Lesson') === 'Lesson');
  const testLessons = publishedLessons.filter(item => String(item.type ?? '') === 'Test');
  if (!hasRequiredFinalExam(guide, publishedLessons)) return res.status(409).json({error:'The required published final guide examination is missing.'});
  if (publishedLessons.length !== lessons.length || !studyLessons.length || !testLessons.length) {
    return res.status(409).json({ error: 'The candidate cannot submit graduation until the certificate-eligible guide has all required published lessons and assessments.' });
  }
  const [certificationConfig,organizationSettingsSnapshot]=await Promise.all([
    loadCertificationConfig(ctx,ctx.organizationId),
    ctx.db.doc(`organizations/${ctx.organizationId}/settings/settings`).get(),
  ]);
  if(certificationConfig.enabled!==true)return res.status(409).json({error:'Official certification is currently disabled for this organization.'});
  const threshold=configuredPassThreshold(certificationConfig.minimumScore)
    ??configuredPassThreshold(organizationSettingsSnapshot.data()?.quizPassThreshold);
  if (threshold === null) {
    return res.status(409).json({ error: 'The certification pass mark is not configured for this organization.' });
  }
  const progress = ctx.profile.progress && typeof ctx.profile.progress === 'object'
    ? ctx.profile.progress as Record<string, unknown>
    : {};
  const completedLessons = new Set(Array.isArray(progress.completedLessons) ? progress.completedLessons.map(String) : []);
  const scores = progress.guideScores && typeof progress.guideScores === 'object'
    ? progress.guideScores as Record<string, unknown>
    : {};
  const language = text(guide.language);
  if (!language) return res.status(409).json({ error: 'The certificate-eligible guide has no configured language.' });
  for (const lesson of studyLessons) {
    const key = `${language}:${guideId}:${String(lesson.id)}`;
    if (!completedLessons.has(key)) return res.status(409).json({ error: 'The candidate has not completed all required lessons.' });
  }
  const assessmentEvidence=await verifiedAssessmentEvidence(
    ctx.db,ctx.auth.uid,testLessons,scores,ctx.organizationId,language,guideId,threshold,
  );
  if (!assessmentEvidence) {
    return res.status(409).json({ error: 'The candidate has not passed all required assessments.' });
  }

  const ref = ctx.db.doc(`graduationRequests/${requestId(ctx.organizationId, ctx.auth.uid, guideId)}`);
  const userRef = ctx.db.doc(`users/${ctx.auth.uid}`);
  // Client-provided averageScore is deliberately ignored; only persisted
  // tenant-scoped grades may enter an official graduation request.
  const now = FieldValue.serverTimestamp();

  const result = await ctx.db.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const current = existing.data() || {};
      if (['approved', 'pending', 'pending_church', 'pending_district', 'pending_conference', 'pending_union'].includes(text(current.status))) {
        return { created: false, data: safeRequest(existing.id, current) };
      }
      if (current.status !== 'rejected') return { created: false, data: safeRequest(existing.id, current) };
    }
    // Read the candidate in the same transaction as the request write. A
    // retake or organization change between initial validation and commit
    // must never leave a fabricated or stale graduation score.
    const freshCandidate = await transaction.get(userRef);
    if (!freshCandidate.exists || String(freshCandidate.data()?.organizationId || '') !== ctx.organizationId) {
      throw new Error('The candidate account changed before graduation submission.');
    }
    const freshData = freshCandidate.data() || {};
    const freshProgress = freshData.progress && typeof freshData.progress === 'object'
      ? freshData.progress as Record<string, unknown> : {};
    const freshCompleted = new Set(Array.isArray(freshProgress.completedLessons) ? freshProgress.completedLessons.map(String) : []);
    if (studyLessons.some(lesson => !freshCompleted.has(`${language}:${guideId}:${String(lesson.id)}`))) {
      throw new Error('The candidate no longer has all required completed lessons.');
    }
    const freshScores = freshProgress.guideScores && typeof freshProgress.guideScores === 'object'
      ? freshProgress.guideScores as Record<string, unknown> : {};
    if(!(await revalidateAssessmentEvidence(
      transaction,userRef,assessmentEvidence,freshScores,ctx.organizationId,language,guideId,
    ))){
      throw new Error('The candidate no longer has all required passing assessments.');
    }
    const authoritativeAverage=assessmentEvidence.averageScore;
    const firstStage = stages[0];
    const data = {
      candidateId: ctx.auth.uid, candidateName: text(candidate.displayName), candidateEmail: text(candidate.email || ctx.auth.email),
      organizationId: ctx.organizationId, guideId, guideTitle: text(guide.title), churchId: text(candidate.churchId),
      districtId: text(candidate.districtId), conferenceId: text(candidate.conferenceId), unionId: text(candidate.unionId),
      averageScore: authoritativeAverage, status: requestStatus(firstStage),
      workflowStageId: firstStage.id, workflowStageIndex: 0, revision: 1, submittedAt: now, approvedAt: null,
      approverNotes: '', decisions: [], updatedAt: now,
    };
    transaction.set(ref, data);
    transaction.set(userRef, { information: { ...(freshData.information && typeof freshData.information === 'object' ? freshData.information : {}), graduating: true }, updatedAt: now }, { merge: true });
    return { created: true, data: safeRequest(ref.id, data) };
  });
  if (result.created) {
    await writeTenantAudit(ctx, 'graduation.request.submitted', ref.path, undefined, result.data as Record<string, unknown>);
    await notifyStageApprovers(ctx,{...(result.data as Record<string,unknown>),id:ref.id},stages[0],ctx.auth.uid);
  }
  return res.status(result.created ? 201 : 200).json({ ok: true, created: result.created, request: result.data });
}

async function decide(req: Request, res: Response) {
  const body = bodyOf(req);
  const requestIdValue = text(body.requestId), decision = text(body.decision).toLowerCase(), notes = text(body.notes);
  const expectedRevision = Number(body.revision);
  if (!requestIdValue || requestIdValue.includes('/') || requestIdValue.length > 160) return res.status(400).json({ error: 'A valid graduation request ID is required.' });
  if (decision !== 'approve' && decision !== 'reject') return res.status(400).json({ error: 'Decision must be approve or reject.' });
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) return res.status(400).json({ error: 'The current request revision is required.' });

  let ctx = await authenticateTenant(req, undefined, true);
  await requirePermission(ctx, 'certificates', 'manage');
  const ref = ctx.db.doc(`graduationRequests/${requestIdValue}`);
  const snapshot = await ref.get();
  if (!snapshot.exists) return res.status(404).json({ error: 'Graduation request was not found.' });
  const current = snapshot.data() || {};
  const requestOrganizationId = text(current.organizationId);
  if (!requestOrganizationId) return res.status(409).json({ error: 'The graduation request has no organization scope.' });
  if (ctx.isSuperAdmin && !ctx.organizationId) ctx = await authenticateTenant(req, requestOrganizationId);
  if (!ctx.isSuperAdmin) {
    if (ctx.tenantType === 'organization') {
      if (text(current.organizationId) !== ctx.organizationId) return res.status(403).json({ error: 'This graduation request belongs to another organization.' });
    } else if (ctx.tenantType === 'hierarchy') {
      if (!(await organizationInHierarchyScope(ctx, requestOrganizationId))) return res.status(403).json({ error: 'This graduation request belongs outside your hierarchy scope.' });
    } else {
      return res.status(403).json({ error: 'An authorized tenant is required to approve graduation requests.' });
    }
  }
  await requireSubscriptionFeature(ctx,'certification',requestOrganizationId);
  const stages = await loadWorkflow(ctx,requestOrganizationId);
  if (['approved', 'rejected'].includes(text(current.status))) return res.status(409).json({ error: 'This graduation request has already reached a final decision.' });

  const stageIndex = Number(current.workflowStageIndex), stageId = text(current.workflowStageId), stage = stages[stageIndex];
  if (!stage || stage.id !== stageId) return res.status(409).json({ error: 'The configured approval workflow no longer matches this request. Reconfigure the workflow or migrate the request before deciding.' });
  const profileRole = text(ctx.profile.role), membershipRole = text(ctx.membership.role);
  let allowed = stage.approverRoles?.some(role => role === profileRole || role === membershipRole);
  if(allowed&&!ctx.isSuperAdmin&&stage.approverRoles?.includes('mentor')
      &&(profileRole==='mentor'||membershipRole==='mentor')){
    const nonMentorRoleMatch=stage.approverRoles.some(role=>role!=='mentor'&&(role===profileRole||role===membershipRole));
    if(!nonMentorRoleMatch){
      const assignment=await ctx.db.doc(`mentorAssignments/${text(current.candidateId)}`).get();
      allowed=Boolean(assignment.exists&&assignment.data()?.status==='active'
        &&text(assignment.data()?.mentorId)===ctx.auth.uid);
    }
  }
  if (!allowed && !ctx.isSuperAdmin) return res.status(403).json({ error: 'You are not authorized or assigned to this learner for the current approval stage.' });

  // An approval may occur days after submission, after another retake or a
  // guide edit. Historical pending requests may also contain the former
  // client-supplied average. Fetch authoritative requirements before deciding;
  // the candidate's current progress is checked inside the transaction.
  let approvalEvidence: {
    guideId:string;language:string;threshold:number;
    studyLessons:{id:string}[];testLessons:{id:string}[];
    assessmentEvidence:AssessmentEvidence;
  } | null = null;
  if (decision === 'approve') {
    const guideId = text(current.guideId);
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(guideId)) return res.status(409).json({ error: 'The graduation request has an invalid guide reference.' });
    const [guideSnapshot, certificationConfig, settingsSnapshot] = await Promise.all([
      ctx.db.doc(`guides/${guideId}`).get(),
      loadCertificationConfig(ctx,requestOrganizationId),
      ctx.db.doc(`organizations/${requestOrganizationId}/settings/settings`).get(),
    ]);
    const guide = guideSnapshot.data() || {};
    const guideOwner = text(guide.organizationId || guide.ownerOrganizationId);
    if (!guideSnapshot.exists || guide.published !== true || guide.archived === true ||
        guide.certificateEligible !== true ||
        (guideOwner !== requestOrganizationId && guide.sharingScope !== 'shared')) {
      return res.status(409).json({ error: 'The graduation guide is no longer eligible for approval.' });
    }
    const language = text(guide.language);
    const threshold=configuredPassThreshold(certificationConfig.minimumScore)
      ??configuredPassThreshold(settingsSnapshot.data()?.quizPassThreshold);
    if (!language || threshold === null) return res.status(409).json({ error: 'The graduation assessment language or pass mark is not configured.' });
    const records = (await guideSnapshot.ref.collection('lessons').get()).docs.map(item => ({ ...item.data(), id: item.id }));
    if (!records.length || records.some(item => item.published !== true || item.archived === true)) {
      return res.status(409).json({ error: 'All graduation requirements must be published and active.' });
    }
    const studyLessons = records.filter(item => String(item.type ?? 'Lesson') === 'Lesson');
    const testLessons = records.filter(item => item.type === 'Test');
    if (!hasRequiredFinalExam(guide, records)) return res.status(409).json({error:'The required published final guide examination is missing.'});
    if (!studyLessons.length || !testLessons.length ||
        testLessons.some(item => !Array.isArray(item.questions) || !item.questions.length)) {
      return res.status(409).json({ error: 'The graduation guide has missing study or assessment requirements.' });
    }
    // The final human approval is the only certificate release gate. Before
    // saving that final decision, verify any additional configured portfolio
    // evidence/signatures so an approved request can always be awarded.
    if(stageIndex===stages.length-1){
      if(certificationConfig.enabled!==true){
        return res.status(409).json({error:'Official certification is currently disabled.'});
      }
      const requirementIds=Array.isArray(guide.certificationRequirementIds)
        ?guide.certificationRequirementIds.map(String).filter(value=>/^[A-Za-z0-9_-]{1,120}$/.test(value)):[];
      const portfolio=await certificationPortfolioEvidence(ctx.db,text(current.candidateId),requestOrganizationId,requirementIds);
      if(portfolio.reasons.length){
        return res.status(409).json({
          error:'Certificate review cannot be approved yet: '+portfolio.reasons.join(' '),
          reasons:portfolio.reasons,
        });
      }
    }
    const candidateId=text(current.candidateId);
    const candidateSnapshot=await ctx.db.doc(`users/${candidateId}`).get();
    const candidateData=candidateSnapshot.data()||{};
    const candidateProgress=candidateData.progress&&typeof candidateData.progress==='object'
      ?candidateData.progress as Record<string,unknown>:{};
    const candidateScores=candidateProgress.guideScores&&typeof candidateProgress.guideScores==='object'
      ?candidateProgress.guideScores as Record<string,unknown>:{};
    const currentAssessmentEvidence=await verifiedAssessmentEvidence(
      ctx.db,candidateId,testLessons,candidateScores,requestOrganizationId,language,guideId,threshold,
    );
    if(!currentAssessmentEvidence){
      return res.status(409).json({error:'The candidate has not passed all required assessments.'});
    }
    approvalEvidence={guideId,language,threshold,studyLessons,testLessons,assessmentEvidence:currentAssessmentEvidence};
  }

  const result = await ctx.db.runTransaction(async transaction => {
    const fresh = await transaction.get(ref);
    if (!fresh.exists) throw new Error('Graduation request was not found.');
    const data = fresh.data() || {};
    const candidateRef = ctx.db.doc(`users/${text(data.candidateId)}`);
    const candidateSnapshot = await transaction.get(candidateRef);
    if (!candidateSnapshot.exists) throw new Error('The graduation candidate account was not found.');
    const candidateData = candidateSnapshot.data() || {};
    const revision = Number(data.revision ?? 0);
    if (revision !== expectedRevision) throw new Error('This graduation request changed before your decision was saved. Refresh and review the current request.');
    if (['approved', 'rejected'].includes(text(data.status))) throw new Error('This graduation request has already reached a final decision.');
    const timestamp = FieldValue.serverTimestamp(), decisions = Array.isArray(data.decisions) ? data.decisions.slice() : [];
    if (decisions.some(item => item && typeof item === 'object' && text((item as Record<string, unknown>).stageId) === stage.id)) throw new Error('This approval stage has already been decided.');

    decisions.push({ stageId: stage.id, stageLabel: stage.label || stage.id, decision, notes, approverUid: ctx.auth.uid, approverRole: profileRole || membershipRole, decidedAt: new Date().toISOString() });
    const nextIndex = stageIndex + 1, nextStage = stages[nextIndex];
    const nextData: Record<string, unknown> = { decisions, revision: revision + 1, approverNotes: notes, updatedAt: timestamp };
    if (decision === 'approve' && approvalEvidence) {
      if (text(data.organizationId) !== requestOrganizationId || text(data.guideId) !== approvalEvidence.guideId ||
          text(candidateData.organizationId) !== requestOrganizationId) {
        throw new Error('The candidate organization or graduation request changed before approval.');
      }
      const progress = candidateData.progress && typeof candidateData.progress === 'object'
        ? candidateData.progress as Record<string, unknown> : {};
      const completed = new Set(Array.isArray(progress.completedLessons) ? progress.completedLessons.map(String) : []);
      if (approvalEvidence.studyLessons.some(lesson =>
        !completed.has(`${approvalEvidence.language}:${approvalEvidence.guideId}:${lesson.id}`))) {
        throw new Error('The candidate no longer has all required completed lessons.');
      }
      const scores = progress.guideScores && typeof progress.guideScores === 'object'
        ? progress.guideScores as Record<string, unknown> : {};
      if(!(await revalidateAssessmentEvidence(
        transaction,candidateRef,approvalEvidence.assessmentEvidence,scores,
        requestOrganizationId,approvalEvidence.language,approvalEvidence.guideId,
      )))throw new Error('The candidate no longer has all required passing assessments.');
      // Repair historical pending requests with authoritative server evidence
      // as each approval stage is saved.
      nextData.averageScore=approvalEvidence.assessmentEvidence.averageScore;
    }
    if (decision === 'reject') {
      nextData.status = 'rejected'; nextData.workflowStageId = stage.id; nextData.workflowStageIndex = stageIndex;
    } else if (nextStage) {
      nextData.status = requestStatus(nextStage); nextData.workflowStageId = nextStage.id; nextData.workflowStageIndex = nextIndex;
    } else {
      nextData.status = 'approved'; nextData.approvedAt = timestamp; nextData.workflowStageId = stage.id; nextData.workflowStageIndex = stageIndex;
      nextData.approverNotes = notes;
      transaction.set(candidateRef, {
        information: {
          ...(candidateData.information && typeof candidateData.information === 'object' ? candidateData.information : {}),
          graduating: false,
          graduated: true,
          decisionDate: new Date().toISOString(),
          graduationDate: new Date().toISOString(),
        },
        updatedAt: timestamp,
      }, { merge: true });
    }
    transaction.update(ref, nextData);
    return { ...data, ...nextData };
  });
  await writeTenantAudit(ctx, decision === 'approve' ? 'graduation.stage.approved' : 'graduation.stage.rejected', ref.path, current, result);
  const safe=safeRequest(ref.id,result);
  const candidateId=text(result.candidateId);
  let certificateAward:Awaited<ReturnType<typeof awardApprovedCertificate>>|null=null;
  let certificateAwardError='';
  if(decision==='approve'&&text(result.status)==='approved'&&candidateId){
    try{
      certificateAward=await awardApprovedCertificate(ctx.db,candidateId,ctx.auth.uid,text(result.guideId));
    }catch(error){
      certificateAwardError=error instanceof Error?error.message:'The approved certificate could not be published.';
      await ref.set({
        certificateStatus:'withheld_error',
        certificateError:certificateAwardError,
        updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      console.error('Automatic certificate award failed after final graduation approval',error);
    }
  }
  if(candidateId&&candidateId!==ctx.auth.uid){
    const finalStatus=text(result.status);
    const statusMessage=decision==='reject'
      ?'Your certificate review requires attention and was not approved at the current review stage.'
      :finalStatus==='approved'
        ?certificateAward
          ?'Your certificate review is approved. Your official certificate is now available.'
          :'Your certificate review is approved. Certificate publication is being finalized.'
        :`Your certificate review passed ${stage.label||stage.id} and moved to the next approval stage.`;
    await createNotification(ctx.db,{
      organizationId:requestOrganizationId,recipientId:candidateId,type:'certificate',
      title:finalStatus==='approved'?'Graduation approved':decision==='reject'?'Graduation review update':'Graduation review progressed',
      body:statusMessage,actionUrl:'/certificates',
      metadata:{source:'graduation-decision',requestId:ref.id,status:finalStatus,decision,stageId:stage.id},
      createdBy:ctx.auth.uid,
    });
  }
  const upcomingStage=decision==='approve'&&text(result.status)!=='approved'
    ?stages[Number(result.workflowStageIndex)]:undefined;
  if(upcomingStage){
    await notifyStageApprovers(ctx,{...result,id:ref.id},upcomingStage,ctx.auth.uid);
  }
  return res.status(200).json({
    ok:true,
    request:safe,
    certificate:certificateAward?.certificate,
    certificateAwarded:certificateAward?.created===true||Boolean(certificateAward?.certificate),
    certificateAwardError:certificateAwardError||undefined,
  });
}

export default async function handler(req: Request, res: Response) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const action = text(bodyOf(req).action);
    if (action === 'submit') return await submit(req, res);
    if (action === 'decision') return await decide(req, res);
    return res.status(400).json({ error: 'Unsupported graduation action.' });
  } catch (error) {
    console.error('VOP graduation API failed', error);
    const message = error instanceof Error ? error.message : 'Graduation workflow failed.';
    if (/Sign in|organization|permission|authorized|member|tenant/i.test(message)) return res.status(403).json({ error: message });
    if (/not found/i.test(message)) return res.status(404).json({ error: message });
    if (/configured|changed before|already|no longer has/i.test(message)) return res.status(409).json({ error: message });
    return res.status(500).json({ error: 'Graduation workflow failed.' });
  }
}
