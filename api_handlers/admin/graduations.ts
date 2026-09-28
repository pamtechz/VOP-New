import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, writeTenantAudit, organizationInHierarchyScope } from '../../server/tenant.js';
import { requirePermission } from '../../server/permissions.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };
type ApprovalStage = { id: string; label?: string; approverRoles?: string[]; enabled?: boolean };

function bodyOf(req: Request) { return req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }

function stageConfig(data: Record<string, unknown>): ApprovalStage[] {
  const raw = Array.isArray(data.approvalStages) ? data.approvalStages : [];
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

async function loadWorkflow(ctx: Awaited<ReturnType<typeof authenticateTenant>>) {
  const snapshot = await ctx.db.doc('system/certification').get();
  const stages = stageConfig(snapshot.exists ? snapshot.data() || {} : {});
  if (!stages.length) throw new Error('Graduation approval stages are not configured. Configure at least one enabled approval stage before accepting graduation requests.');
  return stages;
}

async function submit(req: Request, res: Response) {
  const ctx = await authenticateTenant(req);
  await requirePermission(ctx, 'certificates', 'create');
  if (ctx.isSuperAdmin) return res.status(403).json({ error: 'Super administrators do not submit candidate graduation requests.' });
  const body = bodyOf(req);
  const guideId = text(body.guideId);
  if (!guideId || guideId.includes('/') || guideId.length > 160) return res.status(400).json({ error: 'A valid guide ID is required.' });
  const candidate = ctx.profile;
  if (text(candidate.role) !== 'student') return res.status(403).json({ error: 'Only learner accounts can submit graduation requests.' });

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

  const stages = await loadWorkflow(ctx);
  const lessonsSnapshot = await guideSnapshot.ref.collection('lessons').get();
  const lessons = lessonsSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const publishedLessons = lessons.filter(item => item.published === true);
  const studyLessons = publishedLessons.filter(item => String(item.type ?? 'Lesson') === 'Lesson');
  const testLessons = publishedLessons.filter(item => String(item.type ?? '') === 'Test');
  if (publishedLessons.length !== lessons.length || !studyLessons.length || !testLessons.length) {
    return res.status(409).json({ error: 'The candidate cannot submit graduation until the certificate-eligible guide has all required published lessons and assessments.' });
  }
  const certificationConfigSnapshot = await ctx.db.doc('system/certification').get();
  const certificationConfig = certificationConfigSnapshot.exists ? certificationConfigSnapshot.data() || {} : {};
  const organizationSettingsSnapshot = await ctx.db.doc(`organizations/${ctx.organizationId}/settings/settings`).get();
  const configuredMinimum = Number(certificationConfig.minimumScore);
  const organizationThreshold = Number(organizationSettingsSnapshot.data()?.quizPassThreshold ?? 0);
  const threshold = Number.isFinite(configuredMinimum) && configuredMinimum >= 0 && configuredMinimum <= 100
    ? configuredMinimum
    : organizationThreshold;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
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
  for (const test of testLessons) {
    const key = `${ctx.organizationId}:${language}:${guideId}:${String(test.id)}`;
    const score = Number(scores[key]);
    if (!Number.isFinite(score) || score < threshold) return res.status(409).json({ error: 'The candidate has not passed all required assessments.' });
  }

  const ref = ctx.db.doc(`graduationRequests/${requestId(ctx.organizationId, ctx.auth.uid, guideId)}`);
  const userRef = ctx.db.doc(`users/${ctx.auth.uid}`);
  const score = Number(body.averageScore);
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
    const firstStage = stages[0];
    const data = {
      candidateId: ctx.auth.uid, candidateName: text(candidate.displayName), candidateEmail: text(candidate.email || ctx.auth.email),
      organizationId: ctx.organizationId, guideId, guideTitle: text(guide.title), churchId: text(candidate.churchId),
      districtId: text(candidate.districtId), conferenceId: text(candidate.conferenceId), unionId: text(candidate.unionId),
      averageScore: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0, status: requestStatus(firstStage),
      workflowStageId: firstStage.id, workflowStageIndex: 0, revision: 1, submittedAt: now, approvedAt: null,
      approverNotes: '', decisions: [], updatedAt: now,
    };
    transaction.set(ref, data);
    transaction.set(userRef, { information: { ...(candidate.information && typeof candidate.information === 'object' ? candidate.information : {}), graduating: true }, updatedAt: now }, { merge: true });
    return { created: true, data: safeRequest(ref.id, data) };
  });
  if (result.created) await writeTenantAudit(ctx, 'graduation.request.submitted', ref.path, undefined, result.data as Record<string, unknown>);
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
  const stages = await loadWorkflow(ctx);
  if (['approved', 'rejected'].includes(text(current.status))) return res.status(409).json({ error: 'This graduation request has already reached a final decision.' });

  const stageIndex = Number(current.workflowStageIndex), stageId = text(current.workflowStageId), stage = stages[stageIndex];
  if (!stage || stage.id !== stageId) return res.status(409).json({ error: 'The configured approval workflow no longer matches this request. Reconfigure the workflow or migrate the request before deciding.' });
  const profileRole = text(ctx.profile.role), membershipRole = text(ctx.membership.role);
  const allowed = stage.approverRoles?.some(role => role === profileRole || role === membershipRole);
  if (!allowed && !ctx.isSuperAdmin) return res.status(403).json({ error: 'You are not authorized to decide this approval stage.' });

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
  return res.status(200).json({ ok: true, request: safeRequest(ref.id, result) });
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
    if (/configured|changed before|already/i.test(message)) return res.status(409).json({ error: message });
    return res.status(500).json({ error: 'Graduation workflow failed.' });
  }
}
