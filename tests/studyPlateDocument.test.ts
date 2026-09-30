import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},
  appType:'custom',logLevel:'error'});
after(async()=>server.close());
const {
  normalizeStudyPlateDocument,studyPlatePlainText,legacyBlocksToPlate,
  studyPlateLegacyBlocks,
}=await server.ssrLoadModule('/shared/studyPlateDocument.ts') as typeof import('../shared/studyPlateDocument.ts');
const {
  normalizeCurriculumStructure,curriculumPages,containsPublicQuizAnswer,
}=await server.ssrLoadModule('/shared/curriculumStructure.ts') as typeof import('../shared/curriculumStructure.ts');
const {transferCurriculumNode}=await server.ssrLoadModule('/shared/curriculumTransfer.ts');
const {
  curriculumSectionsToAuthoringDocument,authoringDocumentToCurriculumSections,
  createStudyPlateSectionMarker,isStudyPlateSectionMarker,
}=await server.ssrLoadModule('/shared/studyPlateAuthoring.ts') as typeof import('../shared/studyPlateAuthoring.ts');
const root=fileURLToPath(new URL('../',import.meta.url));
const read=(path:string)=>readFileSync(root+path,'utf8');

const rich=()=>[
  {id:'block-title',type:'h2',children:[{text:'The Sabbath',bold:true}]},
  {id:'block-intro',type:'p',children:[
    {text:'Remember the '},{text:'seventh day',italic:true,underline:true},
    {text:' and read '},{type:'a',url:'https://example.org/study',children:[{text:'Exodus'}]},
  ]},
  {id:'block-list',type:'ul',children:[
    {type:'li',children:[{type:'p',children:[{text:'Read the passage'}]}]},
    {type:'li',children:[{type:'p',children:[{text:'Reflect in prayer'}]}]},
  ]},
];
test('canonical Plate nodes preserve approved marks, links, hierarchy and stable IDs',()=>{
  const d=normalizeStudyPlateDocument(rich());
  assert.deepEqual(d.map(x=>x.id),['block-title','block-intro','block-list']);
  assert.equal(d[0].children[0] && 'text' in d[0].children[0] && d[0].children[0].bold,true);
  assert.match(studyPlatePlainText(d),/seventh day/);
  assert.match(studyPlatePlainText(d),/Reflect in prayer/);
  const bridge=studyPlateLegacyBlocks(d);
  assert.deepEqual(bridge.map(x=>x.id),['block-title','block-intro','block-list']);
  assert.equal(bridge[0].type,'heading');
});
test('Plate List Classic lic nodes round-trip through validated section pages',()=>{
  const nested=normalizeStudyPlateDocument([
    {id:'list-one',type:'ul',children:[
      {type:'li',children:[{type:'lic',children:[{text:'First point',bold:true}]}]},
      {type:'li',children:[{type:'lic',children:[{text:'Second point'}]}]},
    ]},
  ]);
  assert.equal(nested[0].type,'ul');
  assert.equal(nested[0].children[0].type,'li');
  assert.equal(nested[0].children[0].children[0].type,'lic');
  assert.match(studyPlatePlainText(nested),/Second point/);
  const pages=curriculumPages(normalizeCurriculumStructure([{
    id:'chapter-list',title:'List lesson',sections:[{
      id:'section-list',title:'Key points',document:nested,
      blocks:studyPlateLegacyBlocks(nested),
    }],
  }]));
  assert.equal(pages[0].document?.[0].children[0].children[0].type,'lic');
});
test('structured lessons always use Plate and invalid chapter documents are guarded',()=>{
  const studio=read('src/pages/CurriculumManager.tsx');
  const editor=read('src/components/admin/PlateCurriculumAuthoringReview.tsx');
  assert.match(studio,/Plate continuous document mode/);
  assert.match(studio,/plateValidationErrors/);
  assert.match(studio,/onPageError=/);
  assert.doesNotMatch(studio,/PlateCurriculumAuthoringReview:StructuredLessonEditor/);
  assert.doesNotMatch(studio,/setPlateReview/);
  assert.match(editor,/canLeaveChapter/);
  assert.match(editor,/onValidationError=/);
});

