# Voice of Prophecy — Firebase, offline lessons and Android cutover

Scope: `Pamtech-Zambia/VOP-New` only. Existing Firebase project: `voiceofprophecy`. Android application ID: `com.sda.vop`. **This is a release runbook; an Android release, remote Firebase registration, production rules deployment and content approval have NOT been completed.**

## 1. Identity and Firebase registration

Use the Firebase Console for the existing `voiceofprophecy` project. Verify or register the Android app with package `com.sda.vop`, the appropriate release/debug signing SHA fingerprints and its matching `android/app/google-services.json`. Register or verify a Web app in that same project and supply the public Vite Web configuration via `.env.local`, following `.env.example`. Do not commit real application credentials, service-account JSON, Admin SDK keys or signing passwords. Web Firebase API keys are public identifiers, not administrator credentials, but should still be sourced from the real app registration rather than fabricated.

Enable and test Email/Password and Google providers, support email and authorized Web domains. Native Google sign-in uses the Capacitor account picker and passes its Google ID token into Firebase Web Authentication; native behavior remains unverified. Changing the old Android package to `com.sda.vop` creates a separate installation, so devise a real-data migration or communication plan rather than claiming in-place upgrades.

## 2. Dynamic lesson inventory; no seeded operational records

The real approved source is `content/lessons.master.json` (or an explicitly authorized `LESSONS_MASTER_PATH`). It is not present in the accessible repository. Never generate fictional lessons, users, translation data, progress or administrative identities to satisfy a target count.

`config/curriculum-policy.json` declares the approved *required counts* (`expectedLanguageCount`, `expectedLessonCount`). These are release requirements, not code-level language arrays or user data. The current reviewed policy requires 80 languages × 26 lessons, but future inventory changes must be reviewed through this configuration and accompanied by the genuine approved source. `scripts/generate-snapshots.js` reads the policy and master; it requires every declared language/lesson pair exactly once and fails closed on missing/duplicate content, blank pages and invalid quiz material. The generator builds the minified `public/lessons/{language}/{lessonId}.json` set plus manifest transactionally and calculates per-snapshot and manifest SHA-256 integrity hashes.

The production `FirebaseStudyApp` discovers languages and lesson IDs from the validated packaged manifest, rather than hardcoding lists or counts. `scripts/validate-android-release.mjs` separately rechecks the approved release policy, every file's structure/identity/hash and the full manifest digest. The reading/quiz schema currently requires 20 ordered substantive pages and five valid questions per translation; these are schema requirements, not invented content. If the church changes that study format, update the generator, Android validator, reader, Firestore rules and tests as one versioned schema migration rather than only changing a UI number.

The app reads lesson content from local packaged assets, not Firestore. Build scripts read approved source only at build time. APK contents, including answer keys, are accessible to device owners; do not mistake bundled question answers or client-computed scores for official, secret or authoritative grading.

## 3. Security, ownership and progress

The production boot path uses Firebase Auth, not the old browser-local demonstration users. `users/{auth.uid}/progress/{randomSubmissionId}` records are append-only, owner-scoped and tagged `practice_unverified` by prototype `firestore.rules`. They cannot be promoted by client input into official grades or certificates. Staff accounts, roles, organizational records, passing thresholds and certification decisions require authenticated, server-authorized configuration and trusted services; do not hardcode staff, learners or privileged records in the app. Nothing here creates those services or grants an unverified demo account privileges.

The `tests/firestoreRules.test.mjs` suite contains *synthetic test identities only*, for valid own writes and denied cross-account/anonymous requests, malformed payloads, overrides, deletes and unpermitted collections. It must be run against the Firebase Emulator Suite using a `demo-` test project, never a real project. Java 21 is installed within its GitHub job rather than changing the shared `KASAINSTITUTE` runner. **An emulator proof has not yet succeeded and no Firestore rules have been deployed.** Inspect the workflow result and resolve failures before authorizing production deployment.

Firestore Web persistence on Android uses WebView IndexedDB, not native SQLite. Offline submissions may be locally queued; only server acknowledgement may be described as synchronized. Verify offline reading, restart, login state, user switching, reconnection, rejected writes and isolation on actual Android devices.

## 4. Reproducible release validation

Use an approved master, real matching Android `google-services.json` and genuine Web configuration. Run `npm ci`, `npm run build`, `npm run lint`, the VOP regression tests, and `npm audit --omit=dev --audit-level=moderate`. Run `npm run build:android`; it first generates complete snapshots and validates native app identity, Firebase registration, configured inventory, every snapshot and the manifest before running the production build and Capacitor sync. Then build/sign an actual APK or AAB and verify package ID and authentication/offline behavior on devices. Normal VOP verification is repository-scoped and read-only; it does not operate on any other repository's jobs.

Run emulator adversarial tests and review the correct database ID/region, edition, access model, quotas and billing before deploying rules, **only with authorized Firebase project access**. No current GitHub connector has been used to register Firebase apps, enable authentication providers, deploy rules, sign an APK or move live users. Never deploy merely because synthetic CI tests pass. Official certificates require a separate trusted grader and authorized issuance workflow.

## 5. Release decision record

The PR must remain DRAFT and unmerged until the genuine full approved lesson master, matching Firebase app registrations and configuration, emulator proof, device tests, user-migration decision, trusted certification architecture and signed artifact have been verified. The previous demonstration data is not approved production content and must not be silently imported or multiplied. Repository code checks prove code behavior only; they do not establish a completed Firebase or Play Store release.

References: https://firebase.google.com/docs/web/setup ; https://firebase.google.com/docs/firestore/manage-data/enable-offline ; https://firebase.google.com/docs/auth/android/google-signin ; https://firebase.google.com/docs/rules/unit-tests ; https://capacitorjs.com/docs/android .
