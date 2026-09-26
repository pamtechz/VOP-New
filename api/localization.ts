import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, getAdminDb, writeTenantAudit } from '../server/tenant.js';
import { requirePermission } from '../server/permissions.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status:(code:number)=>Response; json:(body:unknown)=>void };
const LOCALE_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
const KEY_RE = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/;
const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
function cleanLocale(value: unknown) { const locale=normalize(value); if(!LOCALE_RE.test(locale)) throw new Error('A valid locale code is required.'); return locale; }
function cleanKey(value: unknown) { const key=String(value||'').trim(); if(!KEY_RE.test(key)) throw new Error('A valid translation key is required.'); return key; }
function namespaceOf(key:string){ return key.split('.')[0]; }
function queryValue(req:Request,name:string){ const value=req.query?.[name]; return Array.isArray(value)?value[0]||'':value||''; }
function sameName(a:unknown,b:unknown){ return normalize(a) && normalize(a)===normalize(b); }

async function buildLanguageRegistry(db: FirebaseFirestore.Firestore) {
  const [languagesSnap, localesSnap] = await Promise.all([db.collection('languages').get(), db.collection('locales').get()]);
  const locales = localesSnap.docs.map(doc=>({id:doc.id.toLowerCase(),data:doc.data()||{}}));
  return languagesSnap.docs.map(doc=>{
    const data=doc.data()||{};
    const submittedCode=normalize(data.code||data.languageCode||doc.id);
    const related=locales.find(item=>item.id!==submittedCode && (sameName(item.data.name,data.name)||sameName(item.data.nativeName,data.nativeName)||sameName(item.data.nativeName,data.name)));
    const code=related?.id && LOCALE_RE.test(related.id) ? related.id : submittedCode;
    const aliases=[submittedCode,...(related?[related.id]:[])].filter((v,i,a)=>v&&a.indexOf(v)===i);
    return { id:code, code, aliases, name:String(data.name||related?.data.name||code).trim(), nativeName:String(data.nativeName||related?.data.nativeName||data.name||code).trim(), enabled:data.enabled!==false, sortOrder:Number(data.sortOrder||0), direction:data.rtl===true?'rtl':'ltr', fallback:normalize(data.fallback||'en') };
  }).filter(item=>item.enabled!==false&&LOCALE_RE.test(item.code)).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));
}

async function resolveLocale(db: FirebaseFirestore.Firestore, requested:string){
  const code=normalize(requested); const registry=await buildLanguageRegistry(db);
  const configured=registry.find(item=>item.code===code||item.aliases.includes(code));
  if(configured) return {code:configured.code,language:configured,aliases:configured.aliases};
  const localeSnap=await db.doc(`locales/${code}`).get();
  if(localeSnap.exists){ const data=localeSnap.data()||{}; return {code,language:data,aliases:[code]}; }
  return {code,language:null,aliases:[code]};
}

