import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({configFile:false,
  server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
after(async()=>{await server.close();});
const { transferCurriculumNode } = await server.ssrLoadModule('/shared/curriculumTransfer.ts') as typeof import('../shared/curriculumTransfer.ts');

const source = [{
  id:'chapter-source',title:'Original',
  sections:[
    {id:'section-one',title:'First',blocks:[{id:'block-one',type:'paragraph',text:'Original text'}]},
    {id:'section-two',title:'Second',blocks:[
      {id:'block-two',type:'paragraph',text:'Moveable'},
      {id:'block-three',type:'paragraph',text:'Retained'},
    ]},
  ],
}];
const destination=[{
  id:'chapter-target',title:'Target',
  sections:[{id:'section-target',title:'Destination',
    blocks:[{id:'block-target',type:'paragraph',text:'Existing content'}]}],
}];

test('section transfer keeps original anchor IDs and does not mutate input documents',()=>{
  const result=transferCurriculumNode(source,destination,'section','section-one','chapter-target','move');
  assert.deepEqual(result.movedAnchorIds,['section-one','block-one']);
  assert.equal(result.source[0].sections.length,1);
  assert.equal(result.destination[0].sections[1].id,'section-one');
  assert.equal(source[0].sections.length,2);
  assert.equal(destination[0].sections.length,1);
});
test('copied section receives entirely new quiz anchor identifiers',()=>{
  const result=transferCurriculumNode(source,destination,'section','section-one','chapter-target','copy');
  const copy=result.destination[0].sections[1];
  assert.notEqual(copy.id,'section-one');
  assert.notEqual(copy.blocks[0].id,'block-one');
  assert.equal(copy.blocks[0].text,'Original text');
  assert.equal(result.source[0].sections.length,2);
});
test('block transfer retains the ID; copy does not inherit the ID',()=>{
  const moved=transferCurriculumNode(source,destination,'block','block-two','section-target','move');
  assert.equal(moved.destination[0].sections[0].blocks[1].id,'block-two');
  assert.deepEqual(moved.movedAnchorIds,['block-two']);
  const copied=transferCurriculumNode(source,destination,'block','block-two','section-target','copy');
  assert.notEqual(copied.destination[0].sections[0].blocks[1].id,'block-two');
  assert.equal(copied.source[0].sections[1].blocks.length,2);
});
test('refuses missing targets and moves that empty a source section or chapter',()=>{
  assert.throws(()=>transferCurriculumNode(source,destination,'section','section-one','missing','move'),/destination/);
  assert.throws(()=>transferCurriculumNode(source,destination,'block','block-one','section-target','move'),/last block/);
  const single=[{...source[0],sections:[source[0].sections[0]]}];
  assert.throws(()=>transferCurriculumNode(single,destination,'section','section-one','chapter-target','move'),/last section/);
});
test('enforces structure and destination size limits',()=>{
  const full=[{...destination[0],sections:Array.from({length:40},(_,index)=>({
    id:'section-t-'+index,title:'Section',blocks:[{id:'block-t-'+index,type:'paragraph',text:'Valid'}],
  }))}];
  assert.throws(()=>transferCurriculumNode(source,full,'section','section-one','chapter-target','copy'),/at most 40 sections/);
});
