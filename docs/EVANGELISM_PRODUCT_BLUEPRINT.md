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
