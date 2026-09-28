import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, getAdminDb, writeTenantAudit } from '../../server/tenant.js';
import { requirePermission } from '../../server/permissions.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status:(code:number)=>Response; json:(body:unknown)=>void };
const CODE_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
const normalize = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => normalize(value).toLowerCase();
const same = (a: unknown,b: unknown) => lower(a) !== '' && lower(a) === lower(b);

async function migrateLegacyLocale(db: FirebaseFirestore.Firestore, canonicalCode: string, name: string, nativeName: string) {
  const locales = await db.collection('locales').get();
  const legacy = locales.docs.find(doc => {
    const data=doc.data()||{};
    return doc.id.toLowerCase() !== canonicalCode && (same(data.name,name) || same(data.nativeName,nativeName) || same(data.nativeName,name));
  });
  if (!legacy) return { migratedFrom:'', count:0 };
  const sourceCode=legacy.id.toLowerCase();
  const sourceTranslations=await db.collection(`locales/${sourceCode}/translations`).get();
  if (sourceTranslations.empty) return { migratedFrom:sourceCode,count:0 };
  let count=0;
  for (let offset=0; offset<sourceTranslations.docs.length; offset+=400) {
    const batch=db.batch();
    sourceTranslations.docs.slice(offset,offset+400).forEach(doc=>{
      const data=doc.data()||{};
      const target=db.doc(`locales/${canonicalCode}/translations/${doc.id}`);
      batch.set(target,{...data,key:doc.id,locale:canonicalCode,migratedFromLocale:sourceCode,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    });
    await batch.commit();
    count += Math.min(400, sourceTranslations.docs.length-offset);
  }
  return { migratedFrom:sourceCode,count };
}

export default async function handler(req: Request, res: Response) {
  try {
    const ctx = await authenticateTenant(req);
    if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed.'});
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string,unknown> : {};
    const action = lower(body.action);
    const requestedCode = lower(body.code || body.id);
    const db = getAdminDb();

    if (action === 'upsert' || action === 'status') await requirePermission(ctx, 'languages', 'update');
    else if (action === 'delete') await requirePermission(ctx, 'languages', 'delete');
    else throw new Error('Unsupported language action.');

    if (!requestedCode || !CODE_RE.test(requestedCode)) throw new Error('A valid language code is required. Use the configured language code, for example bem or en.');

    const languageRef = db.doc(`languages/${requestedCode}`);
    const localeRef = db.doc(`locales/${requestedCode}`);

    if (action === 'upsert') {
      const name=normalize(body.name);
      const nativeName=normalize(body.nativeName)||name;
      if(!name) throw new Error('Language name is required.');
      const existing=await languageRef.get();
      const now=FieldValue.serverTimestamp();
      const data={code:requestedCode,languageCode:requestedCode,name,nativeName,enabled:body.enabled!==false,rtl:body.rtl===true,sortOrder:Number.isFinite(Number(body.sortOrder))?Number(body.sortOrder):0,sharingScope:'shared',organizationId:'',ownerUid:ctx.auth.uid,updatedAt:now,updatedBy:ctx.auth.uid,...(existing.exists?{}:{createdAt:now})};
      await languageRef.set(data,{merge:true});
      await localeRef.set({code:requestedCode,name,nativeName,enabled:data.enabled,rtl:data.rtl,direction:data.rtl?'rtl':'ltr',fallback:body.fallback?lower(body.fallback):'',updatedAt:now,updatedBy:ctx.auth.uid},{merge:true});
      // If an older locale used a different code for the same configured language,
      // copy its translations into the canonical language code. The Languages
      // registry remains authoritative; this is only a data migration.
      const migration=await migrateLegacyLocale(db,requestedCode,name,nativeName);
      await writeTenantAudit(ctx,'language.upsert',`languages/${requestedCode}`,existing.exists?existing.data():undefined,{code:requestedCode,name,nativeName,migratedFrom:migration.migratedFrom,migratedTranslations:migration.count});
      return res.status(200).json({ok:true,item:{id:requestedCode,...data},migration});
    }

    if(action==='status'){
      const snap=await languageRef.get(); if(!snap.exists) throw new Error('Language not found.');
      const enabled=body.enabled===true;
      await languageRef.set({enabled,updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid},{merge:true});
      await localeRef.set({enabled,updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid},{merge:true});
      return res.status(200).json({ok:true,code:requestedCode,enabled});
    }

    const snap=await languageRef.get(); if(!snap.exists)return res.status(404).json({error:'Language not found.'});
    await languageRef.delete(); await localeRef.delete();
    await writeTenantAudit(ctx,'language.delete',`languages/${requestedCode}`,snap.data(),undefined);
    return res.status(200).json({ok:true,code:requestedCode});
  } catch(error){
    const message=error instanceof Error?error.message:'Language operation failed.';
    const status=/sign in/i.test(message)?401:/permission|Only|membership|forbidden/i.test(message)?403:/not found/i.test(message)?404:400;
    return res.status(status).json({error:message});
  }
}