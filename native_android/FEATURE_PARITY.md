# Native Android ↔ VOP web feature parity

This is the release gate for the independent Flutter `native_android` project.
The official design reference is `src/index.css`, `HomeDashboard`,
`BottomNav`, `LearnerSidebar` and the web feature route implementations.

A module is **parity complete** only when it shares the correct server
authorisation, has all relevant Android interactions, supports the current
organisation subscription/feature configuration, handles offline/error states,
and has been manually checked on a real Android device. A menu link or backend
read endpoint alone is *not* feature parity.

## Implemented native capabilities

| Web feature | Native Android current state | Additional release gate |
| --- | --- | --- |
| Web colour tokens and mobile shell | Native navy/gold Material 3, hero cards, rounded content cards, responsive bottom bar and rail | Device screenshot and dark-mode contrast review |
| Discover dashboard | Native welcome, live course summaries, quick links and counts | Dynamic organisation hero slides, bookmarks and featured campaign rules |
| Lessons and programmes | Catalogue, native reader, progress, session-bound quizzes | Every Plate block, media and lesson navigation option |
| Library | Tenant-scoped, published book/resource entries with deep content details | Offline resources, document viewer and rights checks |
| Prayer | Own/community lists, secure request submission, privacy and categories | Ministry/admin management and notification workflows |
| Radio and media | Native catalogue/detail and safe media links | In-app background audio/video player, playlists and resume state |
| Announcements and events | Native published cards/details | Reminder controls and deep linking |
| Certificates | Server-issued credential records and review status | Pixel-faithful template, downloads, QR verification and sharing |
| Notifications | Personal inbox, mark as read, mark all, delete | Push delivery, deep-link actions, real-time badge counts |
| Scripture memory | Published decks, due verses and server-rated reviews | Full revision scheduling and all card states |
| Solo Scripture challenges | Authoritative session, submit answers, finish, score and points | Challenge timer and every duel type |
| Duels | Arena overview and organisation leaderboard | Peer invitation, active competitive duel and result presentation |
| Mentoring | Assigned mentor conversation and send/read messages | Multi-reference attachments, live presence and admin moderation |
| Profile | Native signed-in identity, role and organisation summary | Profile editing, security/passkeys, language preferences |
| Sign-in | Firebase email/password, Google OAuth flow | Device OAuth SHA fingerprints, enrollment and recovery |

## Remaining features before the Android app can claim full web parity

- Native organisation, Union, Conference, District, Church and Super Admin dashboards.
- All administrator CRUD modules, curriculum studio and native Plate editing.
- Candidate lifecycle, mentor allocation, automation, support ticket management.
- Full localisation with organisation-assigned translation permissions.
- Billing/subscriptions, receipts, configured payment gateways and server-verified FX.
- Full engagement catalog including every duel/challenge mode and portfolio.
- Broadcast background playback, media download/stream rights, offline study queue.
- Push/notification channels, reminders, deep links and secure attachments.
- Passkeys/biometrics, account lifecycle/onboarding, accessibility, production signing,
  Play Integrity, performance and automated end-to-end Android device tests.

**Security rule:** Do not duplicate server-only assessments, certificate issuance,
organisation permissions, payment processing or engagement point calculation
inside Flutter. Every mutation must use the corresponding authenticated
VOP API and approved workflow.

## Validation

The GitHub `VOP native Android` workflow runs Flutter analysis, tests and
an APK build. The VOP web/API workflows continue to validate the server.
After CI passes, install the APK on a real device, verify data in both apps,
check role-restricted content and confirm that no private data leaks.

A passing APK build means *buildable*, not *feature complete*.
