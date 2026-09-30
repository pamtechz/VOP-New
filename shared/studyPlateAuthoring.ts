import type { CurriculumSection } from './curriculumStructure.js';
import {
  legacyBlocksToPlate,
  normalizeStudyPlateDocument,
  studyPlateLegacyBlocks,
  type StudyPlateDocument,
  type StudyPlateLeaf,
  type StudyPlateNode,
} from './studyPlateDocument.js';

/**
 * Authoring-only chapter document.
 *
 * Section markers are deliberately NOT part of the learner-readable Plate
 * schema. They are editor boundaries that split one continuous chapter
 * document into canonical CurriculumSection records. The content block after a
 * marker remains a normal Plate block with its original stable ID, so marking
 * a paragraph as the start of a section never destroys block-level quiz
 * anchors.
 */
export type StudyPlateSectionMarker = {
  type:'section_page';
  id:string;
  title:string;
  children:[StudyPlateLeaf];
};

export type StudyPlateAuthoringNode = StudyPlateNode | StudyPlateSectionMarker;
export type StudyPlateAuthoringDocument = StudyPlateAuthoringNode[];

const idPattern=/^[A-Za-z0-9_-]{1,120}$/;

const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;

export const isStudyPlateSectionMarker=(value:unknown):value is StudyPlateSectionMarker=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  return (value as {type?:unknown}).type==='section_page';
};

export function createStudyPlateSectionMarker(id:string,title:string):StudyPlateSectionMarker{
  const normalizedId=String(id||'').trim();
  const normalizedTitle=String(title||'').trim();
  if(!idPattern.test(normalizedId))throw new Error('Section markers need a stable identifier.');
  if(!normalizedTitle||normalizedTitle.length>240)
    throw new Error('Section titles are required and may contain at most 240 characters.');
  return {type:'section_page',id:normalizedId,title:normalizedTitle,children:[{text:''}]};
}

export function curriculumSectionsToAuthoringDocument(
  sections:ReadonlyArray<CurriculumSection>,
):StudyPlateAuthoringDocument{
  if(!sections.length)throw new Error('A chapter needs at least one section.');
  return sections.flatMap(section=>{
    const document=section.document
      ?clone(section.document)
      :legacyBlocksToPlate(section.blocks);
    return [createStudyPlateSectionMarker(section.id,section.title),...document];
  });
}

export function authoringDocumentToCurriculumSections(
  raw:unknown,
):CurriculumSection[]{
  if(!Array.isArray(raw)||!raw.length)
    throw new Error('A chapter document cannot be empty.');
  if(!isStudyPlateSectionMarker(raw[0]))
    throw new Error('A chapter must begin with a section boundary. Undo the deletion or add a section.');

  const sections:CurriculumSection[]=[];
  const markerIds=new Set<string>();
  const allIds=new Set<string>();
  let current:StudyPlateSectionMarker|null=null;
  let blocks:unknown[]=[];

  const flush=()=>{
    if(!current)return;
    if(!blocks.length)
      throw new Error('Section “'+current.title+'” needs at least one content block.');
    const document=normalizeStudyPlateDocument(blocks);
    for(const block of document){
      const blockId=String(block.id||'');
      if(allIds.has(blockId))
        throw new Error('Study blocks need unique stable identifiers across the chapter.');
      allIds.add(blockId);
    }
    sections.push({
      id:current.id,
      title:current.title,
      document,
      blocks:studyPlateLegacyBlocks(document),
    });
    blocks=[];
  };

  for(const item of raw){
    if(isStudyPlateSectionMarker(item)){
      flush();
      if(sections.length>=40)
        throw new Error('A chapter supports at most 40 learner sections/pages.');
      const marker=createStudyPlateSectionMarker(item.id,item.title);
      if(markerIds.has(marker.id)||allIds.has(marker.id))
        throw new Error('Section boundaries need unique stable identifiers.');
      markerIds.add(marker.id);
      allIds.add(marker.id);
      current=marker;
      continue;
    }
    if(!current)
      throw new Error('Content must belong to a section boundary.');
    blocks.push(item);
  }
  flush();
  if(!sections.length)throw new Error('A chapter needs at least one section.');
  return sections;
}

export function sectionForAuthoringIndex(
  value:ReadonlyArray<StudyPlateAuthoringNode>,
  index:number,
):StudyPlateSectionMarker|null{
  const bounded=Math.min(Math.max(index,0),Math.max(0,value.length-1));
  for(let cursor=bounded;cursor>=0;cursor--){
    const node=value[cursor];
    if(isStudyPlateSectionMarker(node))return node;
  }
  return null;
}

export function sectionBlockCount(
  value:ReadonlyArray<StudyPlateAuthoringNode>,
  sectionId:string,
):number{
  const start=value.findIndex(node=>isStudyPlateSectionMarker(node)&&node.id===sectionId);
  if(start<0)return 0;
  let count=0;
  for(let index=start+1;index<value.length;index++){
    if(isStudyPlateSectionMarker(value[index]))break;
    count++;
  }
  return count;
}
