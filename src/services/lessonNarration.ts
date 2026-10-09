/**
 * Voice of Prophecy Lesson Audio Narration Engine
 * Extracts complete spoken text from structured Plate documents, legacy blocks,
 * scripture quotations, and takeaways, providing pause/resume and rate control.
 */

import { studyPlatePlainText } from '../../shared/studyPlateDocument';
import type { CurriculumChapter, CurriculumSection, CurriculumBlock } from '../../shared/curriculumStructure';
import type { LessonContentPage } from '../types';

export type NarrationPlaybackRate = 0.75 | 1.0 | 1.25 | 1.5;

export const AVAILABLE_NARRATION_RATES: NarrationPlaybackRate[] = [0.75, 1.0, 1.25, 1.5];

export interface NarrationExtractionParams {
  page: LessonContentPage;
  chapter?: CurriculumChapter;
  section?: CurriculumSection;
  isLastPage?: boolean;
}

/**
 * Strips raw markdown or formatting characters to ensure smooth, natural
 * pronunciation by the speech synthesizer.
 */
function cleanSpokenText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[*_~`#]/g, '') // remove markdown marks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) -> text
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts a complete narrative script for the current lesson page.
 * Prioritizes rich authoring structures (Plate continuous JSON, legacy blocks)
 * and incorporates scripture quotes and key truths.
 */
export function extractLessonPageSpokenText(params: NarrationExtractionParams): string {
  const { page, chapter, section, isLastPage } = params;
  const segments: string[] = [];

  // 1. Chapter and Section breadcrumb orientation
  if (chapter?.title && section?.title) {
    segments.push(`${chapter.title}. ${section.title}.`);
  } else if (page.title) {
    segments.push(`${page.title}.`);
  }

  // 2. Structured body text
  if (section?.document && Array.isArray(section.document) && section.document.length > 0) {
    const plateText = studyPlatePlainText(section.document);
    if (plateText.trim()) {
      segments.push(cleanSpokenText(plateText));
    }
  } else if (section?.blocks && Array.isArray(section.blocks) && section.blocks.length > 0) {
    const blockTexts = section.blocks
      .filter((block: CurriculumBlock) => ['heading', 'paragraph', 'quote'].includes(block.type) && Boolean(block.text))
      .map((block: CurriculumBlock) => cleanSpokenText(block.text || ''))
      .filter(Boolean);
    if (blockTexts.length > 0) {
      segments.push(blockTexts.join('. '));
    }
  } else if (page.content?.trim()) {
    segments.push(cleanSpokenText(page.content));
  }

  // 3. Scripture quotation
  if (page.scriptureQuote?.text) {
    const scriptureText = cleanSpokenText(page.scriptureQuote.text);
    const ref = cleanSpokenText(page.scriptureQuote.reference || '');
    segments.push(`Holy Scripture passage: ${scriptureText}. From ${ref}.`);
  }

  // 4. Key truth / takeaway
  if (page.keyTakeaway?.trim()) {
    segments.push(`Key truth: ${cleanSpokenText(page.keyTakeaway)}.`);
  }

  // 5. Final reflection prompt (if on the last page)
  if (isLastPage) {
    segments.push('Part C: Reflection and Commitment. Having studied this guide, what is your personal response before God?');
  }

  return segments.join('\n\n');
}

/**
 * Finds the best available browser SpeechSynthesisVoice matching the target language.
 */
export function findBestSpeechVoice(langCode?: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const targetPrefix = (langCode || 'en').toLowerCase().slice(0, 2);

  // 1. Preferred local voice matching exact language
  const exactLocalVoice = voices.find(v => v.lang.toLowerCase().startsWith(targetPrefix) && v.localService);
  if (exactLocalVoice) return exactLocalVoice;

  // 2. Any voice matching language
  const anyLangVoice = voices.find(v => v.lang.toLowerCase().startsWith(targetPrefix));
  if (anyLangVoice) return anyLangVoice;

  // 3. Fallback to default or English voice
  const defaultVoice = voices.find(v => v.default) || voices.find(v => v.lang.toLowerCase().startsWith('en'));
  return defaultVoice || voices[0] || null;
}
