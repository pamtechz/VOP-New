# VOP SaaS Platform Mission

## Mission

Transform VOP into a production-ready, secure, multi-tenant SaaS evangelism and Bible-learning platform for institutions and organizations.

The platform must allow each organization to operate an independently managed VOP experience while sharing approved platform content where explicitly permitted. Organization data, users, curriculum, mentoring, radio, certificates, announcements, materials, candidates, analytics, translations, settings, and operational records must be isolated by tenant and enforced server-side.

## Non-negotiable principles

1. Multi-tenancy is a security boundary, not merely a UI feature.
2. Never rely on client-side hiding for authorization.
3. Every organization-owned record must have an enforceable tenant boundary.
4. Do not introduce demo, placeholder, fabricated analytics, sample accounts, or fake records.
5. Do not hardcode organization-specific content, languages, curriculum options, radio sources, categories, or configurable business data.
6. Preserve existing VOP functionality while migrating it safely into the SaaS architecture.
7. Existing organization hierarchy can be configured for each tenant rather than assuming one fixed hierarchy.
8. Keep platform administration separate from organization administration.
9. Keep secrets and server credentials out of client-side configuration and source control.
10. Preserve responsive, professional, mobile-first UX.

## Content ownership and sharing — mandatory rule

Guides, lessons, and quizzes are shareable resources.

A resource may be shared:
- within its owning organization;
- through an approved platform-wide/shared-content mechanism when explicitly published for system-wide availability;
- through tracked links and QR codes.

Sharing does NOT transfer editing ownership.

Only:
- the organization that owns/uploaded the resource, and
- the VOP Super Admin

may edit, update, publish/unpublish, archive, delete, or change the canonical content of that resource.

Other organizations may consume approved shared content according to its publication/access settings, but they must never be able to modify the owner's canonical resource.

If an organization wants to customize shared content, implement a separate explicit copy/fork mechanism that creates an organization-owned copy. Do not silently convert the original shared resource into editable tenant content.

This ownership rule applies consistently to:
- guides;
- lessons;
- quizzes;
- their questions;
- lesson sections/topics/blocks;
- attachments and canonical metadata.



## Content ownership — individual contributor enforcement

Organization administration does not grant blanket editing rights over content.

For organization-owned content, an organization administrator may edit, publish, unpublish, archive, delete, or otherwise modify a resource **only when that administrator is the recorded creator/contributor/owner of the resource**. The Super Admin may edit organization content regardless of its creator.

This must be enforced server-side using immutable ownership metadata such as `ownerUid` and `ownerOrganizationId`. Never authorize editing solely because the requester belongs to the same organization.

This rule applies to organization-managed:
- guides;
- lessons and lesson components;
- quizzes and quiz questions;
- materials;
- radio/audio/video items;
- announcements where individual ownership is applicable;
- languages;
- translations;
- other contributor-created global/shared resources.

A user may consume content available to their organization without receiving editing rights.

## Global radio, materials, languages and translations

Radio, materials, languages, and translations are treated as **global/shared platform resources** when their records are published into the global library.

Organization administrators may add/contribute to these resources, but contribution does not grant ownership of resources created by another contributor.

An organization administrator may:
- create/add their own global resource;
- edit or remove only resources whose ownership metadata identifies that administrator as the creator/owner, subject to publication/review rules;
- consume approved resources created by other organizations or contributors.

The Super Admin retains platform-wide administrative authority.

### Translation contribution and review workflow

Translations require special review handling.

An organization administrator may directly edit an approved translation only when they own the translation record. If a translation was created/owned by another contributor, organization, or the platform, the administrator must **not overwrite it**.

Instead, provide a translation proposal workflow:
- the proposer submits a suggested replacement;
- the original translation remains unchanged while the proposal is pending;
- the proposal records proposer identity, organization, source key/language, current value, proposed value, reason/notes, and timestamps;
- an authorized reviewer approves or rejects the proposal;
- approval creates a new reviewed translation revision while preserving audit history;
- rejection does not alter the canonical translation;
- Super Admin may review, approve, reject, or directly edit canonical platform translations.

Translation proposals are never treated as canonical content until approved.

## Role-specific settings architecture

Settings must be separated by authority and audience. Do not expose one universal settings object to every user.

### Super Admin settings
Super Admin settings control platform-wide concerns, including:
- organizations and tenant lifecycle;
- platform/shared content;
- global languages and translation governance;
- system defaults;
- platform feature policies;
- global certification/publishing policies;
- quotas/plans and platform configuration;
- security/audit controls.

Only Super Admin may modify platform-level settings.

### Organization settings
Organization settings apply only to the selected organization and are available to authorized organization administrators according to their role.

They include organization-specific:
- branding;
- organization profile;
- default language;
- curriculum configuration;
- learning policies;
- quiz/pass thresholds;
- certificate presentation settings where permitted;
- mentoring configuration;
- radio/material publishing preferences;
- announcements;
- organization feature configuration;
- organization usage/plan information.

Organization administrators must never modify Super Admin/system settings or another organization's settings.

### Individual learner/user settings
Every learner/user has a separate personal settings area containing only settings applicable to that individual account, for example:
- interface/UI preferences;
- personal language preference;
- notification preferences;
- accessibility/display preferences;
- privacy/account preferences;
- study preferences;
- personal device/session preferences where applicable.

A learner must never be given access to organization administration settings merely because they are an organization member.

Personal settings are scoped to the authenticated user and cannot be used to alter roles, privileges, organization membership, ownership, canonical content, assessment results, certificates, or other authoritative records.

