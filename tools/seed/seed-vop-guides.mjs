#!/usr/bin/env node
/** Import the supplied Discover translations into the active guide hierarchy.
 * Offline preview is the default. This never scrapes third-party lesson text.
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const idPattern=/^[A-Za-z0-9_-]{1,120}$/;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same=(a,b)=>String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase();
const configurations=[
  {language:'bem',title:'Ukusanga',languageName:'Bemba',nativeName:'Ichibemba',directory:'bemba'},
  {language:'en',title:'Discover',languageName:'English',nativeName:'English',sourceUrl:'https://bibleschools.com/en/courses/1/lessons/1/steps/9'},
  {language:'toi',title:'Kojana',languageName:'Tonga',nativeName:'Chitonga',directory:'tonga'},
];

function requireValue(condition,message){if(!condition)throw new Error(message);}
const organizationOf=data=>data?.scope==='platform'?'':String(data?.organizationId||'');
function sourceUrl(config,number){
  return config.sourceUrl||`https://languages.bibleschools.com/${config.directory}/${config.directory}${String(number).padStart(2,'0')}.htm`;
}

export function validateMaster(master,languages=['bem','toi']){
  requireValue(master?.schemaVersion===2&&Array.isArray(master.lessons),'Expected a schemaVersion 2 source master.');
  const inventory=new Map();
  for(const language of languages){
    const lessons=master.lessons.filter(lesson=>lesson.lang===language);
    requireValue(lessons.length===26,`${language}: expected exactly 26 supplied lessons.`);
    const ids=new Set();
    for(const lesson of lessons){
      requireValue(/^lesson-(?:0[1-9]|1[0-9]|2[0-6])$/.test(lesson.lessonId),`${language}: invalid lesson number.`);
      requireValue(!ids.has(lesson.lessonId),`${language}: duplicate lesson ${lesson.lessonId}.`);
      ids.add(lesson.lessonId);
      requireValue(typeof lesson.title==='string'&&lesson.title.trim()&&lesson.title.length<=240,`${language}/${lesson.lessonId}: missing or oversized title.`);
      requireValue(typeof lesson.attribution==='string'&&lesson.attribution.trim(),`${language}/${lesson.lessonId}: missing original attribution.`);
      requireValue(/^[a-f0-9]{64}$/.test(lesson.source?.sha256),`${language}/${lesson.lessonId}: missing source checksum.`);
      requireValue(!lesson.quiz?.length&&!lesson.questions?.length,`${language}/${lesson.lessonId}: inline assessment banks cannot be imported into public content.`);
      requireValue(Array.isArray(lesson.pages)&&lesson.pages.length>0&&lesson.pages.length<=40,`${language}/${lesson.lessonId}: no valid reading sections.`);
      for(const [index,page] of lesson.pages.entries()){
        requireValue(page.pageNumber===index+1&&typeof page.title==='string'&&page.title.trim()&&page.title.length<=240,`${language}/${lesson.lessonId}: invalid section order or title.`);
        requireValue(Array.isArray(page.blocks)&&page.blocks.length>0&&page.blocks.length<=50,`${language}/${lesson.lessonId}: invalid section blocks.`);
        let textCount=0;
        for(const block of page.blocks){
          if(block.type==='text'){
            requireValue(typeof block.text==='string'&&block.text.trim()&&block.text.length<=8000,'Invalid source text block.');
            textCount++;
          }else{
            requireValue(block.type==='image'&&/^assets\/[A-Za-z0-9_.-]{1,100}\.(?:jpe?g|png|gif|webp)$/i.test(block.src),'Unsafe or unsupported source block.');
            requireValue(typeof block.alt==='string'&&block.alt.length<=300,'Invalid source image alternative text.');
          }
        }
        requireValue(textCount>0,`${language}/${lesson.lessonId}: section contains no reading text.`);
      }
    }
    inventory.set(language,lessons.sort((a,b)=>a.lessonId.localeCompare(b.lessonId)));
  }
  return inventory;
}

export function applySourceOverrides(master,overrides){
  requireValue(overrides?.schemaVersion===2&&Array.isArray(overrides.lessons),'Invalid supplied lesson overrides.');
  const values=new Map();
  for(const lesson of overrides.lessons){
    requireValue(lesson.lang==='bem'&&['lesson-01','lesson-02'].includes(lesson.lessonId),'Only the two supplied Ukusanga lessons can override this import.');
    requireValue(!values.has(lesson.lessonId),'Duplicate supplied lesson override.');
    values.set(lesson.lessonId,lesson);
  }
  const merged={...master,lessons:master.lessons.map(lesson=>lesson.lang==='bem'&&values.has(lesson.lessonId)?values.get(lesson.lessonId):lesson)};
  validateMaster(merged);
  return merged;
}

/** Preserve all supplied paragraphs and deliberate section boundaries. */
export function buildLesson(source,{guideId,origin='https://vopafrica.vercel.app',published=false}){
  requireValue(idPattern.test(guideId),'Invalid guide ID.');
  const parsed=new URL(origin);
  requireValue(parsed.protocol==='https:'&&parsed.origin===origin&&!parsed.username&&!parsed.password&&parsed.hostname!=='localhost','Use an HTTPS site origin with no path or credentials.');
  const config=configurations.find(item=>item.language===source.lang);
  requireValue(config,'Unsupported import language.');
  const prefix=`${source.lang}-${source.lessonId}`;
  const chapterId=`chapter-${prefix}`;
  const sections=source.pages.map((page,index)=>{
    const sectionId=`section-${prefix}-${index+1}`;
    const blocks=page.blocks.map((block,blockIndex)=>({
      id:`block-${prefix}-${index+1}-${blockIndex+1}`,
      ...(block.type==='text'?{type:'paragraph',text:block.text}:{type:'image',src:`${origin}/lessons/${block.src}`}),
    }));
    const document=blocks.map((block,blockIndex)=>({
      id:block.id,type:block.type==='image'?'img':'p',
      ...(block.type==='image'?{url:block.src,...(page.blocks[blockIndex].alt?{alt:page.blocks[blockIndex].alt}:{})}:{}),
      children:[{text:block.type==='image'?'':block.text}],
    }));
    return {id:sectionId,title:page.title,blocks,document};
  });
  const pages=sections.map((section,index)=>({pageNumber:index+1,title:section.title,
    chapterId,chapterTitle:source.title,sectionId:section.id,sectionTitle:section.title,
    blocks:section.blocks,document:section.document}));
  const contentPages=pages.map(({blocks,...page})=>({...page,
    content:blocks.filter(block=>block.type==='paragraph').map(block=>block.text).join('\n\n'),
    imageUrl:blocks.find(block=>block.type==='image')?.src||'',
  }));
  const number=Number(source.lessonId.slice(-2));
  return {
    id:source.lessonId,lessonId:source.lessonId,guideId,language:source.lang,
    lessonNumber:String(number).padStart(2,'0'),title:source.title,type:'Lesson',
    chapters:[{id:chapterId,title:source.title,sections}],pages,contentPages,
    attribution:source.attribution,source:{
      file:String(source.source.file||''),sha256:source.source.sha256,
      ...(Number.isInteger(source.source.reportedLessonNumber)?{reportedLessonNumber:source.source.reportedLessonNumber}:{}),
      url:source.source.url||sourceUrl(config,number),
    },
    canonical:true,published,archived:false,
    seed:{kind:'vop-language-guides-v1',sourceContentHash:hash(source)},
  };
}