test('one author-defined section corresponds to exactly one student page',()=>{
  const first=normalizeStudyPlateDocument(rich());
  const second=normalizeStudyPlateDocument([
    {id:'block-prayer',type:'p',children:[{text:'Let us pray.'}]},
    {id:'block-quote',type:'blockquote',children:[{text:'Reflect together.'}]},
  ]);
  const chapter=[{id:'chapter-one',title:'Sabbath Fundamentals',sections:[
    {id:'section-one',title:'The teaching',blocks:studyPlateLegacyBlocks(first),document:first},
    {id:'section-two',title:'Reflection',blocks:studyPlateLegacyBlocks(second),document:second},
  ]}];
  const normalized=normalizeCurriculumStructure(chapter);
  const pages=curriculumPages(normalized);
  assert.equal(pages.length,2);
  assert.deepEqual(pages.map(x=>x.sectionId),['section-one','section-two']);
  assert.equal(pages[0].document?.length,3);
  assert.equal(pages[1].document?.length,2);
  assert.match(pages[1].content,/Let us pray/);
  assert.equal(pages[0].blocks[1].id,'block-intro');
});

test('continuous Plate authoring uses section boundaries without consuming the marked paragraph block',()=>{
  const original=normalizeStudyPlateDocument(rich());
  const sections=[{
    id:'section-one',title:'The teaching',
    blocks:studyPlateLegacyBlocks(original),document:original,
  }];
  const authoring=curriculumSectionsToAuthoringDocument(sections);
  assert.equal(authoring.length,4);
  assert.equal(isStudyPlateSectionMarker(authoring[0]),true);
  assert.equal(authoring[1].id,'block-title');

  // Mark the second paragraph as a new section by inserting an authoring-only
  // boundary before it. The paragraph itself keeps the same canonical block ID.
  authoring.splice(2,0,createStudyPlateSectionMarker('section-two','Remember the seventh day'));
  const converted=authoringDocumentToCurriculumSections(authoring);
  assert.equal(converted.length,2);
  assert.equal(converted[0].document?.[0].id,'block-title');
  assert.equal(converted[1].document?.[0].id,'block-intro');
  assert.equal(converted[1].document?.[1].id,'block-list');
  assert.equal(converted[1].title,'Remember the seventh day');

  const pages=curriculumPages(normalizeCurriculumStructure([{
    id:'chapter-one',title:'Sabbath Fundamentals',sections:converted,
  }]));
  assert.deepEqual(pages.map(page=>page.sectionId),['section-one','section-two']);
  assert.equal(JSON.stringify(pages).includes('section_page'),false);
});
test('unchanged legacy lessons bridge without rewriting their anchor IDs',()=>{
  const original=[{id:'block-first',type:'heading',text:'First'},
    {id:'block-second',type:'paragraph',text:'Original narrative'}];
  const d=normalizeStudyPlateDocument(legacyBlocksToPlate(original));
  assert.deepEqual(d.map(x=>x.id),['block-first','block-second']);
  assert.equal(studyPlateLegacyBlocks(d)[0].id,'block-first');
});
test('Plate images preserve bounded accessible alternative text end to end',()=>{
  const document=normalizeStudyPlateDocument([
    {id:'image-one',type:'img',url:'https://example.org/sabbath.jpg',
      alt:'An open Bible beside a calendar highlighting the seventh day.',
      children:[{text:''}]},
    {id:'decorative',type:'img',url:'https://example.org/divider.jpg',alt:'',children:[{text:''}]},
  ]);
  assert.equal(document[0].alt,'An open Bible beside a calendar highlighting the seventh day.');
  assert.equal(document[1].alt,undefined);
  assert.throws(()=>normalizeStudyPlateDocument([
    {id:'too-long',type:'img',url:'https://example.org/image.jpg',
      alt:'a'.repeat(301),children:[{text:''}]},
  ]),/alternative text cannot exceed 300/);
  const editor=read('src/components/admin/StudyPlatePageEditor.tsx');
  const reader=read('src/components/reader/StudyPlateContent.tsx');
  assert.match(editor,/Alternative text/);
  assert.match(editor,/vop-plate-insert-dialog/);
  assert.doesNotMatch(editor,/window\.prompt/);
  assert.match(editor,/type:'img',url:raw,alt,children/);
  assert.match(editor,/alt=\{alt\}/);
  assert.match(reader,/alt=\{node\.alt\|\|''\}/);
});