### Settings authorization rule

The UI may present different settings screens by role, but the database and APIs must enforce the same separation server-side:

**Super Admin → platform settings**

**Organization Admin → own organization settings**

**Learner/ordinary user → own personal settings**

No role may escalate by writing fields belonging to a higher authority layer.

## Learner access contract

Learners are first-class authenticated users and must receive explicit, tested Firestore/API authorization for the operations they legitimately require.

Learners must be able to:
- read their own profile;
- update only permitted personal profile/settings fields;
- read published curriculum available to them;
- read published shared content;
- read published content made available by their organization;
- read their own learning/progress records;
- submit learning/assessment data only through the authoritative workflow;
- read their own notifications;
- read their own graduation/certificate status where applicable;
- access their own certificates and public certificate verification;
- participate in permitted mentoring/conversation workflows;
- create/read their own prayer/support requests where supported.

Learners must never:
- list all organization users;
- read another learner's private data;
- modify assessment results or question-performance aggregates;
- modify graduation approvals;
- issue or alter certificates;
- modify organization settings;
- modify canonical shared content;
- modify another user's settings/profile;
- change their organization, role, privileges, or ownership fields.

Every learner rule must be tested against both the positive case (the learner can perform the required operation) and the negative case (cross-user/cross-tenant access is rejected).

## SaaS organization model

Implement a first-class organization/tenant model with:
- organization identity;
- slug;
- status;
- branding;
- timezone;
- default language;
- configurable hierarchy;
- organization administrators;
- mentors;
- learners/candidates;
- feature entitlements;
- plan/usage metadata;
- audit records.

All organization-facing modules must resolve the active organization from authenticated membership/context and enforce it on the server.

## Organization capabilities

Each organization must be able to manage its own:
- users and invitations;
- candidates;
- mentors and mentor assignments;
- mentoring conversations and support;
- curriculum;
- guides;
- lessons;
- quizzes;
- materials;
- radio/audio/video;
- playlists and schedules;
- announcements;
- certificates;
- languages and translations;
- branding/settings;
- tracked lesson/guide/quiz sharing;
- analytics;
- audit history.

## Mentoring and learner support

Implement and preserve:
- mentor allocation to learners;
- mentor workload/assignment visibility;
- learner-mentor conversations;
- administrator oversight;
- references to guide, lesson, section, topic, block, or quiz;
- learner performance;
- individual learner analytics;
- commonly failed questions;
- support drafts;
- administrator-sent messages;
- performance-triggered support automation;
- in-app notifications;
- configurable email delivery;
- organization-scoped automation.

## Assessment and analytics

Track real assessment evidence, including:
- attempts;
- scores;
- pass/fail;
- question-level results;
- failed-question frequency;
- lesson/guide association;
- learner progress;
- completion;
- engagement where available.

Never fabricate metrics.

Provide organization analytics and platform-level aggregate analytics with appropriate privacy boundaries.

## Sharing and QR

Create first-class tracked share references for:
- guides;
- lessons;
- sections;
- topics;
- blocks;
- quizzes.

A share reference must retain its source organization and canonical resource identity, support deep linking, and record meaningful events such as:
- link opens;
- app launches;
- PWA installation when the platform can reliably detect it.

Do not falsely report a browser link open as an OS-level installation.

QR generation should not require an external QR service when a self-contained implementation is practical.

## Quiz architecture

Create a reusable Quiz Library.

A quiz may be:
- attached to one lesson;
- attached to multiple lessons;
- associated with a guide;
- shared independently;
- published to an organization's learners;
- explicitly published as platform-wide shared content.

Quiz ownership follows the same canonical ownership rule as lessons and guides.

## Platform administration

Super Admin must be able to:
- create/manage organizations;
- manage organization administrators;
- manage platform policies;
- manage platform/shared content;
- control system-wide publishing;
- monitor aggregate usage;
- manage plans/feature entitlements;
- review security/audit information.

Super Admin is the only platform-level role with unrestricted canonical editing rights across organizations.

## Organization authorization

Organization administrators must only operate within their authorized organization and any explicitly configured subordinate scope.

Mentors must only access learners/conversations permitted by their assignments and organization permissions.

Learners must only access their own private data and content made available to them.

## Migration strategy

Do not destroy working VOP features during migration.

First establish:
1. tenant identity and membership;
2. authorization helpers;
3. secure tenant-aware data paths;
4. migration/compatibility strategy;
5. ownership metadata;
6. shared-content publication model;
7. tenant-aware APIs;
8. tenant-aware security rules;
9. tenant-aware UI;
10. tests and validation.

Then migrate existing modules progressively.

## Quality gate

Before declaring the SaaS migration complete:
- build passes;
- lint/type validation passes;
- tenant authorization is tested;
- cross-tenant reads/writes are rejected;
- content ownership editing is tested;
- shared content remains read-only to non-owners;
- organization-owned copies/forks are isolated;
- mentoring is tenant-scoped;
- analytics are tenant-scoped;
- share tracking is tenant-aware;
- no demo data remains;
- responsive UI remains intact;
- production deployment is verified before claiming completion.

## Working directive

Continue implementing this mission directly in the VOP-New repository. Inspect the existing implementation before changing it. Reuse working components where appropriate, but refactor unsafe global assumptions rather than layering workarounds on top of them.

Do not merely describe future work when implementation is possible. Make the required code, schema, authorization, UI, and documentation changes, validate them, commit them, and report exactly what was completed and what remains.

When deployment is rate-limited or unavailable, continue local/repository implementation and validation without falsely claiming deployment.
