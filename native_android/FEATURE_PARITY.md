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
| **Admin Command Center** | Native executive analytics, KPIs, operational health, and module routing (Super Admin & Hierarchy Admins) | Real-time aggregate count verification across scopes |
| **Organisation Portal** | Dedicated institutional workspace (`OrganizationDashboardScreen`) strictly loaded for organization accounts (`owner`, `admin`, `teacher`, `staff`), scoped to `organizationId` | Multi-tenant isolation and seat quota enforcement |
| **Strict Portal Router** | Authoritative login router in `main.dart` following `portalAccess.ts`: admin accounts load Admin Portal only; organization accounts load Organisation Portal only; mentors load Mentor Workspace only; learners load Learner Workspace only | Zero cross-portal bleed on initial launch |
| **Candidate Roster** | Complete candidate roster, search, lifecycle milestones (baptism schedule, marked baptized), and direct enrollment | Batch CSV import and transfer workflows |
| **Organizations & Hierarchy** | Unions, conferences, districts, churches, and campus ministries directory, node creation, and filters | Regional delegation and hierarchy boundary enforcement |
| **Graduation Approvals** | Multi-stage approval queue, exam score validation, approver notes, approve & certificate issuance, reject | Bulk certificate batch signing |
| **User & Role Directory** | Platform and institutional user directory, role assignments (`super_admin` down to `student`), privilege toggles | MFA/session revocation triggers |
| **Curriculum Studio** | Catalog inspector for guides, discover numbers, sharing scopes, certificate eligibility, and lesson breakdowns | In-app visual Plate block authoring |
| **Subscriptions & Plans** | Institutional tier viewer (Church, Conference, Union Unlimited), quota limits, and transparent billing quotes | Native in-app mobile money checkout |
| **Mentor Workspace** | Dedicated pastoral center with assigned candidates, progress tracking, and 1-on-1 chat launch | Automated inactivity alerts and mentor assignment rebalancing |
| **Web Bootstrap & DOM Guards** | Defensive guards for Flutter Web DWDS DOM element removal (`removeChild`) and clean runner modes | Automated browser regression suites |

## Next Phase Roadmap

- Native visual Plate editor for on-device curriculum authoring.
- Full localisation console with organisation-assigned translation permissions.
- In-app mobile money and direct gateway payments checkout within Flutter.
- Broadcast background playback service with lockscreen audio controls and offline study audio queue.
- Push notification channel registration and Firebase Cloud Messaging background handlers.
- Production signing, Play Integrity verification, and physical Android device release tests.

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
