# VOP functional gap and release audit — 2026-09-28

## Scope and evidence

Compared the `main` baseline (`4e53dccb0eee4d03d9a9a1c1e664ac75619b5386`), the source in this change branch, and the public repository's open pull requests with the VOP APP product brief. This is a code and CI review, **not a successful production/browser acceptance test**. Public provider behavior may differ by region, privacy setting, browser policy, or the content owner's embedding permissions.

| Product capability | Mainline / development evidence | Remaining release proof or implementation |
|---|---|---|
| Bible study, guides and lessons | `GuideManager`, `CurriculumManager`, `loadFirestoreGuides` | This PR addresses draft guide selection, multiple same-language guides, learner metadata, and tenant scoping. Run real create → publish → enrol → complete regression in each organization scope. |
| Lesson-specific quizzes | Previously a detached `quizzes` collection plus older inline questions | This PR binds one quiz to an existing guide + lesson, creates the server-graded Test lesson, enforces owner and parent-publish rules. Verify score and progress on authenticated test accounts. Older inline question banks still require migration/UX consolidation. |
| Entire-guide assessments | Previously no quiz attachment target | This PR adds a guide-level Test assessment and keeps it ordered after ordinary lessons. Prove graduation/pass calculations distinguish individual and final assessments. |
| Audio/video teaching | Direct player, YouTube and AudioVerse supported | This PR adds Facebook, Instagram, TikTok, Vimeo and SoundCloud official embeds, plus controlled public-page metadata extraction for WordPress/Umtu. Verify each publisher permits embedding. Unsupported, login-only, DRM and inaccessible pages do not yield downloadable media. Browser HLS compatibility and ingestion from custom providers need more coverage. |
| Personal Settings | Account settings page existed but lacked dedicated stylesheet | This PR introduces scoped mobile-responsive settings CSS. Manually test phone/tablet/desktop, accessibility and dark theme. |
| Master Guide leadership portfolios | PR #88 contains learner portfolio + mentor/evaluator requirements; PR #89 changes self-service permissions | Both remain unmerged and must be rebased, reviewed for tenant isolation, and tested before the product advertises them as live. |
| Scripture memory | PR #88 contains spaced-repetition decks, mastery and review history | PR #88 is unmerged; verify card generation, offline operation and conflict resolution. |
| Iron Duels | PR #88 contains a server-authoritative 1v1 design | PR #88 is unmerged; test match lifecycle, simultaneous scoring, retries and leaderboard tenant privacy. |
| Announcements and organization communications | `AnnouncementsPage`, admin announcement CRUD | Dedicated events, calendar/programme registration, targeted push/inbox delivery and church directory are not proven by the current implementation. PR #87 adds unified search/inbox but remains unmerged. |
| Prayer ministry | `PrayerPage`, `PrayerManagementPanel`, `api/prayer.ts` | Test visibility per requester/church, moderation and status updates across hierarchy roles. |
| Digital certificates and verification | `CertificationManager`, `CertificateVerificationPage`, `api/certificates.ts` | Verify PDF artwork, security assets, signature approval, issued vs revoked records, and organization-specific certificate configuration end to end. |
| Adventist hierarchy and tenant security | `server/tenant.ts`, permission matrix, Firestore rules and CI rules tests | Validate Union → Conference → District → Church + institution scenarios with separate real accounts and cross-tenant negative tests. Scripted rule coverage is not equivalent to browser/API end-to-end coverage. |
| Offline-first study and progress synchronization | `public/sw.js` currently caches shell assets; `src/services/localStudy.ts` posts directly to online progress API | **Not yet complete:** no verified persistent offline guide-download and authenticated offline-progress retry queue. Offline study + eventual server reconciliation requires a separate end-to-end implementation; do not advertise reliable offline completion as released. |
| Localization | UI locale registry, translations and discovery pipeline exist | Several newer screens and dynamic errors still contain English literals. Complete live language switching and fallback tests across admin, reader, radio, prayer and quiz UI. |
| Android delivery | Android project exists in repository | Web fixes and verified API/tenant contracts must precede Android parity and deployment validation. |

## Security and integrity release gates

1. **Quiz answer secrecy:** existing learner reading uses Firestore lesson documents containing `questions` and `correctOptionIndex`; the online grading API is authoritative, but a learner who can read the Firestore document may inspect answer keys in the network response. This PR restricts the *quiz-management API* to contributor roles. Full protection requires separate answer-key storage, a redacted learner-read API and matching Firestore read rules; do not claim secure answer confidentiality until that migration is complete.
2. **No arbitrary scraper:** permit exact trusted public source hosts and HTTPS-only official players. Public HTML parsing is bounded to the initial 64 KiB, without redirects or provider-supplied iframe HTML. DNS verification and a pinned HTTPS address reduce SSRF risk. No login impersonation, cookie forwarding, DRM bypass or private-video downloads.
3. **Cross-tenant tests:** verify guide+lesson attachment with owner, co-editor, hierarchy admin, Super Admin, ordinary learner and foreign-organization accounts. Attempt to attach to archived, foreign, unpublished and malformed parents, then verify server responses and Firestore persistence.
4. **Publication and migration:** confirm archived or unpublished parents cannot expose quiz Test records; reconcile legacy inline question sets and orphan quiz documents. Test moving an assessment between guides and ensure the previous auto-generated Test is removed only for the same source quiz.
5. **Provider and responsive checks:** validate accessible player titles, mobile scrolling, script/frame policies, original-site links on provider refusal, signed direct URLs, and performance on low-bandwidth networks.
6. **Deployment:** CI green is required but not sufficient. Check the real `vopapp.org` deployment target, production Firebase rules/indexes, environment allowlists and a real browser smoke test before merge or release.

## Suggested implementation sequence

Protect learner quiz answer keys and implement a durable offline study queue before publicly promising cheat-resistant assessments and offline completion. Independently review and integrate the staged engagement functionality from PRs #87–#89; do not mistake source code in an open PR for a released feature. Finally close the certificate, localization, and full tenant regression matrix and confirm the production deployment.
