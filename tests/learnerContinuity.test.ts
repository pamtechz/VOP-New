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
  assert.match(catalogue,/program\.guideIds\.length===1\?'module':'modules'/);
});

test('App restores route, guide, lesson and page and uses browser history for previous learner pages',()=>{
  const app=read('src/App.tsx');
  const reader=read('src/components/reader/LessonReaderModal.tsx');
  assert.match(app,/readLearnerLocation\(uid\)/);
  assert.match(app,/learnerLocationFromHistory\(uid,event\.state\)/);
  assert.match(app,/pushLearnerLocation\(currentUser\.uid,location\)/);
  assert.match(app,/replaceLearnerLocation\(currentUser\.uid,location\)/);
  assert.match(app,/window\.history\.back\(\)/);
  assert.match(app,/onPageChange=\{rememberStudyPage\}/);
  assert.match(app,/selectedProgramId=\{activeProgramId\}/);
  assert.match(app,/rememberLocation\(\{route:'lessons',\.\.\.\(programId\?\{programId\}:\{\}\)\}\)/);
  assert.match(reader,/onPageChange\?\.\(currentPageIndex\)/);
});