export default async function handler(req:Request,res:Response){
  try{
    const db=getAdminDb();
    if(req.method==='GET'){
      const requestedLocale=queryValue(req,'locale').trim();
      if(!requestedLocale){
        let items=await buildLanguageRegistry(db);
        if(!items.length){
          const legacy=await db.collection('locales').get();
          items=legacy.docs.map(doc=>{const data=doc.data()||{};const code=normalize(data.code||doc.id);return {id:code,code,aliases:[code],name:String(data.name||code),nativeName:String(data.nativeName||data.name||code),enabled:data.enabled!==false,sortOrder:Number(data.sortOrder||0),direction:data.direction==='rtl'?'rtl':'ltr',fallback:normalize(data.fallback||'en')}}).filter(item=>item.enabled!==false&&LOCALE_RE.test(item.code)).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));
        }
        return res.status(200).json({ok:true,items});
      }
      const requested=cleanLocale(requestedLocale); const resolved=await resolveLocale(db,requested); const locale=resolved.code;
      const [localeSnap,legacyTranslationSnap]=await Promise.all([db.doc(`locales/${locale}`).get(),db.doc(`translations/${locale}`).get()]);
      const metadata=resolved.language&&Object.keys(resolved.language).length?resolved.language:localeSnap.exists?localeSnap.data()||{}:locale==='en'?{code:'en',name:'English',nativeName:'English',enabled:true,direction:'ltr',fallback:'en'}:null;
      if(!metadata||metadata.enabled===false) return res.status(404).json({error:'Locale is not available.'});
      const translations:Record<string,string>={};
      for(const candidate of [...new Set([locale,...resolved.aliases])]){
        const canonicalSnap=await db.collection(`locales/${candidate}/translations`).where('status','==','published').get();
        canonicalSnap.docs.forEach(doc=>{const value=String(doc.data()?.value??'');if(value.trim()&&!translations[doc.id])translations[doc.id]=value;});
        const legacySnap=candidate===locale?legacyTranslationSnap:await db.doc(`translations/${candidate}`).get();
        const values=legacySnap.exists&&legacySnap.data()?.values&&typeof legacySnap.data()?.values==='object'?legacySnap.data()?.values as Record<string,string>:{};
        Object.entries(values).forEach(([key,value])=>{if(!translations[key]&&typeof value==='string'&&value.trim())translations[key]=value;});
      }
      return res.status(200).json({ok:true,locale,requestedLocale:requested,fallback:normalize(metadata.fallback||'en'),direction:String(metadata.direction||(metadata.rtl===true?'rtl':'ltr'))==='rtl'?'rtl':'ltr',version:Number(metadata.version||1),translations});
    }
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed.'});
    const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{}; const action=String(body.action||''); const locale=cleanLocale(body.locale);
    if(action==='bootstrap'){
      const ctx=await authenticateTenant(req); if(!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can manage UI locales.');
      const name=String(body.name||'').trim(); const nativeName=String(body.nativeName||name).trim(); if(!name) throw new Error('Language name is required.');
      const ref=db.doc(`locales/${locale}`); const current=await ref.get();
      await ref.set({code:locale,name,nativeName,enabled:body.enabled!==false,direction:String(body.direction||'ltr')==='rtl'?'rtl':'ltr',fallback:cleanLocale(body.fallback||'en'),version:Number(current.data()?.version||1),updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid},{merge:true});
      return res.status(200).json({ok:true,locale});
    }
    const ctx=await authenticateTenant(req);
    if(action==='list'){ await requirePermission(ctx, 'translations', 'view');
      const requestedNamespace=String(body.namespace||'').trim(); const snap=await db.collection(`locales/${locale}/translations`).get();
      const items=snap.docs.map(doc=>({id:doc.id,...doc.data()})).filter(item=>!requestedNamespace||String(item.namespace||'')===requestedNamespace); return res.status(200).json({ok:true,items});
    }
    if(action==='bulkSave'){ await requirePermission(ctx, 'translations', 'update');
      const values=body.values&&typeof body.values==='object'?body.values as Record<string,unknown>:{}; const status=['draft','review','published'].includes(String(body.status||'draft'))?String(body.status||'draft'):'draft'; const sources=body.sources&&typeof body.sources==='object'?body.sources as Record<string,unknown>:{}; const batch=db.batch();
      Object.entries(values).forEach(([rawKey,rawValue])=>{const key=cleanKey(rawKey);const value=String(rawValue??'');batch.set(db.doc(`locales/${locale}/translations/${key}`),{key,locale,namespace:namespaceOf(key),source:String(sources[key]||''),value,status:value.trim()?status:'draft',version:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid},{merge:true});});
      await batch.commit(); await db.doc(`locales/${locale}`).set({version:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true}); await writeTenantAudit(ctx,'translation.bulkSave',`locales/${locale}`,undefined,{count:Object.keys(values).length}); return res.status(200).json({ok:true,count:Object.keys(values).length});
    }
    const key=cleanKey(body.key); const ref=db.doc(`locales/${locale}/translations/${key}`); const existing=await ref.get();
    if(['save','publish','unpublish'].includes(action)){ await requirePermission(ctx, 'translations', 'update');
      const value=String(body.value??''); if((action==='save'||action==='publish')&&!value.trim()) throw new Error('Translation value cannot be empty.'); const status=action==='publish'?'published':action==='unpublish'?'draft':String(body.status||'draft'); if(!['draft','review','published'].includes(status)) throw new Error('Invalid translation status.');
      await ref.set({key,locale,namespace:namespaceOf(key),source:String(body.source??existing.data()?.source??''),value,status,context:String(body.context||existing.data()?.context||''),translatorNotes:String(body.translatorNotes||existing.data()?.translatorNotes||''),version:Number(existing.data()?.version||0)+1,updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid},{merge:true}); await db.doc(`locales/${locale}`).set({version:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true}); await writeTenantAudit(ctx,`translation.${action}`,`locales/${locale}/translations/${key}`,existing.exists?existing.data():undefined,{key,locale,status}); return res.status(200).json({ok:true,item:{id:key,key,locale,namespace:namespaceOf(key),source:String(body.source??existing.data()?.source??''),value,status}});
    }
    if(action==='delete'){await requirePermission(ctx, 'translations', 'delete');if(!existing.exists)return res.status(404).json({error:'Translation key not found.'});await ref.delete();await writeTenantAudit(ctx,'translation.delete',`locales/${locale}/translations/${key}`,existing.data(),undefined);return res.status(200).json({ok:true,key,locale});}
    return res.status(400).json({error:'Unsupported localization action.'});
  }catch(error){const message=error instanceof Error?error.message:'Localization operation failed.';const status=/Sign in/i.test(message)?401:/permission|Only|membership|available|required/i.test(message)?403:400;return res.status(status).json({error:message});}
}
