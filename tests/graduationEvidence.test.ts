import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedAssessmentAverage } from '../shared/graduationEvidence.ts';

const assessments=[{id:'lesson-final'},{id:'guide-final'}];
const scores={'org-A:en:guide-1:lesson-final':82,'org-A:en:guide-1:guide-final':98};

test('official graduation average uses only the two verified tenant scores',()=>{
  assert.equal(verifiedAssessmentAverage(assessments,scores,'org-A','en','guide-1',80),90);
  assert.equal(verifiedAssessmentAverage([{id:'lesson-final'}],scores,'org-A','en','guide-1',80),82);
});

test('a missing, wrong-organization, wrong-guide or wrong-language score cannot qualify',()=>{
  for(const [org,language,guide] of [
    ['org-B','en','guide-1'],['org-A','bem','guide-1'],['org-A','en','guide-2'],
  ]) assert.equal(verifiedAssessmentAverage(assessments,scores,org,language,guide,80),null);
  assert.equal(verifiedAssessmentAverage(assessments,{'org-A:en:guide-1:lesson-final':82},'org-A','en','guide-1',80),null);
});

test('missing/malformed/out-of-range grades are not coerced into passing',()=>{
  for(const value of [undefined,null,'98','',Number.NaN,Infinity,-1,101,79.99]) {
    const amended={...scores,'org-A:en:guide-1:guide-final':value};
    assert.equal(verifiedAssessmentAverage(assessments,amended,'org-A','en','guide-1',80),null);
  }
});

test('duplicate or invalid test IDs and invalid pass thresholds fail closed',()=>{
  for(const tests of [[],[{id:'lesson-final'},{id:'lesson-final'}],[{id:'../other'}],[{id:''}]]) {
    assert.equal(verifiedAssessmentAverage(tests,scores,'org-A','en','guide-1',80),null);
  }
  for(const threshold of [0,101,Number.NaN]) {
    assert.equal(verifiedAssessmentAverage(assessments,scores,'org-A','en','guide-1',threshold),null);
  }
});

test('averages use precise numeric marks and round to two decimals',()=>{
  const a=[{id:'a'},{id:'b'},{id:'c'}];
  const s={'org-A:en:g:a':90,'org-A:en:g:b':90,'org-A:en:g:c':91};
  assert.equal(verifiedAssessmentAverage(a,s,'org-A','en','g',80),90.33);
});
