import { saveLocaleTranslations, translationKey } from '../server/localization.js';
import { localeAliases } from '../shared/locales.js';
import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, getAdminDb, writeTenantAudit } from '../server/tenant.js';
import { requirePermission } from '../server/permissions.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status:(code:number)=>Response; json:(body:unknown)=>void };
const LOCALE_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();
function cleanLocale(value: unknown) { const locale=normalize(value); if(!LOCALE_RE.test(locale)) throw new Error('A valid locale code is required.'); return locale; }
const cleanKey = translationKey;
function namespaceOf(key:string){ return key.split('.')[0]; }
function queryValue(req:Request,name:string){ const value=req.query?.[name]; return Array.isArray(value)?value[0]||'':value||''; }

async function buildLanguageRegistry(db: FirebaseFirestore.Firestore) {
  const snap=await db.collection('languages').get();
  return snap.docs.map(doc=>{
    const data=doc.data()||{};
    const code=normalize(data.code||data.languageCode||doc.id);
    return {
      id:code,
      code,
      aliases:localeAliases(code, data.aliases),
      name:String(data.name||code).trim(),
      nativeName:String(data.nativeName||data.name||code).trim(),
      enabled:data.enabled!==false,
      sortOrder:Number(data.sortOrder||0),
      direction:data.rtl===true?'rtl':'ltr',
      fallback:normalize(data.fallback||''),
    };
  }).filter(item=>item.enabled&&LOCALE_RE.test(item.code)).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));
}

async function resolveLocale(db: FirebaseFirestore.Firestore, requested:string){
  const code=cleanLocale(requested); const registry=await buildLanguageRegistry(db);
  const configured=registry.find(item=>item.code===code) || registry.find(item=>item.aliases.includes(code));
  if(configured) return {code:configured.code,language:configured,aliases:configured.aliases};
  return {code,language:null,aliases:[code]};
}

export default async function handler(req:Request,res:Response){
  try{
    const db=getAdminDb();
    if(req.method==='GET'){
      const requestedLocale=queryValue(req,'locale').trim();
      if(!requestedLocale){
        const items=await buildLanguageRegistry(db);
        return res.status(200).json({ok:true,items});
      }
      const requested=cleanLocale(requestedLocale); const resolved=await resolveLocale(db,requested); const locale=resolved.code;
      const localeSnap=await db.doc(`locales/${locale}`).get();
      const metadata=resolved.language|| (localeSnap.exists?localeSnap.data()||{}:null);
      if(!metadata||metadata.enabled===false) return res.status(404).json({error:'Locale is not available. Select a language configured by an administrator.'});
      const translations:Record<string,string>={};
      const canonicalSnap=await db.collection(`locales/${locale}/translations`).get();
      const canonicalKeys = new Set(canonicalSnap.docs.map(doc => doc.id));
      canonicalSnap.docs.forEach(doc=>{const data=doc.data();const value=String(data?.value??'');if(data.status==='published'&&value.trim())translations[doc.id]=value;});
      // Legacy aggregate is read only as a compatibility fallback for the same canonical code.
      const legacy=await db.doc(`translations/${locale}`).get();
      const values=legacy.exists&&legacy.data()?.values&&typeof legacy.data()?.values==='object'?legacy.data()?.values as Record<string,string>:{};
      Object.entries(values).forEach(([key,value])=>{if(!canonicalKeys.has(key)&&typeof value==='string'&&value.trim())translations[key]=value;});
      return res.status(200).json({ok:true,locale,requestedLocale:requested,fallback:normalize(metadata.fallback||''),direction:String(metadata.direction||(metadata.rtl===true?'rtl':'ltr'))==='rtl'?'rtl':'ltr',version:Number(metadata.version||1),translations});
    }
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed.'});
    const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};
    const action=normalize(body.action); const locale=(await resolveLocale(db,cleanLocale(body.locale))).code;
    // All canonical locales and their translations are platform assets. A
    // tenant permission grants proposal submission, never platform writes.
    const ctx=await authenticateTenant(req);
    if (action !== 'list' && !ctx.isSuperAdmin) throw new Error('Only VOP Super Admin may modify system locales and translations. Submit a translation proposal for review.');
    if(action==='bootstrap'){
      await requirePermission(ctx,'translations','update');
      const name=String(body.name||'').trim(); const nativeName=String(body.nativeName||name).trim(); if(!name) throw new Error('Language name is required.');
      const ref=db.doc(`locales/${locale}`); const current=await ref.get();
      await ref.set({code:locale,name,nativeName,enabled:body.enabled!==false,direction:String(body.direction||'ltr')==='rtl'?'rtl':'ltr',fallback:body.fallback?cleanLocale(body.fallback):'',version:Number(current.data()?.version||1),updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid},{merge:true});
      return res.status(200).json({ok:true,locale});
    }
    if(action==='list'){ await requirePermission(ctx,'translations','view'); const requestedNamespace=String(body.namespace||'').trim(); const snap=await db.collection(`locales/${locale}/translations`).get(); const items=snap.docs.map(doc=>({id:doc.id,...doc.data()})).filter(item=>!requestedNamespace||String(item.namespace||'')===requestedNamespace); return res.status(200).json({ok:true,items}); }
    if(action==='bulksave'){
      await requirePermission(ctx,'translations','update');
      const values=body.values&&typeof body.values==='object'?body.values as Record<string,unknown>:{};
      const sources=body.sources&&typeof body.sources==='object'?body.sources as Record<string,unknown>:{};
      const status=String(body.status||'published');
      if(!['draft','review','published'].includes(status))throw new Error('Invalid translation status.');
      const count=await saveLocaleTranslations(ctx,locale,values,sources,status);
      await writeTenantAudit(ctx,'translation.bulkSave',`locales/${locale}`,undefined,{count});
      return res.status(200).json({ok:true,count});
    }
    const key=cleanKey(body.key); const ref=db.doc(`locales/${locale}/translations/${key}`); const existing=await ref.get();
    if(['save','publish','unpublish','delete'].includes(action)){
      await requirePermission(ctx,'translations',action==='delete'?'delete':'update');
      if(action==='delete'&&!existing.exists)return res.status(404).json({error:'Translation key not found.'});
      const value=String(body.value??existing.data()?.value??'');
      if((action==='save'||action==='publish')&&!value.trim())throw new Error('Translation value cannot be empty.');
      const status=action==='delete'?'deleted':action==='publish'?'published':action==='unpublish'?'draft':String(body.status||'draft');
      if(action==='save'&&!['draft','review','published'].includes(status))throw new Error('Invalid translation status.');
      await saveLocaleTranslations(ctx,locale,{[key]:value},{[key]:body.source??existing.data()?.source??''},status);
      await writeTenantAudit(ctx,`translation.${action}`,`locales/${locale}/translations/${key}`,undefined,{key,locale,status});
      return res.status(200).json({ok:true,item:{id:key,key,locale,namespace:namespaceOf(key),value,status}});
    }
    return res.status(400).json({error:'Unsupported localization action.'});
  }catch(error){ const message=error instanceof Error?error.message:'Localization operation failed.'; const status=/sign in/i.test(message)?401:/permission|Only|membership|forbidden/i.test(message)?403:/not found|available/i.test(message)?404:400; return res.status(status).json({error:message}); }
}