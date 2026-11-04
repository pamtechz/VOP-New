import test from 'node:test';
import assert from 'node:assert/strict';
import {quizAnswerFeedback} from '../shared/quizFeedback.ts';

test('feedback uses correct option text and preserves authored explanation',()=>{
  assert.equal(quizAnswerFeedback({options:['Love','Mercy'],correctOptionIndex:1,
    explanation:'  Refer to the lesson.  '}),'Correct answer: Mercy\nRefer to the lesson.');
});
test('boolean answers include false and never invent a rationale',()=>{
  assert.equal(quizAnswerFeedback({answer:false}),'Correct answer: False');
  assert.equal(quizAnswerFeedback({answer:true}),'Correct answer: True');
});
test('malformed option keys do not fabricate a boolean answer',()=>{
  for(const correctOptionIndex of [-1,9,undefined,'1']) {
    assert.equal(quizAnswerFeedback({options:['a','b'],correctOptionIndex,answer:true}),'');
  }
});
