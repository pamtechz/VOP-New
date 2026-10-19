import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonScoreForDisplay, lessonIsComplete, isLessonUnlocked, lessonAttachedTestsAreComplete, getAttachedAssessmentsForLesson } from '../src/services/lessonProgress.ts';
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

test('completed lesson unlocks next lesson unless attached test or section test is not completed',()=>{
  const lesson1 = { id: 'l1', type: 'Lesson', title: 'Lesson 1', lessonNumber: '1' } as Lesson;
  const quiz1 = {
    id: 'q1', type: 'Test', title: 'Quiz 1', lessonNumber: '1.1',
    attachedLessonId: 'l1', attachmentType: 'lesson', assessmentPassThreshold: 80,
  } as Lesson;
  const lesson2 = { id: 'l2', type: 'Lesson', title: 'Lesson 2', lessonNumber: '2' } as Lesson;
  const lesson3 = { id: 'l3', type: 'Lesson', title: 'Lesson 3', lessonNumber: '3' } as Lesson;

  const testGuide = {
    id: 'guide-test',
    language: 'en',
    lessons: [lesson1, quiz1, lesson2, lesson3],
  } as DiscoverGuide;

  const studyLessons = [lesson1, lesson2, lesson3];

  // 1. Initial state: Lesson 0 is unlocked, subsequent lessons are locked
  const freshUser = learner('org-a', {}, []);
  assert.equal(isLessonUnlocked(testGuide, 0, freshUser, 80, studyLessons), true);
  assert.equal(isLessonUnlocked(testGuide, 1, freshUser, 80, studyLessons), false);
  assert.equal(isLessonUnlocked(testGuide, 2, freshUser, 80, studyLessons), false);

  // 2. Lesson 1 read, BUT attached quiz not completed -> Lesson 2 MUST REMAIN LOCKED
  const readOnlyUser = learner('org-a', {}, ['en:guide-test:l1']);
  assert.equal(lessonIsComplete(testGuide, lesson1, readOnlyUser, 80), true);
  assert.equal(lessonAttachedTestsAreComplete(testGuide, lesson1, readOnlyUser, 80), false);
  assert.equal(isLessonUnlocked(testGuide, 1, readOnlyUser, 80, studyLessons), false);

  // 3. Lesson 1 read, AND attached quiz passed -> Lesson 2 UNLOCKS!
  const quizPassedUser = learner('org-a', { 'org-a:en:guide-test:q1': 85 }, ['en:guide-test:l1']);
  assert.equal(lessonAttachedTestsAreComplete(testGuide, lesson1, quizPassedUser, 80), true);
  assert.equal(isLessonUnlocked(testGuide, 1, quizPassedUser, 80, studyLessons), true);
  // Lesson 3 is still locked because Lesson 2 is not completed
  assert.equal(isLessonUnlocked(testGuide, 2, quizPassedUser, 80, studyLessons), false);

  // 4. If attached quiz fails (score < threshold), next lesson remains locked
  const quizFailedUser = learner('org-a', { 'org-a:en:guide-test:q1': 60 }, ['en:guide-test:l1']);
  assert.equal(lessonAttachedTestsAreComplete(testGuide, lesson1, quizFailedUser, 80), false);
  assert.equal(isLessonUnlocked(testGuide, 1, quizFailedUser, 80, studyLessons), false);

  // 5. Section-attached test requirement
  const sectionQuiz = {
    id: 'q-sec', type: 'Test', title: 'Section Quiz', lessonNumber: '2.1',
    attachedLessonId: 'l2', attachmentType: 'section', anchorId: 'sec-1', assessmentPassThreshold: 75,
  } as Lesson;
  const guideWithSectionQuiz = {
    ...testGuide,
    lessons: [lesson1, quiz1, lesson2, sectionQuiz, lesson3],
  } as DiscoverGuide;

  // If Lesson 2 is read, but section quiz is not done -> Lesson 3 remains locked
  const l2ReadUser = learner('org-a', { 'org-a:en:guide-test:q1': 85 }, ['en:guide-test:l1', 'en:guide-test:l2']);
  assert.equal(isLessonUnlocked(guideWithSectionQuiz, 2, l2ReadUser, 80, studyLessons), false);

  // Once section quiz is passed -> Lesson 3 unlocks!
  const l2QuizDoneUser = learner('org-a', {
    'org-a:en:guide-test:q1': 85,
    'org-a:en:guide-test:q-sec': 90,
  }, ['en:guide-test:l1', 'en:guide-test:l2']);
  assert.equal(isLessonUnlocked(guideWithSectionQuiz, 2, l2QuizDoneUser, 80, studyLessons), true);
});

