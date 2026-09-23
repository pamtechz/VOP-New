import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, requireOrgRole, writeTenantAudit } from '../../server/tenant';

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
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isNaN(date.getTime()) ? null : value;
}

export default async function handler(request: Request, response: Response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });

  try {
    const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    if (body.action !== 'updateBaptism') return response.status(400).json({ error: 'Unsupported candidate action.' });
    const ctx = await authenticateTenant(request, typeof body.organizationId === 'string' ? body.organizationId : undefined);
    requireOrgRole(ctx, ['owner','admin']);
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
    if (String(candidateSnapshot.data()?.organizationId || '') !== ctx.organizationId && !ctx.isSuperAdmin) return response.status(403).json({ error: 'This candidate belongs to another organization.' });

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
