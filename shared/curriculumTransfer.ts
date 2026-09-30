import { randomUUID } from 'node:crypto';
import {
  normalizeCurriculumStructure,
  type CurriculumChapter,
  type CurriculumSection,
  type CurriculumBlock,
} from './curriculumStructure.ts';
import {studyPlateLegacyBlocks, type StudyPlateDocument} from './studyPlateDocument.js';

export type TransferKind = 'chapter' | 'section' | 'block';
export type TransferMode = 'move' | 'copy';
export type TransferResult = {
  source: CurriculumChapter[];
  destination: CurriculumChapter[];
  movedAnchorIds: string[];
};

const freshId=(kind:string)=>kind+'-'+randomUUID().replace(/-/g,'');
const duplicateSectionContent=(section:CurriculumSection):CurriculumSection=>{
  if(section.document){
    const document:StudyPlateDocument=section.document.map(node=>({
      ...node,id:freshId('block'),children:structuredClone(node.children),
    }));
    return {...section,id:freshId('section'),document,blocks:studyPlateLegacyBlocks(document)};
  }
  return {...section,id:freshId('section'),
    blocks:section.blocks.map(block=>({...block,id:freshId('block')}))};
};

/** Changes only draft study content. The API separately validates ownership,
 * permissions, existing quiz attachments and Firestore transaction freshness. */
export function transferCurriculumNode(
  sourceInput: unknown,
  destinationInput: unknown,
  kind: TransferKind,
  anchorId: string,
  destinationParentId: string,
  mode: TransferMode,
): TransferResult {
  if (!['chapter','section','block'].includes(kind) || !['move','copy'].includes(mode)) {
    throw new Error('Select a chapter, section or block and a move or copy operation.');
  }
  const source = normalizeCurriculumStructure(sourceInput);
  const destination = normalizeCurriculumStructure(destinationInput);
  // A chapter can be copied or transferred only between distinct draft
  // lessons. Its section/block IDs are preserved on move for stable anchors,
  // and regenerated on copy so quizzes never attach to a copied chapter.
  if (kind === 'chapter') {
    const origin = source.find(chapter => chapter.id === anchorId);
    if (!origin) throw new Error('The source chapter is no longer available.');
    if (destination.length >= 40) throw new Error('A lesson supports at most 40 chapters.');
    if (mode === 'move' && source.length <= 1) {
      throw new Error('Add another chapter before moving the last chapter.');
    }
    const movedAnchorIds = [
      origin.id,...origin.sections.flatMap(section => [
        section.id,...section.blocks.map(block => block.id),
      ]),
    ];
    const copy:CurriculumChapter = mode === 'move' ? origin : {
      ...origin,id:freshId('chapter'),
      sections:origin.sections.map(duplicateSectionContent),
    };
    return {
      source:normalizeCurriculumStructure(mode === 'move'
        ? source.filter(chapter => chapter.id !== anchorId) : source),
      destination:normalizeCurriculumStructure([...destination,copy]),
      movedAnchorIds,
    };
  }
  const originChapter = source.find(chapter => chapter.sections.some(section =>
    kind === 'section' ? section.id === anchorId : section.blocks.some(block => block.id === anchorId)));
  const originSection = originChapter?.sections.find(section =>
    kind === 'section' ? section.id === anchorId : section.blocks.some(block => block.id === anchorId));
  if (!originChapter || !originSection) throw new Error('The source section or block is no longer available.');
  const destinationChapter = destination.find(chapter =>
    kind === 'section' ? chapter.id === destinationParentId
      : chapter.sections.some(section => section.id === destinationParentId));
  const destinationSection = kind === 'block'
    ? destinationChapter?.sections.find(section => section.id === destinationParentId)
    : undefined;
  if (!destinationChapter || (kind === 'block' && !destinationSection)) {
    throw new Error('The selected destination no longer exists.');
  }
  if (kind === 'section' && destinationChapter.sections.length >= 40) throw new Error('A chapter supports at most 40 sections.');
  if (kind === 'block' && destinationSection!.blocks.length >= 50) throw new Error('A section supports at most 50 blocks.');
  if (mode === 'move' && kind === 'section' && originChapter.sections.length <= 1) {
    throw new Error('Add another section to the source chapter before moving its last section.');
  }
  if (mode === 'move' && kind === 'block' && originSection.blocks.length <= 1) {
    throw new Error('Add another block to the source section before moving its last block.');
  }
  const movedAnchorIds: string[] = [];
  if (kind === 'section') {
    movedAnchorIds.push(originSection.id, ...originSection.blocks.map(block => block.id));
    const copy: CurriculumSection = mode === 'copy'
      ? duplicateSectionContent(originSection):originSection;
    if (mode === 'move') originChapter.sections=originChapter.sections.filter(section=>section.id!==anchorId);
    destinationChapter.sections.push(copy);
  } else {
    const originBlock=originSection.blocks.find(block=>block.id===anchorId);
    if (!originBlock) throw new Error('The source block no longer exists.');
    movedAnchorIds.push(originBlock.id);
    const destinationSectionValue=destinationSection!;
    const hasRichSource=Boolean(originSection.document);
    if(hasRichSource!==Boolean(destinationSectionValue.document)){
      throw new Error('Both sections must use the same document format before transferring individual blocks.');
    }
    const copy:CurriculumBlock = {...originBlock,
      id:mode === 'copy' ? freshId('block') : originBlock.id};
    if(hasRichSource){
      const existingNode=originSection.document!.find(node=>node.id===anchorId);
      if(!existingNode)throw new Error('The source Plate block is unavailable.');
      const node={...existingNode,id:copy.id,
        children:structuredClone(existingNode.children)};
      if(mode==='move'){
        originSection.document=originSection.document!.filter(item=>item.id!==anchorId);
        originSection.blocks=studyPlateLegacyBlocks(originSection.document);
      }
      destinationSectionValue.document=[...destinationSectionValue.document!,node];
      destinationSectionValue.blocks=studyPlateLegacyBlocks(destinationSectionValue.document);
    }else{
      if(mode==='move')originSection.blocks=originSection.blocks.filter(block=>block.id!==anchorId);
      destinationSectionValue.blocks.push(copy);
    }
  }
  // Revalidate both complete trees. This also enforces unique IDs, media
  // constraints, content bounds and the 600-block aggregate limit.
  return {
    source:normalizeCurriculumStructure(source),
    destination:normalizeCurriculumStructure(destination),
    movedAnchorIds,
  };
}
