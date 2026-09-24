# VOP Evangelism Product Blueprint

## Product promise

VOP should make the next faithful action obvious: **discover → study → understand → pray → connect → share → disciple → graduate → serve**.

The learner portal is not only a course reader. It is the ministry front door and personal mission workspace.

## Learner experience

### Home / Mission Hub
- Resume the exact lesson and page last studied.
- Show study progress without overwhelming the learner.
- Surface the next meaningful action.
- Provide one-tap access to Library, Prayer, Radio and mentor support.
- Keep evangelism actions visible without turning the learner portal into an administrative dashboard.

### Guides and lessons
- Treat human-authored lesson content as canonical content; UI localization must never rewrite lesson text.
- Preserve language-specific course identity.
- Show guide progress, lesson progress, quiz readiness and completion state.
- Persist reading position server-side.
- Support read-aloud, responsive reading, scripture callouts and key truths.
- Make the next lesson transition obvious.

### Library
- Search, filter and open approved books/materials.
- Respect global/shared-content ownership and publication rules.
- Keep contributor editing restricted to the contributor's own content.

### Prayer
- Private prayer journal.
- Organization community prayer when explicitly shared.
- Ministry inbox for authorized ministry administrators.
- Status flow: received → praying → answered.
- Protect privacy at the server boundary.

### Radio & Broadcasts
- Audio, video, YouTube and AudioVerse sources.
- Live and on-demand presentation.
- Playlists and programme schedule.
- Multiple-language discovery.
- Reusable player controls and resilient playback errors.

## Localization

UI locale and study language are separate account preferences.

- UI locale controls navigation, labels, accessibility text, validation and system messages.
- Study language controls which human-authored course content the learner studies.
- UI translations use stable namespaced keys.
- Translation records are globally managed by the VOP Super Admin.
- Published translations are served from the server.
- Missing translations fall back safely without blocking the learner.
- Lesson text is never treated as UI localization.

## SaaS authorization

The hierarchy remains:

**Super Admin → hierarchy tenant (Union/Conference/District/Church) → organization → learner**

The security boundary is server-authoritative.

- Super Admin can operate across tenants.
- Hierarchy administrators remain scoped to their assigned tenant.
- Organization administrators manage only their organization.
- Organization administrators cannot edit another contributor's owned canonical content.
- Owner reassignment is explicit and validated.
- Learners cannot self-elevate privileges.
- Certificates, progress, mentoring, prayer, materials and radio ownership must remain tenant-safe.

## Evangelism loop

Every major learner surface should support at least one of these actions:

1. **Study** — continue the Word.
2. **Pray** — bring people and needs to God.
3. **Listen** — encounter additional gospel media.
4. **Share** — invite another person into a study.
5. **Connect** — ask a mentor or ministry team for help.
6. **Disciple** — continue after course completion.

The goal is not feature volume. The goal is a coherent ministry journey with minimal friction.

## Validation gate

A release is not considered clean until:

- TypeScript/Vite build passes.
- Lint passes.
- Architecture regression gate passes.
- Firestore rules preserve tenant and ownership boundaries.
- Server APIs derive authorization from authenticated profiles/memberships.
- Learner navigation exposes the core ministry surfaces.
- UI localization can load independently of study-language selection.
- No deployment is performed as part of this validation pass.


## VOP authorization, access and UI mission

The platform authorization model is **platform authority + tenant relationship + role + resource ownership + action**. A role alone must never grant unrestricted access.

### Authority hierarchy

```
SUPER ADMIN
├── Global Platform
│   ├── All organisations
│   ├── All hierarchy tenants
│   ├── Global languages
│   ├── Global translations
│   ├── Global curriculum
│   ├── Global radio
│   ├── Global materials
│   ├── Certificates
│   ├── Announcements
│   ├── Audit logs
│   └── Platform configuration
├── UNION
│   └── CONFERENCE
│       └── DISTRICT
│           └── CHURCH
│               └── ORGANISATION / LEARNERS
└── Direct organisations
```

**Role determines capability; tenant and ownership determine scope.**

### Effective permission model

```
authenticated user
  + platform role
  + active tenant membership
  + hierarchy scope
  + resource scope
  + resource ownership
  + requested action
  = ALLOW / DENY
```

The UI should use centralized permission decisions such as `can("edit", "material", resource)`; it must not use scattered role checks as the authorization boundary. The server is authoritative and Firestore rules remain a second enforcement boundary.

### Super Admin

Super Admin is platform-wide and may manage every organisation, hierarchy tenant, user, learner, global resource, certificate, announcement, audit record and platform setting, including supported deletion, suspension and ownership reassignment.

Global ownership remains visible to Super Admin. Platform authority overrides ownership for administration; it does not erase provenance.

