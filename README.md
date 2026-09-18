# Voice of Prophecy — Bible Correspondence School

React/TypeScript/Vite interface packaged for Android with Capacitor. The app includes Discover Bible study guides, lessons, assessments, progress tracking, administrator demo screens and explicitly unverified certificate previews.

> **Not production ready:** Operational records, admin roles and approval records still live in editable browser `localStorage`. `src/data/initialData.ts` contains demonstration people, organisations, curriculum and approvals; these are **fixtures**, not real identities or authoritative records. No official certificate is issued by this frontend.

## Run and check

```bash
npm ci
npm run dev
npm run build
npm run lint
node --experimental-strip-types --test tests/progress.test.ts tests/multitest.test.ts tests/certificatePreview.test.ts tests/averageScore.test.ts tests/quiz.test.ts tests/lesson.test.ts
```

For Android packaging, use the Capacitor/Android configuration under `android/` after a successful web build. These workflows do not publish an APK or a production deployment.

## Implementation

- `src/components/guide/DiscoverGuideView.tsx`: compact mobile numbered lesson timeline. Published lessons are accessible without a hardcoded sequential prerequisite gate; configurable prerequisites require a separate admin-managed policy.
- `src/components/reader/LessonReaderModal.tsx` and `src/services/lesson.ts`: accessible Bible study reader with read-aloud controls; an empty or malformed lesson cannot be marked complete. Progress also rejects an old completion flag if study content has since become invalid.
- `src/pages/ReferenceProfilePage.tsx`: reference-screen profile and dynamically derived lesson/guide progress. Only phone and address can be edited in the demo; identity and organisation assignments are read-only for learners.
- `src/components/layout/MenuDrawer.tsx`: account sheet without an account-impersonation action.
- `src/services/quiz.ts`: validates true/false and multiple-choice questions, rejecting missing or duplicate question IDs, missing options, invalid answer keys, malformed answers and empty quizzes before a score is accepted.
- `src/services/progress.ts`: active-language required curriculum calculations, validated lessons and per-test scores, and derived graduation average across required assessments. Incorrect or incomplete curriculum configuration blocks local certificate eligibility without deleting stored progress.
- `src/services/certificatePreview.ts`: local preview gate requiring completed curriculum plus a matching approved and dated graduation record. These browser records remain untrusted until server verification.
- `src/pages/CertificatesPage.tsx`: responsive **UNVERIFIED PREVIEW**; no official certificate may be inferred from its appearance, downloads or shares.
- `src/pages/AdminPage.tsx`: administrator demo, **not a security boundary**.
- `src/services/storage.ts`: temporary device-local persistence. A queued migration changes stale completion counts, last-test-only grading and organization defaults; this source is still legacy until that migration's verified commit appears in the branch.
- `scripts/run-vop-review-once.mjs`: guarded retry-safe migration wrapper for the VOP-only runner.
- `docs/BACKEND_CONTRACT.md`: requirements for a separate ministry backend, authenticated roles, server-side grading, curriculum revisions and official credential issuance. It does not represent an installed service.

## Production release blockers

1. Establish a **dedicated VOP backend** and identity provider; do not use data or credentials from another project or assume an owner/provider.
2. Move operational settings, languages, translations, church structure, users, curriculum, progress and assessment results into authoritative administrator-managed storage. Preserve stable IDs; do not promote demo accounts into production.
3. Enforce role and organization scope on the server. Learners cannot write scores, privileges, graduation approvals, verified identities or organizational assignments. Audit privileged changes.
4. Require server-side recomputation of required-guide progress and passing grades, approved graduation workflow, immutable certificate IDs and a verification endpoint before issuing official credentials.
5. Verify build, lint, unit tests, authorization and Android/device rendering before merge/release. Visual comparisons to supplied reference screenshots remain outstanding.

### Isolation and release gate

All code here is for `Pamtech-Zambia/VOP-New` only. CI uses the organization's `KASAINSTITUTE` self-hosted runner without cancelling, modifying or interfering with unrelated repositories' jobs. The draft PR must not merge simply because the UI renders; backend/security and automated checks remain release blockers.
