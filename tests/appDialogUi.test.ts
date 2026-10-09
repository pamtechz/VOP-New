import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=(file:string)=>readFileSync(root+file,'utf8');

function sourceFiles(dir:string):string[]{
  return readdirSync(dir).flatMap(name=>{
    const path=dir+'/'+name;
    return statSync(path).isDirectory()?sourceFiles(path):/\.(?:ts|tsx)$/.test(name)?[path]:[];
  });
}

test('app actions use VOP modal dialogs instead of native browser popups',()=>{
  const files=sourceFiles(root+'src');
  for(const file of files){
    const source=readFileSync(file,'utf8');
    assert.doesNotMatch(source,/window\.(?:alert|confirm|prompt)\s*\(/,file);
  }
  const dialog=read('src/components/layout/AppDialog.tsx');
  assert.match(dialog,/ModalLayer/);
  assert.match(dialog,/aria-modal="true"/);
  assert.match(dialog,/export async function appConfirm/);
  assert.match(dialog,/export async function appPrompt/);
  assert.match(dialog,/export function AppAlertDialog/);
});

test('curriculum and user action popovers render in the global modal layer',()=>{
  const menu=read('src/components/admin/StructureActionsMenu.tsx');
  const css=read('src/pages/curriculum-structure.css');
  assert.match(menu,/<ModalLayer><div ref=\{popover\}/);
  assert.match(menu,/getBoundingClientRect\(\)/);
  assert.match(menu,/window\.addEventListener\('scroll',reposition,true\)/);
  assert.match(menu,/popover\.current\?\.contains\(target\)/);
  assert.match(css,/\.vop-structure-actions-popover\.is-portaled\{[\s\S]*position:fixed/);
});

test('management lists keep useful height while their menus are portaled',()=>{
  const users=read('src/pages/UserManagement.tsx');
  const css=read('src/pages/userManagement.css');
  assert.match(users,/StructureActionsMenu label=/);
  assert.match(users,/AppAlertDialog message=\{error\}/);
  assert.match(css,/\.vop-user-table-wrap\{[\s\S]*min-height:clamp\(340px,46vh,620px\)/);
  assert.doesNotMatch(users,/vop-user-menu/);
  assert.doesNotMatch(users,/vop-user-alert/);
});

test('Curriculum Studio popup errors use a top-layer modal',()=>{
  const page=read('src/pages/CurriculumManager.tsx');
  assert.match(page,/AppAlertDialog message=\{error\} title=\{tx\('admin\.curriculum\.curriculum_studio',["']Curriculum Studio["']\)\}/);
  assert.doesNotMatch(page,/vop-reference-alert/);
});
