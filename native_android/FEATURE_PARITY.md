# Flutter and existing VOP web parity

Flutter web and Android share `lib/` and call the existing VOP API routes. Business records and policy are supplied by the backend. API schemas and UI labels are code; they are not demonstration organizations, prices, counts, or content.

| Workflow | Implementation |
| --- | --- |
| Authentication and registration | Existing Firebase sign-in and server-authoritative account registration, approval policy, contact details, and invitations |
| Dedicated portals | Authoritative profile lookup; administrators, organizational staff, mentors, and learners load their own portals. A failed profile lookup shows retry/sign-out rather than a guessed learner account. |
| Public admission | Search the database-backed institution directory; join as a learner without prior membership; reject staff promotion, disabled membership bypass, and silent tenant transfers |
| Public ministry administration | Super Admin creates/designates a public ministry, configures directory admission and locality, manages ownership and members, and later assigns a learner to an authorized church |
| Dashboards | Scoped analytics and actual operational health; permission-aware navigation; unavailable requests show errors |
| Curriculum | Programs, guides, lessons, chapter/section Plate editing, legacy page editing, private Quiz Library, publishing and deletion |
| Content administration | Learning paths, topics, seasons, announcements, events, resources, broadcasts, playlists, and hierarchy records |
| Certificates | Server-issued records and graduation decisions; certificate configuration and visual template editing |
| Mentoring | Live rosters, assignments, performance, support threads, conversations, and automation settings |
| Engagement | Requirements, memory decks and challenge banks; submitted portfolio review and ministry prayer status |
| Localization | Existing translations, proposals, recommendations, approvals, collaborator invitations/access, applications and language access reviews |
| Billing | Database-configured plans and quotas, assignment with an audit reason, cancellation/reactivation, billing policy, payable items, provider controls, payment history and receipts |
| Checkout | Existing gateway contract, HTTPS provider validation, inline web/native checkout, and authenticated server verification of payment results |
| Account tools | Profile, preferences, notifications, invitations, security/passkeys, account lifecycle, offline study and existing learner features |

## Release verification

Source implementation, automated backend validation, Flutter compilation, and device acceptance are separate gates. The self-hosted Windows KASAINSTITUTE workflow runs Flutter analysis, tests, web compilation and an Android APK build. Backend workflows run unit/integration tests and Firestore rules checks.

Before replacing the existing web deployment or distributing an Android release, verify the built application with real administrator, organizational staff, mentor and learner accounts on representative desktop/mobile browsers and a physical Android device. Exercise configured payment providers in their approved test environment, confirm production OAuth fingerprints/signing, compare dashboard records to the existing web, and review rendering of the institution's actual Plate documents and certificate templates.

No production database migration or replacement web deployment is implied by adding these source changes. The existing backend remains authoritative for permissions, subscription enforcement, quiz answers, graduation, certificate issuance and payments.
