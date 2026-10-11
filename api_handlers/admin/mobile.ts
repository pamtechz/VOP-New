/** VOP mobile v1. One authenticated, read-only BFF within the existing
 * /api/admin Vercel function. Mutations intentionally use the exact web
 * /api/study/progress, /api/mentorship, /api/share and /api/engagement handlers.
 * Never send private assessment banks, permissions or payment secrets. */
import {authenticateTenant} from '../../server/tenant.js';
import {curriculumPages,containsPublicQuizAnswer} from '../../shared/curriculumStructure.js';
import {normalizeStudyPlateDocument} from '../../shared/studyPlateDocument.js';
import {isSafeHttpsMediaUrl} from '../../shared/mediaSources.js';
import type {QueryDocumentSnapshot,DocumentData} from 'firebase-admin/firestore';

type Request={method?:string;query?:Record<string,string|string[]|undefined>;headers?:Record<string,string|string[]|undefined>};
type Response={status:(code:number)=>Response;json:(body:unknown)=>void;setHeader?:(name:string,value:string)=>void};
type Raw=Record<string,unknown>;
const idPattern=/^[A-Za-z0-9_-]{1,120}$/;
const cleanId=(value:unknown)=>{const id=typeof value==='string'?value.trim():'';if(!idPattern.test(id))throw Error('A valid content ID is required.');return id;};
const param=(req:Request,key:string)=>{const value=req.query?.[key];return Array.isArray(value)?value[0]||'':value||'';};
const string=(value:unknown)=>typeof value==='string'?value.trim():'';
const publicImage=(value:unknown)=>{const url=string(value);return isSafeHttpsMediaUrl(url)?url:'';};
const hasAccess=(item:Raw,scope:{organizationId:string;isSuperAdmin:boolean},ownerFallback='')=>{
  const owner=string(item.organizationId||item.ownerOrganizationId)||ownerFallback;
  return item.published===true&&item.archived!==true&&(
    scope.isSuperAdmin||
    (item.sharingScope==='shared')||
    Boolean(scope.organizationId&&owner===scope.organizationId)||
    (!owner&&item.sharingScope!=='private')
  );
};
const plainGuide=(id:string,row:Raw)=>({
  id,title:string(row.title),subtitle:string(row.subtitle),description:string(row.description),
  language:string(row.language),image:publicImage(row.image||row.featuredImage||row.coverImageUrl),
  discoverNumber:Number(row.discoverNumber)||0,
  organizationId:string(row.organizationId||row.ownerOrganizationId),
  sharingScope:string(row.sharingScope),learnerEntryMode:row.learnerEntryMode==='sections'?'sections':'lessons',
  certificateEligible:row.certificateEligible===true,requiresFinalExam:row.requiresFinalExam===true,
});
const plainProgram=(id:string,row:Raw)=>({
  id,title:string(row.title),description:string(row.description),
  coverImageUrl:publicImage(row.coverImageUrl),
  guideIds:Array.isArray(row.guideIds)?row.guideIds.filter(v=>typeof v==='string'&&idPattern.test(v)).slice(0,100):[],
  entryMode:row.entryMode==='sections'?'sections':'lessons',
  organizationId:string(row.organizationId||row.ownerOrganizationId),
});
const plainLesson=(id:string,row:Raw)=>({
  id,title:string(row.title||row.lessonTitle||row.name),description:string(row.description),
  lessonNumber:string(row.lessonNumber||id),type:row.type==='Test'?'Test':'Lesson',
  estimatedMinutes:Number.isFinite(Number(row.estimatedMinutes))?Number(row.estimatedMinutes):15,
  assessmentKind:string(row.assessmentKind),sourceQuizId:string(row.sourceQuizId),
  // Questions and correct answers MUST only be returned by the existing
  // session-based study/progress startQuiz action, never in catalogue records.
});
const simplePage=(page:Raw,index:number)=>{
  if(containsPublicQuizAnswer(page))throw Error('A study page contains restricted assessment material.');
  const rawDocument=Array.isArray(page.document)?page.document:null;
  const document=rawDocument?normalizeStudyPlateDocument(rawDocument):null;
  const rawBlocks=Array.isArray(page.blocks)?page.blocks:[];
  const blocks=rawBlocks.filter(b=>b&&typeof b==='object')
    .map(b=>b as Raw).filter(b=>['paragraph','heading','quote','image','video','audio'].includes(string(b.type)))
    .slice(0,150).map(b=>({id:string(b.id),type:string(b.type),
      text:string(b.text),src:publicImage(b.src)}));
  return {
    pageNumber:index+1,title:string(page.title||page.sectionTitle),
    chapterId:string(page.chapterId),chapterTitle:string(page.chapterTitle),
    sectionId:string(page.sectionId),content:string(page.content),
    imageUrl:publicImage(page.imageUrl),blocks,document,
  };
};
const lessonPages=(row:Raw)=>{
  if(row.type==='Test')return [];
  if(Array.isArray(row.chapters)&&row.chapters.length){
    const pages=curriculumPages(row.chapters as Parameters<typeof curriculumPages>[0]);
    return pages.slice(0,200).map((page,index)=>simplePage(page as unknown as Raw,index));
  }
  return (Array.isArray(row.contentPages)?row.contentPages:[])
    .slice(0,200).map((page,index)=>simplePage(page as Raw,index));
};
const unique=(results:Array<Array<QueryDocumentSnapshot<DocumentData>>>)=>{
  const found=new Map<string,QueryDocumentSnapshot<DocumentData>>();
  for(const items of results)for(const doc of items)found.set(doc.ref.path,doc);
  return [...found.values()];
};
function errorStatus(error:unknown){
  const message=error instanceof Error?error.message:'The mobile service is unavailable.';
  if(/sign in|token|unauthoriz/i.test(message))return 401;
  if(/membership|organization|cannot access|permission|outside your/i.test(message))return 403;
  if(/valid content ID|unsupported|invalid|required/.test(message))return 400;
  return 503;
}
export default async function mobile(req:Request,res:Response){
  res.setHeader?.('Cache-Control','private, no-store, max-age=0');
  res.setHeader?.('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED',error:'Use GET for read-only mobile endpoints.'});
  const resource=param(req,'resource');
  if(!['bootstrap','catalog','guide','lesson','progress','announcements','resources','events','radio'].includes(resource))
    return res.status(404).json({ok:false,code:'NOT_FOUND',error:'Unknown mobile API resource.'});
  try{
    const ctx=await authenticateTenant(req,undefined,true);
    const scope={organizationId:ctx.organizationId,isSuperAdmin:ctx.isSuperAdmin};
    const db=ctx.db;
    const uid=ctx.auth.uid;
    if(resource==='bootstrap'){
      const organization=scope.organizationId?await db.doc('organizations/'+scope.organizationId).get():null;
      return res.status(200).json({ok:true,version:1,
        account:{uid,displayName:string(ctx.profile.displayName||ctx.profile.name||ctx.auth.name),
          email:string(ctx.auth.email),role:string(ctx.profile.role||'student'),
          organizationId:scope.organizationId,
          organizationName:string(organization?.data()?.name||organization?.data()?.title),
          studyLanguage:string(ctx.profile.studyLanguage||ctx.profile.preferredLanguage||'en'),
          uiLocale:string(ctx.profile.uiLocale||'en')},
        capabilities:{
          progress:'/api/study/progress',
          mentoring:'/api/mentorship',engagement:'/api/engagement',
          enrollment:'/api/share',payments:'/api/payments',
          quizzes:'/api/study/progress',
        }});
    }
    if(resource==='progress'){
      const progress=ctx.profile.progress&&typeof ctx.profile.progress==='object'?
        ctx.profile.progress as Raw:{};
      return res.status(200).json({ok:true,
        completedLessons:Array.isArray(progress.completedLessons)?
          progress.completedLessons.filter(v=>typeof v==='string').slice(0,3000):[],
        lessonResume:progress.lessonResume&&typeof progress.lessonResume==='object'?
          progress.lessonResume:{},
        // Assessment marks are intentionally not read from private banks.
      });
    }
    if(resource==='catalog'){
      const guidesRef=db.collection('guides');
      const programsRef=db.collection('programs');
      const tasks=[
        guidesRef.where('published','==',true).where('sharingScope','==','shared').limit(100).get(),
        guidesRef.where('published','==',true).where('organizationId','==','').limit(100).get(),
        ...(scope.organizationId?[
          guidesRef.where('organizationId','==',scope.organizationId).limit(100).get(),
          guidesRef.where('ownerOrganizationId','==',scope.organizationId).limit(100).get(),
        ]:[]),
      ];
      const programTasks=[
        programsRef.where('published','==',true).where('sharingScope','==','shared').limit(60).get(),
        ...(scope.organizationId?[programsRef.where('organizationId','==',scope.organizationId).limit(60).get()]:[]),
      ];
      const [guideSets,programSets]=await Promise.all([
        Promise.all(tasks),Promise.all(programTasks),
      ]);
      const guides=unique(guideSets.map(set=>set.docs))
        .filter(doc=>hasAccess(doc.data(),scope)).map(doc=>plainGuide(doc.id,doc.data()));
      const programs=unique(programSets.map(set=>set.docs))
        .filter(doc=>hasAccess(doc.data(),scope)).map(doc=>plainProgram(doc.id,doc.data()));
      guides.sort((a,b)=>a.discoverNumber-b.discoverNumber||a.title.localeCompare(b.title));
      programs.sort((a,b)=>a.title.localeCompare(b.title));
      return res.status(200).json({ok:true,guides,programs});
    }
    if(resource==='announcements'){
      const ref=db.collection('announcements');
      const [shared,own]=await Promise.all([
        ref.where('published','==',true).where('sharingScope','==','shared').limit(30).get(),
        scope.organizationId?ref.where('organizationId','==',scope.organizationId).limit(30).get():Promise.resolve(null),
      ]);
      const rows=unique([shared.docs,own?.docs||[]]).filter(doc=>hasAccess(doc.data(),scope))
        .map(doc=>({id:doc.id,title:string(doc.data().title),body:string(doc.data().content||doc.data().description),
          imageUrl:publicImage(doc.data().imageUrl)})).slice(0,30);
      return res.status(200).json({ok:true,items:rows});
    }
    if(['resources','events','radio'].includes(resource)){
      const collections=resource==='resources'
        ?['books']:resource==='events'?['events']:['radioBroadcasts','playlists'];
      const fetchScoped=async(collectionName:string)=>{
        const ref=db.collection(collectionName);
        const [shared,global,tenant]=await Promise.all([
          ref.where('published','==',true).where('sharingScope','==','shared').limit(80).get(),
          ref.where('published','==',true).where('organizationId','==','').limit(80).get(),
          scope.organizationId?ref.where('organizationId','==',scope.organizationId).limit(80).get():Promise.resolve(null),
        ]);
        return unique([shared.docs,global.docs,tenant?.docs||[]])
          .filter(doc=>hasAccess(doc.data(),scope));
      };
      const scoped=await Promise.all(collections.map(fetchScoped));
      if(resource==='resources'){
        const items=scoped[0].map(doc=>{
          const data=doc.data();
          return {id:doc.id,name:string(data.name),category:string(data.category),
            author:string(data.author),description:string(data.description),
            imageUrl:publicImage(data.imageUrl),url:publicImage(data.url||data.downloadUrl)};
        }).filter(item=>item.name);
        return res.status(200).json({ok:true,items});
      }
      if(resource==='events'){
        const items=scoped[0].map(doc=>{
          const data=doc.data();
          return {id:doc.id,title:string(data.title),description:string(data.description),
            startAt:string(data.startAt),endAt:string(data.endAt),
            location:string(data.location),imageUrl:publicImage(data.imageUrl)};
        }).filter(item=>item.title);
        items.sort((a,b)=>a.startAt.localeCompare(b.startAt));
        return res.status(200).json({ok:true,items});
      }
      const items=scoped[0].map(doc=>{
        const data=doc.data();
        return {id:doc.id,title:string(data.title),speaker:string(data.speaker),
          series:string(data.series),description:string(data.description),
          mediaType:string(data.mediaType),posterUrl:publicImage(data.posterUrl),
          audioUrl:publicImage(data.audioUrl),videoUrl:publicImage(data.videoUrl),
          streamUrl:publicImage(data.streamUrl)};
      }).filter(item=>item.title);
      const playlists=scoped[1].map(doc=>{
        const data=doc.data();
        return {id:doc.id,name:string(data.name),description:string(data.description),
          itemIds:Array.isArray(data.itemIds)
            ?data.itemIds.filter((id:unknown)=>typeof id==='string'&&idPattern.test(id)).slice(0,100):[]};
      }).filter(item=>item.name);
      return res.status(200).json({ok:true,items,playlists});
    }
    const guideId=cleanId(param(req,'guideId'));
    const guideSnap=await db.doc('guides/'+guideId).get();
    if(!guideSnap.exists||!hasAccess(guideSnap.data()||{},scope))
      return res.status(404).json({ok:false,code:'NOT_FOUND',error:'Published course not found or not available.'});
    const guide=guideSnap.data()||{};
    if(resource==='guide'){
      const snap=await guideSnap.ref.collection('lessons').where('published','==',true).limit(120).get();
      const lessons=snap.docs.filter(doc=>{
        const row=doc.data();
        return hasAccess(row,scope,string(guide.organizationId||guide.ownerOrganizationId));
      }).map(doc=>plainLesson(doc.id,doc.data()))
        .sort((a,b)=>a.lessonNumber.localeCompare(b.lessonNumber,undefined,{numeric:true}));
      return res.status(200).json({ok:true,guide:plainGuide(guideId,guide),lessons});
    }
    const lessonId=cleanId(param(req,'lessonId'));
    const snap=await guideSnap.ref.collection('lessons').doc(lessonId).get();
    if(!snap.exists||!hasAccess(snap.data()||{},scope,string(guide.organizationId||guide.ownerOrganizationId)))
      return res.status(404).json({ok:false,code:'NOT_FOUND',error:'Published lesson not found or not available.'});
    const lesson=snap.data()||{};
    return res.status(200).json({ok:true,guide:plainGuide(guideId,guide),
      lesson:{...plainLesson(lessonId,lesson),pages:lessonPages(lesson)}});
  }catch(error){
    const code=errorStatus(error);
    // Avoid echoing internal Firestore paths or stack traces to mobile clients.
    const message=code>=500?'The mobile service is temporarily unavailable.':
      error instanceof Error?error.message:'The request could not be completed.';
    return res.status(code).json({ok:false,code:code===401?'UNAUTHENTICATED':code===403?'FORBIDDEN':code===400?'INVALID_REQUEST':'UNAVAILABLE',error:message});
  }
}
