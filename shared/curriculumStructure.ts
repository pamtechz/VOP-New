import { isSafeHttpsMediaUrl, resolveMediaSource } from './mediaSources.js';
import { normalizeStudyPlateDocument, studyPlateLegacyBlocks, studyPlatePlainText, type StudyPlateDocument } from './studyPlateDocument.js';

/**
 * Published content hierarchy:
 *   Guide -> Lesson -> Chapter -> Section -> Block
 * Assessments are separate private Quiz Library records; no answer keys or
 * quiz questions are accepted or stored inside these learner-readable nodes.
 */
export type CurriculumBlockType = 'paragraph' | 'heading' | 'quote' | 'image' | 'video' | 'audio';
export type CurriculumBlock = { id:string; type:CurriculumBlockType; text?:string; src?:string };
export type CurriculumSection = {
  id:string; title:string; blocks:CurriculumBlock[]; document?:StudyPlateDocument;
  scriptureQuote?:{reference:string;text:string}; keyTakeaway?:string;
  imageUrl?:string; audioUrl?:string; videoUrl?:string;
};
export type CurriculumChapter = { id:string; title:string; sections:CurriculumSection[] };
export type CurriculumPage = {
  pageNumber:number; title:string; chapterId:string; chapterTitle:string;
  sectionId:string; sectionTitle:string; content:string; imageUrl?:string;
  audioUrl?:string; videoUrl?:string; scriptureQuote?:{reference:string;text:string};
  keyTakeaway?:string; blocks:CurriculumBlock[];document?:StudyPlateDocument;
};

const allowed=new Set<CurriculumBlockType>(['paragraph','heading','quote','image','video','audio']);
const idPattern=/^[A-Za-z0-9_-]{1,120}$/;
const record=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)
  ?value as Record<string,unknown>:null;

function validId(value:unknown, kind:string, seen:Set<string>) {
  const id=String(value||'').trim();
  if(!idPattern.test(id)||seen.has(id))throw new Error(`Invalid or duplicate ${kind} identifier.`);
  seen.add(id);return id;
}

function validTitle(value:unknown, kind:string) {
  const title=String(value||'').trim();
  if(!title||title.length>240)throw new Error(`${kind} title is required (max 240 characters).`);
  return title;
}

function validSrc(value:unknown, kind:'image'|'video'|'audio') {
  const text=String(value||'').trim();
  if(!text||text.length>2048)throw new Error(`A ${kind} block needs a valid media URL.`);
  if (!isSafeHttpsMediaUrl(text)) {
    throw new Error('Media blocks require safe public HTTPS URLs without credentials or local network destinations.');
  }
  return text;
}

function optionalSectionMedia(value:unknown,kind:'image'|'audio'|'video'):string|undefined {
  const url=String(value??'').trim();
  if(!url)return undefined;
  if(url.length>2048 || !isSafeHttpsMediaUrl(url))
    throw new Error('Section media requires a safe public HTTPS URL.');
  if(kind==='image')return url;
  const source=resolveMediaSource(url);
  if(!source || source.kind==='external' ||
    (kind==='audio'&&source.kind==='direct-video') ||
    (kind==='video'&&source.kind==='direct-audio'))
    throw new Error('Section media must be an approved public HTTPS embed or direct media file.');
  return source.originalUrl;
}

/** Enforce strict bounds and whitelist fields. No arbitrary HTML, answer keys,
 * private media or unlimited arrays enter the published lesson document. */
export function normalizeCurriculumStructure(value:unknown):CurriculumChapter[] {
  if(!Array.isArray(value)||!value.length||value.length>40)throw new Error('Add 1–40 chapters before publishing a structured lesson.');
  const seen=new Set<string>();let blockTotal=0;
  return value.map((chapterRaw,chapterIndex)=>{
    const chapter=record(chapterRaw);
    if(!chapter)throw new Error('Invalid chapter '+(chapterIndex+1)+'.');
    const id=validId(chapter.id,'chapter',seen);
    const title=validTitle(chapter.title,'Chapter');
    if(!Array.isArray(chapter.sections)||!chapter.sections.length||chapter.sections.length>40)throw new Error('Every chapter needs 1–40 sections.');
    const sections=chapter.sections.map((sectionRaw:unknown,sectionIndex:number)=>{
      const section=record(sectionRaw);
      if(!section)throw new Error('Invalid section '+(sectionIndex+1)+'.');
      const id=validId(section.id,'section',seen);
      const title=validTitle(section.title,'Section');
      const document=section.document===undefined?undefined:normalizeStudyPlateDocument(section.document);
      const blockInput=document?studyPlateLegacyBlocks(document):section.blocks;
      if(!Array.isArray(blockInput)||!blockInput.length||blockInput.length>50)
        throw new Error('Every section needs 1–50 content blocks.');
      const blocks=blockInput.map((blockRaw:unknown)=>{
        const block=record(blockRaw);
        if(!block||!allowed.has(block.type as CurriculumBlockType))throw new Error('Unsupported lesson block type.');
        if(++blockTotal>600)throw new Error('A lesson supports at most 600 blocks.');
        const id=validId(block.id,'block',seen);
        const type=block.type as CurriculumBlockType;
        if(type==='image'||type==='video'||type==='audio')return {id,type,src:validSrc(block.src,type)};
        const text=String(block.text??'').trim();
        if(text.length>8000)throw new Error('Text blocks may contain at most 8000 characters.');
        return {id,type,text};
      });
      const rawScripture=section.scriptureQuote===undefined?undefined:record(section.scriptureQuote);
      if(section.scriptureQuote!==undefined&&!rawScripture)
        throw new Error('Scripture focus must contain a reference and passage text.');
      const reference=String(rawScripture?.reference??'').trim();
      const passage=String(rawScripture?.text??'').trim();
      if(reference.length>160||passage.length>4000||
          (reference.length>0&&passage.length===0))
        throw new Error('Scripture focus requires valid passage text and a short reference.');
      const keyTakeaway=String(section.keyTakeaway??'').trim();
      if(keyTakeaway.length>2000)throw new Error('Section takeaway exceeds 2000 characters.');
      const imageUrl=optionalSectionMedia(section.imageUrl,'image');
      const audioUrl=optionalSectionMedia(section.audioUrl,'audio');
      const videoUrl=optionalSectionMedia(section.videoUrl,'video');
      return {id,title,blocks,...(document?{document}:{}),
        ...(passage?{scriptureQuote:{reference,text:passage}}:{}),
        ...(keyTakeaway?{keyTakeaway}:{}),
        ...(imageUrl?{imageUrl}:{}),
        ...(audioUrl?{audioUrl}:{}),
        ...(videoUrl?{videoUrl}:{})};
    });
    return {id,title,sections};
  });
}

