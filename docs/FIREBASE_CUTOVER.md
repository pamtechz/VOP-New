# VOP Firebase + source-verified offline curriculum cutover

**Repository:** `Pamtech-Zambia/VOP-New` only. **Firebase project:** `voiceofprophecy`. **Android package:** `com.sda.vop`. This document describes implementation and release gates, not a claim that Firebase apps were registered, data was seeded remotely, a signed APK was built, or a deployment was completed.

## Approved lesson source and ingestion

The original 80-language and 20-page assumptions were test fixtures, **not product requirements**. The user supplied the authoritative archive `sunday lessons-20260920T085104Z-1-001.zip`. Do not download lesson text from the earlier Drive URL or use legacy demonstration content as the production curriculum. The approved scope for this import is the archive's `bemba/` and `tonga/` lesson HTML only: 26 numbered lessons each, **52 localized lessons**. The extractor produces **362 actual numbered reading sections** and copies **170 referenced images**, preserving source text order. Exclude indexes, navigation scripts, signup pages and unrelated `40facts`, `60facts`, and `about` files.

The distributable content-import overlay supplied with this work contains `scripts/import_lessons.py`, `config/approved-languages.json`, `content/lessons.master.json`, `content/lessons.seed.json`, `content/import-report.json`, `content/assets/`, `public/lessons/`, and `tools/seed/`. **Large extracted JSON and binary assets have NOT been committed to this private repository through the text-only GitHub connector.** Overlay and commit this package to the dedicated VOP branch, never another repository. Without these genuine files, `npm run build:android` must fail closed; successful app-only CI does not prove the real lessons have been packaged.

The source filenames for Bemba lessons 11 and 12 conflict with visible headers that both say lesson 10. Preserve the original text; review this discrepancy rather than silently altering lesson titles. The seeder blocks a live apply until this is explicitly acknowledged. The HTML source contains no independently verified quiz answer keys. Store `quiz: []` and render reading only; never invent five questions, issue pass/fail grades, or award credentials from these source files.

Run after placing the package contents in the VOP working tree:

```bash
python -m pip install -r requirements-import.txt
python scripts/import_lessons.py "/path/to/sunday lessons-20260920T085104Z-1-001.zip" --metadata config/approved-languages.json --output /tmp/vop-extracted
# Place the extractor's generated content/ files and referenced assets into their repository paths.
node scripts/generate-snapshots.js
node --test tests/ingestion.test.mjs
npm ci
npm run build
npm run lint
```

Use a Windows directory instead of `/tmp` on Windows. The release policy currently requires two approved languages and 26 lesson IDs each. This is a configurable reviewed **inventory expectation**, never a hardcoded lesson list in React. The real manifest supplies language names, IDs, localized titles and image inventory. The schema 2 snapshot generator accepts any positive number of genuine sections and an empty quiz, stages output transactionally, and calculates SHA-256 revision/manifest/image hashes. The reader retains the original VOP page-turning and read-aloud behavior with images; APK reading performs **zero Firestore content queries**.

## Editorial database seed (optional and explicitly authorized)

The generated `content/lessons.seed.json` is an **export**, not evidence that Firestore has been seeded. Public client Firestore rules deny access to content collections. Seed only through an authenticated, separately authorized Admin SDK tool, after validating the target project, database ID, original source hashes, exact 52-document inventory and editorial headings. `tools/seed/seed-firestore.mjs` defaults to offline dry-run, checks destination collisions/revisions and is idempotent. Do not include service-account JSON or other private keys in Git. Never seed demonstration users, admin roles, or fake grades.

```bash
cd tools/seed
npm install
node seed-firestore.mjs --project-id voiceofprophecy --database-id '(default)' --curriculum-id discover
# ONLY with verified project access and approved editorial exception:
node seed-firestore.mjs --project-id voiceofprophecy --database-id '(default)' --curriculum-id discover --apply --acknowledge-source-headings
```

The database seed is for authorized editorial storage, not APK runtime content reads. If the intended database is not `(default)`, verify its actual ID and Admin SDK compatibility before applying. No remote seed has been performed.

## Firebase and native identity gates

In the existing project, register or verify Android app `com.sda.vop` and a Web app; add appropriate debug/release SHA-1/SHA-256 fingerprints, matching `android/app/google-services.json` and public Vite Web config. Enable and test Email/Password and Google Auth providers and authorized domains. Do not fabricate registration or hardcode user accounts. Android package changes can affect application upgrade/user-data migration. The Android release validator verifies deployment identity, source snapshots, manifest digest and every referenced local image. A real signed APK/AAB and physical device authentication/offline/reconnect tests remain required.

Firestore Web persistence uses WebView IndexedDB, not SQLite. Owner-scoped, append-only progress writes are tagged `practice_unverified`; client-generated answers and scores are not trusted qualifications. The five Firestore Emulator tests previously passed, but **emulator success does not prove deployed live rules**. Official certificates require separate server-authoritative assessment and approval; source HTML reading alone confers no certification.

## Verified repository checks and remaining gates

[Exact-head VOP verification run 35501663370](https://github.com/Pamtech-Zambia/VOP-New/actions/runs/35501663370) passed `npm ci`, TypeScript/Vite production build, active-runtime lint (0 warnings/errors), **51/51 regression tests**, and production dependency audit (0 findings). The test fixtures prove schema behavior and rollback; they are **synthetic** and are not a test of a real APK build with the large imported content. The full development audit reports three moderate `firebase-tools` dependency-chain findings (`csv-parse`, `stream-json`, aggregate `firebase-tools`), and Vite reports a Firebase chunk around 556 kB. Review compatible fixes and profile on-device performance.

Keep PR #1 draft and unmerged until extracted content is committed and reviewed, Firebase/Android registration and rules deployment are authorized and verified, real on-device tests pass, and any requested official certification has a trusted backend. No unrelated repository jobs should be touched.
