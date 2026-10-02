import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=(path:string)=>readFileSync(root+path,'utf8');
const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
after(async()=>vite.close());
const {resolveAboutProfile}=await vite.ssrLoadModule('/src/services/aboutSettings.ts');
const {normalizeLearnerLocation,sameLearnerLocation}=await vite.ssrLoadModule('/src/services/learnerNavigation.ts');

const baseSettings={
  appName:'VOP',organizationName:'Platform VOP',schoolName:'',directorName:'',directorTitle:'',
  contactPhone:'111',whatsappNumber:'222',contactEmail:'platform@example.test',
  quizPassThreshold:80,defaultLanguage:'en',customLanguages:[],customTranslations:{},
  detailPages:{
    aboutUsMission:'Platform mission',aboutUsHistory:'Platform history',aboutUsLeadership:'Platform leadership',
    aboutAppDescription:'Platform application',aboutAppVersion:'1.0',aboutAppCredits:'Platform credits',
    contactOfficeAddress:'Platform office',contactOfficeHours:'08:00-17:00',
    contactPhoneNumbers:['111'],contactEmails:['platform@example.test'],contactWhatsAppNumbers:['222'],
    socialLinks:{website:'https://platform.example.test'},
  },
};

test('learner About profile uses configured organization ministry/contact content but keeps app metadata platform-owned',()=>{
  const scoped={
    ...baseSettings,
    organizationName:'Riverside SDA Church',
    contactPhone:'333',contactEmail:'local@example.test',
    detailPages:{
      ...baseSettings.detailPages,
      aboutUsMission:'Local mission',aboutUsHistory:'Local history',aboutUsLeadership:'Local leadership',
      aboutAppDescription:'MUST NOT REPLACE PLATFORM APP COPY',
      contactOfficeAddress:'Local office',contactPhoneNumbers:['333'],contactEmails:['local@example.test'],
    },
  };
  const result=resolveAboutProfile(baseSettings,scoped,{
    scope:'organization',organizationId:'org-riverside',organizationName:'Riverside SDA Church',
  });
  assert.equal(result.organizationName,'Riverside SDA Church');
  assert.equal(result.detailPages.aboutUsMission,'Local mission');
  assert.equal(result.detailPages.contactOfficeAddress,'Local office');
  assert.equal(result.detailPages.aboutAppDescription,'Platform application');
  assert.equal(result.aboutContext.scope,'organization');
  assert.equal(result.aboutContext.inheritedFromPlatform,false);
});

test('empty organization About profile falls back to Super Admin platform profile',()=>{
  const empty={
    ...baseSettings,organizationName:'',contactPhone:'',whatsappNumber:'',contactEmail:'',website:'',
    detailPages:{
      aboutUsMission:'',aboutUsHistory:'',aboutUsLeadership:'',aboutAppDescription:'',
      aboutAppVersion:'',aboutAppCredits:'',contactOfficeAddress:'',contactOfficeHours:'',
      contactPhoneNumbers:[],contactEmails:[],contactWhatsAppNumbers:[],socialLinks:{},
    },
  };
  const result=resolveAboutProfile(baseSettings,empty,{
    scope:'organization',organizationId:'org-empty',organizationName:'Empty Organisation',
  });
  assert.equal(result.organizationName,'Platform VOP');
  assert.equal(result.detailPages.aboutUsMission,'Platform mission');
  assert.equal(result.contactEmail,'platform@example.test');
  assert.equal(result.aboutContext.scope,'platform');
  assert.equal(result.aboutContext.inheritedFromPlatform,true);
});

test('learner navigation state validates route and preserves nested study location',()=>{
  const location=normalizeLearnerLocation({
    route:'lessons',programId:'program-a',guideId:'guide-a',guideLanguage:'bem',lessonId:'lesson-a',pageIndex:4.9,
  });
  assert.deepEqual(location,{
    route:'lessons',programId:'program-a',guideId:'guide-a',guideLanguage:'bem',lessonId:'lesson-a',pageIndex:4,
  });
  assert.equal(sameLearnerLocation(location,{...location}),true);
  assert.equal(sameLearnerLocation(location,{...location,pageIndex:5}),false);
  assert.equal(normalizeLearnerLocation({route:'not-a-route'}),null);
});

