import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {
  pushLearnerLocation,
  readLearnerLocation,
  rememberLearnerLocationFromHistory,
  replaceLearnerLocation,
} from '../src/services/learnerNavigation.ts';

type BrowserHarness={
  setState:(value:unknown)=>void;
  state:()=>unknown;
  pushCalls:()=>number;
  replaceCalls:()=>number;
  restore:()=>void;
};

function installBrowser():BrowserHarness{
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  const values=new Map<string,string>();
  let state:unknown=null;
  let href='https://vop.test/app';
  let pushes=0;
  let replaces=0;

  const storage={
    get length(){return values.size;},
    clear(){values.clear();},
    getItem(key:string){return values.has(key)?values.get(key)!:null;},
    key(index:number){return [...values.keys()][index]??null;},
    removeItem(key:string){values.delete(key);},
    setItem(key:string,value:string){values.set(key,String(value));},
  } as Storage;

  const history={
    get state(){return state;},
    pushState(next:unknown,_unused:string,url?:string|URL|null){
      pushes+=1;
      state=structuredClone(next);
      if(url!==undefined&&url!==null)href=String(url);
    },
    replaceState(next:unknown,_unused:string,url?:string|URL|null){
      replaces+=1;
      state=structuredClone(next);
      if(url!==undefined&&url!==null)href=String(url);
    },
  } as unknown as History;

  const windowValue={
    history,
    location:{get href(){return href;}},
  } as unknown as Window;

  Object.defineProperty(globalThis,'window',{configurable:true,value:windowValue});
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:storage});

  return {
    setState(value){state=structuredClone(value);},
    state:()=>state,
    pushCalls:()=>pushes,
    replaceCalls:()=>replaces,
    restore(){
      if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);
      else delete (globalThis as {window?:unknown}).window;
      if(previousStorage)Object.defineProperty(globalThis,'sessionStorage',previousStorage);
      else delete (globalThis as {sessionStorage?:unknown}).sessionStorage;
    },
  };
}

test('session resume remembers location without recreating stale browser history depth',()=>{
  const browser=installBrowser();
  try{
    replaceLearnerLocation('learner-a',{route:'lessons'},7);
    assert.equal((browser.state() as {vopLearnerDepth?:number}).vopLearnerDepth,7);

    // A new document/history entry in the same tab may still have the resume
    // bookmark in sessionStorage, but it must start with no internal Back depth.
    browser.setState(null);
    assert.deepEqual(readLearnerLocation('learner-a'),{
      location:{route:'lessons'},
      depth:0,
    });

    pushLearnerLocation('learner-a',{route:'resources'});
    assert.equal((browser.state() as {vopLearnerDepth?:number}).vopLearnerDepth,1);
  }finally{
    browser.restore();
  }
});

test('Back/Forward destination refreshes resume memory without mutating browser history',()=>{
  const browser=installBrowser();
  try{
    const historyState={
      foreignState:'keep-me',
      vopLearner:{uid:'learner-b',location:{route:'prayer'}},
      vopLearnerDepth:3,
    };
    browser.setState(historyState);
    const pushes=browser.pushCalls();
    const replaces=browser.replaceCalls();

    const remembered=rememberLearnerLocationFromHistory('learner-b',historyState);
    assert.deepEqual(remembered,{location:{route:'prayer'},depth:3});
    assert.equal(browser.pushCalls(),pushes);
    assert.equal(browser.replaceCalls(),replaces);

    // Simulate a later reload/new entry. Resume follows the popped-to location,
    // while history depth is deliberately reset.
    browser.setState(null);
    assert.deepEqual(readLearnerLocation('learner-b'),{
      location:{route:'prayer'},
      depth:0,
    });
  }finally{
    browser.restore();
  }
});

test('application popstate flow treats browser history as authoritative and URL cleanup preserves state',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const app=readFileSync(root+'src/App.tsx','utf8');
  const inbox=readFileSync(root+'src/pages/InboxPage.tsx','utf8');
  const certificate=readFileSync(root+'src/pages/CertificateVerificationPage.tsx','utf8');

  assert.match(app,/rememberLearnerLocationFromHistory\(uid,event\.state\)/);
  assert.match(app,/pendingHistoryLocation\.current=stored\.location/);
  assert.match(app,/if\(pendingHistoryLocation\.current\)/);
  assert.doesNotMatch(app,/learnerLocationFromHistory\(uid,event\.state\)/);
  assert.match(app,/replaceState\(window\.history\.state, '', window\.location\.pathname\)/);
  assert.match(inbox,/replaceState\(window\.history\.state,''/);
  assert.match(certificate,/replaceState\(window\.history\.state, '', url\)/);
});
