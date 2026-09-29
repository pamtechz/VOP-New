import test from 'node:test';
import assert from 'node:assert/strict';
import { quizManagementItem } from '../shared/quizManagementVisibility.ts';

const record = {
  title:'Lesson quiz', description:'Description', language:'en',
  guideId:'guide-a', lessonId:'lesson-a', attachmentType:'lesson',
  organizationId:'org-a', ownerUid:'author', sharingScope:'shared',
  published:true, archived:false, assessmentPath:'guides/guide-a/lessons/quiz-1',
  privateTeacherNote:'Never disclose',
  questions:[{
    key:'q-1', question:'Which answer?', options:['A','B'],
    correctOptionIndex:1, answer:false, explanation:'Secret rationale',
  }],
};

test('quiz bank author and Super Admin retain full management access', () => {
  for (const [uid, elevated] of [['author',false],['admin',true]] as const) {
    const result = quizManagementItem('quiz-1',record,uid,elevated);
    assert.equal(result.canEdit,true);
    assert.equal(result.questions[0].correctOptionIndex,1);
    assert.equal(result.privateTeacherNote,'Never disclose');
  }
});

test('other contributors receive only public quiz fields and no answers', () => {
  const result = quizManagementItem('quiz-1',record,'peer',false);
  assert.equal(result.canEdit,false);
  assert.equal(result.guideId,'guide-a');
  assert.deepEqual(result.questions,[{key:'q-1',question:'Which answer?',options:['A','B']}]);
  assert.equal('assessmentPath' in result,false);
  assert.equal('privateTeacherNote' in result,false);
  assert.equal(JSON.stringify(result).includes('correctOptionIndex'),false);
  assert.equal(JSON.stringify(result).includes('Secret rationale'),false);
});

test('missing or malformed question bank cannot leak private metadata', () => {
  const result = quizManagementItem('quiz-2',{...record,questions:{key:'q',answer:true}},'peer',false);
  assert.deepEqual(result.questions,[]);
});
