import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'});
after(async()=>{await server.close();});
const {
  normalizeCurriculumStructure,curriculumPages,curriculumAnchorExists,
  containsPublicQuizAnswer,hasRequiredFinalExam,
} = await server.ssrLoadModule('/shared/curriculumStructure.ts') as typeof import('../shared/curriculumStructure.ts');

const chapter=()=>[{
  id:'chapter-one',title:'The beginning',
  sections:[{
    id:'section-one',title:'Scripture and reflection',
    blocks:[
      {id:'block-heading',type:'heading',text:'Genesis 1:1'},
      {id:'block-text',type:'paragraph',text:'In the beginning God created the heavens and the earth.'},
      {id:'block-audio',type:'audio',src:'https://example.com/lesson.mp3'},
    ],
  }],
}];

test('normalizes chapter/section/block hierarchy and produces reader-compatible pages',()=>{
  const model=normalizeCurriculumStructure(chapter());
  assert.equal(model[0].sections[0].blocks.length,3);
  const pages=curriculumPages(model);
  assert.equal(pages.length,1);
  assert.equal(pages[0].chapterId,'chapter-one');
  assert.equal(pages[0].sectionId,'section-one');
  assert.match(pages[0].content,/Genesis 1:1/);
  assert.match(pages[0].content,/heavens and the earth/);
  assert.ok(pages[0].blocks.every(block=>block.id));
  assert.equal(JSON.stringify(pages).includes('correctOptionIndex'),false);
  for (const [kind,id] of [['chapter','chapter-one'],['section','section-one'],['block','block-heading']] as const){
    assert.equal(curriculumAnchorExists(model,kind,id),true);
  }
  assert.equal(curriculumAnchorExists(model,'block','not-in-this-lesson'),false);
});

test('refuses missing, duplicate, oversized, scriptable and private media blocks',()=>{
  assert.throws(()=>normalizeCurriculumStructure([]),/chapters/);
  assert.throws(()=>normalizeCurriculumStructure([{id:'c',title:'Chapter',sections:[]}]),/sections/);
  const bad=chapter();bad[0].sections[0].blocks[0].id='section-one';
  assert.throws(()=>normalizeCurriculumStructure(bad),/duplicate block identifier/);
  for(const src of [
    'javascript:alert(1)','http://example.com/audio.mp3',
    'https://127.0.0.1/lesson.mp3','https://localhost/lesson.mp3',
    'https://user:password@example.com/lesson.mp3',
    'https://example.com/lesson.mp3#fragment',
  ]){
    const item=chapter();item[0].sections[0].blocks[2].src=src;
    assert.throws(()=>normalizeCurriculumStructure(item),/safe public HTTPS/);
  }
  const tooMany=Array.from({length:41},(_,index)=>({...chapter()[0],id:'c'+index}));
  assert.throws(()=>normalizeCurriculumStructure(tooMany),/1–40 chapters/);
});

test('detects disguised inline answer keys before learner-readable lesson persistence',()=>{
  assert.equal(containsPublicQuizAnswer(chapter()),false);
  assert.equal(containsPublicQuizAnswer({chapters:[{blocks:[{question:'Faith?',options:['Yes','No'],correctOptionIndex:0}]}]}),true);
  assert.equal(containsPublicQuizAnswer({pages:[{quiz:[{prompt:'Faith?',answer:'Yes'}]}]}),true);
  assert.equal(containsPublicQuizAnswer({questions:[{question:'Prompt only',options:['One','Two']}]}),false);
});

test('requires real published private-bank final examination only for opted-in structured guides',()=>{
  const exam={
    id:'exam-1',type:'Test',published:true,archived:false,
    attachmentType:'guide',assessmentKind:'final_exam',answerVisibility:'public_redacted',
    sourceQuizId:'quiz1',questions:[{key:'q1',question:'What?',options:['A','B']}],
  };
  assert.equal(hasRequiredFinalExam({requiresFinalExam:true},[]),false);
  assert.equal(hasRequiredFinalExam({requiresFinalExam:false},[]),true);
  assert.equal(hasRequiredFinalExam({requiresFinalExam:true},[{...exam,published:false}]),false);
  assert.equal(hasRequiredFinalExam({requiresFinalExam:true},[{...exam,attachmentType:'lesson'}]),false);
  assert.equal(hasRequiredFinalExam({requiresFinalExam:true},[{...exam,assessmentKind:'practice'}]),false);
  assert.equal(hasRequiredFinalExam({requiresFinalExam:true},[{...exam,sourceQuizId:''}]),false);
  assert.equal(hasRequiredFinalExam({requiresFinalExam:true},[exam]),true);
});