test('approved audio and video stay as first-class Plate blocks and legacy media keeps stable IDs',()=>{
  const document=normalizeStudyPlateDocument([
    {id:'video-one',type:'video',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',children:[{text:''}]},
    {id:'audio-one',type:'audio',url:'https://www.audioverse.org/en/media/12345',children:[{text:''}]},
    {id:'direct-video',type:'video',url:'https://cdn.example.org/study.mp4',children:[{text:''}]},
  ]);
  assert.deepEqual(document.map(item=>item.type),['video','audio','video']);
  const bridge=studyPlateLegacyBlocks(document);
  assert.deepEqual(bridge.map(item=>item.type),['video','audio','video']);
  assert.deepEqual(bridge.map(item=>item.id),['video-one','audio-one','direct-video']);
  const restored=normalizeStudyPlateDocument(legacyBlocksToPlate(bridge));
  assert.deepEqual(restored.map(item=>item.id),['video-one','audio-one','direct-video']);
  assert.equal(restored[0].url,'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.throws(()=>normalizeStudyPlateDocument([
    {id:'bad-media',type:'video',url:'https://example.org/not-a-media-page',children:[{text:''}]},
  ]),/approved embeddable or direct public HTTPS source/);
  assert.throws(()=>normalizeStudyPlateDocument([
    {id:'external-page',type:'video',url:'https://www.umtu.me/app',children:[{text:''}]},
  ]),/approved embeddable or direct public HTTPS source/);
  assert.throws(()=>normalizeStudyPlateDocument([
    {id:'wrong-kind',type:'audio',url:'https://cdn.example.org/movie.mp4',children:[{text:''}]},
  ]),/audio source/);
});

