import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path:string)=>readFileSync(path,'utf8');
const native=read('native_android/lib/screens/curriculum_lesson_editor_screen.dart');
const studio=read('native_android/lib/widgets/lesson_section_studio.dart');
const plate=read('native_android/lib/widgets/plate_document_editor.dart');
const vercel=JSON.parse(read('vercel.json'));

test('Classic Web lesson editing stays within Flutter rather than navigating to a Legacy URL',()=>{
  assert.match(native,/lessonMode:true/);
  assert.match(native,/action:'upsertLesson'/);
  assert.match(native,/actions\.contains\('update'\) && lesson\['canEdit'\]==true/);
  assert.doesNotMatch(native,/openUnifiedWebEditor|classic\/editor/);
  assert.ok(vercel.redirects.some((item:{source:string;destination:string})=>
    item.source==='/classic/editor'&&item.destination==='/classic/'));
  assert.ok(!vercel.rewrites.some((item:{source:string})=>item.source==='/classic/editor'));
});

test('Flutter editor uses continuous rich text with one ribbon and focusable learner pages',()=>{
  assert.match(studio,/PlateDocumentEditor\(/);
  assert.match(studio,/inlineMode:true/);
  assert.match(studio,/ribbonBar\(\)/);
  assert.match(studio,/pagesSidebar\(\)/);
  assert.match(studio,/for\(var i=0;i<sections\.length;i\+\+\)contentPage\(sections\[i\],i\)/);
  assert.match(studio,/Scrollable\.ensureVisible/);
  for(const label of ['Home','Insert','Scripture & Layout','LEARNER PAGES']){
    assert.ok(studio.includes(label),label);
  }
  assert.match(plate,/widget\.inlineMode\?inlineDocument\(\)/);
  assert.match(plate,/rebaseLeaves\(/);
  assert.match(plate,/void undo\(\)/);
  assert.match(plate,/void redo\(\)/);
});

test('Legacy local draft indicator only reports successful browser storage writes',()=>{
  const src=read('src/pages/CurriculumManager.tsx');
  const css=read('src/components/admin/plate-structure.css');
  assert.match(src,/function saveLocalDraft\(editor: EditorState\): boolean/);
  assert.match(src,/if \(!saveLocalDraft\(editor\)\) \{/);
  assert.match(css,/\.vop-plate-autosave-chip\.failed/);
});
