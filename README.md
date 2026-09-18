# Voice of Prophecy — Bible Correspondence School

This repository contains a React/TypeScript/Vite interface packaged for Android with Capacitor. It includes Discover Bible study guides, a lesson reader, assessments, candidate progress, an administration interface and certificate **previews**.

> **Development / demo status:** All operational records currently live in browser `localStorage`. The seeded people, organisations, curriculum and approvals in `src/data/initialData.ts` are demo fixtures, **not trustworthy production records**. Browser-stored role flags are not authentication. No official credential should be issued from the present client. Certificate imagery is intentionally marked **UNVERIFIED PREVIEW** until a secure server is integrated.

## Run and check

```bash
npm ci
npm run dev
npm run build
npm run lint
node --experimental-strip-types --test tests/progress.test.ts tests/multitest.test.ts
```

For Android packaging, use the Capacitor/Android configuration under `android/` and `capacitor.config.ts` after a successful web build. No APK or release build is automatically published by this repository's verification workflow.

## Source layout

- `src/components/guide/DiscoverGuideView.tsx`: simple mobile lesson timeline.
- `src/pages/ProfilePage.tsx` and `src/components/layout/MenuDrawer.tsx`: candidate profile and account view.
- `src/services/progress.ts`: derived, language-scoped required-guide progress and eligibility.
- `src/pages/CertificatesPage.tsx`: local-only, explicitly unverified completion preview.
- `src/pages/AdminPage.tsx`: administrator demo functions; **not** a secure role boundary.
- `src/data/initialData.ts`: legacy demo seed content; replace via reviewed migration before public release.
- `src/services/storage.ts`: temporary device-local persistence; replace with authenticated server APIs.
- `src/reference.css`: reference-screen styling supplementary to the existing CSS.

## Production readiness — blocking work

1. Provision a **VOP-specific** backend and identity provider; never use credentials or data belonging to another repository or service. Confirm costs and the target organisation before provisioning anything.
2. Migrate operational settings, languages, translations, organizations, users, curriculum and grades into authoritative administrator-managed storage. Preserve stable IDs and audit provenance; do not promote seeded demo users as real accounts.
3. Enforce roles, organization scope, grading and graduation approval in trusted server functions with database row-level policies. Students must not be able to write scores, approved status or their own roles.
4. Issue immutable server-generated certificates with identity, unique ID, issuance date and verification endpoint only after the server independently verifies all required guides, per-test marks and approved graduation records. Never use browser-generated 'verification' links as proof.
5. Add authenticated integration tests, device screenshots at representative widths, backup/restore and failure/recovery checks. Run `npm run build`, lint, unit, authorization and Android tests before merge or release.

### Scope and isolation

Work for this project must stay in `Pamtech-Zambia/VOP-New`. The VOP-only CI uses the `KASAINSTITUTE` self-hosted runner label without terminating or modifying other repositories' jobs. This branch must not be merged simply because its UI renders; an official certification release requires the server work above.
