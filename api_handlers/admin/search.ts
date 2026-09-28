import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { authenticateTenant, accessibleOrganizationIds, organizationInHierarchyScope } from '../../server/tenant.js';
import { canPermission } from '../../server/permissions.js';

type Request = { method?: string; headers?: Record<string,string|string[]|undefined>; query?: Record<string,unknown>; body?: unknown };
type Response = { status:(code:number)=>Response; json:(body:unknown)=>void };
type SearchDoc = QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;
type SearchItem = { type:string; id:string; title:string; description:string; organizationId?:string; actionUrl:string };

function value(req:Request,name:string) {
  const query=req.query && typeof req.query==='object' ? req.query as Record<string,unknown> : {};
  const body=req.body && typeof req.body==='object' ? req.body as Record<string,unknown> : {};
  const raw=query[name] ?? body[name];
  return Array.isArray(raw) ? String(raw[0] ?? '').trim() : String(raw ?? '').trim();
}
function words(text:string) { return text.toLocaleLowerCase().split(/\s+/).filter(Boolean).slice(0,8); }
function haystack(data:Record<string,unknown>) {
  return Object.entries(data)
    .filter(([key,val]) => !['questions','answers','metadata','tokens','password'].includes(key) && ['string','number','boolean'].includes(typeof val))
    .map(([,val])=>String(val)).join(' ').toLocaleLowerCase();
}
function title(data:Record<string,unknown>, fallback:string) {
  return String(data.title || data.name || data.displayName || data.certificateNumber || data.subject || fallback).trim().slice(0,160);
}
function description(data:Record<string,unknown>) {
  return String(data.description || data.summary || data.subtitle || data.body || data.email || '').trim().slice(0,220);
}
async function orgAllowed(ctx:Awaited<ReturnType<typeof authenticateTenant>>, organizationId:string, scoped:string[]) {
  if (ctx.isSuperAdmin) return true;
  if (!organizationId) return true;
  if (ctx.tenantType==='organization') return ctx.organizationId===organizationId;
  if (ctx.tenantType==='hierarchy') return scoped.includes(organizationId) || organizationInHierarchyScope(ctx,organizationId);
  return false;
}
async function candidateDocs(ctx:Awaited<ReturnType<typeof authenticateTenant>>, collectionName:string, scoped:string[], includeShared=true) {
  const source=ctx.db.collection(collectionName);
  const promises: Promise<FirebaseFirestore.QuerySnapshot>[]=[];
  if (ctx.isSuperAdmin && !ctx.organizationId) {
    promises.push(source.limit(800).get());
  } else {
    for (const orgId of scoped.slice(0,30)) promises.push(source.where('organizationId','==',orgId).limit(250).get());
    promises.push(source.where('organizationId','==','').limit(250).get());
    if (includeShared) promises.push(source.where('sharingScope','==','shared').limit(250).get());
  }
  const snapshots=await Promise.all(promises);
  const unique=new Map<string,SearchDoc>();
  snapshots.flatMap(snapshot=>snapshot.docs).forEach(doc=>unique.set(doc.ref.path,doc));
  return [...unique.values()];
}

