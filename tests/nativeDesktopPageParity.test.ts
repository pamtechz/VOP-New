import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(name:string)=>readFileSync('native_android/lib/'+name,'utf8');

test('Classic desktop frame supports native mobile and role-scoped web navigation',()=>{
  const desktop=read('widgets/vop_desktop_layout.dart');
  const nav=read('screens/workspace_navigation.dart');
  const shell=read('widgets/workspace_desktop_shell.dart');
  assert.match(desktop,/MediaQuery\.sizeOf\(context\)\.width >= 1160/);
  assert.match(desktop,/if \(!isDesktop\(context\)\) return child/);
  assert.match(desktop,/WorkspaceNavigation\(api: api, compact: true\)/);
  assert.match(nav,/this\.compact=false/);
  assert.match(nav,/permissions=recordMap/);
  assert.match(nav,/if\(can\('users','view'\)\)/);
  assert.match(nav,/if \(widget\.compact\)/);
  assert.match(shell,/WorkspaceNavigation\(api: api, compact: true\)/);
});

test('Desktop secondary pages use a persistent workspace navigation frame',()=>{
  const screens=[
    'workspace_records_screen.dart',
    'candidates_screen.dart',
    'organizations_screen.dart',
    'user_management_screen.dart',
    'graduations_screen.dart',
    'plans_management_screen.dart',
    'workspace_operations_screen.dart',
  ];
  for (const name of screens) {
    const source=read('screens/'+name);
    assert.match(source,/VopDesktopWorkspaceFrame\(api:\s*widget\.api,\s*child:/,name);
    assert.match(source,/import '\.\.\/widgets\/vop_desktop_layout\.dart';/,name);
  }
});

test('Roster and records have true adaptive desktop layouts without breaking mobile',()=>{
  const candidates=read('screens/candidates_screen.dart');
  const records=read('screens/workspace_records_screen.dart');
  assert.match(candidates,/GridView\.builder\(/);
  assert.match(candidates,/ListView\.separated\(/);
  assert.match(candidates,/size\.maxWidth >= 760/);
  assert.match(candidates,/itemBuilder: \(context, index\) => candidateCard\(index\)/);
  assert.match(records,/tableOverride \?\? VopDesktopWorkspaceFrame\.isDesktop\(context\)/);
  assert.match(records,/DataTable\(columns:/);
  assert.match(records,/onTap:\(\)=>_details\(item,schema,workspace,actions\)/);
  assert.match(records,/ListView\.separated/);
});

test('Classic library and account setting panels adapt for desktop instead of phone layouts',()=>{
  const content=read('screens/content_screen.dart');
  const account=read('screens/account_settings_screen.dart');
  assert.match(content,/layout\.maxWidth>=1020\?3:/);
  assert.match(content,/final rowCount=\(filtered\.length\+columns-1\)~\/columns/);
  assert.match(content,/ListView\.builder\(/);
  assert.match(content,/filtered\[offset\+column\]/);
  assert.match(account,/NavigationRail\(/);
  assert.match(account,/MediaQuery\.sizeOf\(context\)\.width<1000/);
  assert.match(account,/onDestinationSelected:\(index\)=>setState\(\(\)=>page=index\)/);
});

test('Users and organizations use lazy desktop column listings',()=>{
  const list=read('widgets/vop_management_list.dart');
  const users=read('screens/user_management_screen.dart');
  const organizations=read('screens/organizations_screen.dart');
  assert.match(list,/layout.maxWidth>=820/);
  assert.match(list,/ListView.builder\(/);
  assert.match(list,/ListView.separated\(/);
  assert.match(users,/VopAdaptiveManagementList\(/);
  assert.match(organizations,/VopAdaptiveManagementList\(/);
});