### Organisation Admin and hierarchy administrators

Organisation Admin is scoped to `organizationId === currentUser.organizationId`. Hierarchy administrators are scoped to their assigned `tenantId` and may operate only on organisations/resources contained within that hierarchy.

Organisation administrators must never enumerate or mutate unrelated organisations, hierarchy tenants or another contributor's owned global content.

### Privilege precedence

When an account has both a hierarchy role and an explicit active organisation membership, the active organisation relationship takes precedence for organisation-scoped operations.

Effective resolution is:

1. Super Admin platform authority.
2. Explicit active tenant/organisation relationship.
3. Tenant administrative role.
4. Member capabilities.
5. Resource ownership.
6. Public/global read permission.

Precedence never bypasses a higher security restriction.

### Organisation selector

- Super Admin: searchable selector over all authorised active organisations.
- Organisation Admin: current organisation only and preferably locked/read-only.
- Hierarchy Admin: organisations inside assigned hierarchy only.
- Learner/member: no administrative organisation selector.

Hiding an option is not authorization. APIs must reject out-of-scope organisation IDs.

### Global content ownership

Languages, translations, radio, materials and other globally visible resources are globally readable according to publication rules, not globally editable.

Contributor-owned resources retain `ownerUid`, `ownerTenantId` where applicable, provenance and publication/review state. Contributors can mutate only resources they own within their authorized tenant. Super Admin is the platform override.

### Translation workflow

```
Draft → Submitted → Under Review → Approved → Published
```

Owners can edit/delete/submit according to state. Non-owners cannot directly edit or delete another contributor's translation; they use **Suggest improvement**. Proposers can see status but cannot approve their own proposal. Authorized reviewers/Super Admin can approve, reject or request changes.

Review UI must expose original value, current value, proposed value, proposer and status.

### Radio and materials

Radio and materials are globally discoverable when published. Contributors may create and manage only their own contributions. Super Admin can manage all contributions and supported publication/ownership operations.

### Canonical curriculum

Canonical curriculum, lessons, chapters, quizzes and questions are platform-controlled unless an explicit curriculum-author capability is granted. Organisation Admins consume, assign and track curriculum; they do not silently mutate shared canonical content.

### Learners, mentors and certificates

Organisation Admins manage only their own learners and mentors. Mentor allocation remains within the same authorized organisation/tenant unless an explicit hierarchy rule permits cross-tenant allocation.

Certificate access and mutation are tenant-scoped server-side. Organisation administrators see only their organisation; hierarchy administrators see only their hierarchy; Super Admin sees all. Public verification exposes only intentionally public information.

### Announcements

Global announcements are Super Admin managed. Organisation announcements are organisation/creator scoped. Hierarchy announcements are hierarchy scoped. Contributors cannot edit or delete another tenant's announcement.

### Role-specific settings and navigation

Settings are separate information architectures, not one universal page with disabled controls.

**Super Admin:** Platform, authentication, security, organisations, hierarchy, languages, translations, curriculum, radio, materials, certificates, notifications, email, audit and system.

**Organisation Admin:** Organisation profile, users, roles/access, mentors, learners, notifications and preferences.

**Learner:** profile, interface language, study language, accessibility, notifications, privacy and learner preferences.

Super Admin navigation:
`Dashboard · Organisations · Hierarchy · Users · Candidates · Mentors · Curriculum · Languages · Translations · Radio · Materials · Certificates · Announcements · Audit Logs · Settings`

Organisation Admin navigation:
`Dashboard · Learners · Mentors · Users · Curriculum · Translations · Radio · Materials · Certificates · Announcements · Settings`

Navigation itself must communicate scope. Do not merely show global administration and disable buttons.

### Ownership-aware UI

Every editable resource should expose ownership/provenance internally. Current-owner resources may expose Edit/Delete; another contributor's resources expose View/Suggest improvement; Super Admin may expose full management.

### Security invariants

Continuously verify organisation isolation, hierarchy containment, membership precedence, owner-only global mutation, Super Admin override, administrator deletion/ownership-transfer safeguards, translation review isolation, certificate isolation, mentor allocation scope, global-read/owner-write semantics, role-specific settings/navigation, server authorization independent of UI visibility, and consistency between API authorization and Firestore rules.

### Final regression mission

Run the complete regression path:

```
Super Admin
  ↓
Hierarchy Tenant
  ↓
Organisation
  ↓
Organisation Admin
  ↓
Mentor / Staff
  ↓
Learner
  ↓
Study → Pray → Listen → Connect → Share → Disciple
```

At every transition verify both visible UI scope and server-side denial outside scope. Do not consider the mission complete merely because unauthorized UI controls are hidden.
