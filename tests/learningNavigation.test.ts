import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=(path:string)=>readFileSync(root+path,'utf8');

test('Library is materials-only; the learning tools have independent application routes',()=>{
  const library=source('src/pages/ResourcesPage.tsx');
  const app=source('src/App.tsx');
  const routes=source('src/types/index.ts');
  assert.doesNotMatch(library,/portfolioGet|memoryDecks|duelOverview|setTab\(/);
  for(const [route,mode] of [
    ['master-guide','master-guide'],['scripture-memory','memory'],['iron-duels','duels'],
  ]) {
    assert.match(routes,new RegExp("'"+route+"'"));
    assert.ok(app.includes(`currentRoute === '${route}'`),route);
    assert.ok(app.includes(`mode="${mode}"`),mode);
  }
  assert.match(app,/currentRoute === 'lessons'/);
  assert.match(source('src/pages/EngagementPage.tsx'),/action:'duelFinish'/);
  assert.match(source('src/pages/EngagementPage.tsx'),/action:\s*'portfolioGet'/);
  assert.match(source('src/pages/EngagementPage.tsx'),/action:\s*'memoryDue'/);
});

test('mobile bottom nav contains five learning destinations, while account actions stay in sidebar',()=>{
  const bottom=source('src/components/layout/BottomNav.tsx');
  const drawer=source('src/components/layout/MenuDrawer.tsx');
  for(const route of ['home','lessons','resources','prayer','radio']){
    assert.ok(bottom.includes("route:'"+route+"'"),route);
  }
  assert.doesNotMatch(bottom,/route:'profile'|route:'admin'/);
  for(const route of ['profile','personal-settings','admin','master-guide','scripture-memory','iron-duels']){
    assert.ok(drawer.includes("route: '"+route+"'") || drawer.includes("route:'"+route+"'"),route);
  }
});

test('small-screen admin sidebar has an explicit control, visible list and supported backdrop',()=>{
  const page=source('src/pages/AdminPage.tsx');
  const css=source('src/pages/admin-mobile.css');
  assert.match(page,/aria-controls="vop-admin-navigation"/);
  assert.match(page,/id="vop-admin-navigation"/);
  assert.match(page,/vop-sidebar-backdrop open/);
  assert.match(css,/vop-sidebar\.open/);
  assert.match(css,/vop-nav-item span/);
  assert.match(css,/display:grid!important/);
  assert.match(css,/overflow-y:auto/);
});

test('learning workspace has mobile, tablet and accessible bottom nav breakpoints',()=>{
  const css=source('src/pages/learning.css');
  assert.match(css,/@media\(max-width:767px\)/);
  assert.match(css,/@media\(max-width:650px\)/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/vop-radio-docked-player/);
});

test('lesson reader, grading and offline completion follow each guide language',()=>{
  const app=source('src/App.tsx');
  const study=source('src/services/localStudy.ts');
  assert.ok(app.includes('completeLesson(activeGuide.id, activeLesson.id, activeGuide.language)'));
  assert.ok(app.includes('submitQuizAnswers(activeGuide.id, activeLesson.id, answers, activeGuide.language,sessionId)'));
  const quizModal=source('src/components/quiz/QuizModal.tsx');
  const localStudy=source('src/services/localStudy.ts');
  assert.match(quizModal,/beginQuizAttempt\(guide\.id,lesson\.id,guide\.language,confirmRetake\)/);
  assert.match(localStudy,/action:'startQuiz'/);
  assert.match(localStudy,/sessionId/);
  assert.match(quizModal,/attemptStartLock/);
  assert.match(quizModal,/previousScore/);
  assert.match(quizModal,/Revoke result/);
  assert.match(localStudy,/confirmRetake/);
  assert.ok(study.includes('uid:firebaseUser.uid, language, guideId, lessonId'));
  assert.ok(app.includes('${guide.language}:${guide.id}:${lesson.id}'));
  assert.match(app,/openStudyItem\(activeGuide,lesson/);
});

test('published lesson and guide status share server-scoped completion checks',()=>{
  for(const file of ['src/pages/LessonsPage.tsx','src/components/guide/DiscoverGuideView.tsx','src/components/home/HomeDashboard.tsx']){
    assert.match(source(file),/lessonIsComplete/);
  }
  const progress=source('src/services/lessonProgress.ts');
  assert.match(progress,/if \(lesson.sourceQuizId\) return undefined/);
  assert.match(progress,/organizationId \|\| 'platform'/);
});


test('learner assessment and module status use localization keys, and the inventory scans TypeScript UI files',()=>{
  const quiz=source('src/components/quiz/QuizModal.tsx');
  const guide=source('src/components/guide/DiscoverGuideView.tsx');
  const inventory=source('scripts/inventory-ui-localization.mjs');
  assert.match(quiz,/getTranslation/);
  for(const key of [
    'quiz.retake_warning_title','quiz.retake_warning_with_score','quiz.confirm_retake',
    'quiz.revoke_and_retake','quiz.current_recorded_result','quiz.question_progress',
    'quiz.passed_retake_at','quiz.failed_retake_at','quiz.return_to_guide',
  ]) assert.ok(quiz.includes("'"+key+"'"),key);
  for(const key of [
    'guide.lessons_progress','guide.section_count','guide.lesson_count',
    'guide.page_count','guide.read_minutes','guide.final_exam_locked_label',
  ]) assert.ok(guide.includes("'"+key+"'"),key);
  assert.match(inventory,/const EXT = \/\\\.\(tsx\|jsx\|ts\|js\)\$\//);
  assert.match(inventory,/split\(\/\\r\?\\n\/\)/);
  assert.doesNotMatch(inventory,/const EXT = \/\\\\\\\.\(tsx\|jsx\|ts\|js\)\$\//);
});
