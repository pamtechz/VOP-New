import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPersonalRuntimeSettings,resetPersonalRuntimeSettings} from '../src/services/personalRuntimeSettings.ts';

test('personal accessibility settings map to root runtime attributes',()=>{
  const attributes=new Set<string>();
  const previous=(globalThis as {document?:unknown}).document;
  (globalThis as {document?:unknown}).document={
    documentElement:{
      toggleAttribute(name:string,force?:boolean){
        if(force)attributes.add(name);else attributes.delete(name);
      },
    },
  };
  try{
    applyPersonalRuntimeSettings({accessibility:{reducedMotion:true,largeText:true,highContrast:false}});
    assert.equal(attributes.has('data-vop-reduced-motion'),true);
    assert.equal(attributes.has('data-vop-large-text'),true);
    assert.equal(attributes.has('data-vop-high-contrast'),false);
    resetPersonalRuntimeSettings();
    assert.equal(attributes.size,0);
  }finally{
    (globalThis as {document?:unknown}).document=previous;
  }
});
