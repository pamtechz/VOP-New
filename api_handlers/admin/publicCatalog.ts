/** Public discovery returns only metadata for explicitly published, shareable
 * studies. Lesson bodies, assessment banks and organisation-private content
 * remain behind the authenticated VOP mobile/study API.
 */
import {getAdminDb} from '../../server/tenant.js';

type Request={method?:string};
type Response={status:(code:number)=>Response;json:(data:unknown)=>void;setHeader?:(key:string,value:string)=>void};
type RecordData=Record<string,unknown>;
const string=(value:unknown)=>typeof value==='string'?value.trim():'';
const clip=(value:unknown,length:number)=>string(value).slice(0,length);
const itemId=(value:string)=>/^[A-Za-z0-9_-]{1,120}$/.test(value);
const owner=(row:RecordData)=>string(row.organizationId||row.ownerOrganizationId);
export function isPublicStudy(row:RecordData):boolean{
  return row.published===true&&row.archived!==true&&
    (row.sharingScope==='shared'||(!owner(row)&&
      (!row.sharingScope||row.sharingScope==='public'||row.sharingScope==='platform'));
}
export function publicLessonMetadata(id:string,row:RecordData,guide:RecordData){
  if(!itemId(id)||!isPublicStudy(row))return null;
  // A published course cannot expose an organisation-only lesson.
  // Require its own public-sharing policy and matching ownership.
  if(owner(row)&&owner(row)!==owner(guide))return null;
  return {
    id,title:clip(row.title||row.lessonTitle||row.name,150),
    description:clip(row.description,240),
    lessonNumber:clip(row.lessonNumber||'',25),
    type:row.type==='Test'?'assessment':'lesson',
    estimatedMinutes:Number.isFinite(Number(row.estimatedMinutes))&&Number(row.estimatedMinutes)>0?
      Math.min(240,Math.round(Number(row.estimatedMinutes))):null,
  };
}
export default async function publicCatalog(req:Request,res:Response){
  res.setHeader?.('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed.'});
  try {
    const db=getAdminDb();
    // Server-side filters apply even when Firestore's publication flags or
    // sharing scopes change. Never load unpublished lesson content into output.
    const [guideSnap,programSnap]=await Promise.all([
      db.collection('guides').where('published','==',true).limit(160).get(),
      db.collection('programs').where('published','==',true).limit(100).get(),
    ]);
    const guides=guideSnap.docs.filter(doc=>itemId(doc.id)&&isPublicStudy(doc.data()))
      .slice(0,48);
    const guideRows=await Promise.all(guides.map(async doc=>{
      const row=doc.data() as RecordData;
      const snapshot=await doc.ref.collection('lessons')
        .where('published','==',true).limit(90).get();
      const lessons=snapshot.docs.map(lesson=>
        publicLessonMetadata(lesson.id,lesson.data() as RecordData,row))
        .filter((lesson):lesson is NonNullable<typeof lesson>=>Boolean(lesson&&lesson.title))
        .sort((a,b)=>a.lessonNumber.localeCompare(b.lessonNumber,undefined,{numeric:true})||
          a.title.localeCompare(b.title)).slice(0,75);
      return {
        id:doc.id,title:clip(row.title,160),subtitle:clip(row.subtitle,160),
        description:clip(row.description,600),language:clip(row.language||'en',24),
        discoverNumber:Number.isFinite(Number(row.discoverNumber))?Number(row.discoverNumber):null,
        lessons,
      };
    }));
    const publicGuides=guideRows.filter(guide=>guide.title)
      .sort((a,b)=>(a.discoverNumber??9999)-(b.discoverNumber??9999)||
        a.title.localeCompare(b.title));
    const guideIds=new Set(publicGuides.map(guide=>guide.id));
    const programs=programSnap.docs.filter(doc=>itemId(doc.id)&&isPublicStudy(doc.data()))
      .map(doc=>{
        const row=doc.data() as RecordData;
        return {id:doc.id,title:clip(row.title,160),description:clip(row.description,600),
          guideIds:(Array.isArray(row.guideIds)?row.guideIds:[])
            .filter((id):id is string=>typeof id==='string'&&guideIds.has(id)).slice(0,80)};
      }).filter(program=>program.title)
      .sort((a,b)=>a.title.localeCompare(b.title)).slice(0,40);
    res.setHeader?.('Cache-Control','public, s-maxage=90, stale-while-revalidate=180');
    return res.status(200).json({ok:true,programs,guides:publicGuides});
  }catch{
    res.setHeader?.('Cache-Control','no-store');
    return res.status(503).json({ok:false,error:'The published study catalogue is temporarily unavailable.'});
  }
}
