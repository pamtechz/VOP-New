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
      const requestedLocale = q(req, 'locale').trim();
      if (!requestedLocale) {
        const snap = await db.collection('locales').get();
        const items = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(item => item.enabled !== false && LOCALE_RE.test(String(item.code || item.id)))
          .sort((a,b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.name || a.id).localeCompare(String(b.name || b.id)));
        const hasEnglish = items.some(item => String(item.code || item.id).toLowerCase() === 'en');
        if (!hasEnglish) items.unshift({ id:'en', code:'en', name:'English', nativeName:'English', enabled:true, direction:'ltr', fallback:'en', sortOrder:0 });
        return res.status(200).json({ok:true, items});
      }
      const locale = cleanLocale(requestedLocale);
      const [localeSnap, legacyLanguageSnap, legacyTranslationSnap] = await Promise.all([
        db.doc(`locales/${locale}`).get(),
        db.doc(`languages/${locale}`).get(),
        db.doc(`translations/${locale}`).get(),
      ]);
      const metadata = localeSnap.exists ? localeSnap.data() || {} : legacyLanguageSnap.exists ? legacyLanguageSnap.data() || {} : locale === 'en' ? {code:'en',name:'English',nativeName:'English',enabled:true,direction:'ltr',fallback:'en'} : null;
      if (!metadata || metadata.enabled === false) return res.status(404).json({ error:'Locale is not available.' });
      const snap = await db.collection(`locales/${locale}/translations`).where('status','==','published').get();
      const translations: Record<string,string> = {};
      snap.docs.forEach(doc => {
        const value = String(doc.data()?.value ?? '');
        if (value.trim()) translations[doc.id] = value;
      });
      const legacyValues = legacyTranslationSnap.exists && legacyTranslationSnap.data()?.values && typeof legacyTranslationSnap.data()?.values === 'object'
        ? legacyTranslationSnap.data()?.values as Record<string,string> : {};
      Object.entries(legacyValues).forEach(([key,value]) => {
        if (!translations[key] && typeof value === 'string' && value.trim()) translations[key] = value;
      });
      return res.status(200).json({
        ok:true,
        locale,
        fallback:String(metadata.fallback || 'en'),
        direction:String(metadata.direction || (metadata.rtl === true ? 'rtl' : 'ltr')) === 'rtl' ? 'rtl' : 'ltr',
        version:Number(metadata.version || 1),
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

    if (action === 'bulkSave') {
      const values = body.values && typeof body.values === 'object' ? body.values as Record<string,unknown> : {};
      const bulkStatus = ['draft','review','published'].includes(String(body.status||'draft')) ? String(body.status||'draft') : 'draft';
      const batch = db.batch();
      const now = new Date();
      Object.entries(values).forEach(([rawKey, rawValue]) => {
        const key = cleanKey(rawKey);
        const value = String(rawValue ?? '');
        const ref = db.doc(`locales/${locale}/translations/${key}`);
        batch.set(ref, {
          key, locale, namespace:namespaceOf(key), source:String((body.sources && typeof body.sources === 'object' ? (body.sources as Record<string,unknown>)[key] : '') || ''),
          value, status:value.trim() ? bulkStatus : 'draft', version:FieldValue.increment(1),
          updatedAt:now, updatedBy:ctx.auth.uid,
        }, {merge:true});
      });
      await batch.commit();
      await db.doc(`locales/${locale}`).set({version:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      await writeTenantAudit(ctx,'translation.bulkSave',`locales/${locale}`,undefined,{count:Object.keys(values).length});
      return res.status(200).json({ok:true,count:Object.keys(values).length});
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
