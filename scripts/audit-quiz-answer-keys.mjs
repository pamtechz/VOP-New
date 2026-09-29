/* 
 * One-time, conservative assessment redaction. Default mode is READ-ONLY.
 * Usage: node scripts/audit-quiz-answer-keys.mjs
 * Apply mode requires VOP_QUIZ_MIGRATION_PROJECT=project-id,
 * VOP_QUIZ_MIGRATION_APPLY=YES and --apply.
 * This script never changes legacy tests without a matching canonical quiz.
 */
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { hasEmbeddedAnswerKeys, verifiedMigrationCandidate } from './quiz-answer-inventory.mjs';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
const apply = process.argv.includes('--apply');
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
if (!projectId || !process.env.FIREBASE_ADMIN_CLIENT_EMAIL || !process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
  throw new Error('Firebase Admin credentials and project ID are required.');
}
if (apply && (process.env.VOP_QUIZ_MIGRATION_APPLY !== 'YES'
  || process.env.VOP_QUIZ_MIGRATION_PROJECT !== projectId
  || !String(process.env.VOP_QUIZ_MIGRATION_BACKUP_REF || '').trim())) {
  throw new Error('Application refused. Confirm the target project, VOP_QUIZ_MIGRATION_APPLY=YES, and a verified VOP_QUIZ_MIGRATION_BACKUP_REF.');
}
const app = getApps()[0] || initializeApp({ credential: cert({
  projectId,
  clientEmail:process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey:process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
}) });
const db = getFirestore(app);
const summary = { projectId, mode:apply?'APPLY':'REPORT', scanned:0, redacted:0, alreadySafe:0,
  skipped:0, legacyWithoutBank:0, embeddedInLessons:0, issues:[] };
const restricted = (record) => Array.isArray(record)
  && record.some(item => item && typeof item === 'object'
    && (Object.hasOwn(item, 'correctOptionIndex') || Object.hasOwn(item, 'answer')
    || Object.hasOwn(item, 'explanation')));
for (const guide of (await db.collection('guides').get()).docs) {
  // Inventory every learner-readable lesson, not just Test documents. Some
  // historical authoring paths stored quizzes inside regular lesson pages.
  const assessments = await guide.ref.collection('lessons').get();
  for (const assessment of assessments.docs) {
    summary.scanned++;
    const row = assessment.data();
    if (hasEmbeddedAnswerKeys(row.contentPages) || hasEmbeddedAnswerKeys(row.pages)) {
      summary.embeddedInLessons++;
      summary.issues.push({path:assessment.ref.path,reason:'Answer-bearing questions inside lesson pages: requires a separate migration'});
    }
    if (row.type !== 'Test') {
      if (restricted(row.questions) || restricted(row.quiz)) {
        summary.embeddedInLessons++;
        summary.issues.push({path:assessment.ref.path,reason:'Answer-bearing inline quiz on a study lesson: requires a separate migration'});
      }
      continue;
    }
    if (!restricted(row.questions) && !restricted(row.quiz)) { summary.alreadySafe++; continue; }
    const quizId = String(row.sourceQuizId || '');
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(quizId)) {
      summary.legacyWithoutBank++; summary.issues.push({path:assessment.ref.path,reason:'No canonical quiz bank'});
      continue;
    }
    const bank = await db.doc('quizzes/' + quizId).get();
    const candidate = verifiedMigrationCandidate({
      guideId:guide.id,
      guideOrganizationId:String(guide.data()?.organizationId || ''),
      assessmentPath:assessment.ref.path,
      assessment:row,
      bank:bank.exists ? bank.data() : undefined,
    });
    if (!candidate.publicQuestions) {
      summary.skipped++;
      summary.issues.push({path:assessment.ref.path,reason:candidate.reason || 'Quiz bank mismatch'});
      continue;
    }
    if (apply) {
      try {
        // Recheck both snapshots in one transaction. A quiz edit performed
        // after the audit read must not redact a newer set of questions.
        await db.runTransaction(async transaction => {
          const [freshAssessment, freshBank] = await Promise.all([
            transaction.get(assessment.ref), transaction.get(bank.ref),
          ]);
          if (!freshAssessment.exists || !freshBank.exists ||
              !freshAssessment.updateTime?.isEqual(assessment.updateTime) ||
              !freshBank.updateTime?.isEqual(bank.updateTime)) {
            throw new Error('Assessment or private bank changed since audit read');
          }
          const current = verifiedMigrationCandidate({
            guideId:guide.id,
            guideOrganizationId:String(guide.data()?.organizationId || ''),
            assessmentPath:assessment.ref.path,
            assessment:freshAssessment.data(),
            bank:freshBank.data(),
          });
          if (!current.publicQuestions) throw new Error(current.reason || 'Quiz bank mismatch');
          transaction.update(assessment.ref, {
            questions:current.publicQuestions, quiz:current.publicQuestions,
            answerVisibility:'public_redacted',
            updatedAt:FieldValue.serverTimestamp(),
          });
        });
      } catch (error) {
        summary.skipped++;
        summary.issues.push({
          path:assessment.ref.path,
          reason:error instanceof Error ? error.message : 'Redaction precondition failed',
        });
        continue;
      }
    }
    summary.redacted++;
  }
}
// This legacy curriculum also requires a separate ownership-preserving migration.
// Never delete, silently redact or re-score it as if it had a canonical source.
const legacyLanguages = await db.collection('curricula/discover/languages').get();
for (const lang of legacyLanguages.docs) {
  const tests = await lang.ref.collection('lessons').get();
  for (const record of tests.docs) {
    const value = record.data();
    const inline = restricted(value.questions) || restricted(value.quiz);
    const embedded = hasEmbeddedAnswerKeys(value.contentPages) || hasEmbeddedAnswerKeys(value.pages);
    if (inline || embedded) {
      if (value.type === 'Test') summary.legacyWithoutBank++;
      else summary.embeddedInLessons++;
      summary.issues.push({path:record.ref.path,reason:'Legacy learner-readable answer keys: migrate to a private bank without modifying existing grades'});
    }
  }
}
console.log(JSON.stringify(summary,null,2));
if (summary.legacyWithoutBank || summary.embeddedInLessons || summary.skipped) {
  process.exitCode = 2; // migration is NOT complete; do not certify historical answer secrecy
}
