# Quiz answer-key separation: controlled migration

## What this release changes

The Quiz Library writes the complete bank into `quizzes/{quizId}`, accessible only through its authenticated contributor-management API. It writes **questions without `correctOptionIndex`, `answer` or `explanation`** into the learner-facing `guides/{guideId}/lessons/quiz-{quizId}` assessment. On submission, `/api/study/progress` validates the quiz association and grades from the canonical server bank. The learner modal validates answer shape without doing local grading. Firestore rules deny ordinary users direct access to the private quiz bank and deny all client writes to generated assessments.

## Production release precautions

- **Do not claim all historical tests are protected yet.** Previously stored learner-readable lesson/Test documents may still contain answer keys. Offline/APK assets can also contain self-check questions by design. No user-visible security claim should cover those assets.
- Run `node scripts/audit-quiz-answer-keys.mjs` with **server-only** Firebase Admin credentials against a staging copy of Firestore first. In its default REPORT mode, the script makes no writes and lists unredacted Test documents, missing banks, mismatches and embedded answer keys in regular lessons or rich-text pages. The `embeddedInLessons` total is report-only: those records are never modified by the script.
- Verify the candidate records, tenant scopes, question order and quiz/assessment references against legitimate student attempts. Export a backup before any production writes.
- Only after staging acceptance, explicitly set `VOP_QUIZ_MIGRATION_PROJECT` to the matching Firebase project ID and `VOP_QUIZ_MIGRATION_APPLY=YES`, then run with `--apply`. The script updates only canonical Test documents with matching server banks. It never changes unlinked historical tests or grades.
- Re-run in REPORT mode: expect zero remaining keyed linked Test documents. Address `legacyWithoutBank`, `embeddedInLessons` and `skipped` individually; no automatic answer-bank fabrication or loss of existing assessments.
- Test one learner, contributor, hierarchy admin, Super Admin, and foreign-organization member. Verify only permitted users can access private bank documents, grading succeeds after redaction, and Test documents cannot be overwritten from a browser.
- Restore a backup if historical lesson content or quiz ordering changed unexpectedly. Do not roll back Firestore security rules to allow all students to read `quizzes`; API-based grade access is the supported path.

## Further work (explicitly not complete)

Some historical lesson records embed question/answer arrays directly in readable course content rather than a separate Test document. The report now inventories those records, but migrating them safely still requires a matching private quiz bank and a verified compatibility plan for existing attempts. Do not use `--apply` expecting it to migrate inline lessons or rich-text pages. The offline bundled lessons are practice/self-study materials, not a secure examination engine. Implement assessment attempt throttling, teacher-controlled visibility and public/private question feedback before using high-stakes testing. Tenant-authenticated browser QA and production migration remain separate release gates.
