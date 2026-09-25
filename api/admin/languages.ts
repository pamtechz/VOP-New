import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, getAdminDb, writeTenantAudit } from '../../server/tenant.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status:(code:number)=>Response; json:(body:unknown)=>void };
const CODE_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

export default async function handler(req: Request, res: Response) {
  try {
    const ctx = await authenticateTenant(req);
    if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can manage global languages.');
    if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed.'});
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string,unknown> : {};
    const action = String(body.action || '');
    const code = String(body.code || body.id || '').trim().toLowerCase();
    if (!code || !CODE_RE.test(code)) throw new Error('A valid language code is required.');
    const db = getAdminDb();
    const languageRef = db.doc(`languages/${code}`);
    const localeRef = db.doc(`locales/${code}`);

    if (action === 'upsert') {
      const name = String(body.name || '').trim();
      const nativeName = String(body.nativeName || name).trim();
      if (!name) throw new Error('Language name is required.');
      const existing = await languageRef.get();
      const data = {
        code, languageCode: code, name, nativeName,
        enabled: body.enabled !== false, rtl: body.rtl === true,
        sortOrder: Number(body.sortOrder || 0), sharingScope:'shared', organizationId:'', ownerUid:ctx.auth.uid,
        updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid,
        ...(existing.exists ? {} : {createdAt:FieldValue.serverTimestamp()}),
      };
      await languageRef.set(data, {merge:true});
      await localeRef.set({code,name,nativeName,enabled:data.enabled,rtl:data.rtl,direction:data.rtl?'rtl':'ltr',fallback:'en',updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid},{merge:true});
      await writeTenantAudit(ctx,'language.upsert',`languages/${code}`,existing.exists?existing.data():undefined,{code,name});
      return res.status(200).json({ok:true,item:{id:code,code,languageCode:code,name,nativeName,enabled:data.enabled,rtl:data.rtl,sortOrder:data.sortOrder}});
    }
    if (action === 'status') {
      const snap = await languageRef.get();
      if (!snap.exists) throw new Error('Language not found.');
      const enabled = body.enabled === true;
      await languageRef.set({enabled,updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid},{merge:true});
      await localeRef.set({enabled,updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid},{merge:true});
      return res.status(200).json({ok:true,code,enabled});
    }
    if (action === 'delete') {
      const snap = await languageRef.get();
      if (!snap.exists) return res.status(404).json({error:'Language not found.'});
      await languageRef.delete();
      await localeRef.delete();
      await writeTenantAudit(ctx,'language.delete',`languages/${code}`,snap.data(),undefined);
      return res.status(200).json({ok:true,code});
    }
    return res.status(400).json({error:'Unsupported language action.'});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Language operation failed.';
    const status = /sign in/i.test(message) ? 401 : /Only|permission|membership/i.test(message) ? 403 : 400;
    return res.status(status).json({error:message});
  }
}
