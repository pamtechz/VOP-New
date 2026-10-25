import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';

test('component namespaces preserve published translation keys, fallback and live locale changes',async()=>{
  const original={fetch:globalThis.fetch,localStorage:globalThis.localStorage,document:globalThis.document};
  const storage=new Map([['vop_ui_locale','eng']]);
  Object.assign(globalThis,{
    localStorage:{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value)},
    document:{documentElement:{}},
    fetch:async(url:string)=>({ok:true,json:async()=>url==='/api/localization'
      ?{items:[{code:'eng',aliases:['en']},{code:'bem'}]}
      :{translations:{'admin.study_table.insert_row':String(url).endsWith('bem')?'Translated row':'Insert row'}}}),
  });
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try{
    const {createUiTranslator,setUiLocale,loadUiLocale}=await vite.ssrLoadModule('/src/services/i18n.ts');
    const translate=createUiTranslator('admin.study_table','StudyEditableTable');
    assert.equal(translate('insert_row','Insert row'),'Insert row');
    setUiLocale('bem');
    await loadUiLocale('bem');
    assert.equal(translate('insert_row','Insert row'),'Translated row');
    assert.equal(translate('missing_label','Unpublished fallback'),'Unpublished fallback');
    setUiLocale('eng');
    await loadUiLocale('eng');
    assert.equal(translate('insert_row','Insert row'),'Insert row');
  }finally{
    await vite.close();
    Object.assign(globalThis,original);
  }
});
