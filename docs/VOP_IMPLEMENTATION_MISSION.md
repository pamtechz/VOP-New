# VOP Implementation Mission

You are the implementation agent for VOP-New. Execute this mission directly against the repository; do not stop at analysis.

## Product target

VOP must be a production-ready, secure multi-tenant SaaS evangelism and Bible-learning platform. Each organization has isolated users, candidates, mentors, mentoring, curriculum, guides, lessons, quizzes, radio, materials, announcements, certificates, analytics, settings, branding, translations and audit records.

## Mandatory content ownership

Guides, lessons and quizzes are shareable but canonical editing ownership never transfers.

- The owning/uploading organization may edit its canonical content according to its authorized content-management roles.
- VOP Super Admin may edit any canonical content.
- Other organizations may consume approved shared content read-only.
- A consuming organization must use an explicit fork/copy operation to create editable organization-owned content.
- Questions, sections, topics, blocks, attachments and canonical metadata follow the same ownership boundary.

## Mandatory SaaS security

Tenant boundaries must be enforced server-side and in Firestore rules. Client-side hiding is never authorization. Every tenant-owned read/write must resolve authenticated organization membership and reject cross-tenant access. Super Admin is the only unrestricted platform role.

## Mandatory localization boundary

VOP has two independent language concepts:

- uiLocale: application/interface language.
- studyLanguage: human-authored curriculum language.

UI localization covers navigation, controls, forms, notifications, errors, validation, admin screens, accessibility text and system-generated UI. Use stable namespaced keys and database-backed published translations.

Curriculum content is human-authored and must never be passed through the UI translation function. Do not translate lesson titles, lesson body content, guide content, quiz questions, quiz options, Bible references, captions or other curriculum data. The stored curriculum language determines which human-authored content is displayed.

Adding or publishing a UI locale must not require a React source-code change. Translation management must be authorized server-side. Missing translations must use deterministic fallback: requested locale -> configured fallback -> English -> developer fallback.

## Required implementation areas

Complete and validate, in repository order:

1. Tenant identity, memberships and server authorization.
2. Organization onboarding, invitations, hierarchy and branding.
3. Tenant-aware curriculum, guides, lessons and reusable Quiz Library.
4. Shared-content publishing and explicit fork/copy workflows.
5. Tenant-aware users, candidates and mentoring.
6. Tenant-aware radio, persistent playlists, schedules and media.
7. Tenant-aware materials, announcements and certificates.
8. Sharing, deep links, QR generation and truthful open/app-launch/PWA-install metrics.
9. Organization analytics and platform aggregate analytics.
10. Plans, quotas, feature entitlements and usage metering.
11. Audit/security controls.
12. Database-driven UI localization and Translation Studio.
13. Independent uiLocale/studyLanguage persistence.
14. Repository-wide hardcoded UI audit and accessibility localization.
15. Tests, type checking, lint, build and deployment verification.

## Quality rules

Never add demo accounts, fake records, placeholder analytics or fabricated curriculum data. Never expose secrets in client code. Preserve existing human-translated Bemba/Tonga and other curriculum data exactly unless a documented migration is required.

For every feature previously marked missing, partially implemented or warning, inspect the actual implementation, complete it, test it, and only then mark it complete.

Production completion requires passing build/type/lint checks, tenant isolation tests, content ownership tests, localization audit, regression tests and successful deployment verification. If deployment is rate-limited, continue repository implementation and validation but do not claim deployment success.
