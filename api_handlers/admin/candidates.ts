import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import { authenticateTenant, requireOrgRole, writeTenantAudit, organizationInHierarchyScope } from '../../server/tenant.js';
import { requirePermission } from '../../server/permissions.js';

type Request = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type Response = {
  status: (code: number) => Response;
  json: (body: unknown) => void;
};

function validDate(value: unknown) {
  if (value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isNaN(date.getTime()) ? null : value;
}

export default async function handler(request: Request, response: Response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });

  try {
    const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    if (body.action === 'enroll') {
      const requestedOrganizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : '';
      const ctx = await authenticateTenant(request, requestedOrganizationId || undefined);
      await requirePermission(ctx, 'users', 'create');
      if (ctx.tenantType === 'hierarchy') {
        if (!requestedOrganizationId || !(await organizationInHierarchyScope(ctx, requestedOrganizationId))) return response.status(403).json({ error: 'The selected organization is outside your hierarchy scope.' });
      } else {
        requireOrgRole(ctx, ['owner','admin']);
      }
      const organizationId = ctx.organizationId || requestedOrganizationId;
      if (!organizationId) throw new Error('An organization is required for candidate enrollment.');
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const guideId = typeof body.guideId === 'string' ? body.guideId.trim() : '';
      if (!displayName || !email || !guideId) return response.status(400).json({ error: 'Full name, email and course are required.' });
      if (password && password.length < 6) return response.status(400).json({ error: 'Password must contain at least 6 characters.' });
      const guideRef = ctx.db.doc('guides/' + guideId);
      const guide = await guideRef.get();
      if (!guide.exists) throw new Error('The selected course was not found.');
      const guideData = guide.data() || {};
      if (String(guideData.organizationId || '') !== organizationId) throw new Error('The selected course does not belong to this organization.');
      if (guideData.published !== true || guideData.archived === true) throw new Error('Only a published active course can be used for enrollment.');
      const authService = getAuth(getApps()[0]);
      let account;
      let created = false;
      try {
        account = await authService.getUserByEmail(email);
      } catch (error) {
        const code = String((error as {code?:unknown})?.code || '');
        if (code !== 'auth/user-not-found') throw error;
        account = await authService.createUser({ email, displayName, ...(phoneNumber ? { phoneNumber } : {}), ...(password ? { password } : {}), disabled:false });
        created = true;
      }
      const candidateRef = ctx.db.doc('users/' + account.uid);
      const existingSnapshot = await candidateRef.get();
      const existing = existingSnapshot.exists ? existingSnapshot.data() || {} : {};
      const existingOrg = String(existing.organizationId || '').trim();
      if (existingOrg && existingOrg !== organizationId) throw new Error('This email already belongs to another organization.');
      const now = new Date().toISOString();
      const oldInfo = (existing.information && typeof existing.information === 'object') ? existing.information as Record<string, unknown> : {};
      const oldProgress = (existing.progress && typeof existing.progress === 'object') ? existing.progress as Record<string, unknown> : {};
      const information = { ...oldInfo, enrollmentDate: String(oldInfo.enrollmentDate || now), graduating:false, graduated:false, baptismCandidate:Boolean(oldInfo.baptismCandidate), baptized:Boolean(oldInfo.baptized) };
      const progress = { ...oldProgress, discoverProgress:Number(oldProgress.discoverProgress || 0), completedGuidesCount:Number(oldProgress.completedGuidesCount || 0), totalGuidesCount:Number(oldProgress.totalGuidesCount || 0), guideScores:oldProgress.guideScores || {}, completedLessons:Array.isArray(oldProgress.completedLessons) ? oldProgress.completedLessons : [] };
      await ctx.db.runTransaction(async transaction => {
        transaction.set(candidateRef, { uid:account.uid, email, displayName:displayName || account.displayName || email.split('@')[0], ...(phoneNumber ? {phoneNumber} : {}), role:String(existing.role || 'student'), userType:'learner', organizationId, organizationRole:'learner', information, progress, updatedAt:FieldValue.serverTimestamp(), createdAt:existing.createdAt || FieldValue.serverTimestamp() }, { merge:true });
        transaction.set(ctx.db.doc('organizations/' + organizationId + '/members/' + account.uid), { uid:account.uid, organizationId, role:'learner', active:true, invitedBy:ctx.auth.uid, joinedAt:String(existing.joinedAt || now), updatedAt:now }, { merge:true });
        transaction.set(ctx.db.doc('courseEnrollments/' + organizationId + '_' + account.uid + '_' + guideId), { uid:account.uid, organizationId, guideId, source:'admin', enrolledBy:ctx.auth.uid, enrolledAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp(), status:'active' }, { merge:true });
      });
      await authService.setCustomUserClaims(account.uid, { role:String(existing.role || 'student'), organizationId, organizationRole:'learner' });
      const resetLink = !password ? await authService.generatePasswordResetLink(email).catch(() => null) : null;
      await writeTenantAudit(ctx, 'candidate.enroll', 'users/' + account.uid, undefined, { organizationId, guideId, created });
      return response.status(200).json({ ok:true, created, resetLink, candidate:{uid:account.uid,email,displayName:displayName || account.displayName || email.split('@')[0],organizationId,guideId} });
    }
    if (body.action !== 'updateBaptism') return response.status(400).json({ error: 'Unsupported candidate action.' });
    const requestedOrganizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : '';
    const ctx = await authenticateTenant(request, requestedOrganizationId || undefined);
    await requirePermission(ctx, 'users', 'update');
    if (ctx.tenantType === 'hierarchy') {
      if (!requestedOrganizationId || !(await organizationInHierarchyScope(ctx, requestedOrganizationId))) return response.status(403).json({ error: 'The selected organization is outside your hierarchy scope.' });
    } else {
      requireOrgRole(ctx, ['owner','admin']);
    }
    const candidateId = typeof body.candidateId === 'string' ? body.candidateId.trim() : '';
    if (!candidateId || !/^[A-Za-z0-9_-]{1,160}$/.test(candidateId)) {
      return response.status(400).json({ error: 'A valid candidate ID is required.' });
    }

    const baptismCandidate = body.baptismCandidate === true;
    const baptized = body.baptized === true;
    if (baptized && baptismCandidate) {
      return response.status(400).json({ error: 'A candidate cannot be marked as both a baptism candidate and baptized.' });
    }

    const baptismDate = validDate(body.baptismDate);
    if (baptismDate === null) return response.status(400).json({ error: 'Baptism date must use YYYY-MM-DD.' });
    if (baptized && !baptismDate) return response.status(400).json({ error: 'A baptism date is required when marking a candidate as baptized.' });

    const candidateRef = ctx.db.doc(`users/${candidateId}`);
    const candidateSnapshot = await candidateRef.get();
    if (!candidateSnapshot.exists) return response.status(404).json({ error: 'Candidate was not found.' });
    const candidateOrganizationId = String(candidateSnapshot.data()?.organizationId || '').trim();
    if (!ctx.isSuperAdmin && (ctx.tenantType === 'organization' ? candidateOrganizationId !== ctx.organizationId : !(await organizationInHierarchyScope(ctx, candidateOrganizationId)))) return response.status(403).json({ error: 'This candidate belongs outside your authorized organization scope.' });

    const information = (candidateSnapshot.data()?.information || {}) as Record<string, unknown>;
    await candidateRef.set({
      information: {
        ...information,
        baptismCandidate,
        baptized,
        baptismDate: baptized ? baptismDate : '',
      },
      updatedAt: FieldValue.serverTimestamp(),
      baptismStatusUpdatedAt: FieldValue.serverTimestamp(),
      baptismStatusUpdatedBy: ctx.auth.uid,
    }, { merge: true });

    const saved = await candidateRef.get();
    const data = saved.data() || {};
    await writeTenantAudit(ctx,'candidate.baptism.update',`users/${candidateId}`,undefined,{baptismCandidate,baptized,baptismDate});
    return response.status(200).json({
      ok: true,
      candidate: {
        uid: saved.id,
        ...data,
        information: data.information || {},
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Candidate baptism update failed.';
    if (message.includes('Firebase Admin') || message.includes('not configured')) return response.status(503).json({ error: message });
    if (message.includes('auth/id-token') || message.includes('argument-error')) return response.status(401).json({ error: 'Your session is invalid. Sign in again.' });
    console.error('VOP candidate baptism update failed', error);
    return response.status(500).json({ error: 'Candidate baptism update failed.' });
  }
}
