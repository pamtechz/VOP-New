import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import { authenticateTenant, requireOrgRole, writeTenantAudit, organizationInHierarchyScope, enforceOrganizationMembershipQuotas } from '../../server/tenant.js';
import { requirePermission, requireSubscriptionFeature } from '../../server/permissions.js';

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
      await requireSubscriptionFeature(ctx,'candidates',organizationId);
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
      const guideOrganizationId=String(guideData.organizationId || guideData.ownerOrganizationId || '').trim();
      const systemWide=guideData.published===true && guideData.archived!==true
        && (guideData.sharingScope==='shared' || String(guideData.scope||'')==='platform' || !guideOrganizationId);
      if (guideOrganizationId !== organizationId && !systemWide) throw new Error('The selected course is not available to this organization.');
      if (guideData.published !== true || guideData.archived === true) throw new Error('Only a published active course can be used for enrollment.');
      const authService = getAuth(getApps()[0]);
      let account;
      let created = false;
      try {
        account = await authService.getUserByEmail(email);
      } catch (error) {
        const code = String((error as {code?:unknown})?.code || '');
        if (code !== 'auth/user-not-found') throw error;
        await enforceOrganizationMembershipQuotas(ctx,organizationId,'learner');
        account = await authService.createUser({ email, displayName, ...(phoneNumber ? { phoneNumber } : {}), ...(password ? { password } : {}), disabled:false });
        created = true;
      }
      await enforceOrganizationMembershipQuotas(ctx,organizationId,'learner',account.uid);
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

    if (body.action === 'updateCandidate') {
      const targetOrgId = typeof body.organizationId === 'string' ? body.organizationId.trim() : '';
      const ctx = await authenticateTenant(request, targetOrgId || undefined);
      await requirePermission(ctx, 'users', 'update');
      const candidateId = typeof body.candidateId === 'string' ? body.candidateId.trim() : '';
      if (!candidateId || !/^[A-Za-z0-9_-]{1,160}$/.test(candidateId)) {
        return response.status(400).json({ error: 'A valid candidate ID is required.' });
      }

      const candidateRef = ctx.db.doc(`users/${candidateId}`);
      const candidateSnapshot = await candidateRef.get();
      if (!candidateSnapshot.exists) return response.status(404).json({ error: 'Candidate was not found.' });

      const candidateData = candidateSnapshot.data() || {};
      const currentOrgId = String(candidateData.organizationId || '').trim();

      if (!ctx.isSuperAdmin && (ctx.tenantType === 'organization' ? currentOrgId !== ctx.organizationId : !(await organizationInHierarchyScope(ctx, currentOrgId)))) {
        return response.status(403).json({ error: 'This candidate belongs outside your authorized organization scope.' });
      }

      await requireSubscriptionFeature(ctx, 'candidates', currentOrgId || ctx.organizationId);

      const nextOrgId = targetOrgId || currentOrgId;
      if (nextOrgId && nextOrgId !== currentOrgId) {
        if (!ctx.isSuperAdmin && !(ctx.tenantType === 'hierarchy' && await organizationInHierarchyScope(ctx, nextOrgId))) {
          return response.status(403).json({ error: 'You do not have permission to transfer candidates outside your authorized organization scope.' });
        }
        const targetOrgSnap = await ctx.db.doc('organizations/' + nextOrgId).get();
        if (!targetOrgSnap.exists || targetOrgSnap.data()?.status !== 'active') {
          return response.status(400).json({ error: 'The selected target organization is inactive or does not exist.' });
        }
        await enforceOrganizationMembershipQuotas(ctx, nextOrgId, 'learner', candidateId);
      }

      const authService = getAuth(getApps()[0]);
      const authUpdates: Parameters<typeof authService.updateUser>[1] = {};
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
      const disabled = typeof body.disabled === 'boolean' ? body.disabled : undefined;

      if (displayName) authUpdates.displayName = displayName;
      if (email) authUpdates.email = email;
      if (phoneNumber !== undefined) authUpdates.phoneNumber = phoneNumber || null;
      if (disabled !== undefined) authUpdates.disabled = disabled;

      if (Object.keys(authUpdates).length > 0) {
        await authService.updateUser(candidateId, authUpdates).catch(err => {
          console.warn('Could not update Firebase Auth record for candidate', err);
        });
      }

      const conferenceName = typeof body.conferenceName === 'string' ? body.conferenceName.trim() : undefined;
      const districtName = typeof body.districtName === 'string' ? body.districtName.trim() : undefined;
      const churchName = typeof body.churchName === 'string' ? body.churchName.trim() : undefined;
      const conferenceId = typeof body.conferenceId === 'string' ? body.conferenceId.trim() : undefined;
      const districtId = typeof body.districtId === 'string' ? body.districtId.trim() : undefined;
      const churchId = typeof body.churchId === 'string' ? body.churchId.trim() : undefined;

      let orgName = candidateData.organizationName;
      if (nextOrgId && nextOrgId !== currentOrgId) {
        const oSnap = await ctx.db.doc('organizations/' + nextOrgId).get();
        if (oSnap.exists) orgName = String(oSnap.data()?.name || nextOrgId);
      }

      const now = new Date().toISOString();
      await ctx.db.runTransaction(async tx => {
        if (nextOrgId && nextOrgId !== currentOrgId) {
          if (currentOrgId) {
            tx.set(ctx.db.doc(`organizations/${currentOrgId}/members/${candidateId}`), { active: false, updatedAt: now }, { merge: true });
          }
          tx.set(ctx.db.doc(`organizations/${nextOrgId}/members/${candidateId}`), {
            uid: candidateId,
            organizationId: nextOrgId,
            role: 'learner',
            active: true,
            updatedAt: now,
            reassignedBy: ctx.auth.uid,
          }, { merge: true });
        }
        tx.set(candidateRef, {
          ...(displayName ? { displayName } : {}),
          ...(email ? { email } : {}),
          ...(phoneNumber !== undefined ? { phoneNumber } : {}),
          ...(disabled !== undefined ? { disabled } : {}),
          organizationId: nextOrgId,
          accountType: nextOrgId ? 'organization' : 'personal',
          ...(orgName ? { organizationName: orgName } : {}),
          ...(conferenceName !== undefined ? { conferenceName } : {}),
          ...(districtName !== undefined ? { districtName } : {}),
          ...(churchName !== undefined ? { churchName } : {}),
          ...(conferenceId !== undefined ? { conferenceId } : {}),
          ...(districtId !== undefined ? { districtId } : {}),
          ...(churchId !== undefined ? { churchId } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });

      if (nextOrgId && nextOrgId !== currentOrgId) {
        await authService.setCustomUserClaims(candidateId, {
          role: String(candidateData.role || 'student'),
          organizationId: nextOrgId,
          organizationRole: 'learner',
          accountType: nextOrgId ? 'organization' : 'personal',
        }).catch(() => {});
      }

      const updatedSnap = await candidateRef.get();
      const updatedData = updatedSnap.data() || {};
      await writeTenantAudit(ctx, 'candidate.update', `users/${candidateId}`, undefined, {
        displayName, email, phoneNumber, organizationId: nextOrgId, previousOrganizationId: currentOrgId,
      });

      return response.status(200).json({
        ok: true,
        candidate: {
          uid: candidateId,
          ...updatedData,
          displayName: updatedData.displayName || displayName || candidateData.displayName,
          email: updatedData.email || email || candidateData.email,
          phoneNumber: updatedData.phoneNumber || phoneNumber || candidateData.phoneNumber,
          organizationId: nextOrgId,
          organizationName: orgName || updatedData.organizationName,
          conferenceName: conferenceName ?? updatedData.conferenceName,
          districtName: districtName ?? updatedData.districtName,
          churchName: churchName ?? updatedData.churchName,
          disabled: disabled ?? updatedData.disabled ?? false,
          information: updatedData.information || {},
        },
      });
    }

    if (body.action === 'deleteCandidate') {
      const requestedOrganizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : '';
      const ctx = await authenticateTenant(request, requestedOrganizationId || undefined);
      await requirePermission(ctx, 'users', 'delete');
      if (ctx.tenantType === 'hierarchy') {
        if (!requestedOrganizationId || !(await organizationInHierarchyScope(ctx, requestedOrganizationId))) {
          return response.status(403).json({ error: 'The selected organization is outside your hierarchy scope.' });
        }
      } else {
        requireOrgRole(ctx, ['owner','admin']);
      }
      const candidateId = typeof body.candidateId === 'string' ? body.candidateId.trim() : typeof body.uid === 'string' ? body.uid.trim() : '';
      if (!candidateId || !/^[A-Za-z0-9_-]{1,160}$/.test(candidateId)) {
        return response.status(400).json({ error: 'A valid candidate ID is required.' });
      }
      if (candidateId === String(ctx.auth.uid)) {
        return response.status(400).json({ error: 'The signed-in administrator cannot delete their own account.' });
      }

      const candidateRef = ctx.db.doc(`users/${candidateId}`);
      const candidateSnapshot = await candidateRef.get();
      if (!candidateSnapshot.exists) return response.status(404).json({ error: 'Candidate was not found.' });
      const candidateData = candidateSnapshot.data() || {};
      const candidateOrganizationId = String(candidateData.organizationId || '').trim();

      if (!ctx.isSuperAdmin) {
        if (ctx.tenantType === 'organization') {
          if (candidateOrganizationId !== ctx.organizationId) {
            return response.status(403).json({ error: 'This candidate belongs outside your authorized organization.' });
          }
        } else if (!(await organizationInHierarchyScope(ctx, candidateOrganizationId))) {
          return response.status(403).json({ error: 'This candidate belongs outside your authorized hierarchy scope.' });
        }
      }

      const platformRole = String(candidateData.role || '').trim();
      if (platformRole === 'super_admin' || ['union_admin','conference_admin','district_admin','church_admin'].includes(platformRole)) {
        return response.status(403).json({ error: 'Administrative accounts cannot be deleted through candidate management.' });
      }

      const passkeys = await ctx.db.collection('passkeyCredentials').where('uid', '==', candidateId).limit(20).get();
      if (!passkeys.empty) {
        const cleanup = ctx.db.batch();
        passkeys.docs.forEach(doc => cleanup.delete(doc.ref));
        await cleanup.commit().catch(() => undefined);
      }

      const authService = getAuth(getApps()[0]);
      await authService.deleteUser(candidateId).catch(() => undefined);
      await candidateRef.delete();

      if (candidateOrganizationId) {
        await ctx.db.doc(`organizations/${candidateOrganizationId}/members/${candidateId}`).delete().catch(() => undefined);
      }

      await writeTenantAudit(ctx, 'candidate.delete', `users/${candidateId}`, candidateData, undefined);
      return response.status(200).json({ ok: true, deleted: candidateId });
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

    const baptismStatus = typeof body.baptismStatus === 'string' ? body.baptismStatus.trim() : '';
    if (baptismStatus && !['not_marked','scheduled','baptized'].includes(baptismStatus)) {
      return response.status(400).json({ error: 'Baptism status must be not marked, scheduled, or baptized.' });
    }
    // Preserve older callers that send the two booleans while the dedicated
    // candidate screen uses the explicit lifecycle status.
    const baptismCandidate = baptismStatus
      ? baptismStatus === 'scheduled'
      : body.baptismCandidate === true;
    const baptized = baptismStatus
      ? baptismStatus === 'baptized'
      : body.baptized === true;
    if (baptized && baptismCandidate) {
      return response.status(400).json({ error: 'A candidate cannot be marked as both scheduled for baptism and baptized.' });
    }

    const baptismScheduledDate = validDate(body.baptismScheduledDate);
    const baptismDate = validDate(body.baptismDate);
    if (baptismScheduledDate === null) return response.status(400).json({ error: 'Scheduled baptism date must use YYYY-MM-DD.' });
    if (baptismDate === null) return response.status(400).json({ error: 'Baptism date must use YYYY-MM-DD.' });
    if (baptismStatus === 'scheduled' && !baptismScheduledDate) {
      return response.status(400).json({ error: 'Choose the scheduled baptism date.' });
    }
    if (baptized && !baptismDate) return response.status(400).json({ error: 'A baptism date is required when marking a candidate as baptized.' });

    const candidateRef = ctx.db.doc(`users/${candidateId}`);
    const candidateSnapshot = await candidateRef.get();
    if (!candidateSnapshot.exists) return response.status(404).json({ error: 'Candidate was not found.' });
    const candidateOrganizationId = String(candidateSnapshot.data()?.organizationId || '').trim();
    if (!ctx.isSuperAdmin && (ctx.tenantType === 'organization' ? candidateOrganizationId !== ctx.organizationId : !(await organizationInHierarchyScope(ctx, candidateOrganizationId)))) return response.status(403).json({ error: 'This candidate belongs outside your authorized organization scope.' });
    await requireSubscriptionFeature(ctx,'candidates',candidateOrganizationId);

    const information = (candidateSnapshot.data()?.information || {}) as Record<string, unknown>;
    const retainedScheduledDate = baptismStatus === 'not_marked'
      ? ''
      : baptized
        ? String(information.baptismScheduledDate || baptismScheduledDate || '')
        : baptismScheduledDate || String(information.baptismScheduledDate || '');
    await candidateRef.set({
      information: {
        ...information,
        baptismCandidate,
        baptized,
        baptismScheduledDate: retainedScheduledDate,
        baptismDate: baptized ? baptismDate : '',
      },
      updatedAt: FieldValue.serverTimestamp(),
      baptismStatusUpdatedAt: FieldValue.serverTimestamp(),
      baptismStatusUpdatedBy: ctx.auth.uid,
    }, { merge: true });

    const saved = await candidateRef.get();
    const data = saved.data() || {};
    await writeTenantAudit(ctx,'candidate.baptism.update',`users/${candidateId}`,undefined,{
      baptismStatus:baptized?'baptized':baptismCandidate?'scheduled':'not_marked',
      baptismCandidate,baptized,baptismScheduledDate:retainedScheduledDate,baptismDate,
    });
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
    if (/permission|authorized|outside|subscription plan|subscription is inactive/i.test(message)) return response.status(403).json({ error: message });
    console.error('VOP candidate baptism update failed', error);
    return response.status(500).json({ error: 'Candidate baptism update failed.' });
  }
}
