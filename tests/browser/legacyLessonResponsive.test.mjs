import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';

const root=fileURLToPath(new URL('../../',import.meta.url));
const entry="import React from 'react';\nimport {createRoot} from 'react-dom/client';\nimport {PlateCurriculumAuthoringReview} from '/src/components/admin/PlateCurriculumAuthoringReview.tsx';\nimport '/src/index.css';\nconst chapter={id:'responsive-chapter',title:'Chapter with an informative heading',sections:[{id:'responsive-section',title:'Creation and redemption',blocks:[{id:'responsive-block',type:'paragraph',text:'A complete lesson section with real text.'}]},{id:'responsive-evidence',title:'Evidence and faith',blocks:[{id:'evidence-block',type:'paragraph',text:'Consider the evidence and study further.'}]}]};\nconst headers=React.createElement('div',{className:'vop-plate-header-fields'},...[['Lesson Title','text'],['Lesson #','number'],['Guide','text'],['Season','text'],['Language','text']].map(([title,type])=>React.createElement('label',{className:'vop-plate-header-field'+(title==='Lesson Title'?' vop-plate-field-title':title==='Lesson #'?' vop-plate-field-small':'')},React.createElement('span',null,title),React.createElement('input',{type,defaultValue:title==='Lesson Title'?'Creation':'1','aria-label':title}))));\nfunction Fixture(){const [chapters,setChapters]=React.useState([chapter]);React.useEffect(()=>{window.vopFixtureChapters=chapters;},[chapters]);return React.createElement('div',{className:'vop-fullpage-lesson-editor'},React.createElement(PlateCurriculumAuthoringReview,{chapters,onChange:setChapters,onQuiz:()=>{},canAttachQuiz:false,lessonPublished:false,guideTitle:'Discover',lessonTitle:'Creation',canTransfer:false,otherLessons:[],onTransfer:()=>{},onBack:()=>{},onSave:()=>{window.savedLessonCount=(window.savedLessonCount||0)+1;},lessonHeaderFields:headers,autoSaveChip:React.createElement('span',{className:'vop-plate-autosave-chip'},'Draft status')}));}\ncreateRoot(document.getElementById('root')).render(React.createElement(Fixture));";

test('legacy lesson authoring remains operable across desktop, tablet and small phones',
  {timeout:120000},async t=>{
  const server=await createServer({root,configFile:join(root,'vite.config.ts'),
    server:{host:'127.0.0.1',port:0},plugins:[{
      name:'legacy-responsive-acceptance-fixture',
      resolveId(id){if(id==='virtual:vop-lesson-responsive')return '\0vop-lesson-responsive';},
      load(id){if(id==='\0vop-lesson-responsive')return entry;},
      configureServer(vite){vite.middlewares.use('/__vop_responsive',async(_req,res)=>{
        res.setHeader('Content-Type','text/html');
        res.end(await vite.transformIndexHtml('/__vop_responsive',
          '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/__x00__vop-lesson-responsive"></script></body></html>'));
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
    page.on('pageerror',e=>errors.push(e.message));
    const url='http://127.0.0.1:'+server.httpServer.address().port+'/__vop_responsive';
    for(const width of [1440,1024,768,390,320]){
      await t.test(width+'px: no clipped save actions or unintentional horizontal overflow',async()=>{
        await page.setViewportSize({width,height:850});
        await page.goto(url);
        const draft=page.getByRole('button',{name:'Save lesson draft'});
        const publish=page.getByRole('button',{name:'Publish lesson'});
        await draft.waitFor();
        await page.getByRole('textbox',{name:'Edit study chapter'}).waitFor();
        const layout=await page.evaluate(()=>{
          const root=document.querySelector('.vop-fullpage-lesson-editor');
          const pane=document.querySelector('.vop-plate-document-pane');
          const buttons=[...document.querySelectorAll('.vop-plate-header-save-actions button')];
          const bounds=buttons.map(button=>button.getBoundingClientRect());
          return {scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,
            rootWidth:root.getBoundingClientRect().width,
            paneWidth:pane.getBoundingClientRect().width,
            saveButtons:bounds.map(rect=>({left:rect.left,right:rect.right,width:rect.width}))};
        });
        assert.ok(layout.scrollWidth<=width+1,'no document-wide horizontal overflow: '+JSON.stringify(layout));
        assert.ok(layout.rootWidth<=width+1,'full editor fits viewport');
        assert.ok(layout.paneWidth<=width+1,'lesson pane fits viewport');
        assert.ok(layout.saveButtons.length>=3,'save and publish actions are present');
        for(const button of layout.saveButtons){
          assert.ok(button.width>0 && button.left>=-1 && button.right<=width+1,
            'all save actions stay inside viewport: '+JSON.stringify(layout));
        }
        await draft.click();
        assert.equal(await page.evaluate(()=>window.savedLessonCount),1);
        await publish.click();
        assert.equal(await page.evaluate(()=>window.savedLessonCount),2);
      });
    }
    for(const width of [390,1440]){
      await t.test(width+'px: selecting a section focuses its matching content marker',async()=>{
        await page.setViewportSize({width,height:850});
        await page.goto(url);
        const target=width<861
          ?page.locator('.vop-studio-mobile-pages button').filter({hasText:'Evidence and faith'})
          :page.getByRole('button',{name:'Focus section 2: Evidence and faith'});
        await target.waitFor();
        await target.click();
        await page.waitForFunction(()=>{
          const marker=document.querySelector('[data-vop-section-id="responsive-evidence"]');
          return marker?.getAttribute('data-vop-focused')==='true';
        });
        assert.equal(await page.locator('[data-vop-section-id="responsive-evidence"]')
          .getAttribute('data-vop-focused'),'true');
        if(width===390){
          await page.getByRole('button',{name:'Add Block'}).click();
          await page.waitForFunction(()=>{
            const sections=window.vopFixtureChapters?.[0]?.sections;
            return sections?.find(section=>section.id==='responsive-evidence')?.blocks?.length===2;
          });
          assert.equal(await page.evaluate(()=>{
            const sections=window.vopFixtureChapters[0].sections;
            return sections.find(section=>section.id==='responsive-section').blocks.length;
          }),1,'adding a mobile block must not duplicate or alter a different section');
        }
      });
    }
    assert.deepEqual(errors,[],'no browser runtime errors during resizing');
  }finally{await browser?.close();await server.close();}
});
