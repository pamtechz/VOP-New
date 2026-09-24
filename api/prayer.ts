import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, requireOrgRole, writeTenantAudit } from '../server/tenant.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown; query?: Record<string, string | string[] | undefined> };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

const categories = new Set(['Spiritual','Health','Family','Guidance','Thanksgiving','Other']);
const statuses = new Set(['Received','Praying','Answered']);

function id(value: unknown) {
  const result = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(result)) throw new Error('A valid prayer request ID is required.');
  return result;
}

export default async function handler(req: Request, res: Response) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const ctx = await authenticateTenant(req);
    const collection = ctx.db.collection('prayerRequests');
    const role = String(ctx.profile.role || '');
    const admin = ctx.isSuperAdmin || ['owner','admin'].includes(String(ctx.membership.role || '')) || ['union_admin','conference_admin','district_admin','church_admin'].includes(role);

    if (req.method === 'GET') {
      const own = String(req.query?.mine || '') === 'true';
      const snapshot = own
        ? await collection.where('candidateId','==',ctx.auth.uid).orderBy('createdAt','desc').limit(100).get()
        : await collection.where('organizationId','==',ctx.organizationId).orderBy('createdAt','desc').limit(100).get();

      const items = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(item => {
          if (item.candidateId === ctx.auth.uid) return true;
          return admin && item.organizationId === ctx.organizationId && item.isPrivate !== true;
        });

      return res.status(200).json({ ok:true, items });
    }

    if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed.' });

    const action = String(body.action || 'create');

    if (action === 'create') {
      const requestText = String(body.requestText || '').trim();
      const category = String(body.category || 'Other');
      if (requestText.length < 5) throw new Error('Prayer request must contain at least 5 characters.');
      if (requestText.length > 3000) throw new Error('Prayer request is too long.');
      if (!categories.has(category)) throw new Error('Select a valid prayer category.');

      const ref = collection.doc();
      const now = new Date().toISOString();
      const record = {
        id: ref.id,
        organizationId: ctx.organizationId,
        candidateId: ctx.auth.uid,
        candidateName: String(ctx.profile.displayName || ctx.auth.name || 'Learner'),
        churchId: String(ctx.profile.churchId || ''),
        category,
        isPrivate: body.isPrivate === true,
        status: 'Received',
        requestText,
        createdAt: now,
        updatedAt: now,
      };
      await ref.set(record);
      await writeTenantAudit(ctx,'prayer.create',`prayerRequests/${ref.id}`,undefined,record);
      return res.status(201).json({ ok:true, item:record });
    }

    if (action === 'status') {
      if (!admin) throw new Error('Only authorized ministry administrators can update prayer status.');
      const requestId = id(body.id);
      const status = String(body.status || '');
      if (!statuses.has(status)) throw new Error('Invalid prayer status.');
      const ref = collection.doc(requestId);
      const existing = await ref.get();
      if (!existing.exists) throw new Error('Prayer request not found.');
      const data = existing.data() || {};
      if (String(data.organizationId || '') !== ctx.organizationId) throw new Error('You cannot manage a prayer request outside your organization.');
      await ref.update({ status, updatedAt: new Date().toISOString(), updatedBy: ctx.auth.uid });
      await writeTenantAudit(ctx,'prayer.status',`prayerRequests/${requestId}`,data,{...data,status});
      return res.status(200).json({ ok:true, id:requestId, status });
    }

    if (action === 'delete') {
      const requestId = id(body.id);
      const ref = collection.doc(requestId);
      const existing = await ref.get();
      if (!existing.exists) return res.status(200).json({ ok:true,id:requestId });
      const data = existing.data() || {};
      if (data.candidateId !== ctx.auth.uid && !admin) throw new Error('You can only delete your own prayer request.');
      if (data.organizationId !== ctx.organizationId && !ctx.isSuperAdmin) throw new Error('You cannot delete a prayer request outside your organization.');
      await ref.delete();
      await writeTenantAudit(ctx,'prayer.delete',`prayerRequests/${requestId}`,data,undefined);
      return res.status(200).json({ ok:true,id:requestId });
    }

    throw new Error('Unsupported prayer action.');
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Prayer request operation failed.' });
  }
}
