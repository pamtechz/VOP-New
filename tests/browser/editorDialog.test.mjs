import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';

// A UI fixture uses the real editor and modal components. It does not emulate
// authentication or claim to test publication, API authorization or storage.
const root=fileURLToPath(new URL('../../',import.meta.url));
const entry=`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {StudyPlatePageEditor} from '/src/components/admin/StudyPlatePageEditor.tsx';
import {createStudyPlateSectionMarker} from '/shared/studyPlateAuthoring.ts';
import {appConfirm} from '/src/components/layout/AppDialog.tsx';
import '/src/index.css';
createRoot(document.getElementById('root')).render(React.createElement('main',{style:{padding:16,paddingTop:96}},
 React.createElement('button',{onClick:()=>{void appConfirm(Array(45).fill('A curriculum review item that requires scrolling.').join('\\n'),{title:'Review curriculum changes',confirmLabel:'Apply changes'}).then(value=>window.dialogResult=value);}},'Review changes'),
 React.createElement(StudyPlatePageEditor,{chapterId:'acceptance-chapter',
 document:[createStudyPlateSectionMarker('acceptance-section','Bible study'),{id:'acceptance-paragraph',type:'p',children:[{text:'Study editor acceptance paragraph.'}]}],
 canAttachQuiz:false,onSectionsChange:value=>window.savedSections=value})));
`;

test('real editor and long dialogs work at desktop, tablet and phone widths', {timeout:90000},async t=>{
  const server=await createServer({root,configFile:join(root,'vite.config.ts'),
    // Browser acceptance suites execute concurrently on Windows. Distinct
    // optimizer caches prevent competing renames of node_modules/.vite/deps.
    cacheDir:join(root,'node_modules','.vite-vop-editor-dialog-test'),
    server:{host:'127.0.0.1',port:0},plugins:[{
      name:'vop-browser-acceptance-fixture',
      resolveId(id){if(id==='virtual:vop-editor-acceptance')return '\0vop-editor-acceptance';},
      load(id){if(id==='\0vop-editor-acceptance')return entry;},
      configureServer(vite){vite.middlewares.use('/__vop_editor',async(_req,res)=>{
        res.setHeader('Content-Type','text/html');
        res.end(await vite.transformIndexHtml('/__vop_editor',
          '<!doctype html><html lang="en"><body><div id="root"></div><script type="module" src="/@id/__x00__vop-editor-acceptance"></script></body></html>'));
      });},
    }]});
  let browser;
  try{
    await server.listen();
    browser=await chromium.launch({headless:true,
      executablePath:process.env.VOP_BROWSER_EXECUTABLE||undefined,
      args:process.platform==='linux'?['--disable-gpu','--disable-software-rasterizer','--use-gl=disabled']:[],
    });
    const page=await browser.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const url='http://127.0.0.1:'+server.httpServer.address().port+'/__vop_editor';
    for(const width of [1440,768,390,320]){
      await t.test(width+'px: bounded editor, readable long dialog and keyboard focus',async()=>{
        await page.setViewportSize({width,height:900});
        await page.goto(url);
        await page.getByText('Study editor acceptance paragraph.').waitFor();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        const trigger=page.getByRole('button',{name:'Review changes',exact:true});
        await trigger.click();
        const dialog=page.getByRole('dialog');
        await dialog.waitFor();
        await page.waitForFunction(()=>document.activeElement?.textContent==='Apply changes');
        const title=await page.getByRole('heading',{name:'Review curriculum changes'}).boundingBox();
        const primary=await page.getByRole('button',{name:'Apply changes'}).boundingBox();
        assert.ok(title&&title.y>=0&&title.y+title.height<=900,'title remains in the viewport');
        assert.ok(primary&&primary.y>=0&&primary.y+primary.height<=900,'primary action remains in the viewport');
        assert.equal(await dialog.locator('.vop-app-dialog-body').evaluate(el=>el.scrollHeight>el.clientHeight),true);
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Close');
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Apply changes');
        if(process.env.VOP_BROWSER_ARTIFACT_DIR){
          await mkdir(process.env.VOP_BROWSER_ARTIFACT_DIR,{recursive:true});
          await page.screenshot({path:join(process.env.VOP_BROWSER_ARTIFACT_DIR,'dialog-'+width+'.png'),fullPage:true});
        }
        await page.keyboard.press('Escape');
        await dialog.waitFor({state:'hidden'});
        await page.waitForFunction(()=>document.activeElement?.textContent==='Review changes');
        assert.equal(await page.evaluate(()=>window.dialogResult),false);
      });
    }
    await t.test('typing updates the real editor while preserving section and block identity',async()=>{
      const paragraph=page.getByText('Study editor acceptance paragraph.',{exact:true});
      await paragraph.click();
      await page.getByRole('textbox',{name:'Edit study chapter'}).press('End');
      await page.keyboard.type(' Additional reading.');
      try{
        await page.waitForFunction(()=>JSON.stringify(window.savedSections||[]).includes('Additional reading.'),{},{timeout:5000});
      }catch(error){
        console.error({errors,dom:await page.evaluate(()=>({text:document.body.innerText,active:document.activeElement?.getAttribute('role'),selection:window.getSelection()?.anchorNode?.textContent,sections:window.savedSections}))});
        throw error;
      }
      const sections=await page.evaluate(()=>window.savedSections);
      assert.equal(sections[0].id,'acceptance-section');
      assert.ok(sections[0].blocks.some(block=>block.id==='acceptance-paragraph'));
    });
    await t.test('formatting retains the caret and updates the toolbar state',async()=>{
      const editor=page.getByRole('textbox',{name:'Edit study chapter'});
      await editor.press('Control+End');
      const bold=page.getByRole('button',{name:'Bold',exact:true});
      await bold.click();
      await page.waitForFunction(()=>document.querySelector('button[aria-label="Bold"]')?.getAttribute('aria-pressed')==='true');
      await page.keyboard.type(' Bold reading.');
      await page.waitForFunction(()=>JSON.stringify(window.savedSections||[]).includes('Bold reading.'));
      const sections=await page.evaluate(()=>window.savedSections);
      assert.equal(sections[0].id,'acceptance-section');
      assert.ok(JSON.stringify(sections[0].document).includes('"bold":true'));
    });
    assert.deepEqual(errors,[],'no browser runtime errors');
  }finally{await browser?.close();await server.close();}
});
