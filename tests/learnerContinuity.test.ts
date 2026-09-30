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
  assert.match(reader,/Lesson\/chapter\/section\/block quizzes live inside their owning lesson/);
  assert.match(reader,/Assessments are attached to this module; they are not lessons or modules themselves/);
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
  assert.match(contentApi,/type \|\| 'Lesson'\) !== 'Test'/);
  assert.match(admin,/lesson\.type === 'Lesson'/);
  assert.match(admin,/lesson\.type === 'Test'/);
  assert.match(guideManager,/lesson\.type === 'Lesson'/);
  assert.match(home,/primaryStudyLessons/);
});

test('dark theme defines semantic surfaces and covers late legacy UI islands',()=>{
  const theme=read('src/theme-dark.css');
  const preference=read('src/services/themePreference.ts');
  const html=read('index.html');
  for(const token of ['--bg-primary:#0c1118','--bg-card:#151e28','--bg-elevated:#1c2835','--text-primary:#f6f8fa','--border-subtle:#314050']){
    assert.ok(theme.includes(token),token);
  }
  for(const selector of ['vop-app-header-account-menu','vop-admin-sidebar-footer','vop-plate-more>div','vop-reference-table th','vop-save-state-chip.saved']){
    assert.ok(theme.includes(selector),selector);
  }
  assert.match(preference,/#0c1118/);
  assert.match(html,/meta name="theme-color" content="#0c1118"/);
});
