import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path:string)=>readFileSync(path,'utf8');
const native=read('native_android/lib/screens/curriculum_lesson_editor_screen.dart');
const studio=read('native_android/lib/widgets/lesson_section_studio.dart');
const plate=read('native_android/lib/widgets/plate_document_editor.dart');
const classic=read('native_android/lib/widgets/classic_web_lesson_studio.dart');
const record=read('native_android/lib/screens/workspace_records_screen.dart');
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

test('Classic Web renders native Flutter layout with one ribbon and focusable learner pages',()=>{
  assert.match(studio,/if\(kIsWeb\)/);
  assert.match(studio,/ClassicWebLessonStudio\(/);
  assert.match(classic,/class ClassicWebLessonStudio extends StatefulWidget/);
  assert.match(classic,/Widget header\(bool compact\)/);
  assert.match(classic,/Widget sidebar\(\{required bool compact\}\)/);
  assert.match(classic,/Widget ribbon\(\)/);
  assert.match(classic,/Widget documentCanvas\(\)/);
  assert.match(classic,/PlateDocumentEditor\(/);
  assert.match(classic,/inlineMode: true/);
  assert.match(classic,/Scrollable.ensureVisible/);
  assert.match(record,/widget.lessonMode&&kIsWeb&&lessonTab=='chapters'/);
  for(const label of ['Home','Insert','Scripture & Layout','LEARNER PAGES',
    'SECTION / LEARNER PAGE','Save draft','Update']){
    assert.ok(classic.includes(label),label);
  }
  assert.match(plate,/widget.inlineMode\?inlineDocument\(\)/);
  assert.match(plate,/rebaseLeaves\(/);
  assert.match(plate,/setActiveFontSize/);
  assert.match(plate,/setActiveAlignment/);
  assert.match(plate,/patchSelectedLeaves/);
  assert.match(plate,/class PlateMarkedTextController/);
  assert.match(plate,/copySelection\(\)/);
  assert.match(plate,/pasteClipboard\(\)/);
  assert.match(plate,/cutSelection\(\)/);
  assert.match(classic,/ribbonIcon\(Icons.content_paste, 'Paste'/);

  assert.match(plate,/void undo\(\)/);
  assert.match(plate,/void redo\(\)/);
  assert.doesNotMatch(classic,/launchUrl|webOnlyWindowName/);
});

test('Legacy local draft indicator only reports successful browser storage writes',()=>{
  const src=read('src/pages/CurriculumManager.tsx');
  const css=read('src/components/admin/plate-structure.css');
  assert.match(src,/function saveLocalDraft\(editor: EditorState\): boolean/);
  assert.match(src,/if \(!saveLocalDraft\(editor\)\) \{/);
  assert.match(css,/\.vop-plate-autosave-chip\.failed/);
});