/** Existing lesson IDs and progress references always win over proposed IDs. */
export function existingLessonFor(source,existing){
  const number=Number(source.lessonId.slice(-2));
  const matches=existing.filter(item=>item.id===source.lessonId||
    Number(item.data.lessonNumber)===number||same(item.data.title,source.title));
  requireValue(matches.length<=1,`Ambiguous existing lesson ${source.lang}/${source.lessonId}; reconcile duplicates before importing.`);
  if(!matches.length)return null;
  const existingLesson=matches[0];
  requireValue(existingLesson.data.seed?.sourceContentHash===hash(source),
    `Existing lesson ${existingLesson.id} differs or has no verified import fingerprint; it will not be overwritten.`);
  return existingLesson;
}

async function editionFor(app,projectId,databaseId){
  const {access_token:accessToken}=await app.options.credential.getAccessToken();
  const response=await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}`,{
    headers:{Authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(30000),
  });
  requireValue(response.ok,`Cannot verify the target Firestore database (${response.status}). No writes performed.`);
  const database=await response.json();
  requireValue(database.type==='FIRESTORE_NATIVE','This importer requires the existing native Firestore database.');
  // STANDARD is the API default when databaseEdition was not specified.
  const edition=database.databaseEdition||'STANDARD';
  requireValue(edition==='STANDARD','This importer targets the existing Standard database; review Enterprise requirements separately.');
  return edition;
}

export async function planImport(db,inventory,{programId,programTitle,origin,publish,now}){
  const programs=programId?[await db.doc(`programs/${programId}`).get()]:
    (await db.collection('programs').get()).docs.filter(doc=>same(doc.data().title,programTitle)&&doc.data().archived!==true);
  requireValue(programs.length===1&&programs[0].exists,'Choose exactly one existing VOP program with --program-id. No new program will be guessed or created.');
  const program=programs[0];
  const owner=organizationOf(program.data());
  const [guideRegistry,languageRegistry]=await Promise.all([
    db.collection('guides').get(),db.collection('languages').get(),
  ]);
  const existingGuides=guideRegistry.docs;
  const writes=[];
  const guides=[];
  const ids=[...(program.data().guideIds||[])];
  for(const config of configurations){
    if(!inventory.has(config.language))continue;
    const matching=existingGuides.filter(doc=>same(doc.data().title,config.title)&&
      same(doc.data().language,config.language)&&organizationOf(doc.data())===owner);
    requireValue(matching.length<=1,`Multiple ${config.title} guides match; resolve the duplicate guides before importing.`);
    const guideId=matching[0]?.id||`vop-${program.id}-${config.language}`;
    requireValue(idPattern.test(guideId),'The derived guide ID is too long; choose a shorter program ID.');
    const guideRef=db.doc(`guides/${guideId}`);
    const current=matching[0]||await guideRef.get();
    requireValue(!current.exists||matching.length===1,`Unrelated record occupies ${guideRef.path}.`);
    requireValue(!current.data()?.archived,`${config.title} is archived; restore it deliberately before importing.`);
    const published=current.exists?current.data().published===true:publish;
    requireValue(!program.data().published||published,
      `A published VOP program cannot adopt an unpublished ${config.title} guide. Review --publish for the complete supplied translations.`);
    if(program.data().sharingScope==='shared'&&current.exists)
      requireValue(current.data().sharingScope==='shared',`The existing ${config.title} guide is not shared; no visibility changes will be guessed.`);
    const sharingScope=program.data().sharingScope==='shared'?'shared':owner?'organization':'private';
    const languageCodes=config.language==='en'?['en','eng']:[config.language];
    const languages=languageRegistry.docs.filter(doc=>languageCodes.includes(doc.id.toLowerCase())||
      languageCodes.includes(String(doc.data().code||doc.data().languageCode||'').toLowerCase()));
    requireValue(languages.length&&languages.some(doc=>doc.data().enabled!==false),`Enable ${config.language} in the platform language registry before importing.`);
    const lessons=(await guideRef.collection('lessons').get()).docs.map(doc=>({id:doc.id,data:doc.data()}));
    let created=0,reused=0;
    for(const source of inventory.get(config.language)){
      if(existingLessonFor(source,lessons)){reused++;continue;}
      const data={...buildLesson(source,{guideId,origin,published:publish}),
        organizationId:owner,ownerOrganizationId:owner,
        ownerTenantId:current.data()?.ownerTenantId||program.data().ownerTenantId||'',
        ownerUid:current.data()?.ownerUid||program.data().ownerUid||'',
        sharingScope,createdAt:now,updatedAt:now,updatedBy:'system:vop-language-import'};
      requireValue(Buffer.byteLength(JSON.stringify(data))<900000,`Lesson ${source.lessonId} is too large for one Firestore document.`);
      writes.push({path:`guides/${guideId}/lessons/${source.lessonId}`,create:true,data});created++;
    }
    const guideSourceUrl=config.sourceUrl||`https://languages.bibleschools.com/${config.directory}/`;
    if(!current.exists){
      writes.push({path:guideRef.path,create:true,data:{
        id:guideId,title:config.title,language:config.language,curriculumId:'discover',
        discoverNumber:configurations.indexOf(config)+1,description:'',subtitle:config.languageName,
        organizationId:owner,ownerOrganizationId:owner,ownerUid:program.data().ownerUid||'',
        ownerTenantId:program.data().ownerTenantId||'',scope:owner?'organization':'platform',
        canonical:true,sharingScope,published,archived:false,learnerEntryMode:'lessons',
        requiresFinalExam:true,certificateEligible:false,
        sourceUrl:guideSourceUrl,
        createdAt:now,updatedAt:now,updatedBy:'system:vop-language-import',
      }});
    }else if(created){
      writes.push({path:guideRef.path,create:false,updateTime:current.updateTime,
        data:{updatedAt:now,updatedBy:'system:vop-language-import'}});
    }
    if(!ids.includes(guideId))ids.push(guideId);
    guides.push({title:config.title,language:config.language,id:guideId,createdLessons:created,reusedLessons:reused});
  }
  if(JSON.stringify(ids)!==JSON.stringify(program.data().guideIds||[])){
    writes.push({path:program.ref.path,create:false,updateTime:program.updateTime,
      data:{guideIds:ids,updatedAt:now,updatedBy:'system:vop-language-import'}});
  }
  requireValue(ids.length<=100,'The resulting program exceeds the existing guide-reference limit.');
  requireValue(writes.length<400&&Buffer.byteLength(JSON.stringify(writes))<8_000_000,'Import exceeds the bounded atomic batch size.');
  return {programId:program.id,guides,writes};
}

