import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=(path:string)=>readFileSync(path,'utf8');

test('Legacy lesson and section cards match the study-card reference design',()=>{
  const component=read('src/components/guide/DiscoverGuideView.tsx');
  const css=read('src/components/guide/guide-sections.css');
  assert.match(component,/vop-section-study-card/);
  assert.match(component,/studyActions\(lesson,sectionPages,section\.title,section\.id,unlocked\)/);
  assert.match(component,/studyActions\(lesson,pages,lesson\.title,undefined,unlocked\)/);
  assert.match(css,/\.vop-section-study-card\.completed::before\{background:#45a552\}/);
  assert.match(css,/\.vop-section-flashcards,\.vop-section-edit-questions/);
  assert.match(component,/onSelectLesson\(lesson,actualIndex\)/);
  assert.match(component,/inlineAssessment\(item,t\('guide\.take_test'/);
});

test('student accounts cannot see chapter-question editing in Legacy',()=>{
  const component=read('src/components/guide/DiscoverGuideView.tsx');
  const app=read('src/App.tsx');
  assert.match(component,/Boolean\(onEditQuestions\)&&hasAdminPortalAccess\(currentUser\)/);
  assert.match(component,/from '..\/..\/services\/portalAccess'/);
  assert.match(component,/mayEditQuestions&&onEditQuestions/);
  assert.match(app,/onEditQuestions=\{hasAdminPortalAccess\(currentUser\)/);
  assert.match(app,/navigate\('admin'\)/);
});

test('Classic Flutter web and Android use the same permission-aware section card',()=>{
  const guide=read('native_android/lib/screens/guide_screen.dart');
  const card=read('native_android/lib/widgets/vop_section_study_card.dart');
  const studio=read('native_android/lib/screens/curriculum_lesson_editor_screen.dart');
  assert.match(guide,/return VopSectionStudyCard\(/);
  assert.match(guide,/onEditQuestions:widget\.canEditChapterQuestions&&/);
  assert.match(guide,/this\.canEditChapterQuestions=false/);
  const learner=read('native_android/lib/screens/home_shell.dart');
  assert.doesNotMatch(learner,/canEditChapterQuestions\s*:/);
  assert.match(studio,/quizPerm\.contains\('update'\)/);
  assert.match(guide,/onTakeTest:locked\|\|attachedQuizId==null/);
  assert.match(card,/if\(onTakeTest!=null\)/);
  assert.match(card,/if\(onFlashcards!=null\)/);
  assert.match(card,/if\(onEditQuestions!=null\)/);
  assert.match(studio,/editable&&quizPerm\.contains\('update'\)/);
  assert.match(studio,/onTakeTest:attachedTest==null\?null/);
  assert.match(studio,/entry\['published'\]==true/);
  assert.match(studio,/VopSectionStudyCard\(/);
});

test('flashcards use actual authorised lesson content and metadata is not fabricated',()=>{
  const api=read('api_handlers/admin/mobile.ts');
  const flashFlutter=read('native_android/lib/screens/lesson_flashcards_screen.dart');
  const flashWeb=read('src/components/guide/SectionStudyFlashcards.tsx');
  assert.match(api,/pageCount:row\.type==='Test'\?0:/);
  assert.match(api,/Math\.min\(200,Array\.isArray\(row\.contentPages\)/);
  assert.match(flashFlutter,/widget\.api\.lesson\(widget\.guideId,widget\.lessonId\)/);
  assert.match(flashFlutter,/page\['keyTakeaway'\]/);
  assert.match(flashWeb,/page\.keyTakeaway\|\|page\.scriptureQuote\?\.text\|\|page\.content/);
  assert.doesNotMatch(flashWeb,/correctOptionIndex|answerKey/);
});

test('Classic renders authored sections as cards and opens only their published pages',()=>{
  const mobile=read('api_handlers/admin/mobile.ts');
  const guide=read('native_android/lib/screens/guide_screen.dart');
  const lesson=read('native_android/lib/screens/lesson_screen.dart');
  const flashcards=read('native_android/lib/screens/lesson_flashcards_screen.dart');
  const card=read('native_android/lib/widgets/vop_section_study_card.dart');
  assert.match(mobile,/const sectionOutline=/);
  assert.match(mobile,/sections:sectionOutline\(row\)/);
  assert.match(mobile,/pageIndex:index,pageCount:1/);
  assert.match(guide,/details\['learnerEntryMode'\]=='sections'/);
  assert.match(guide,/studyLessons\.expand\(\(lesson\)/);
  assert.match(guide,/initialPageIndex:isSection\?startPage:null/);
  assert.match(guide,/sectionId:sectionId/);
  assert.match(card,/headingLabel='Section'/);
  assert.match(lesson,/widget\.initialPageIndex == null/);
  assert.match(flashcards,/page\['sectionId'\]==widget\.sectionId/);
  // Learner shell opens GuideScreen with no administrator capability.
  assert.doesNotMatch(read('native_android/lib/screens/home_shell.dart'),/canEditChapterQuestions\s*:/);
});
