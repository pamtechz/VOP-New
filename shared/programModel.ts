import {isSafeHttpsMediaUrl} from './mediaSources.js';

export type ProgramEntryMode='lessons'|'sections';
export type CurriculumProgramDraft={
  title:string;
  description:string;
  coverImageUrl:string;
  entryMode:ProgramEntryMode;
  guideIds:string[];
  sharingScope:'private'|'organization'|'shared';
  certificateEligible:boolean;
  certificateDocumentType:string;
  certificateTypeName:string;
  published:boolean;
  archived:boolean;
};
const idPattern=/^[A-Za-z0-9_-]{1,120}$/;
export function normalizeProgramDraft(value:unknown):CurriculumProgramDraft{
  const data=value&&typeof value==='object'&&!Array.isArray(value)
    ?value as Record<string,unknown>:{};
  const title=String(data.title||'').trim();
  const description=String(data.description||'').trim();
  const coverImageUrl=String(data.coverImageUrl||'').trim();
  if(!title||title.length>160)throw new Error('Program title must contain 1–160 characters.');
  if(description.length>5000)throw new Error('Program description cannot exceed 5,000 characters.');
  if(coverImageUrl&&!isSafeHttpsMediaUrl(coverImageUrl))
    throw new Error('Program cover image must use a safe public HTTPS URL.');
  if(data.guideIds!==undefined && (!Array.isArray(data.guideIds) || data.guideIds.length>100))
    throw new Error('Programs support at most 100 ordered guides.');
  const guideIds:Array<string>=(Array.isArray(data.guideIds)?data.guideIds:[]).map(item=>{
    if(typeof item!=='string'||!idPattern.test(item))
      throw new Error('Each guide assignment needs a valid identifier.');
    return item;
  });
  if(new Set(guideIds).size!==guideIds.length)
    throw new Error('The same guide cannot appear twice in a program.');
  if(data.entryMode!==undefined&&!['lessons','sections'].includes(String(data.entryMode)))
    throw new Error('Select lessons or sections for program navigation.');
  if(data.sharingScope!==undefined&&!['private','organization','shared'].includes(String(data.sharingScope)))
    throw new Error('Select a valid program sharing scope.');
  return {
    title,description,coverImageUrl,
    entryMode:data.entryMode==='sections'?'sections':'lessons',
    guideIds,
    sharingScope:data.sharingScope==='shared'?'shared':data.sharingScope==='private'?'private':'organization',
    certificateEligible:data.certificateEligible===true,
    certificateDocumentType:String(data.certificateDocumentType||'program').trim().slice(0,80)||'program',
    certificateTypeName:String(data.certificateTypeName||'').trim().slice(0,160),
    published:data.published===true,
    archived:data.archived===true,
  };
}
