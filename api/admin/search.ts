import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { authenticateTenant, accessibleOrganizationIds, organizationInHierarchyScope } from '../../server/tenant.js';
import { requirePermission } from '../../server/permissions.js';

type Request = { method?: string; headers?: Record<string,string|string[]|undefined>; query?: Record<string,unknown>; body?: unknown };
type Response = { status:(code:number)=>Response; json:(body:unknown)=>void };

function firebaseAdmin() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Firebase Admin server configuration is missing.');
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function header(req:Request,name:string) {
  const value=req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
function q(req:Request,name:string) {
  const query=req.query && typeof req.query==='object' ? req.query : {};
  const body=req.body && typeof req.body==='object' ? req.body as Record<string,unknown> : {};
  const queryValue=(query as Record<string,unknown>)[name];
  const bodyValue=body[name];
  return String(queryValue ?? bodyValue ?? '').trim();
}
function tokens(value:string) { return value.toLowerCase().split(/\s+/).filter(Boolean).slice(0,8); }
function haystack(data:Record<string,unknown>) {
  return Object.values(data).filter(value=>typeof value==='string'||typeof value==='number'||typeof value==='boolean')
    .map(value=>String(value)).join(' ').toLowerCase();
}
function serialize(doc:QueryDocumentSnapshot) {
  const data=doc.data() as Record<string,unknown>;
  return { id:doc.id, ...data };
}
function scopedOrgIds(ctx:Awaited<ReturnType<typeof authenticateTenant>>, requested:string) {
  if (ctx.isSuperAdmin && !requested) return null;
  if (requested) return [requested];
  if (ctx.tenantType==='organization' && ctx.organizationId) return [ctx.organizationId];
  return accessibleOrganizationIds(ctx);
}

export default async function handler(req:Request,res:Response) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({error:'Method not allowed.'});
  try {
    const requestedOrg=q(req,'organizationId');
    const ctx=await authenticateTenant(req, requestedOrg || undefined);
    await requirePermission(ctx,'dashboard','view');
    const query=q(req,'q');
    const types=q(req,'types');
    const limit=Math.max(1,Math.min(50,Number(q(req,'limit')||20)));
    if (query.length<2) return res.status(200).json({ok:true,items:[]});
    const words=tokens(query);
    const db=getFirestore(firebaseAdmin());
    const orgIds=scopedOrgIds(ctx,requestedOrg);
    const candidates:Array<{type:string; id:string; title:string; description:string; scope:string; organizationId?:string; url?:string}>=[];
    const definitions=[
      {type:'user',collection:'users',resource:'users',fields:['displayName','email','userCode','organizationName']},
      {type:'guide',collection:'guides',resource:'curriculum',fields:['title','subtitle','description','language']},
      {type:'lesson',collection:'lessons',resource:'lessons',fields:['title','description','lessonNumber','language']},
      {type:'announcement',collection:'announcements',resource:'announcements',fields:['title','body','summary']},
      {type:'material',collection:'books',resource:'materials',fields:['title','description','author','language']},
      {type:'radio',collection:'radioBroadcasts',resource:'radio',fields:['title','description','station','category']},
      {type:'certificate',collection:'certificates',resource:'certificates',fields:['certificateNumber','recipientName','programme','organizationName']},
    ] as const;
    const requestedTypes=new Set(types ? types.split(',').map(x=>x.trim()).filter(Boolean) : definitions.map(x=>x.type));
    for (const def of definitions) {
      if (!requestedTypes.has(def.type)) continue;
      if (!(await import('../../server/permissions.js')).canPermission(ctx, def.resource as never,'view')) continue;
      let snapshot;
      if (def.collection==='users') {
        if (ctx.isSuperAdmin && !requestedOrg) snapshot=await db.collection('users').limit(1000).get();
        else {
          const ids=orgIds ?? [];
          const snaps=await Promise.all(ids.slice(0,10).map(id=>db.collection('users').where('organizationId','==',id).limit(500).get()));
          const map=new Map<string,QueryDocumentSnapshot>();
          snaps.flatMap(s=>s.docs).forEach(d=>map.set(d.id,d));
          snapshot={docs:[...map.values()]} as unknown as {docs:QueryDocumentSnapshot[]};
        }
      } else {
        const collection=db.collection(def.collection);
        snapshot=orgIds ? await Promise.race([
          Promise.all(orgIds.slice(0,10).map(id=>collection.where('organizationId','==',id).limit(300).get())).then(snaps=>({docs:snaps.flatMap(s=>s.docs)})),
          new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('query timeout')),5000))
        ]) : await collection.limit(1000).get();
      }
      for (const doc of snapshot.docs) {
        const data=doc.data() as Record<string,unknown>;
        if (data.archived===true || data.status==='archived' || data.deleted===true) continue;
        if (def.collection!=='users' && orgIds && !orgIds.includes(String(data.organizationId||'')) && String(data.organizationId||'')!=='') continue;
        if (def.collection!=='users' && !ctx.isSuperAdmin && String(data.scope||'')==='platform') continue;
        const text=haystack(data);
        if (!words.every(word=>text.includes(word))) continue;
        const organizationId=String(data.organizationId||'').trim() || undefined;
        const title=String(data.title||data.displayName||data.certificateNumber||data.name||doc.id);
        const description=String(data.description||data.summary||data.subtitle||data.body||'').slice(0,240);
        candidates.push({type:def.type,id:doc.id,title,description,scope:String(data.scope||data.sharingScope||'organization'),organizationId});
        if (candidates.length>=limit*4) break;
      }
    }
    candidates.sort((a,b)=>Number(b.title.toLowerCase().startsWith(query.toLowerCase()))-Number(a.title.toLowerCase().startsWith(query.toLowerCase())) || a.title.localeCompare(b.title));
    return res.status(200).json({ok:true,items:candidates.slice(0,limit)});
  } catch(error) {
    const message=error instanceof Error?error.message:'Search failed.';
    return res.status(message.includes('permission')?403:400).json({error:message});
  }
}
