import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=(file:string)=>readFileSync(root+file,'utf8');

test('curriculum chapters use the full editor width with one ellipsis per node',()=>{
  const editor=read('src/components/admin/StructuredLessonEditor.tsx');
  const css=read('src/pages/curriculum-structure.css');
  assert.doesNotMatch(editor,/vop-structure-outline/);
  assert.match(css,/vop-structure-workspace,.vop-structure-content\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  for(const kind of ['chapter','section','block']){
    assert.match(editor,new RegExp("transferPicker\\('"+kind+"'"));
  }
  assert.match(editor,/moveChapter\(chapterIndex,-1\)/);
  assert.match(editor,/moveChapter\(chapterIndex,1\)/);
  assert.match(editor,/StructureActionsMenu label=\{chapter\.title/);
  assert.match(editor,/StructureActionsMenu label=\{section\.title/);
  assert.match(editor,/StructureActionsMenu label=\{block\.type/);
  const popover=read('src/components/admin/StructureActionsMenu.tsx');
  assert.match(popover,/aria-expanded=\{open\}/);
  assert.match(popover,/event\.key==='Escape'/);
  assert.match(popover,/document\.addEventListener\('pointerdown',outside\)/);
  assert.match(css,/vop-structure-actions-popover/);
});

test('featured image uses an editor tab rather than a permanent right column',()=>{
  const page=read('src/pages/CurriculumManager.tsx');
  const css=read('src/pages/curriculum-structure.css');
  assert.match(page,/\['image', tx\('curriculum\.featuredImage'/);
  assert.match(page,/editorTab === 'image'/);
  assert.match(page,/vop-lesson-featured-preview/);
  assert.doesNotMatch(page,/aside className="vop-reference-editor-side"/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
});

test('lesson auxiliary tabs have consistent padding and persistence feedback',()=>{
  const page=read('src/pages/CurriculumManager.tsx');
  const css=read('src/pages/curriculum-structure.css');
  assert.match(page,/editorTab === 'media'[\s\S]*vop-lesson-aux-tab/);
  assert.match(page,/editorTab === 'bible'[\s\S]*vop-lesson-aux-tab/);
  assert.match(page,/editorTab === 'notes'[\s\S]*vop-lesson-aux-tab/);
  assert.match(page,/editorTab === 'settings'[\s\S]*vop-lesson-aux-tab/);
  assert.match(css,/\.vop-lesson-aux-tab\{[\s\S]*padding:15px/);
  assert.match(page,/vop-editor-save-status/);
  assert.match(page,/Saving changes…/);
  assert.match(page,/Unsaved changes/);
  assert.match(page,/All changes saved/);
  assert.match(page,/Not saved yet/);
  assert.match(page,/saving\?tx\('common\.saving','Saving…'\):tx\('curriculum\.saveDraft'/);
  assert.match(css,/\.vop-editor-save-status\.saving/);
  assert.match(css,/\.vop-editor-save-status\.saved/);
  assert.match(css,/\.vop-editor-save-status\.dirty/);
});

test('compact rails and certification controls preserve certificate artwork geometry',()=>{
  const css=read('src/components/layout/navigation-header.css');
  const cert=read('src/pages/certification-compact.css');
  assert.match(css,/--vop-rail-expanded:clamp\(230px,18vw,258px\)/);
  assert.match(css,/--vop-rail-compact:64px/);
  assert.match(css,/height:64px!important;min-height:64px!important/);
  assert.match(css,/width:18px;height:18px;flex-basis:18px/);
  assert.match(cert,/\.vop-cert-list-head h1/);
  assert.match(cert,/font-size:20px!important/);
  assert.match(cert,/\.vop-cert-primary-button/);
  assert.match(cert,/min-height:35px!important/);
  assert.doesNotMatch(cert,/\.vop-certificate-artwork\s*\{/);
  assert.match(read('src/pages/CertificationManager.tsx'),/import '\.\/certification-compact\.css'/);
  assert.doesNotMatch(read('src/pages/AdminPage.tsx'),/vop-admin-header-language/);
});
