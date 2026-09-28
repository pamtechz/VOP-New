import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuizQuestions, quizLessonNumber } from '../shared/quizAttachments.ts';
import { isQuizConfigured, gradeQuiz } from '../src/services/quiz.ts';

const valid = { question:'Which answer?', options:['A','B','C'], correctOptionIndex:1, explanation:'Because B is correct.' };
test('normalizes valid quiz as a server-gradeable lesson assessment',()=>{
 const questions=normalizeQuizQuestions([valid], 'quiz123');
 assert.equal(questions[0].key,'quiz123-q1');
 assert.equal(questions[0].answer,false);
 assert.equal(isQuizConfigured(questions),true);
 assert.equal(gradeQuiz(questions,{0:1}),100);
 assert.equal(gradeQuiz(questions,{0:0}),0);
});
test('requires fully configured questions before a quiz may be published',()=>{
 for(const invalid of [
   {...valid,question:''},{...valid,options:['','B']},{...valid,options:['Only one']},
   {...valid,correctOptionIndex:3},{...valid,correctOptionIndex:1.4}
 ]) assert.throws(()=>normalizeQuizQuestions([invalid],'quiz123'));
 assert.throws(()=>normalizeQuizQuestions(Array(201).fill(valid),'quiz123'));
});
test('entire-guide assessments follow lesson quizzes in reading order',()=>{
 assert.equal(quizLessonNumber('lesson','2'),'2.quiz');
 assert.equal(quizLessonNumber('guide'),'999999');
});
