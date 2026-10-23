import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {validateMaster,buildLesson,existingLessonFor,planImport,applySourceOverrides,matchesWrittenFields} from '../tools/seed/seed-vop-guides.mjs';

const archive=JSON.parse(readFileSync(new URL('../content/lessons.master.json',import.meta.url),'utf8'));
const supplied=JSON.parse(readFileSync(new URL('../content/ukusanga-supplied-lessons.json',import.meta.url),'utf8'));
const master=applySourceOverrides(archive,supplied);
const englishMaster=JSON.parse(readFileSync(new URL('../content/discover-english-supplied.master.json',import.meta.url),'utf8'));
const englishManifest=JSON.parse(readFileSync(new URL('../content/discover-english-source-manifest.json',import.meta.url),'utf8'));
const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
after(async()=>vite.close());
const {normalizeCurriculumStructure}=await vite.ssrLoadModule('/shared/curriculumStructure.ts');
const inventory=validateMaster(master);
const englishLessons=validateMaster(englishMaster,['en']).get('en');

test('the supplied English PDF becomes 26 canonical lessons with 184 numbered-topic and introduction sections',()=>{
  assert.equal(englishManifest.sourceSha256,'7111161fbb65eefe004aaee8d48ad18b3bc1decaa699d1821593a7e7bf510019');
  assert.equal(englishLessons.length,26);
  assert.equal(englishManifest.sectionCount,184);
  assert.equal(englishManifest.answerSheetsImportedAsPublicContent,0);
  let sections=0;
  for(const [index,source] of englishLessons.entries()){
    const lesson=buildLesson(source,{guideId:'discover-english',published:true});
    assert.deepEqual(normalizeCurriculumStructure(lesson.chapters),lesson.chapters);
    const expected=englishManifest.lessons[index];
    assert.deepEqual(source.pages.map(page=>page.title),expected.sectionTitles);
    const reading=source.pages.map((page,index)=>(index===0?'':page.title)+page.blocks.map(block=>block.text).join('')).join('').replace(/\s+/g,'');
    assert.equal(createHash('sha256').update(reading).digest('hex'),expected.readingSha256,source.lessonId);
    assert.equal(lesson.source.sha256,englishManifest.sourceSha256);
    assert.equal(lesson.source.pdfPageStart,index*4+1);
    assert.equal(lesson.source.pdfPageEnd,index*4+3);
    assert.match(lesson.attribution,/Copyrights©2000 by the Voice of Prophecy/);
    assert.equal(lesson.published,true);
    assert.ok(!/DISCOVER\s*-\s*Answer Sheet|Your Name:|Email adress for E-Lessons/.test(reading));
    sections+=lesson.pages.length;
  }
  assert.equal(sections,184);
});

test('English sections follow numbered topics across columns and pages, including split headings and printed source errors',()=>{
  const first=englishLessons[0];
  assert.match(first.pages[0].blocks[0].text,/^Jim once asked an atheist/);
  assert.ok(first.pages[1].blocks.some(block=>block.text.includes('one chance in ten billion')));
  assert.ok(first.pages[2].blocks.some(block=>block.text.includes('dictionary resulting from an explosion in a print shop')));
  assert.equal(englishLessons[16].pages[5].title,'WE SHARE CHRIST BY THE WAY WE ACT');
  assert.deepEqual(englishManifest.lessons[3].printedSectionNumbers,[1,2,3,4,5,5]);
  assert.equal(englishLessons[3].pages.length,7);
  assert.equal(englishLessons[25].pages.at(-1).title,'THE TWO HARVESTS');
});

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
  assert.equal(pages,368);
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