export default async function handler(req:Request,res:Response) {
  if (req.method!=='GET' && req.method!=='POST') return res.status(405).json({error:'Method not allowed.'});
  try {
    const requestedOrganization=value(req,'organizationId');
    const ctx=await authenticateTenant(req,requestedOrganization || undefined, true);
    const q=value(req,'q');
    if (q.length<2) return res.status(200).json({ok:true,items:[]});
    if (q.length>120) return res.status(400).json({error:'Search query is too long.'});
    const queryWords=words(q);
    const limit=Math.max(1,Math.min(30,Number(value(req,'limit') || 15)));
    const scoped=ctx.isSuperAdmin && !requestedOrganization
      ? []
      : requestedOrganization ? [requestedOrganization]
      : ctx.tenantType==='organization' && ctx.organizationId ? [ctx.organizationId]
      : await accessibleOrganizationIds(ctx);

    const definitions = [
      {type:'user',collection:'users',resource:'users',url:'/admin?section=users',shared:false},
      {type:'guide',collection:'guides',resource:'curriculum',url:'/',shared:true},
      {type:'announcement',collection:'announcements',resource:'announcements',url:'/announcements',shared:true},
      {type:'material',collection:'books',resource:'materials',url:'/resources',shared:true},
      {type:'radio',collection:'radioBroadcasts',resource:'radio',url:'/radio',shared:true},
      {type:'certificate',collection:'certificates',resource:'certificates',url:'/certificates',shared:false},
      {type:'event',collection:'events',resource:'announcements',url:'/events',shared:true},
    ] as const;
    const requestedTypes=new Set((value(req,'types') || definitions.map(d=>d.type).join(',')).split(',').map(v=>v.trim()).filter(Boolean));
    const results:SearchItem[]=[];

    for (const def of definitions) {
      if (!requestedTypes.has(def.type) || !(await canPermission(ctx,def.resource,'view'))) continue;
      const docs=await candidateDocs(ctx,def.collection,scoped,def.shared);
      for (const doc of docs) {
        const data=doc.data() as Record<string,unknown>;
        if (data.archived===true || data.deleted===true || data.status==='archived') continue;
        const organizationId=String(data.organizationId || data.ownerOrganizationId || '').trim();
        const publiclyVisible=data.published===true && (data.sharingScope==='shared' || !organizationId);
        if (!(await orgAllowed(ctx,organizationId,scoped)) && !publiclyVisible) continue;
        const text=haystack(data);
        if (!queryWords.every(word=>text.includes(word))) continue;
        results.push({type:def.type,id:doc.id,title:title(data,doc.id),description:description(data),organizationId:organizationId||undefined,actionUrl:def.url});
        if (results.length>=limit*5) break;
      }
    }

    // Lessons are nested below guides; search only guides already authorized for
    // this tenant and cap reads to avoid an unbounded collection-group scan.
    if (requestedTypes.has('lesson') && await canPermission(ctx,'lessons','view')) {
      const guides=await candidateDocs(ctx,'guides',scoped,true);
      for (const guideDoc of guides.slice(0,40)) {
        const guide=guideDoc.data() as Record<string,unknown>;
        const organizationId=String(guide.organizationId || guide.ownerOrganizationId || '').trim();
        const publicGuide=guide.published===true && guide.sharingScope==='shared';
        if (!(await orgAllowed(ctx,organizationId,scoped)) && !publicGuide) continue;
        const lessons=await guideDoc.ref.collection('lessons').where('published','==',true).limit(120).get();
        for (const lessonDoc of lessons.docs) {
          const data=lessonDoc.data() as Record<string,unknown>;
          if (data.archived===true || data.type==='Test') continue;
          if (!queryWords.every(word=>haystack(data).includes(word))) continue;
          results.push({type:'lesson',id:lessonDoc.id,title:title(data,lessonDoc.id),description:description(data),organizationId:organizationId||undefined,actionUrl:'/'});
          if (results.length>=limit*5) break;
        }
        if (results.length>=limit*5) break;
      }
    }

    const needle=q.toLocaleLowerCase();
    const deduped=[...new Map(results.map(item=>[item.type+':'+item.id,item])).values()];
    deduped.sort((a,b)=>Number(b.title.toLocaleLowerCase().startsWith(needle))-Number(a.title.toLocaleLowerCase().startsWith(needle)) || a.title.localeCompare(b.title));
    return res.status(200).json({ok:true,items:deduped.slice(0,limit)});
  } catch(error) {
    const message=error instanceof Error ? error.message : 'Search failed.';
    return res.status(/sign in|permission|organization|scope|member/i.test(message)?403:400).json({error:message});
  }
}
