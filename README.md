# Voice of Prophecy — Bible Correspondence School

React/TypeScript/Vite interface packaged for Android with Capacitor. The application uses Firebase Authentication/Firestore for account and content data, Vercel server APIs for privileged operations, server-side assessment grading, tenant-scoped administration, graduation approval and official certificate issuance.

> **Security model:** Browser storage is treated only as non-authoritative UI/cache state and is namespaced to the authenticated account. Operational progress, assessment results, graduation decisions, tenant membership and official credentials are server-authoritative. No system can be guaranteed literally unhackable; the release target is defense-in-depth with least privilege, tenant isolation, immutable credential records and deny-by-default Firestore rules.

## Run and check

```bash
npm ci
npm run dev
npm run build
npm run lint
node --experimental-strip-types --test tests/progress.test.ts tests/multitest.test.ts tests/certificatePreview.test.ts tests/averageScore.test.ts tests/quiz.test.ts tests/lesson.test.ts
```

For Android packaging, use the Capacitor/Android configuration under `android/` after a successful web build. These workflows do not publish an APK or a production deployment.


## Local development API

The production deployment uses Vercel's native `/api/*` functions. A plain Vite server does not provide those routes, so `vite.config.ts` now mounts the same TypeScript handlers under `/api/*` during `npm run dev`. This prevents local 404s such as `POST /api/account/profile` and `POST /api/study/progress`.

Create `.env.local` from `.env.example`. Keep the Firebase Web values prefixed with `VITE_`. Keep Firebase Admin credentials server-only (never use a `VITE_` prefix):

```text
VITE_FIREBASE_PROJECT_ID=voiceofprophecy
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_APP_ID=...

FIREBASE_ADMIN_PROJECT_ID=voiceofprophecy
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY=...
```

The Admin SDK variables are required for server-authoritative study progress, assessment grading, certificate issuance and administrator API actions. A newly registered learner can still create their own minimum student profile through the Firestore rules if the local Admin SDK is unavailable.

After changing environment variables, restart Vite:

```bash
npm run dev
```

## Firestore curriculum

The production lesson seed script writes approved lessons to the canonical `curricula/discover/languages/{language}/lessons/{lessonId}` hierarchy used by the web reader.

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
- `src/services/storage.ts`: compatibility/UI cache layer only. Cached values are namespaced by Firebase account and are never used to award study credit, grades, graduation approval or official credentials.
- `scripts/run-vop-review-once.mjs`: guarded retry-safe migration wrapper for the VOP-only runner.
- `docs/BACKEND_CONTRACT.md`: requirements for a separate ministry backend, authenticated roles, server-side grading, curriculum revisions and official credential issuance. It does not represent an installed service.

## Production release gate

1. Keep Firebase Admin credentials server-only; web configuration may contain only public Firebase client configuration.
2. Maintain first-class SaaS tenants for `union_admin`, `conference_admin`, `district_admin` and `church_admin`, with server-side membership and hierarchy scope checks.
3. Keep canonical guide/lesson editing restricted to the owning organization and Super Admin. Shared published content is readable/installable across tenants only where explicitly allowed; edits require an organization-owned fork.
4. Keep learner progress and assessment grading server-authoritative. Graduation eligibility and approval are handled by the configured multi-stage workflow with revision/concurrency protection.
5. Official certificates are issued only by the server after tenant, guide, completion, assessment, graduation and identity checks; certificate identity is immutable and public verification returns a deliberately reduced record.
6. Run build, lint, automated authorization/security tests and Android/device visual verification before declaring a release.

### Isolation and release gate

All code here is for `pamtechz/VOP-New` only. Backend authorization and Firestore rules are part of the release gate; a working UI is not treated as proof of authorization. Production deployments must be verified as READY before a deployment is considered active.

## UI parity

The learner account, certificate, and administrator overview screens use the supplied VOP mobile visual reference as a presentation guide. Names, progress values, curriculum, languages, users, certificate metadata, radio programmes, and other operational content remain data-driven; the reference images are not used as application data.
