import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {validateMaster,buildLesson,existingLessonFor,planImport,applySourceOverrides} from '../tools/seed/seed-vop-guides.mjs';

const master=JSON.parse(readFileSync(new URL('../content/lessons.master.json',import.meta.url),'utf8'));
const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
after(async()=>vite.close());
const {normalizeCurriculumStructure}=await vite.ssrLoadModule('/shared/curriculumStructure.ts');
const inventory=validateMaster(master);

test('all supplied lessons remain readable in the canonical app schema, with original text and section order',()=>{
  let pages=0;
  for(const [language,lessons]of inventory){
    assert.equal(lessons.length,26);
    for(const source of lessons){
      const lesson=buildLesson(source,{guideId:`guide-${language}`});
      assert.deepEqual(normalizeCurriculumStructure(lesson.chapters),lesson.chapters);
      assert.equal(lesson.contentPages.length,source.pages.length);
      for(const [index,page]of lesson.contentPages.entries()){
        assert.equal(page.title,source.pages[index].title);
        assert.equal(page.content,source.pages[index].blocks.filter(block=>block.type==='text').map(block=>block.text).join('\n\n'));
        assert.ok(!page.content.includes('\\n\\n'));
        pages++;
      }
      assert.equal(lesson.attribution,source.attribution);
      assert.equal(lesson.source.sha256,source.source.sha256);
      assert.equal(lesson.published,false);
      assert.ok(!('questions'in lesson)&&!('quiz'in lesson));
    }
  }
  assert.equal(pages,364);
});