async function main(){
  const args=process.argv.slice(2);
  const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
  const has=name=>args.includes(name);
  let master=JSON.parse(await readFile(resolve(option('--master')||resolve(root,'content/lessons.master.json')),'utf8'));
  const overridePath=resolve(option('--overrides')||resolve(root,'content/ukusanga-supplied-lessons-01-02.json'));
  try{master=applySourceOverrides(master,JSON.parse(await readFile(overridePath,'utf8')));}
  catch(error){if(error.code!=='ENOENT'||option('--overrides'))throw error;}
  const inventory=validateMaster(master);
  const englishPath=option('--english-master');
  if(englishPath){
    requireValue(has('--authorized-english'),'An authorized, user-supplied English master is required; this tool does not scrape copyrighted lesson bodies.');
    const english=JSON.parse(await readFile(resolve(englishPath),'utf8'));
    inventory.set('en',validateMaster(english,['en']).get('en'));
  }
  const origin=option('--site-origin')||'https://vopafrica.vercel.app';
  const summary={mode:'OFFLINE_PREVIEW',guides:configurations.map(config=>({
    title:config.title,language:config.language,lessons:inventory.get(config.language)?.length||0,
    status:inventory.has(config.language)?'ready':'needs_authorized_source',
  })),sections:[...inventory.values()].flat().reduce((sum,item)=>sum+item.pages.length,0),
  sourceWarnings:['Bemba source files 11 and 12 display lesson number 10 internally. Preserve filenames/order 11 and 12 and their original prose.'],
  inlineQuestionsImported:0};
  for(const [language,lessons]of inventory)for(const lesson of lessons)buildLesson(lesson,{guideId:`preview-${language}`,origin});
  if(!has('--connect')&&!has('--apply')){console.log(JSON.stringify(summary,null,2));return;}
  const projectId=option('--project-id');
  requireValue(projectId&&/^[a-z][a-z0-9-]{3,80}$/.test(projectId),'Provide the target --project-id.');
  if(has('--apply'))requireValue(option('--confirm-project')===projectId&&option('--backup-file'),
    '--apply needs a matching --confirm-project and an explicit --backup-file.');
  const [{applicationDefault,cert,initializeApp},{getFirestore}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/firestore')]);
  const configuredProject=process.env.FIREBASE_ADMIN_PROJECT_ID||process.env.FIREBASE_PROJECT_ID;
  if(configuredProject)requireValue(configuredProject===projectId,'The configured Firebase project differs from the requested import target.');
  const configuredEmail=process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const configuredKey=process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  const credential=configuredEmail&&configuredKey?cert({projectId,clientEmail:configuredEmail,privateKey:configuredKey.replace(/\\n/g,'\n')}):applicationDefault();
  const app=initializeApp({projectId,credential});
  const databaseId=option('--database-id')||'(default)';
  const edition=await editionFor(app,projectId,databaseId);
  const db=getFirestore(app,databaseId);
  const now=new Date().toISOString();
  const plan=await planImport(db,inventory,{programId:option('--program-id'),programTitle:option('--program-title')||'VOP',origin,publish:has('--publish'),now});
  const report={...summary,mode:has('--apply')?'APPLY':'LIVE_PREVIEW',projectId,databaseId,edition,
    programId:plan.programId,guides:plan.guides,writes:plan.writes.length};
  console.log(JSON.stringify(report,null,2));
  if(!has('--apply')||!plan.writes.length)return;
  // Snapshot and compare every touched document before one atomic commit.
  const snapshots=await db.getAll(...plan.writes.map(item=>db.doc(item.path)));
  for(const [index,item]of plan.writes.entries()){
    requireValue(!item.create||!snapshots[index].exists,`Concurrent record creation at ${item.path}; retry the preview.`);
    if(!item.create)requireValue(snapshots[index].updateTime.isEqual(item.updateTime),`Concurrent program edit at ${item.path}; retry the preview.`);
  }
  const backup={schema:'vop-guide-import-backup-v1',projectId,databaseId,createdAt:now,report,
    entries:plan.writes.map((item,index)=>({path:item.path,before:snapshots[index].exists?snapshots[index].data():null,
      after:item.data,created:item.create,updateTime:snapshots[index].updateTime?.toDate().toISOString()||null}))};
  await writeFile(resolve(option('--backup-file')),JSON.stringify(backup,null,2),{flag:'wx',mode:0o600});
  const batch=db.batch();
  for(const item of plan.writes){
    if(item.create)batch.create(db.doc(item.path),item.data);
    else batch.update(db.doc(item.path),item.data,{lastUpdateTime:item.updateTime});
  }
  const receipt=db.collection('curriculumImports').doc(hash({projectId,databaseId,now,paths:plan.writes.map(item=>item.path)}));
  batch.create(receipt,{kind:'vop-language-guides-v1',createdAt:now,programId:plan.programId,
    guides:plan.guides,actor:'system:vop-language-import',sourceMasterHash:hash(master),documentCount:plan.writes.length,
    // Preserve the prior parent metadata durably when execution uses an
    // ephemeral approved build environment. New lessons use create-only writes.
    parentBackups:plan.writes.flatMap((item,index)=>item.create?[]:[{path:item.path,before:snapshots[index].data()}]),
  });
  await batch.commit();
  const verification=await db.getAll(...plan.writes.map(item=>db.doc(item.path)));
  requireValue(verification.every((item,index)=>item.exists&&Object.entries(plan.writes[index].data).every(
    ([key,value])=>hash(item.data()[key])===hash(value))),
    'Import committed but exact-field read-back verification failed. Inspect the receipt before retrying.');
  console.log(`Verified ${plan.writes.length} imported or linked documents. Receipt: ${receipt.path}`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
