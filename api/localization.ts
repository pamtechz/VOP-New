import { saveLocaleTranslations, translationKey } from '../server/localization.js';
import { isEnglishLocale, localeAliases } from '../shared/locales.js';
import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, getAdminDb, requireOrgRole, writeTenantAudit } from '../server/tenant.js';
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
    const bearer=req.headers?.authorization || req.headers?.Authorization;
    const viewer=typeof bearer==='string'&&bearer.startsWith('Bearer ')
      ? await authenticateTenant(req) : null;
    const viewerOrganizationId=viewer?.organizationId || '';
    if(req.method==='GET'){
      const requestedLocale=queryValue(req,'locale').trim();
      if(!requestedLocale){
        const items=await buildLanguageRegistry(db);
        if(viewerOrganizationId){
          const tenant=await db.collection('organizations/'+viewerOrganizationId+'/languages').get();
          const known=new Set(items.map(item=>item.code));
          tenant.docs.forEach(doc=>{
            const data=doc.data();
            const code=normalize(data.code || doc.id);
            if(known.has(code)||data.enabled===false||!LOCALE_RE.test(code))return;
            items.push({id:code,code,aliases:localeAliases(code,data.aliases),
              name:String(data.name||code),nativeName:String(data.nativeName||data.name||code),
              enabled:true,sortOrder:Number(data.sortOrder||0),direction:data.rtl===true?'rtl':'ltr',
              fallback:'en'});
          });
          items.sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));
        }
        return res.status(200).json({ok:true,items});
      }
      const requested=cleanLocale(requestedLocale); const resolved=await resolveLocale(db,requested); const locale=resolved.code;
      const localeSnap=await db.doc(`locales/${locale}`).get();
      const tenantLanguage=viewerOrganizationId
        ? await db.doc(`organizations/${viewerOrganizationId}/languages/${locale}`).get()
        : null;
      const metadata=resolved.language|| (tenantLanguage?.exists?tenantLanguage.data()||{}:null)
        || (localeSnap.exists?localeSnap.data()||{}:null);
      if(!metadata||metadata.enabled===false) return res.status(404).json({error:'Locale is not available. Select a language configured by an administrator.'});
      const translations:Record<string,string>={};
      const canonicalSnap=await db.collection(`locales/${locale}/translations`).get();
      const canonicalKeys = new Set(canonicalSnap.docs.map(doc => doc.id));
      canonicalSnap.docs.forEach(doc=>{const data=doc.data();const value=String(data?.value??'');if(data.status==='published'&&value.trim())translations[doc.id]=value;});
      // Legacy aggregate is read only as a compatibility fallback for the same canonical code.
      const legacy=await db.doc(`translations/${locale}`).get();
      const values=legacy.exists&&legacy.data()?.values&&typeof legacy.data()?.values==='object'?legacy.data()?.values as Record<string,string>:{};
      Object.entries(values).forEach(([key,value])=>{if(!canonicalKeys.has(key)&&typeof value==='string'&&value.trim())translations[key]=value;});
      if(viewerOrganizationId && (resolved.language || tenantLanguage?.exists)){
        const tenantTranslations=await db.collection(`organizations/${viewerOrganizationId}/locales/${locale}/translations`).get();
        tenantTranslations.docs.forEach(doc=>{
          const entry=doc.data();const value=String(entry.value||'');
          if(entry.status==='published'&&value.trim())translations[doc.id]=value;
        });
      }
      return res.status(200).json({ok:true,locale,requestedLocale:requested,fallback:normalize(metadata.fallback||''),direction:String(metadata.direction||(metadata.rtl===true?'rtl':'ltr'))==='rtl'?'rtl':'ltr',version:Number(metadata.version||1),translations});
    }
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed.'});
    const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};
    const action=normalize(body.action); const locale=(await resolveLocale(db,cleanLocale(body.locale))).code;
    if (action.startsWith('tenant')) {
      const ctx=await authenticateTenant(req, typeof body.organizationId==='string'?body.organizationId:undefined);
      const organizationId=ctx.organizationId;
      if(!organizationId || ctx.tenantType!=='organization')
        throw new Error('An active organization is required for tenant translation management.');
      const base=`organizations/${organizationId}/locales/${locale}/translations`;
      if(action==='tenantlist'){
        await requirePermission(ctx,'translations','view');
        const snap=await db.collection(base).get();
        return res.status(200).json({ok:true,items:snap.docs.map(doc=>({
          id:doc.id,...doc.data(),canEdit:ctx.isSuperAdmin || doc.data().ownerUid===ctx.auth.uid,
        }))});
      }
      requireOrgRole(ctx,['owner','admin','editor']);
      if(isEnglishLocale(locale))throw new Error('English is the source language. Select another language to translate into.');
      const [globalLanguage,tenantLanguage]=await Promise.all([
        db.doc('languages/'+locale).get(),
        db.doc(`organizations/${organizationId}/languages/${locale}`).get(),
      ]);
      if((!globalLanguage.exists||globalLanguage.data()?.enabled===false)
        && (!tenantLanguage.exists||tenantLanguage.data()?.enabled===false))
        throw new Error('Choose a language configured for this organization.');
      const key=cleanKey(body.key);
      const ref=db.doc(base+'/'+key);
      if(action==='tenantsave'){
        await requirePermission(ctx,'translations','update');
        const value=String(body.value??'').trim();
        const status=body.status==='draft'?'draft':'published';
        if(!value || value.length>12000)throw new Error('A translation value is required (maximum 12,000 characters).');
        await db.runTransaction(async transaction=>{
          const existing=await transaction.get(ref);
          if(existing.exists && !ctx.isSuperAdmin && existing.data()?.ownerUid!==ctx.auth.uid)
            throw new Error('Only the contributor or Super Admin may edit this organization translation.');
          transaction.set(ref,{
            key,locale,namespace:namespaceOf(key),value,status,
            ownerUid:existing.data()?.ownerUid || ctx.auth.uid,ownerOrganizationId:organizationId,
            organizationId,scope:'organization',sharingScope:'organization',platformOwned:false,
            updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid,
            createdAt:existing.data()?.createdAt || FieldValue.serverTimestamp(),
          },{merge:true});
        });
        await writeTenantAudit(ctx,'tenant.translation.save',ref.path,undefined,{locale,key,status});
        return res.status(200).json({ok:true,item:{key,locale,status}});
      }
      if(action==='tenantdelete'){
        await requirePermission(ctx,'translations','update');
        await db.runTransaction(async transaction=>{
          const existing=await transaction.get(ref);
          if(!existing.exists)throw new Error('Translation key not found.');
          if(!ctx.isSuperAdmin && existing.data()?.ownerUid!==ctx.auth.uid)
            throw new Error('Only the contributor or Super Admin may delete this translation.');
          if(existing.data()?.platformOwned===true)
            throw new Error('Platform-stewarded translations cannot be deleted.');
          transaction.delete(ref);
        });
        await writeTenantAudit(ctx,'tenant.translation.delete',ref.path,undefined,{locale,key});
        return res.status(200).json({ok:true,key,locale});
      }
      throw new Error('Unsupported organization translation action.');
    }
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