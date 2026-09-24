import { authenticateTenant, writeTenantAudit } from '../../server/tenant.js';
import { DEFAULT_PERMISSION_MATRIX, normalizePermissionMatrix, PERMISSION_ROLES, PERMISSION_RESOURCES, PERMISSION_ACTIONS, type PermissionMatrix } from '../../shared/permissions.js';

type Request = { method?: string; headers?: Record<string, string | string[]>; body?: unknown };
type Response = { status: (code:number) => Response; json: (body:unknown) => void };

function sanitizeMatrix(value: unknown): PermissionMatrix {
  return normalizePermissionMatrix(value);
}

export default async function handler(req: Request, res: Response) {
  try {
    const ctx = await authenticateTenant(req);

    if (req.method === 'GET') {
      const snapshot = await ctx.db.doc('system/permissions').get();
      const matrix = normalizePermissionMatrix(snapshot.exists ? snapshot.data()?.matrix : DEFAULT_PERMISSION_MATRIX);
      return res.status(200).json({
        ok:true,
        matrix,
        roles: PERMISSION_ROLES,
        resources: PERMISSION_RESOURCES,
        actions: PERMISSION_ACTIONS,
        source: snapshot.exists ? 'custom' : 'default',
      });
    }

    if (!ctx.isSuperAdmin) return res.status(403).json({ error:'Only the VOP Super Admin can manage the permission matrix.' });
    if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed.' });
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const action = String(body.action || 'save');

    if (action === 'reset') {
      await ctx.db.doc('system/permissions').set({
        matrix: DEFAULT_PERMISSION_MATRIX,
        updatedBy: ctx.auth.uid,
        updatedAt: new Date().toISOString(),
        version: 1,
      }, { merge:true });
      await writeTenantAudit(ctx,'permissions.reset','system/permissions',undefined,{ matrix:DEFAULT_PERMISSION_MATRIX });
      return res.status(200).json({ ok:true, matrix:DEFAULT_PERMISSION_MATRIX, source:'default' });
    }

    if (action !== 'save') return res.status(400).json({ error:'Unsupported permission action.' });
    const matrix = sanitizeMatrix(body.matrix);
    await ctx.db.doc('system/permissions').set({
      matrix,
      updatedBy: ctx.auth.uid,
      updatedAt: new Date().toISOString(),
      version: 1,
    }, { merge:true });
    await writeTenantAudit(ctx,'permissions.update','system/permissions',undefined,{ matrix });
    return res.status(200).json({ ok:true, matrix, source:'custom' });
  } catch (error) {
    return res.status(400).json({ error:error instanceof Error ? error.message : 'Permission matrix operation failed.' });
  }
}
