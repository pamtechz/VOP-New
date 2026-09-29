import test from 'node:test';
import assert from 'node:assert/strict';
import { hasEmbeddedAnswerKeys, verifiedMigrationCandidate } from '../scripts/quiz-answer-inventory.mjs';

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

const bank={
  id:'quiz-1',guideId:'guide-1',organizationId:'org-1',language:'en',
  assessmentPath:'guides/guide-1/lessons/quiz-quiz-1',
  questions:[{key:'quiz-1-q1',question:'A question',options:['Wrong','Correct'],
    correctOptionIndex:1,answer:false,explanation:'Teacher-only'}],
};
const assessment={
  type:'Test',sourceQuizId:'quiz-1',guideId:'guide-1',organizationId:'org-1',language:'en',
  questions:[{...bank.questions[0]}],quiz:[{...bank.questions[0]}],
};
const candidate=overrides=>verifiedMigrationCandidate({
  guideId:'guide-1',guideOrganizationId:'org-1',
  assessmentPath:'guides/guide-1/lessons/quiz-quiz-1',
  assessment,bank,...overrides,
});

test('a matching private bank yields prompts/options without answer keys',()=>{
  const result=candidate({});
  assert.deepEqual(result.publicQuestions,[{
    key:'quiz-1-q1',question:'A question',options:['Wrong','Correct'],
  }]);
  assert.equal(JSON.stringify(result).includes('Teacher-only'),false);
  assert.equal(JSON.stringify(result).includes('correctOptionIndex'),false);
});

test('an unlinked, foreign-tenant or mismatched bank is never migrated',()=>{
  const cases=[
    {bank:undefined},
    {assessment:{...assessment,guideId:'another'}},
    {assessment:{...assessment,organizationId:'org-2'}},
    {assessment:{...assessment,sourceQuizId:'quiz-2'}},
    {bank:{...bank,organizationId:'org-2'}},
    {bank:{...bank,assessmentPath:'guides/other/lessons/quiz-quiz-1'}},
    {bank:{...bank,language:'bem'}},
    {assessment:{...assessment,questions:[{...bank.questions[0],question:'Edited'}]}},
    {assessment:{...assessment,quiz:[{...bank.questions[0],options:['Different','Choices']}]}},
    {bank:{...bank,questions:[{...bank.questions[0],correctOptionIndex:9}]}},
    {bank:{...bank,questions:[bank.questions[0],bank.questions[0]]}},
  ];
  for(const item of cases) {
    const result=candidate(item);
    assert.equal(result.publicQuestions,undefined,JSON.stringify(item));
    assert.ok(result.reason,JSON.stringify(item));
  }
});
