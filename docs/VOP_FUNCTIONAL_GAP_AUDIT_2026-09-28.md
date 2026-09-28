# VOP functional gap and release audit — 2026-09-28

## Scope and evidence

Compared the VOP APP brief with merged PRs #98–#101 and the staged engagement integration in PR #102. The original document predates the follow-up security and offline passes. This is a code and CI review, **not a successful production/browser acceptance test**. Public provider behavior may differ by region, privacy setting, browser policy, or the content owner's embedding permissions.

| Product capability | Mainline / development evidence | Remaining release proof or implementation |
|---|---|---|
| Bible study, guides and lessons | `GuideManager`, `CurriculumManager`, `loadFirestoreGuides` | Merged PR #98 addresses draft guide selection, multiple same-language guides, learner metadata, and tenant scoping. Run real create → publish → enrol → complete regression in each organization scope. |
| Lesson-specific quizzes | Previously a detached `quizzes` collection plus older inline questions | Merged PRs #98 and #99 bind quizzes to a guide/lesson, use server-side grading and restrict answer-bank reads. Verify score and progress on authenticated test accounts. Older inline question banks still require migration/UX consolidation. |
| Entire-guide assessments | Previously no quiz attachment target | Merged PR #98 adds a whole-guide Test and keeps it ordered after ordinary lessons. Prove graduation/pass calculations distinguish individual and final assessments. |
| Audio/video teaching | Direct player, YouTube and AudioVerse supported | Merged PR #98 adds approved social embeds plus bounded public-page metadata extraction for WordPress/Umtu. Verify each publisher permits embedding. Unsupported, login-only, DRM and inaccessible pages do not yield downloadable media. Browser HLS compatibility and ingestion from custom providers need more coverage. |
| Personal Settings | Account settings page existed but lacked dedicated stylesheet | Merged PR #98 introduces scoped mobile-responsive settings CSS. Manually test phone/tablet/desktop, accessibility and dark theme. |
| Master Guide leadership portfolios | PR #102 stages learner activity/evidence, evaluator inbox, transactional sign-offs, time-limited verification links and scoped content studio | PR #102 remains unmerged pending final CI and authenticated browser QA. Verify evidence access, assigned mentors, hierarchy scopes and approval records. |
| Scripture memory | PR #102 stages Firestore-backed decks, review-state history, spaced-repetition scheduling and admin deck creation | PR #102 remains unmerged. Verify offline review and concurrent updates; no claim of offline memory sync yet. |
| Iron Duels | PR #102 stages same-org opt-in challenges, hidden answer keys, transactional scoring and expiry handling | PR #102 remains unmerged. Verify browser gameplay, anti-abuse/rate limits, rating privacy and race conditions; incomplete expired challenges must not influence ratings. |
| Announcements and organization communications | `AnnouncementsPage`, admin announcement CRUD | Dedicated events, calendar/programme registration, targeted push/inbox delivery and church directory are not proven by the current implementation. PR #87 adds unified search/inbox but remains unmerged. |
| Prayer ministry | `PrayerPage`, `PrayerManagementPanel`, `api/prayer.ts` | Test visibility per requester/church, moderation and status updates across hierarchy roles. |
| Digital certificates and verification | `CertificationManager`, `CertificateVerificationPage`, `api/certificates.ts` | Verify PDF artwork, security assets, signature approval, issued vs revoked records, and organization-specific certificate configuration end to end. |
| Adventist hierarchy and tenant security | `server/tenant.ts`, permission matrix, Firestore rules and CI rules tests | Validate Union → Conference → District → Church + institution scenarios with separate real accounts and cross-tenant negative tests. Scripted rule coverage is not equivalent to browser/API end-to-end coverage. |
| Offline-first study and progress synchronization | Merged PR #100 enables per-user Firestore persistence and a local lesson-completion queue replayed to server verification | Previously cached lessons can be read offline; quiz grading remains online. Download-manager UX, offline audio/video, eviction recovery, shared-device privacy and real multi-device conflict tests are still outstanding. |
| Localization | UI locale registry, translations and discovery pipeline exist | Several newer screens and dynamic errors still contain English literals. Complete live language switching and fallback tests across admin, reader, radio, prayer and quiz UI. |
| Android delivery | Android project exists in repository | Web fixes and verified API/tenant contracts must precede Android parity and deployment validation. |

## Security and integrity release gates

1. **Quiz answer secrecy:** merged PR #99 redacts *new or edited* published learner assessments, grades against the private quiz bank and blocks direct client access to that bank. Historical published legacy Test documents may still contain answers: execute and review the report-first migration described in the security runbook before claiming historical confidentiality.
2. **No arbitrary scraper:** permit exact trusted public source hosts and HTTPS-only official players. Public HTML parsing is bounded to the initial 64 KiB, without redirects or provider-supplied iframe HTML. DNS verification and a pinned HTTPS address reduce SSRF risk. No login impersonation, cookie forwarding, DRM bypass or private-video downloads.
3. **Cross-tenant tests:** verify guide+lesson attachment with owner, co-editor, hierarchy admin, Super Admin, ordinary learner and foreign-organization accounts. Attempt to attach to archived, foreign, unpublished and malformed parents, then verify server responses and Firestore persistence.
4. **Publication and migration:** confirm archived or unpublished parents cannot expose quiz Test records; reconcile legacy inline question sets and orphan quiz documents. Test moving an assessment between guides and ensure the previous auto-generated Test is removed only for the same source quiz.
5. **Provider and responsive checks:** validate accessible player titles, mobile scrolling, script/frame policies, original-site links on provider refusal, signed direct URLs, and performance on low-bandwidth networks.
6. **Deployment:** CI green is required but not sufficient. Check the real `vopapp.org` deployment target, production Firebase rules/indexes, environment allowlists and a real browser smoke test before merge or release.

## Suggested implementation sequence

Finish the historical quiz-answer migration, validate the existing offline cache and replay on real shared devices, review and integrate PR #102, and reconcile the still-open scope/search/inbox work in PR #87 without overwriting newer tenant and UI fixes. Treat open PRs as development, not released features. Finally close the certificate, localization, and full tenant regression matrix and confirm the production deployment.
