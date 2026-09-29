import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonScoreForDisplay, lessonIsComplete } from '../src/services/lessonProgress.ts';
import type { DiscoverGuide, Lesson, User } from '../src/types/index.ts';

const ordinary = {id:'lesson-a',type:'Lesson',title:'Study',lessonNumber:'1'} as Lesson;
const quiz = {id:'quiz-a',type:'Test',title:'Assessment',lessonNumber:'2',
  sourceQuizId:'private-a',answerVisibility:'public_redacted'} as Lesson;
const guide = {id:'guide-a',language:'en',lessons:[ordinary,quiz]} as DiscoverGuide;
const learner = (organizationId: string, scores: Record<string,number>, completedLessons:string[]=[]) =>
  ({ organizationId, progress:{guideScores:scores,completedLessons} } as User);

test('server-issued score and language-scoped completion drive learner progress',()=>{
  const user=learner('org-a',{'org-a:en:guide-a:quiz-a':86},['en:guide-a:lesson-a']);
  assert.equal(lessonScoreForDisplay(guide,quiz,user),86);
  assert.equal(lessonIsComplete(guide,ordinary,user,80),true);
  assert.equal(lessonIsComplete(guide,quiz,user,80),true);
  assert.equal(lessonIsComplete(guide,quiz,user,90),false);
});

test('foreign organization, historical score and missing pass mark cannot pass a redacted test',()=>{
  const scores={'org-a:en:guide-a:quiz-a':100,'en:guide-a:quiz-a':100,'guide-a:quiz-a':100,'guide-a':100};
  const foreign=learner('org-b',scores);
  assert.equal(lessonScoreForDisplay(guide,quiz,foreign),undefined);
  assert.equal(lessonIsComplete(guide,quiz,foreign,80),false);
  assert.equal(lessonIsComplete(guide,quiz,learner('org-a',scores),0),false);
});

test('invalid authoritative score never falls back to older grades',()=>{
  const user=learner('org-a',{'org-a:en:guide-a:quiz-a':Number.NaN,'guide-a':100});
  assert.equal(lessonScoreForDisplay(guide,quiz,user),undefined);
});

test('legacy local marks remain displayable only for historical noncanonical tests',()=>{
  const oldQuiz={...quiz,sourceQuizId:undefined};
  const oldGuide={...guide,lessons:[ordinary,oldQuiz]};
  const user=learner('org-a',{'guide-a':93},['lesson-a']);
  assert.equal(lessonScoreForDisplay(oldGuide,oldQuiz,user),93);
  assert.equal(lessonIsComplete(oldGuide,ordinary,user,80),true);
  assert.equal(lessonIsComplete(oldGuide,oldQuiz,user,80),true);
});