test('lesson images point to existing deployment asset paths and match the approved archive checksums',()=>{
  const {assetHashes}=JSON.parse(readFileSync(new URL('../content/import-report.json',import.meta.url),'utf8'));
  for(const lessons of inventory.values())for(const source of lessons){
    const lesson=buildLesson(source,{guideId:'guide-one'});
    for(const section of lesson.chapters[0].sections)for(const block of section.blocks){
      if(block.type!=='image')continue;
      const url=new URL(block.src);
      assert.equal(url.origin,'https://vopafrica.vercel.app');
      assert.match(url.pathname,/^\/lessons\/assets\//);
      assert.ok(assetHashes[url.pathname.split('/').at(-1)]);
      assert.equal(createHash('sha256').update(readFileSync(new URL('../public'+url.pathname,import.meta.url))).digest('hex'),assetHashes[url.pathname.split('/').at(-1)]);
    }
  }
});

function fakeDb(records){
  const db={
    doc(path){return {path,id:path.split('/').at(-1),async get(){return snapshot(path);},collection(name){return collection(path+'/'+name);}};},
    collection,
  };
  function snapshot(path){return {id:path.split('/').at(-1),exists:records.has(path),data:()=>records.get(path),ref:db.doc(path),updateTime:{seconds:1}};}
  function collection(path){return {async get(){return {docs:[...records.keys()].filter(key=>key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/')).map(snapshot)};}};}
  return db;
}
test('a real inventory attaches to the existing program and guide, then produces zero writes on repeat',async()=>{
  const records=new Map([
    ['programs/vop',{title:'VOP',published:true,sharingScope:'shared',organizationId:'',guideIds:['unrelated-guide']}],
    ['guides/ukusanga',{title:'UKUSANGA',published:true,language:'bem',sharingScope:'shared',organizationId:''}],
    ['languages/bem',{enabled:true}],['languages/toi',{enabled:true}],
  ]);
  const db=fakeDb(records);
  const options={programTitle:'VOP',origin:'https://vopafrica.vercel.app',publish:true,now:'2026-10-22T12:00:00Z'};
  const plan=await planImport(db,inventory,options);
  assert.equal(plan.programId,'vop');
  assert.equal(plan.guides[0].id,'ukusanga');
  assert.equal(plan.writes.filter(write=>write.path.includes('/lessons/')).length,52);
  assert.equal(plan.writes.filter(write=>write.path.startsWith('curricula/')).length,0);
  assert.deepEqual(plan.writes.find(write=>write.path==='programs/vop').data.guideIds,['unrelated-guide','ukusanga','vop-vop-toi']);
  for(const write of plan.writes)records.set(write.path,write.create?write.data:{...records.get(write.path),...write.data});
  assert.equal((await planImport(db,inventory,options)).writes.length,0);
  records.get('guides/ukusanga/lessons/lesson-01').seed.sourceContentHash='changed';
  await assert.rejects(()=>planImport(db,inventory,options),/will not be overwritten/);
});
test('a disabled language or an archived guide blocks the complete plan before any mutation',async()=>{
  const records=new Map([
    ['programs/vop',{title:'VOP',published:true,sharingScope:'shared',organizationId:'',guideIds:[]}],
    ['guides/ukusanga',{title:'UKUSANGA',archived:true,published:true,language:'bem',sharingScope:'shared',organizationId:''}],
    ['languages/bem',{enabled:true}],['languages/toi',{enabled:false}],
  ]);
  const options={programTitle:'VOP',origin:'https://vopafrica.vercel.app',publish:true,now:'2026-10-22T12:00:00Z'};
  await assert.rejects(()=>planImport(fakeDb(records),inventory,options),/archived/);
  records.get('guides/ukusanga').archived=false;
  await assert.rejects(()=>planImport(fakeDb(records),inventory,options),/Enable toi/);
  assert.equal(records.has('guides/ukusanga/lessons/lesson-01'),false);
});

test('the supplied lessons replace only Bemba 1 and 2 and preserve every source word',()=>{
  const supplied=JSON.parse(readFileSync(new URL('../content/ukusanga-supplied-lessons-01-02.json',import.meta.url),'utf8'));
  const updated=applySourceOverrides(master,supplied);
  const text=lesson=>lesson.pages.map(page=>page.blocks.filter(block=>block.type==='text').map(block=>block.text).join(' ')).join(' ').replace(/\s+/g,' ');
  for(const lesson of supplied.lessons){
    const original=master.lessons.find(item=>item.lang==='bem'&&item.lessonId===lesson.lessonId);
    const changed=updated.lessons.find(item=>item.lang==='bem'&&item.lessonId===lesson.lessonId);
    assert.equal(text(changed),text(original));
    assert.equal(changed.source.sha256,lesson.source.sha256);
    assert.deepEqual(changed.pages.map(page=>page.title),original.pages.map(page=>page.title));
  }
  assert.equal(updated.lessons.find(item=>item.lang==='toi'&&item.lessonId==='lesson-01'),master.lessons.find(item=>item.lang==='toi'&&item.lessonId==='lesson-01'));
  assert.throws(()=>applySourceOverrides(master,{schemaVersion:2,lessons:[{...supplied.lessons[0],lessonId:'lesson-03'}]}),/two supplied/);
});

test('legacy uppercase language registry entries can be used without renaming languages',async()=>{
  const records=new Map([
    ['programs/vop',{title:'VOP',published:true,sharingScope:'shared',scope:'platform',organizationId:'obsolete-owner',guideIds:[]}],
    ['guides/ukusanga',{title:'UKUSANGA',published:true,language:'BEM',sharingScope:'shared',scope:'platform',organizationId:'obsolete-owner'}],
    ['languages/BEM',{enabled:true}],['languages/TOI',{enabled:true}],
  ]);
  const options={programTitle:'VOP',origin:'https://vopafrica.vercel.app',publish:true,now:'2026-10-22T12:00:00Z'};
  const plan=await planImport(fakeDb(records),inventory,options);
  assert.equal(plan.guides[0].id,'ukusanga');
  assert.equal(plan.writes.find(write=>write.path==='guides/vop-vop-toi').data.organizationId,'');
  assert.ok(!plan.writes.some(write=>write.path.startsWith('languages/')));
});

test('fingerprinted lessons are reused under the original ID and edited content is never overwritten',()=>{
  const source=inventory.get('bem')[0];
  const data=buildLesson(source,{guideId:'ukusanga'});
  const existing={id:'historical-lesson-one',data};
  assert.equal(existingLessonFor(source,[existing]).id,'historical-lesson-one');
  assert.equal(existingLessonFor(source,[]),null);
  assert.throws(()=>existingLessonFor(source,[{id:source.lessonId,data:{title:source.title}}]),/will not be overwritten/);
  assert.throws(()=>existingLessonFor(source,[existing,{id:source.lessonId,data}]),/Ambiguous/);
});

test('partial inventories, duplicate numbers, unsafe image paths and embedded assessment keys are rejected',()=>{
  const change=callback=>{const value=structuredClone(master);callback(value);return value;};
  assert.throws(()=>validateMaster(change(value=>value.lessons.pop())),/exactly 26/);
  assert.throws(()=>validateMaster(change(value=>value.lessons[1].lessonId='lesson-01')),/duplicate/);
  assert.throws(()=>validateMaster(change(value=>value.lessons[0].pages[0].blocks.push({type:'image',src:'assets/../../secret.jpg',alt:''}))),/Unsafe/);
  assert.throws(()=>validateMaster(change(value=>value.lessons[0].quiz=[{question:'Q',correctOptionIndex:0}])),/assessment/);
  assert.throws(()=>buildLesson(master.lessons[0],{guideId:'bad/id'}),/guide ID/);
  assert.throws(()=>buildLesson(master.lessons[0],{guideId:'guide',origin:'http://example.com'}),/HTTPS/);
});

test('Bemba lessons 11 and 12 retain distinct ordering despite incorrect headings in the source',()=>{
  const lessons=inventory.get('bem');
  for(const number of [11,12]){
    const source=lessons[number-1];
    assert.equal(source.source.reportedLessonNumber,10);
    const lesson=buildLesson(source,{guideId:'ukusanga'});
    assert.equal(lesson.lessonNumber,String(number));
    assert.match(lesson.source.url,new RegExp(`bemba${number}\\.htm$`));
  }
});
