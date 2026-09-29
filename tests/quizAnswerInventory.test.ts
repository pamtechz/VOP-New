import test from 'node:test';
import assert from 'node:assert/strict';
import { hasEmbeddedAnswerKeys } from '../scripts/quiz-answer-inventory.mjs';

test('nested learner-readable lesson pages expose old answer keys to the audit', () => {
  const row = {
    contentPages:[{blocks:[
      {type:'text',text:'Study introduction'},
      {type:'quiz',questions:[
        {key:'q-1',question:'Pick one',options:['A','B'],correctOptionIndex:1,explanation:'Private'},
      ]},
    ]}],
  };
  assert.equal(hasEmbeddedAnswerKeys(row),true);
});

test('historical booleans and explanations inside inline questions are detected', () => {
  assert.equal(hasEmbeddedAnswerKeys({quiz:[{question:'Is this true?',answer:false}]}),true);
  assert.equal(hasEmbeddedAnswerKeys({pages:[{questions:[{prompt:'Explain',explanation:'Answer'}]}]}),true);
});

test('public redacted questions and ordinary prose do not create false positives', () => {
  assert.equal(hasEmbeddedAnswerKeys({questions:[{key:'q1',question:'Pick one',options:['A','B']}]}),false);
  assert.equal(hasEmbeddedAnswerKeys({pages:[{blocks:[{type:'text',text:'The answer requires study.'}]}]}),false);
  assert.equal(hasEmbeddedAnswerKeys(null),false);
});

test('depth-limited inspection ignores primitive and excessively nested values', () => {
  let nested={question:'Too deep',answer:true};
  for (let i=0;i<30;i++) nested={node:nested};
  assert.equal(hasEmbeddedAnswerKeys(nested),false);
});
