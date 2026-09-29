import type { CurriculumBlock, CurriculumChapter, CurriculumSection } from './curriculumStructure.js';

/** An authoring-only structural edit. Quizzes live in a separate private bank:
 * copying content never copies quiz attachments or grades. */
export type StructureTransfer = {
  kind: 'section' | 'block';
  itemId: string;
  targetChapterId: string;
  targetSectionId?: string;
  copy: boolean;
};

const freshId = (prefix: string): string =>
  prefix + '-' + Math.random().toString(36).slice(2, 12);

function clone(chapters: CurriculumChapter[]): CurriculumChapter[] {
  return chapters.map(chapter => ({
    ...chapter, sections: chapter.sections.map(section => ({
      ...section, blocks: section.blocks.map(block => ({ ...block })),
    })),
  }));
}
function ids(chapters: CurriculumChapter[]) {
  return new Set(chapters.flatMap(chapter => [chapter.id,
    ...chapter.sections.flatMap(section => [section.id, ...section.blocks.map(block => block.id)])]));
}
function findSection(chapters: CurriculumChapter[], sectionId: string) {
  for (const chapter of chapters) {
    const index = chapter.sections.findIndex(section => section.id === sectionId);
    if (index >= 0) return { chapter, index, section: chapter.sections[index] };
  }
  throw new Error('The source section no longer exists.');
}
function findBlock(chapters: CurriculumChapter[], blockId: string) {
  for (const chapter of chapters) for (const section of chapter.sections) {
    const index = section.blocks.findIndex(block => block.id === blockId);
    if (index >= 0) return { chapter, section, index, block: section.blocks[index] };
  }
  throw new Error('The source block no longer exists.');
}
function uniqueId(prefix: string, taken: Set<string>, createId: (prefix:string)=>string) {
  for (let tries = 0; tries < 16; tries++) {
    const result = createId(prefix);
    if (/^[A-Za-z0-9_-]{1,120}$/.test(result) && !taken.has(result)) {
      taken.add(result);
      return result;
    }
  }
  throw new Error('Could not generate a unique content identifier.');
}

/** All quiz anchors belonging to the selected item, including descendants. */
export function transferAnchorIds(chapters: CurriculumChapter[], kind: StructureTransfer['kind'], itemId: string): string[] {
  if (kind === 'block') return [findBlock(chapters, itemId).block.id];
  const section = findSection(chapters, itemId).section;
  return [section.id, ...section.blocks.map(block => block.id)];
}

/** Move or duplicate a section/block, either within a lesson or between lessons.
 * Pass the SAME array reference for source and destination to edit one lesson.
 * A move retains identifiers; a duplicate generates new identifiers. */
export function transferCurriculumStructure(
  source: CurriculumChapter[], destination: CurriculumChapter[], request: StructureTransfer,
  createId: (prefix:string)=>string = freshId,
): { source: CurriculumChapter[]; destination: CurriculumChapter[] } {
  const sameLesson = source === destination;
  const from = clone(source);
  const to = sameLesson ? from : clone(destination);
  if (!request.itemId || !request.targetChapterId) throw new Error('Choose source content and a destination chapter.');
  const targetChapter = to.find(chapter => chapter.id === request.targetChapterId);
  if (!targetChapter) throw new Error('The destination chapter no longer exists.');
  const taken = ids(to);

  if (request.kind === 'section') {
    const origin = findSection(from, request.itemId);
    const target = targetChapter.sections;
    if (!request.copy && origin.chapter.sections.length === 1 && origin.chapter !== targetChapter) {
      throw new Error('Keep at least one section in the source chapter.');
    }
    if (target.length >= 40 && !(origin.chapter === targetChapter && !request.copy)) {
      throw new Error('A chapter supports at most 40 sections.');
    }
    let item: CurriculumSection = origin.section;
    if (!request.copy) {
      origin.chapter.sections.splice(origin.index, 1);
      if (!sameLesson) {
        const newIds = [item.id, ...item.blocks.map(block => block.id)];
        if (newIds.some(value => taken.has(value))) throw new Error('Destination contains an identical content ID.');
      }
    } else {
      item = { ...item,
        id: uniqueId('section', taken, createId),
        blocks: item.blocks.map(block => ({ ...block, id: uniqueId('block', taken, createId) })),
      };
    }
    target.push(item);
  } else if (request.kind === 'block') {
    if (!request.targetSectionId) throw new Error('Choose a destination section.');
    const targetSection = targetChapter.sections.find(section => section.id === request.targetSectionId);
    if (!targetSection) throw new Error('The destination section no longer exists.');
    const origin = findBlock(from, request.itemId);
    if (!request.copy && origin.section.blocks.length === 1 && origin.section !== targetSection) {
      throw new Error('Keep at least one block in the source section.');
    }
    if (targetSection.blocks.length >= 50 && !(origin.section === targetSection && !request.copy)) {
      throw new Error('A section supports at most 50 blocks.');
    }
    let item: CurriculumBlock = origin.block;
    if (!request.copy) {
      origin.section.blocks.splice(origin.index, 1);
      if (!sameLesson && taken.has(item.id)) throw new Error('Destination contains an identical content ID.');
    } else {
      item = { ...item, id: uniqueId('block', taken, createId) };
    }
    targetSection.blocks.push(item);
  } else {
    throw new Error('Only sections or blocks can be transferred.');
  }
  const countBlocks = (chapters: CurriculumChapter[]) =>
    chapters.reduce((n,chapter)=>n+chapter.sections.reduce((sum,section)=>sum+section.blocks.length,0),0);
  if (countBlocks(to) > 600) throw new Error('A lesson supports at most 600 blocks.');
  return { source: from, destination: to };
}
