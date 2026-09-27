import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { authenticateTenant, accessibleOrganizationIds, organizationInHierarchyScope } from '../../server/tenant.js';
import { canPermission } from '../../server/permissions.js';

type Request={method?:string;headers?:Record<string,string|string[]|undefined>;query?:Record<string,unknown>;body?:unknown};
type Response={status:(code:number)=>Response;json:(body:unknown)=>void};

function admin(){
  if(getApps().length)return getApps()[0];
  const projectId=process.env.FIREBASE_ADMIN_PROJECT_ID||process.env.FIREBASE_PROJECT_ID;
  const clientEmail=process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey=process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n');
  if(!projectId||!clientEmail||!privateKey)throw new Error('Firebase Admin server configuration is missing.');
  return initializeApp({credential:cert({projectId,clientEmail,privateKey})});
}
function header(req:Request,name:string){const value=req.headers?.[name]??req.headers?.[name.toLowerCase()];return Array.isArray(value)?value[0]??'':value??'';}
function q(req:Request,name:string){const query=req.query&&typeof req.query==='object'?req.query as Record<string,unknown>:{};const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};return String((query[name]??body[name])??'').trim();}
function tokens(value:string){return value.toLowerCase().split(/\s+/).filter(Boolean).slice(0,8);}
function haystack(data:Record<string,unknown>){return Object.values(data).filter(value=>['string','number','boolean'].includes(typeof value)).map(String).join(' ').toLowerCase();}
function scopeOf(data:Record<string,unknown>){return String(data.scope||data.sharingScope||'organization').toLowerCase();}
function hierarchyNodeId(ctx:Awaited<ReturnType<typeof authenticateTenant>>){return String(ctx.tenantId||'').split(':').slice(1).join(':')||String(ctx.profile.adminNodeId||'').trim();}
async function accessible(ctx:Awaited<ReturnType<typeof authenticateTenant>>,data:Record<string,unknown>,orgIds:string[]|null){
  if(ctx.isSuperAdmin)return true;
  const scope=scopeOf(data);
  if(scope==='platform')return data.published===true||data.public===true||data.visibility==='public'||data.status==='published';
  const organizationId=String(data.organizationId||data.ownerOrganizationId||'').trim();
  if(scope==='organization')return !!organizationId&&!!orgIds&&orgIds.includes(organizationId);
  if(scope==='hierarchy'){
    const nodeId=hierarchyNodeId(ctx);
    const resourceHierarchyId=String(data.hierarchyId||data.tenantId||data.ownerTenantId||'').trim();
    if(ctx.tenantType==='hierarchy'&&(resourceHierarchyId===nodeId||resourceHierarchyId===ctx.tenantId))return true;
    return !!organizationId&&await organizationInHierarchyScope(ctx,organizationId);
  }
  return false;
}
async function candidateDocs(db:ReturnType<typeof getFirestore>,collection:string,ctx:Awaited<ReturnType<typeof authenticateTenant>>,orgIds:string[]|null){
  const refs:Promise<{docs:QueryDocumentSnapshot[]} >[]=[];
  const source=db.collection(collection);
  refs.push(source.where('scope','==','platform').limit(500).get());
  if(ctx.tenantType==='hierarchy'){
    const nodeId=hierarchyNodeId(ctx);
    if(nodeId)refs.push(source.where('hierarchyId','==',nodeId).limit(500).get());
    if(ctx.tenantId)refs.push(source.where('tenantId','==',ctx.tenantId).limit(500).get());
  }
  for(const id of (orgIds||[]).slice(0,20))refs.push(source.where('organizationId','==',id).limit(500).get());
  if(ctx.isSuperAdmin&&!orgIds)refs.push(source.limit(1000).get());
  const snapshots=await Promise.all(refs);const map=new Map<string,QueryDocumentSnapshot>();
  snapshots.flatMap(s=>s.docs).forEach(doc=>map.set(doc.id,doc));
  return [...map.values()];
}

export default async function handler(req:Request,res:Response){
  if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
  try{
    const requestedOrg=q(req,'organizationId');
    const ctx=await authenticateTenant(req,requestedOrg||undefined);
    const query=q(req,'q');
    const types=q(req,'types');
    const limit=Math.max(1,Math.min(50,Number(q(req,'limit')||20)));
    if(query.length<2)return res.status(200).json({ok:true,items:[]});
    const words=tokens(query);const db=getFirestore(admin());
    const orgIds=ctx.isSuperAdmin&&!requestedOrg?null:requestedOrg?[requestedOrg]:ctx.tenantType==='organization'&&ctx.organizationId?[ctx.organizationId]:await accessibleOrganizationIds(ctx);
    const definitions=[
      {type:'user',collection:'users',resource:'users'},
      {type:'guide',collection:'guides',resource:'curriculum'},
      {type:'lesson',collection:'lessons',resource:'lessons'},
      {type:'announcement',collection:'announcements',resource:'announcements'},
      {type:'material',collection:'books',resource:'materials'},
      {type:'radio',collection:'radioBroadcasts',resource:'radio'},
      {type:'certificate',collection:'certificates',resource:'certificates'},
    ] as const;
    const requestedTypes=new Set(types?types.split(',').map(x=>x.trim()).filter(Boolean):definitions.map(x=>x.type));
    const candidates:Array<{type:string;id:string;title:string;description:string;scope:string;organizationId?:string}>=[];
    for(const def of definitions){
      if(!requestedTypes.has(def.type)||!canPermission(ctx,def.resource,'view'))continue;
      const docs=await candidateDocs(db,def.collection,ctx,orgIds);
      for(const doc of docs){
        const data=doc.data() as Record<string,unknown>;
        if(data.archived===true||data.deleted===true||data.status==='archived')continue;
        if(!await accessible(ctx,data,orgIds))continue;
        const text=haystack(data);if(!words.every(word=>text.includes(word)))continue;
        const organizationId=String(data.organizationId||data.ownerOrganizationId||'').trim()||undefined;
        candidates.push({type:def.type,id:doc.id,title:String(data.title||data.displayName||data.certificateNumber||data.name||doc.id),description:String(data.description||data.summary||data.subtitle||data.body||'').slice(0,240),scope:scopeOf(data),organizationId});
        if(candidates.length>=limit*4)break;
      }
    }
    const needle=query.toLowerCase();
    candidates.sort((a,b)=>Number(b.title.toLowerCase().startsWith(needle))-Number(a.title.toLowerCase().startsWith(needle))||a.title.localeCompare(b.title));
    return res.status(200).json({ok:true,items:candidates.slice(0,limit)});
  }catch(error){const message=error instanceof Error?error.message:'Search failed.';return res.status(message.includes('permission')||message.includes('organization')?403:400).json({error:message});}
}