test('learner hierarchy counts lessons separately and keeps quizzes in their owning assessment scope',()=>{
  const reader=read('src/components/guide/DiscoverGuideView.tsx');
  const lessonReader=read('src/components/reader/LessonReaderModal.tsx');
  const catalogue=read('src/pages/LessonsPage.tsx');
  assert.match(reader,/filter\(item=>item\.type==='Lesson'\)/);
  assert.match(reader,/filter\(item=>item\.type==='Test'\)/);
  assert.match(reader,/vop-section-study-card/);
  assert.match(reader,/attachedAssessments\(lesson,'section',section\.id\)/);
  assert.match(reader,/attachedAssessments\(lesson,'chapter',chapter\.id\)/);
  assert.match(reader,/attachedAssessments\(lesson,'lesson'\)/);
  assert.match(reader,/guide\.learnerEntryMode==='sections'/);
  assert.match(reader,/totalSections/);
  assert.match(reader,/Take test/);
  assert.match(reader,/Lesson\/chapter\/section\/block quizzes live inside their owning lesson/);
  assert.match(reader,/never counted as lessons, sections or curriculum modules/);
  assert.doesNotMatch(reader,/modules completed/);
  assert.match(lessonReader,/item\.attachedLessonId===lesson\.id/);
  assert.match(lessonReader,/assessmentLinks\('section',currentSection\.id\)/);
  assert.match(catalogue,/availableProgramGuideIds/);
  assert.match(catalogue,/guide\.lessons\.some\(lesson=>lesson\.type==='Lesson'\)/);
  assert.match(catalogue,/moduleCount===1\?'module':'modules'/);
  assert.doesNotMatch(catalogue,/program\.guideIds\.length===1\?'module':'modules'/);
});

test('App restores route, guide, lesson and page and uses browser history for previous learner pages',()=>{
  const app=read('src/App.tsx');
  const reader=read('src/components/reader/LessonReaderModal.tsx');
  assert.match(app,/readLearnerLocation\(uid\)/);
  assert.match(app,/learnerLocationFromHistory\(uid,event\.state\)/);
  assert.match(app,/pushLearnerLocation\(currentUser\.uid,location\)/);
  assert.match(app,/replaceLearnerLocation\(currentUser\.uid,location\)/);
  assert.match(app,/window\.history\.back\(\)/);
  assert.match(app,/clearLearnerLocation\(uid\)/);
  assert.match(app,/event\.shiftKey&&key==='r'/);
  assert.match(app,/onPageChange=\{rememberStudyPage\}/);
  assert.match(app,/selectedProgramId=\{activeProgramId\}/);
  assert.match(app,/rememberLocation\(\{route:'lessons',\.\.\.\(programId\?\{programId\}:\{\}\)\}\)/);
  assert.match(reader,/onPageChange\?\.\(currentPageIndex\)/);
});


test('guide selectors and dashboards exclude assessment records from lesson and module totals',()=>{
  const contentApi=read('api_handlers/admin/content.ts');
  const admin=read('src/pages/AdminPage.tsx');
  const guideManager=read('src/pages/GuideManager.tsx');
  const home=read('src/components/home/HomeDashboard.tsx');
  assert.match(contentApi,/lessonCount: studyLessons\.length/);
  assert.match(contentApi,/String\((?:lesson\.)?data(?:\(\))?\.type\s*\|\|\s*'Lesson'\)\s*!==?\s*'Test'/);
  assert.match(admin,/lesson\.type === 'Lesson'/);
  assert.match(admin,/lesson\.type === 'Test'/);
  assert.match(guideManager,/lesson\.type === 'Lesson'/);
  assert.match(home,/primaryStudyLessons/);
});

