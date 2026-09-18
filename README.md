# Voice of Prophecy — Bible Correspondence School

React/TypeScript/Vite interface packaged for Android with Capacitor. The app includes Discover Bible study guides, lessons, assessments, progress tracking, administrator demo screens and explicitly unverified certificate previews.

> **Not production ready:** Operational records, admin roles and approval records still live in editable browser `localStorage`. `src/data/initialData.ts` contains demonstration people, organisations, curriculum and approvals; these are **fixtures**, not real identities or authoritative records. No official certificate is issued by this frontend.

## Run and check

```bash
npm ci
npm run dev
npm run build
npm run lint
node --experimental-strip-types --test tests/progress.test.ts tests/multitest.test.ts tests/certificatePreview.test.ts tests/averageScore.test.ts tests/quiz.test.ts
```

For Android packaging, use the Capacitor/Android configuration under `android/` after a successful web build. These workflows do not publish an APK or a production deployment.

## Implementation

- `src/components/guide/DiscoverGuideView.tsx`: compact mobile numbered lesson timeline. Published lessons are accessible without a hardcoded sequential prerequisite gate; configurable prerequisites would require a separate admin-managed policy.
- `src/pages/ReferenceProfilePage.tsx`: reference-screen profile and dynamically derived lesson/guide progress. Only phone and address can be edited in the demo; identity and organisation assignments are read-only for learners.
- `src/components/layout/MenuDrawer.tsx`: account sheet without an account-impersonation action.
- `src/services/quiz.ts`: validates both true/false and administrator-configured multiple-choice questions, rejecting missing options, answer keys, malformed answers and empty quizzes before scores can be saved.
- `src/services/progress.ts`: active-language required curriculum calculations, validated per-test scores and derived graduation average across required assessments.
- `src/services/certificatePreview.ts`: local preview gate requiring completed curriculum plus a matching approved and dated graduation record. All such records remain untrusted until server verification.
- `src/pages/CertificatesPage.tsx`: responsive **UNVERIFIED PREVIEW**; no official certificate may be inferred from its appearance, downloads or shares.
- `src/pages/AdminPage.tsx`: administrator demo, **not a security boundary**.
- `src/services/storage.ts`: temporary device-local persistence. An atomic queued migration changes stale completion counts, last-test-only grading and organization defaults; this source is still legacy until that migration's verified commit appears in the branch.
- `scripts/run-vop-review-once.mjs`: guarded retry-safe migration wrapper for the VOP-only runner.

## Production release blockers

1. Provision a **dedicated VOP backend** and identity provider; do not use data or credentials from another project. The destination organization and any cost must be confirmed before provisioning.
2. Move all operational settings, languages, translations, church structure, users, curriculum, progress and assessment results into authoritative administrator-managed persistence. Preserve stable IDs; do not promote demo accounts into production.
3. Enforce role and organization scope on the server. Students cannot write scores, privileges, graduation approvals, verified identities or organizational assignments. All privileged mutations need an audit trail.
4. Require server-side recomputation of all required-guide progress and passing grades, approved graduation workflow, immutable certificate ID and verification endpoint before issuing any official credential.
5. Verify build, lint, unit tests, authorization and Android/device rendering before merge/release. Visual comparisons to the supplied reference screenshots remain outstanding.

### Isolation and release gate

All code here is for `Pamtech-Zambia/VOP-New` only. CI is configured for the organization's `KASAINSTITUTE` self-hosted runner and must not cancel, modify or interfere with unrelated repositories' jobs. The draft PR must not merge simply because the UI renders; the backend/security requirements above and automated checks remain release blockers.
