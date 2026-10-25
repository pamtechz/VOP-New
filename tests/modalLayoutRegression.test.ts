import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=(path:string)=>readFileSync(root+path,'utf8');

test('Hero Slide uses a real popup page with a constrained scroll region and pinned actions',()=>{
  const editor=read('src/components/admin/HeroSliderManager.tsx');
  const styles=read('src/components/admin/hero-slider-manager.css');
  assert.match(editor,/<ModalLayer>/);
  assert.match(editor,/role="dialog" aria-modal="true"/);
  assert.match(editor,/aria-labelledby="vop-hsm-editor-title"/);
  assert.match(editor,/className="vop-hsm-editor-form"/);
  assert.match(editor,/className="vop-hsm-modal-body" tabIndex=\{0\}/);
  assert.match(editor,/className="vop-hsm-modal-foot"/);
  assert.match(styles,/\.vop-hsm-editor-form\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.match(styles,/\.vop-hsm-modal-body\s*\{[\s\S]*?min-height:\s*0[\s\S]*?overflow-y:\s*auto/);
  assert.match(styles,/\.vop-hsm-modal-foot\s*\{[\s\S]*?flex:\s*0 0 auto/);
  assert.match(styles,/100dvh/);
  assert.match(styles,/@media \(max-width: 700px\), \(max-height: 570px\)/);
});

test('long admin modals have responsive, scrollable viewport constraints without clipping form actions',()=>{
  const global=read('src/modal-overflow.css');
  const main=read('src/main.tsx');
  assert.match(main,/import '\.\/modal-overflow\.css'/);
  for(const name of [
    'vop-admin-editor-modal','vop-ann-editor-modal','vop-radio-editor-modal',
    'vop-candidate-modal','vop-cert-issuer-modal','vop-user-modal',
    'vop-cs-modal','vop-payment-modal',
  ])assert.ok(global.includes(name),name+' is missing scroll protection');
  assert.match(global,/\.vop-admin-editor-modal \.vop-admin-editor-scroll\s*\{[\s\S]*?flex:\s*1 1 auto[\s\S]*?min-height:\s*0/);
  assert.match(global,/\.vop-radio-editor-modal \.vop-radio-editor-body\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(global,/overflow-y:\s*auto/);
  assert.match(global,/max-height:\s*100dvh/);
  assert.match(global,/overscroll-behavior:\s*contain/);
  assert.match(global,/-webkit-overflow-scrolling:\s*touch/);
});


test('long-form user, announcement and payment editors keep primary actions accessible',()=>{
  const styles=read('src/modal-overflow.css');
  for(const selector of [
    '.vop-ann-editor-modal > div:last-child',
    '.vop-user-editor-modal > .vop-user-modal-actions',
    '.vop-candidate-modal > .vop-candidate-modal-actions',
    '.vop-payable-editor > .vop-payment-submit',
    '.vop-app-dialog-actions',
  ])assert.ok(styles.includes(selector),selector+' needs a visible action bar');
  assert.match(styles,/position:\s*sticky/);
  assert.match(styles,/bottom:\s*0/);
  assert.match(styles,/safe-area-inset-bottom/);
  assert.match(styles,/\.vop-payable-editor[\s\S]*?overscroll-behavior-y:\s*contain/);
  const user=read('src/pages/UserManagement.tsx');
  const admin=read('src/pages/AdminRecordsPanel.tsx');
  const payment=read('src/pages/PaymentManagement.tsx');
  assert.match(user,/vop-user-modal-actions/);
  assert.match(admin,/vop-ann-editor-modal/);
  assert.match(payment,/vop-payable-editor/);
});