test('light and dark modes share one canonical variable contract',()=>{
  const theme=read('src/theme.css');
  const preference=read('src/services/themePreference.ts');
  const html=read('index.html');
  const main=read('src/main.tsx');
  const index=read('src/index.css');

  assert.match(theme,/CANONICAL LIGHT \/ DARK THEME CONTRACT/);
  assert.match(theme,/:root,\s*\[data-theme="light"\]/);
  assert.match(theme,/\[data-theme="dark"\]\s*\{/);
  for(const token of [
    '--theme-accent:','--theme-title:','--theme-text:','--theme-muted:',
    '--theme-bg:','--theme-surface:','--theme-border:','--theme-shadow:',
  ]) assert.ok(theme.includes(token),token);

  assert.match(theme,/--bg-primary: var\(--theme-bg\)/);
  assert.match(theme,/--bg-card: var\(--theme-surface\)/);
  assert.match(theme,/--text-primary: var\(--theme-title\)/);
  assert.match(theme,/--border-subtle: var\(--theme-border\)/);
  assert.match(theme,/transition: background-color \.3s ease, color \.3s ease/);
  assert.match(theme,/prefers-reduced-motion: reduce/);

  assert.match(preference,/localStorage\.setItem\(KEY,theme\)/);
  assert.match(preference,/classList\.toggle\('dark-theme',theme==='dark'\)/);
  assert.match(preference,/#0b0c0f/);
  assert.match(preference,/#f7f9fc/);

  assert.match(html,/<html lang="en" data-theme="light">/);
  assert.match(html,/localStorage\.getItem\('vop_theme'\) === 'dark' \? 'dark' : 'light'/);
  assert.match(html,/theme === 'dark' \? '#0b0c0f' : '#f7f9fc'/);
  assert.ok(main.indexOf("import './theme.css';") > main.indexOf("import './admin-layout-overrides.css';"),
    'canonical theme stylesheet must load after portal styles');
  assert.doesNotMatch(main,/theme-dark\.css/);
  assert.doesNotMatch(index,/\/\* Dark Theme Variables \*\//);
});

test('shared sidebar and header chrome consume canonical theme tokens',()=>{
  const sidebar=read('src/components/layout/sidebar-system.css');
  const header=read('src/components/layout/navigation-header.css');
  for(const token of ['--theme-bg','--theme-surface','--theme-surface-soft','--theme-border','--theme-title','--theme-text','--theme-muted','--theme-accent']){
    assert.ok(sidebar.includes('var('+token+')'),token+' missing from shared sidebar');
  }
  for(const token of ['--theme-surface','--theme-surface-soft','--theme-border','--theme-title','--theme-text','--theme-muted']){
    assert.ok(header.includes('var('+token+')'),token+' missing from shared header');
  }
  assert.doesNotMatch(sidebar,/#eaf1f9|#eaf2ff|#e4efff|#e8f1ff|#edf4ff/);
  assert.doesNotMatch(header,/#f6faff|#edf5ff/);
  assert.doesNotMatch(header,/var\([^)]*\)[0-9a-f]/i);
  assert.match(header,/background:var\(--vop-error-bg\);color:var\(--vop-error\)/);
});

test('admin learning and public neutral surfaces inherit the canonical theme contract',()=>{
  const admin=read('src/pages/admin.css');
  const learning=read('src/pages/learning.css');
  const publicHome=read('src/pages/public-home.css');

  for(const declaration of [
    '--vop-bg:var(--theme-bg)',
    '--vop-text:var(--theme-title)',
    '--vop-muted:var(--theme-muted)',
    '--vop-border:var(--theme-border)',
    '--vop-card:var(--theme-surface)',
  ]) assert.ok(admin.includes(declaration),declaration);

  for(const token of ['--theme-surface','--theme-surface-soft','--theme-border','--theme-border-strong','--theme-title','--theme-text','--theme-muted']){
    assert.ok(admin.includes('var('+token+')'),token+' missing from admin');
    assert.ok(learning.includes('var('+token+')') || token==='--theme-border-strong',token+' missing from learning');
  }
  for(const token of ['--theme-bg','--theme-surface','--theme-surface-soft','--theme-border','--theme-title','--theme-text','--theme-muted']){
    assert.ok(publicHome.includes('var('+token+')'),token+' missing from public home');
  }

  for(const [name,css] of [['admin',admin],['learning',learning],['public home',publicHome]] as const){
    assert.doesNotMatch(css,/var\([^)]*\)[0-9a-f]{2,6}\b/i,name+' contains a malformed theme color');
  }
  assert.doesNotMatch(learning,/#eff5fc|#edf4ff|#fcfdff|#edf3fa/i);
  assert.doesNotMatch(publicHome,/#f8fafc|#f4f7fb|#f1f5f9|#edf4ff|#eff5fc|#fcfdff|#edf3fa/i);
  assert.match(admin,/background:var\(--vop-error-bg\)/);
  assert.match(admin,/background:var\(--vop-warning-bg\)/);
  assert.match(admin,/background:var\(--vop-success-bg\)/);
});

test('remaining portals do not define competing dark palettes or malformed theme colors',()=>{
  const candidates=read('src/pages/candidate-management.css');
  const users=read('src/pages/userManagement.css');
  const mentor=read('src/pages/mentor-workspace.css');
  const reference=read('src/reference.css');

  for(const [name,css] of [
    ['candidates',candidates],['users',users],['mentor',mentor],['reference',reference],
  ] as const){
    assert.doesNotMatch(css,/var\([^)]*\)[0-9a-f]{2,6}\b/i,name+' contains a malformed theme color');
  }

  assert.match(candidates,/background:var\(--vop-error-bg\);color:var\(--vop-error\)/);
  assert.match(users,/background:var\(--vop-warning-bg\);color:var\(--vop-warning\)/);
  assert.match(reference,/background:var\(--vop-error-bg\)/);
  assert.match(reference,/background:var\(--theme-surface\)/);
  assert.doesNotMatch(mentor,/\[data-theme="dark"\]/);
  assert.doesNotMatch(mentor,/#101f33|#2a3f59|#17304c|#174f8d/);
  for(const token of ['--theme-title','--theme-text','--theme-muted','--theme-surface-soft','--theme-surface-elevated','--theme-border']){
    assert.ok(mentor.includes('var('+token+')'),token+' missing from mentor workspace');
  }
  assert.match(mentor,/background:var\(--vop-error-bg\)/);
  assert.match(mentor,/background:var\(--vop-success-bg\)/);
});

test('theme switching is centralized and page styles do not define local dark palettes',()=>{
  const theme=read('src/theme.css');
  const index=read('src/index.css');
  const admin=read('src/pages/admin.css');
  const guideSections=read('src/components/guide/guide-sections.css');

  assert.match(theme,/\[data-theme="dark"\]/);
  for(const [name,css] of [
    ['index',index],['admin',admin],['guide sections',guideSections],
  ] as const){
    assert.doesNotMatch(css,/\[data-theme="dark"\]/,name+' defines a competing dark theme');
  }
  assert.match(index,/\.vop-admin-account[\s\S]*background: var\(--theme-surface-soft\)/);
  assert.match(admin,/\.vop-org-invite-result[\s\S]*background:var\(--theme-surface-soft\)/);
  assert.match(guideSections,/\.vop-section-study-card[\s\S]*background:var\(--bg-card,#fff\)/);
  assert.match(guideSections,/background:var\(--vop-warning-bg\)/);
  assert.match(guideSections,/background:var\(--vop-success-bg\)/);
  assert.doesNotMatch(guideSections,/#101f33|#314050|#342914|#143124|#3b2d17/);
});

test('legacy portals remain covered while canonical theme variables own final surfaces',()=>{
  const theme=read('src/theme.css');
  const readerModal=read('src/components/reader/LessonReaderModal.tsx');
  const quizModal=read('src/components/quiz/QuizModal.tsx');
  const contentStudio=read('src/components/admin/ContentStudio.tsx');
  const adminRecords=read('src/pages/AdminRecordsPanel.tsx');

  for(const selector of [
    'vop-learner-sidebar','vop-admin .vop-sidebar','vop-candidate-list-card',
    'vop-program-catalog-card','vop-mentoring-card','vop-dialog-card',
  ]) assert.ok(theme.includes(selector),selector+' theme coverage');

  assert.match(theme,/background: var\(--theme-surface\) !important/);
  assert.match(theme,/border-color: var\(--theme-border\) !important/);
  assert.match(theme,/box-shadow: inset 3px 0 var\(--theme-accent\) !important/);
  assert.match(readerModal,/data-surface="progress"/);
  assert.match(quizModal,/data-surface="question"/);
  assert.doesNotMatch(contentStudio,/bg-blue-50/);
  assert.doesNotMatch(adminRecords,/#f5f9ff/);
});


test('page resume restoration is lesson-only, bounded and server-backed',()=>{
  const app=read('src/App.tsx');
  const reader=read('src/components/reader/LessonReaderModal.tsx');
  const firestore=read('src/services/firestoreData.ts');
  assert.match(firestore,/normalizeLessonResume/);
  assert.match(firestore,/lessonResume:\s*normalizeLessonResume\(data\.progress\?\.lessonResume\)/);
  assert.match(app,/const isStudyLesson=lesson\.type==='Lesson'/);
  assert.match(app,/Math\.min\(pageCount-1/);
  assert.match(app,/activeLesson\.type!=='Lesson'/);
  assert.match(app,/\.\.\.\(isStudyLesson\?\{pageIndex:desired\}:\{\}\)/);
  assert.match(reader,/lesson\.type!=='Lesson'/);
  assert.match(reader,/const safePageIndex=clampPageIndex\(pageIndex\)/);
});

test('assessment completion relies on server graduation automation without a duplicate learner graduation POST',()=>{
  const study=read('src/services/localStudy.ts');
  const api=read('api/study/progress.ts');
  const modal=read('src/components/quiz/QuizModal.tsx');
  assert.doesNotMatch(study,/fetch\('\/api\/admin\/graduations'/);
  assert.match(api,/ensureAutomaticGraduationReview/);
  assert.match(api,/confirmationRequired:true/);
  assert.match(study,/AssessmentStartConditionError/);
  assert.match(modal,/ASSESSMENT_RETAKE_CONFIRMATION/);
  assert.match(modal,/setConfirmingRetake\(true\)/);
});