test('adding English preserves both live translations and attaches only one Discover guide, with no changes on repeat',async()=>{
  const records=new Map([
    ['programs/vop',{title:'VOP',published:true,sharingScope:'shared',organizationId:'',guideIds:[]}],
    ['guides/ukusanga',{title:'UKUSANGA',published:true,language:'bem',sharingScope:'shared',organizationId:''}],
    ['languages/BEM',{enabled:true}],['languages/TOI',{enabled:true}],['languages/ENG',{enabled:true}],
  ]);
  const options={programTitle:'VOP',origin:'https://vopafrica.vercel.app',publish:true,now:'2026-10-23T12:00:00Z'};
  const db=fakeDb(records);
  const save=plan=>{for(const write of plan.writes)records.set(write.path,write.create?write.data:{...records.get(write.path),...write.data});};
  save(await planImport(db,inventory,options));
  const originalGuideIds=[...records.get('programs/vop').guideIds];
  const withEnglish=new Map([...inventory,['en',englishLessons]]);
  const plan=await planImport(db,withEnglish,options);
  assert.equal(plan.writes.length,28);
  assert.equal(plan.writes.filter(write=>write.path.includes('/lessons/')).length,26);
  assert.equal(plan.guides.find(guide=>guide.language==='bem').reusedLessons,26);
  assert.equal(plan.guides.find(guide=>guide.language==='toi').reusedLessons,26);
  assert.deepEqual(plan.writes.find(write=>write.path==='programs/vop').data.guideIds,[...originalGuideIds,'vop-vop-en']);
  save(plan);
  assert.equal((await planImport(db,withEnglish,options)).writes.length,0);
});

test('all 26 supplied Bemba lessons preserve source reading checksums, original attribution and deduplicated numbering',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../content/ukusanga-supplied-source-manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.lessons.length,26);
  assert.equal(manifest.lessons.filter(item=>item.sourceKind==='uploaded_text').length,21);
  assert.equal(supplied.lessons.length,26);
  for(const expected of manifest.lessons){
    const actual=inventory.get('bem').find(item=>item.lessonId===expected.lessonId);
    const reading=actual.pages.map(page=>page.title+' '+page.blocks.filter(block=>block.type==='text').map(block=>block.text).join(' ')).join(' ').replace(/\s+/g,' ').trim();
    assert.equal(createHash('sha256').update(reading).digest('hex'),expected.readingSha256,expected.lessonId);
    assert.equal(actual.pages.length,expected.sections);
    assert.equal(actual.source.sha256,expected.sha256);
    assert.equal(actual.attribution,'copyright © 2002 The Voice of Prophecy');
  }
  assert.equal(master.lessons.find(item=>item.lang==='toi'&&item.lessonId==='lesson-01'),archive.lessons.find(item=>item.lang==='toi'&&item.lessonId==='lesson-01'));
  const wrongLanguage=structuredClone(supplied);
  wrongLanguage.lessons.push({...wrongLanguage.lessons[0],lang:'toi'});
  assert.throws(()=>applySourceOverrides(archive,wrongLanguage),/Only supplied/);
  assert.throws(()=>applySourceOverrides(archive,{schemaVersion:2,lessons:supplied.lessons.slice(0,2)}),/exactly 26/);
});

test('lesson 21 includes the supplied closing four sections and numbered body lists remain within their section',()=>{
  const lesson=inventory.get('bem')[20];
  assert.equal(lesson.pages.length,9);
  assert.equal(lesson.pages.at(-1).title,'BUSHE ICIKALAMBA ICILIPO CINSHI?');
  assert.ok(lesson.pages.at(-1).blocks.some(block=>block.text?.includes('(John 15:11)')));
  assert.equal(inventory.get('bem')[10].pages.length,9);
  assert.equal(inventory.get('bem')[17].pages.length,9);
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

test('read-back verification accepts reordered Firestore map keys and detects changed or missing reading fields',()=>{
  const expected={chapters:[{title:'Reading',sections:[{id:'one',blocks:[{type:'paragraph',text:'Source words'}]}]}],published:true};
  const actual={published:true,chapters:[{sections:[{blocks:[{text:'Source words',type:'paragraph'}],id:'one'}],title:'Reading'}],extraMetadata:'preserved'};
  assert.equal(matchesWrittenFields(actual,expected),true);
  actual.chapters[0].sections[0].blocks[0].text='Changed';
  assert.equal(matchesWrittenFields(actual,expected),false);
  assert.equal(matchesWrittenFields({published:true},expected),false);
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
  for(const number of [11,12]){
    const source=archive.lessons.filter(item=>item.lang==='bem')[number-1];
    assert.equal(source.source.reportedLessonNumber,10);
    const lesson=buildLesson(source,{guideId:'ukusanga'});
    assert.equal(lesson.lessonNumber,String(number));
    assert.match(lesson.source.url,new RegExp(`bemba${number}\\.htm$`));
  }
});
