import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertQuizAnchorsPreserved,
  buildPlateMigrationPreview,
  stableHash,
} from '../scripts/migrate-legacy-lessons-to-plate.mjs';

test('legacy Plate migration preserves existing stable IDs and learner page order', () => {
  const lesson={
    title:'Legacy Lesson',
    contentPages:[
      {
        pageNumber:1,title:'Opening',chapterId:'chapter-existing',chapterTitle:'Chapter One',
        sectionId:'section-existing',content:'Opening paragraph',
      },
      {
        pageNumber:2,title:'Second page',chapterId:'chapter-existing',chapterTitle:'Chapter One',
        sectionId:'section-two',content:'Second paragraph',
      },
    ],
    pages:[
      {
        pageNumber:1,chapterId:'chapter-existing',sectionId:'section-existing',
        blocks:[
          {id:'block-existing',type:'heading',text:'Opening'},
          {id:'block-paragraph',type:'paragraph',text:'Opening paragraph'},
        ],
      },
      {
        pageNumber:2,chapterId:'chapter-existing',sectionId:'section-two',
        blocks:[{id:'block-second',type:'paragraph',text:'Second paragraph'}],
      },
    ],
  };
  const preview=buildPlateMigrationPreview(lesson,{guideId:'guide-a',lessonId:'lesson-a'});
  assert.equal(preview.status,'migratable');
  assert.equal(preview.chapters.length,1);
  assert.equal(preview.chapters[0].id,'chapter-existing');
  assert.deepEqual(preview.chapters[0].sections.map(section=>section.id),['section-existing','section-two']);
  assert.deepEqual(preview.chapters[0].sections[0].blocks.map(block=>block.id),['block-existing','block-paragraph']);
  assert.deepEqual(preview.contentPages.map(page=>page.pageNumber),[1,2]);
  assert.equal(preview.contentPages[0].document[0].id,'block-existing');
  assert.equal(preview.contentPages[1].sectionId,'section-two');
});

test('legacy Plate migration creates deterministic IDs when old pages had none', () => {
  const lesson={
    title:'No IDs',
    contentPages:[
      {pageNumber:1,title:'Page A',content:'Alpha'},
      {pageNumber:2,title:'Page B',content:'Beta'},
    ],
  };
  const first=buildPlateMigrationPreview(lesson,{guideId:'guide-x',lessonId:'lesson-x'});
  const second=buildPlateMigrationPreview(lesson,{guideId:'guide-x',lessonId:'lesson-x'});
  assert.deepEqual(first.chapters,second.chapters);
  assert.deepEqual(first.contentPages,second.contentPages);
  assert.match(first.chapters[0].id,/^chapter-/);
  assert.match(first.chapters[0].sections[0].id,/^section-/);
  assert.match(first.chapters[0].sections[0].blocks[0].id,/^block-/);
});

test('legacy Plate migration refuses unsafe media instead of losing it', () => {
  const lesson={
    title:'Unsafe Media',
    contentPages:[{pageNumber:1,title:'Page',content:'Text',imageUrl:'http://127.0.0.1/private.jpg'}],
  };
  assert.throws(
    ()=>buildPlateMigrationPreview(lesson,{guideId:'guide-a',lessonId:'lesson-a'}),
    /Unsafe legacy page image URL/,
  );
});

test('legacy Plate migration preserves safe page images as Plate image blocks', () => {
  const lesson={
    title:'Media',
    contentPages:[{pageNumber:1,title:'Page',content:'Text',imageUrl:'https://example.org/study.jpg'}],
  };
  const preview=buildPlateMigrationPreview(lesson,{guideId:'guide-a',lessonId:'lesson-a'});
  const section=preview.chapters[0].sections[0];
  const image=section.blocks.find(block=>block.type==='image');
  assert.equal(image?.src,'https://example.org/study.jpg');
  assert.equal(section.document.find(node=>node.type==='img')?.url,'https://example.org/study.jpg');
});

test('legacy Plate migration blocks a conversion that would orphan quiz anchors', () => {
  const lesson={
    title:'Anchors',
    contentPages:[{
      pageNumber:1,title:'Page',chapterId:'chapter-a',sectionId:'section-a',content:'Text',
    }],
  };
  const preview=buildPlateMigrationPreview(lesson,{guideId:'guide-a',lessonId:'lesson-a'});
  assert.equal(assertQuizAnchorsPreserved([
    {id:'quiz-ok',attachmentType:'section',anchorId:'section-a'},
  ],preview.anchors),true);
  assert.throws(()=>assertQuizAnchorsPreserved([
    {id:'quiz-broken',attachmentType:'block',anchorId:'legacy-block-that-would-disappear'},
  ],preview.anchors),/would break 1 quiz anchor/);
});

test('stable migration hashes ignore object key insertion order', () => {
  assert.equal(stableHash({b:2,a:{d:4,c:3}}),stableHash({a:{c:3,d:4},b:2}));
});