test('document schema rejects active content, private destinations and malformed lists',()=>{
  for(const type of ['script','iframe','html','form','table','svg']){
    assert.throws(()=>normalizeStudyPlateDocument([
      {id:'n1',type,children:[{text:'x'}]},
    ]),/Unsupported/);
  }
  for(const url of ['javascript:alert(1)','data:text/html,evil',
    'http://example.org','https://127.0.0.1/private','https://localhost/study']){
    assert.throws(()=>normalizeStudyPlateDocument([
      {id:'a1',type:'p',children:[{type:'a',url,children:[{text:'unsafe'}]}]},
    ]),/public HTTPS|Study links/);
  }
  assert.throws(()=>normalizeStudyPlateDocument([
    {id:'x',type:'ul',children:[{text:'invalid list'}]},
  ]),/List containers/);
  assert.throws(()=>normalizeStudyPlateDocument([
    {id:'same',type:'p',children:[{text:'One'}]},
    {id:'same',type:'p',children:[{text:'Two'}]},
  ]),/unique stable/);
});
test('public document rejects private quiz payloads, even when nested in Plate nodes',()=>{
  const leaked=[{id:'test',type:'p',children:[{
    text:'Question',question:'Which answer?',options:['A','B'],answer:0,
  }]}];
  assert.equal(containsPublicQuizAnswer(leaked),true);
  const normalized=normalizeStudyPlateDocument(leaked);
  assert.equal(JSON.stringify(normalized).includes('answer'),false);
});
test('Plate authoring uses a continuous chapter document with explicit section boundaries',()=>{
  const editor=read('src/components/admin/StudyPlatePageEditor.tsx');
  const structure=read('src/components/admin/PlateCurriculumAuthoringReview.tsx');
  const studio=read('src/pages/CurriculumManager.tsx');
  assert.match(editor,/SectionPagePlugin/);
  assert.match(editor,/authoringDocumentToCurriculumSections/);
  assert.match(editor,/markSection/);
  assert.match(editor,/Start section/);
  assert.match(editor,/Quiz for current block/);
  assert.match(editor,/Insert approved audio or video/);
  assert.match(editor,/Supported public sources include YouTube/);
  assert.match(editor,/page added as a safe external link/);
  assert.match(editor,/LinkRules\.autolink/);
  assert.match(editor,/upsertLink\(editor/);
  assert.match(editor,/fetch\('\/api\/media'/);
  assert.match(editor,/StudyVideoPlugin/);
  assert.match(editor,/StudyAudioPlugin/);
  assert.match(editor,/ctrlKey\|\|event\.metaKey/);
  assert.match(editor,/key\.toLowerCase\(\)==='k'/);
  assert.match(structure,/vop-plate-document-shell/);
  assert.match(structure,/curriculumSectionsToAuthoringDocument/);
  assert.match(structure,/moveSection=\(sectionId:string,step:-1\|1\)/);
  assert.match(structure,/moveChapter=\(step:-1\|1\)/);
  assert.match(structure,/initialSectionId/);
  assert.match(studio,/programContext\?\.entryMode==='sections'/);
  assert.match(studio,/vop-admin-direct-section/);
  assert.match(studio,/openModuleLesson\(entry\.item,entry\.section\.id\)/);
  assert.match(studio,/beforeunload/);
  assert.match(studio,/You have unsaved lesson changes/);
  assert.match(studio,/Save your lesson changes before leaving the editor to manage a quiz/);
});

test('authoring outline and Plate toolbar remain visibly sticky below the admin header',()=>{
  const toolbar=read('src/components/admin/plate-authoring.css');
  const structure=read('src/components/admin/plate-structure.css');
  assert.match(toolbar,/top:var\(--vop-plate-toolbar-top,var\(--vop-plate-sticky-top,76px\)\)/);
  assert.match(toolbar,/z-index:90/);
  assert.match(structure,/--vop-plate-sticky-top:76px/);
  assert.match(structure,/\.vop-plate-outline\{[\s\S]*position:sticky;top:var\(--vop-plate-sticky-top,76px\)/);
  assert.match(structure,/max-height:calc\(100dvh - var\(--vop-plate-sticky-top,76px\) - 10px\)/);
  assert.match(structure,/@media\(max-width:860px\)[\s\S]*\.vop-plate-outline\{position:static/);
});

test('Plate workspace scrolls only the lesson paper and keeps outline and toolbar persistent',()=>{
  const toolbar=read('src/components/admin/plate-authoring.css');
  const structure=read('src/components/admin/plate-structure.css');
  assert.match(structure,/@media\(min-width:861px\)[\s\S]*\.vop-plate-document-shell\{[\s\S]*position:sticky/);
  assert.match(structure,/height:calc\(100dvh - var\(--vop-plate-sticky-top,76px\) - 10px\)/);
  assert.match(structure,/\.vop-plate-outline\{[\s\S]*grid-template-rows:auto auto minmax\(0,1fr\)/);
  assert.match(structure,/\.vop-plate-outline-list\{[\s\S]*overflow-y:auto/);
  assert.match(toolbar,/\.vop-plate-document-pane \.vop-plate-page-editor\{[\s\S]*overflow-y:auto/);
  assert.match(toolbar,/--vop-plate-toolbar-top:0px/);
});

test('Plate overflow menu preserves selection and every visible action invokes real editor behavior',()=>{
  const editor=read('src/components/admin/StudyPlatePageEditor.tsx');
  assert.match(editor,/savedSelection=useRef/);
  assert.match(editor,/editor\.tf\.select\(savedSelection\.current as never\)/);
  assert.match(editor,/menuAction\(markSection\)/);
  assert.match(editor,/openInsert\('link'\)/);
  assert.match(editor,/openInsert\('image'\)/);
  assert.match(editor,/openInsert\('media'\)/);
  assert.match(editor,/editor\.tf\.blockquote\.toggle\(\)/);
  assert.match(editor,/editor\.tf\.toggleMark\('code'\)/);
  assert.match(editor,/insertParagraphAfter/);
  assert.match(editor,/attachQuiz\('section'\)/);
  assert.match(editor,/attachQuiz\('block'\)/);
});

test('saved draft lessons can open anchored quiz authoring without publishing first',()=>{
  const manager=read('src/pages/CurriculumManager.tsx');
  const plate=read('src/components/admin/PlateCurriculumAuthoringReview.tsx');
  assert.match(manager,/canAttachQuiz=\{Boolean\(editor\.id\)\}/);
  assert.match(manager,/lessonPublished=\{editor\.published\}/);
  assert.match(manager,/Save this lesson before attaching a quiz so its section and block anchors exist/);
  assert.doesNotMatch(manager,/Save and publish this lesson before attaching a published quiz/);
  assert.match(plate,/if\(lessonPublished\)/);
});

test('modal dialogs use body-level activation-ordered layers',()=>{
  const layer=read('src/components/layout/ModalLayer.tsx');
  const editor=read('src/components/admin/StudyPlatePageEditor.tsx');
  const quiz=read('src/components/quiz/QuizModal.tsx');
  const reader=read('src/components/reader/LessonReaderModal.tsx');
  const users=read('src/pages/UserManagement.tsx');
  assert.match(layer,/createPortal/);
  assert.match(layer,/modalLayerSequence/);
  assert.match(layer,/onPointerDownCapture/);
  assert.match(editor,/<ModalLayer><div className="vop-plate-insert-backdrop"/);
  assert.match(quiz,/<ModalLayer><div/);
  assert.match(reader,/<ModalLayer><div/);
  assert.match(users,/selected && <ModalLayer>/);
  assert.match(users,/editor && <ModalLayer>/);
});

test('Plate is the single structured editor while learner rendering remains validated',()=>{
  const manager=read('src/pages/CurriculumManager.tsx');
  const plate=read('src/components/admin/PlateCurriculumAuthoringReview.tsx');
  const reader=read('src/components/reader/LessonReaderModal.tsx');
  const safe=read('src/components/reader/StudyPlateContent.tsx');
  assert.match(manager,/PlateCurriculumAuthoringReview/);
  assert.doesNotMatch(manager,/const EditorComponent=/);
  assert.doesNotMatch(manager,/Legacy editor/);
  assert.match(plate,/curriculumSectionsToAuthoringDocument/);
  assert.match(plate,/vop-plate-outline/);
  assert.match(plate,/duplicateSectionSafely/);
  assert.match(plate,/organizationId=\{organizationId\}/);
  assert.match(reader,/currentSection\.document/);
  assert.match(reader,/afterBlock=\{blockId=>assessmentLinks\('block',blockId\)\}/);
  assert.doesNotMatch(safe,/dangerouslySetInnerHTML/);
  assert.match(safe,/normalizeStudyPlateDocument\(document\)/);
  assert.match(safe,/This page contains unsupported content/);
});

test('cross-lesson Plate copies regenerate every canonical block ID without losing formatting',()=>{
  const document=normalizeStudyPlateDocument(rich());
  const from=[{id:'chapter-a',title:'Guide chapter',sections:[
    {id:'section-a',title:'Study page',blocks:studyPlateLegacyBlocks(document),document},
    {id:'section-b',title:'Second page',blocks:[{id:'paragraph-b',type:'paragraph',text:'Keep'}]},
  ]}];
  const to=[{id:'chapter-z',title:'Destination',sections:[
    {id:'section-z',title:'Target',blocks:[{id:'paragraph-z',type:'paragraph',text:'Existing'}]},
  ]}];
  const copied=transferCurriculumNode(from,to,'section','section-a','chapter-z','copy');
  const page=copied.destination[0].sections[1];
  assert.notEqual(page.id,'section-a');
  assert.deepEqual(page.document?.map(item=>item.id).length,3);
  assert.notEqual(page.document?.[0].id,'block-title');
  assert.equal(page.blocks[0].id,page.document?.[0].id);
  assert.equal(page.document?.[0].children[0] && 'text' in page.document[0].children[0]
    && page.document[0].children[0].bold,true);
  const moved=transferCurriculumNode(from,to,'section','section-a','chapter-z','move');
  assert.equal(moved.destination[0].sections[1].document?.[0].id,'block-title');
  assert.equal(moved.source[0].sections.length,1);
  assert.equal(from[0].sections.length,2);
});

test('individual Plate blocks can move between rich pages without flattening, mixed formats are rejected',()=>{
  const sourceDoc=normalizeStudyPlateDocument(rich());
  const targetDoc=normalizeStudyPlateDocument([
    {id:'destination-paragraph',type:'p',children:[{text:'Target'}]},
  ]);
  const from=[{id:'source-chapter',title:'Source',sections:[
    {id:'source-page',title:'Source page',blocks:studyPlateLegacyBlocks(sourceDoc),document:sourceDoc},
  ]}];
  const richTarget=[{id:'target-chapter',title:'Target',sections:[
    {id:'target-page',title:'Target page',blocks:studyPlateLegacyBlocks(targetDoc),document:targetDoc},
  ]}];
  const moved=transferCurriculumNode(from,richTarget,'block','block-title','target-page','move');
  assert.equal(moved.source[0].sections[0].document?.length,2);
  assert.equal(moved.destination[0].sections[0].document?.[1].id,'block-title');
  assert.equal(moved.destination[0].sections[0].document?.[1].children[0] &&
    'text' in moved.destination[0].sections[0].document[1].children[0] &&
    moved.destination[0].sections[0].document[1].children[0].bold,true);
  const legacy=[{id:'target-chapter',title:'Target',sections:[
    {id:'target-page',title:'Target page',blocks:[{id:'target-block',type:'paragraph',text:'Original'}]},
  ]}];
  assert.throws(()=>transferCurriculumNode(from,legacy,'block','block-title','target-page','move'),/same document format/);
});

test('guide editor persists a learner navigation preference without changing course completion',()=>{
  const manager=read('src/pages/GuideManager.tsx');
  const api=read('api_handlers/admin/content.ts');
  const loader=read('src/services/firestoreData.ts');
  const view=read('src/components/guide/DiscoverGuideView.tsx');
  const app=read('src/App.tsx');
  assert.match(manager,/Student guide navigation/);
  assert.match(manager,/<option value="lessons">Lessons \(default\)<\/option>/);
  assert.match(manager,/<option value="sections">Sections \/ pages<\/option>/);
  assert.match(api,/learnerEntryMode: data\.learnerEntryMode === 'sections'/);
  assert.match(loader,/learnerEntryMode: data\.learnerEntryMode === 'sections'/);
  assert.match(view,/guide\.learnerEntryMode==='sections'/);
  assert.match(view,/vop-section-study-card/);
  assert.match(view,/onSelectLesson\(lesson,actualIndex\)/);
  assert.match(app,/pageIndex===undefined/);
  assert.match(app,/lessonResume/);
  assert.match(view,/completedStudyLessons/);
  assert.match(view,/const isFinal=/);
});
