import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, getAdminDb, writeTenantAudit } from './lib/tenant';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status:(code:number)=>Response; json:(body:unknown)=>void };

const LOCALE_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
const KEY_RE = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/;

function cleanLocale(value: unknown) {
  const locale = String(value || '').trim().toLowerCase();
  if (!LOCALE_RE.test(locale)) throw new Error('A valid locale code is required.');
  return locale;
}
function cleanKey(value: unknown) {
  const key = String(value || '').trim();
  if (!KEY_RE.test(key)) throw new Error('A valid translation key is required.');
  return key;
}
function namespaceOf(key: string) { return key.split('.')[0]; }
function q(req: Request, name: string) {
  const value = req.query?.[name];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export default async function handler(req: Request, res: Response) {
  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      const locale = cleanLocale(q(req, 'locale') || 'en');
      const localeSnap = await db.doc(`locales/${locale}`).get();
      if (!localeSnap.exists || localeSnap.data()?.enabled === false) {
        return res.status(404).json({ error:'Locale is not available.' });
      }
      const snap = await db.collection(`locales/${locale}/translations`)
        .where('status','==','published').get();
      const translations: Record<string,string> = {};
      snap.docs.forEach(doc => {
        const value = String(doc.data()?.value ?? '');
        if (value.trim()) translations[doc.id] = value;
      });
      return res.status(200).json({
        ok:true,
        locale,
        fallback:String(localeSnap.data()?.fallback || 'en'),
        direction:String(localeSnap.data()?.direction || 'ltr') === 'rtl' ? 'rtl' : 'ltr',
        version:Number(localeSnap.data()?.version || 1),
        translations
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed.' });
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string,unknown> : {};
    const action = String(body.action || '');
    const locale = cleanLocale(body.locale);

    if (action === 'bootstrap') {
      const ctx = await authenticateTenant(req);
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can manage UI locales.');
      const name = String(body.name || '').trim();
      const nativeName = String(body.nativeName || name).trim();
      if (!name) throw new Error('Language name is required.');
      const ref = db.doc(`locales/${locale}`);
      const current = await ref.get();
      const direction = String(body.direction || 'ltr') === 'rtl' ? 'rtl' : 'ltr';
      await ref.set({
        code:locale, name, nativeName, enabled:body.enabled !== false,
        direction, fallback:cleanLocale(body.fallback || 'en'),
        version:Number(current.data()?.version || 1),
        updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid,
      }, { merge:true });
      return res.status(200).json({ok:true, locale});
    }

    const ctx = await authenticateTenant(req);
    if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can manage global UI translations.');

    if (action === 'list') {
      const requestedNamespace = String(body.namespace || '').trim();
      const snap = await db.collection(`locales/${locale}/translations`).get();
      const items = snap.docs
        .map(doc => ({ id:doc.id, ...doc.data() }))
        .filter(item => !requestedNamespace || String(item.namespace || '') === requestedNamespace);
      return res.status(200).json({ok:true, items});
    }

    const key = cleanKey(body.key);
    const ref = db.doc(`locales/${locale}/translations/${key}`);
    const existing = await ref.get();

    if (action === 'save' || action === 'publish' || action === 'unpublish') {
      const value = String(body.value ?? '');
      if ((action === 'save' || action === 'publish') && !value.trim()) throw new Error('Translation value cannot be empty.');
      const source = String(body.source ?? existing.data()?.source ?? '');
      const status = action === 'publish' ? 'published' : action === 'unpublish' ? 'draft' : String(body.status || 'draft');
      if (!['draft','review','published'].includes(status)) throw new Error('Invalid translation status.');
      await ref.set({
        key, locale, namespace:namespaceOf(key), source, value,
        status, context:String(body.context || existing.data()?.context || ''),
        translatorNotes:String(body.translatorNotes || existing.data()?.translatorNotes || ''),
        version:Number(existing.data()?.version || 0) + 1,
        updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid,
      }, {merge:true});
      await db.doc(`locales/${locale}`).set({version:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      await writeTenantAudit(ctx, `translation.${action}`, `locales/${locale}/translations/${key}`, existing.exists ? existing.data() : undefined, {key,locale,status});
      return res.status(200).json({ok:true,item:{id:key,key,locale,namespace:namespaceOf(key),source,value,status}});
    }

    if (action === 'delete') {
      if (!existing.exists) return res.status(404).json({error:'Translation key not found.'});
      await ref.delete();
      await writeTenantAudit(ctx,'translation.delete',`locales/${locale}/translations/${key}`,existing.data(),undefined);
      return res.status(200).json({ok:true,key,locale});
    }

    return res.status(400).json({error:'Unsupported localization action.'});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Localization operation failed.';
    const status = /Sign in/.test(message) ? 401 : /permission|Only|membership|available|required/.test(message) ? 403 : 400;
    return res.status(status).json({error:message});
  }
}