/** Flatten chapters into existing reader-compatible pages without discarding
 * hierarchy or forcing old flat lessons into the new schema. */
export function curriculumPages(chapters:CurriculumChapter[]):CurriculumPage[] {
  const pages:CurriculumPage[]=[];
  chapters.forEach(chapter=>chapter.sections.forEach(section=>{
    const content=section.document
      ? studyPlatePlainText(section.document)
      : [chapter.title,section.title,
        ...section.blocks.filter(block=>['paragraph','heading','quote'].includes(block.type)).map(block=>block.text||''),
      ].filter(Boolean).join('\n\n');
    pages.push({
      pageNumber:pages.length+1,
      title:section.title,chapterId:chapter.id,chapterTitle:chapter.title,
      sectionId:section.id,sectionTitle:section.title,content,
      imageUrl:section.imageUrl||section.blocks.find(block=>block.type==='image')?.src||'',
      ...(section.audioUrl?{audioUrl:section.audioUrl}:{}),
      ...(section.videoUrl?{videoUrl:section.videoUrl}:{}),
      ...(section.scriptureQuote?{scriptureQuote:section.scriptureQuote}:{}),
      ...(section.keyTakeaway?{keyTakeaway:section.keyTakeaway}:{}),
      blocks:section.blocks,...(section.document?{document:section.document}:{}),
    });
  }));
  return pages;
}

/** Ensure a quiz references a real chapter/section/block of its parent lesson. */
export function curriculumAnchorExists(chapters:unknown,type:'chapter'|'section'|'block',id:string):boolean {
  if(!idPattern.test(id)||!Array.isArray(chapters))return false;
  for(const chapter of chapters){
    if(!chapter||typeof chapter!=='object')continue;
    if(type==='chapter'&&chapter.id===id)return true;
    if(!Array.isArray(chapter.sections))continue;
    for(const section of chapter.sections){
      if(!section||typeof section!=='object')continue;
      if(type==='section'&&section.id===id)return true;
      if(type==='block'&&Array.isArray(section.blocks)&&section.blocks.some(
        (block:unknown)=>block&&typeof block==='object'&&(block as {id?:unknown}).id===id
      ))return true;
    }
  }
  return false;
}

/** New guides must finish with a real private-bank final examination.
 * Existing guides that predate the flag keep their established policy. */
export function hasRequiredFinalExam(
  guide: {requiresFinalExam?:unknown},
  records: readonly Record<string,unknown>[],
):boolean {
  if(guide.requiresFinalExam!==true)return true;
  return records.some(item=>item.type==='Test'
    && item.published===true && item.archived!==true
    && item.attachmentType==='guide' && item.assessmentKind==='final_exam'
    && item.answerVisibility==='public_redacted'
    && typeof item.sourceQuizId==='string' && idPattern.test(item.sourceQuizId)
    && Array.isArray(item.questions) && item.questions.length>0);
}

/** Detect legacy answer-bearing question objects anywhere in author-supplied
 * public lesson fields. Reject new writes rather than embedding a key in a
 * learner-readable page, text block or metadata object. */
export function containsPublicQuizAnswer(value:unknown,depth=0):boolean {
  if(depth>24||value===null||typeof value!=='object')return false;
  if(Array.isArray(value))return value.some(item=>containsPublicQuizAnswer(item,depth+1));
  const row=value as Record<string,unknown>;
  const questionLike=Object.prototype.hasOwnProperty.call(row,'question')||Object.prototype.hasOwnProperty.call(row,'prompt')
    ||Object.prototype.hasOwnProperty.call(row,'options');
  if(questionLike&&(Object.prototype.hasOwnProperty.call(row,'correctOptionIndex')||Object.prototype.hasOwnProperty.call(row,'answer')
    ||Object.prototype.hasOwnProperty.call(row,'explanation')))return true;
  return Object.values(row).some(item=>containsPublicQuizAnswer(item,depth+1));
}
