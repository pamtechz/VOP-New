# VOP production backend contract (provider-neutral)

This is an implementation contract, **not** an installed backend. Select an isolated VOP project, its owner, region and acceptable cost before provisioning. No database, secrets or resources from EDURMS or any other repository may be reused. The current `localStorage` interface and bundled users are untrusted demo fixtures.

## 1. Authoritative ownership

Every API call must authenticate a real user using the chosen identity provider. Derive the actor identity and permissions from a verified server session; never accept `uid`, `role`, `privileges`, `graduated`, `approved`, church scope, or marks from browser storage as authoritative. Deny when a session, role assignment, organization scope, or configuration is absent. A VOP deployment must not silently bootstrap a demonstration administrator.

Store stable opaque IDs and independently versioned records for:

- Users and verified identity claims. Separate editable contact fields from verified legal/certificate names and administrator-controlled organizational assignments.
- Organization nodes and their configurable parent relationships. Do not assume predefined church, district, conference or union IDs or an obligatory fixed hierarchy.
- Role assignments: actor, permission set, organization scope and validity interval; check effective permissions on **every** server mutation and sensitive read.
- Application configuration, courses, curriculum revisions, required-guide assignments, languages, localized strings, lessons, assessments and private answer keys. Admins create all operational records; code contains no real people or production seed content.
- Enrollments, lesson completion events, assessment attempts, grading outcomes, approval requests and an append-only approval-event history.
- Issued certificates: immutable number, recipient identity snapshot, course-revision snapshot, issued timestamp, issuer, approval provenance, revocation status and verification metadata.
- Auditing: actor, timestamp, action, target, previous/new version, organization scope and request ID for sensitive writes.

A curriculum revision must pin the required guides, lessons, tests, questions, language equivalence mapping and passing thresholds used to evaluate a learner. Publishing a new revision must not rewrite historical completions, grades or issued credentials. Uniqueness constraints must prevent duplicate guide IDs, lesson IDs in the applicable completion namespace, attempted assessment IDs and duplicate official issuance for one candidate and eligible course revision.

## 2. API boundaries

Authenticated learner reads: `GET /v1/me`, `GET /v1/curriculum`, `GET /v1/me/progress`, `GET /v1/me/certificates`. Only public, published curriculum text and questions may be served to learners; do not transmit correct answers or grading keys to the client before or during an attempt. `PATCH /v1/me/contact` accepts only whitelisted contact fields, never role, name verification, score or organization fields.

Learner writes: `POST /v1/lesson-completions` records a server-validated enrollment/lesson/revision pair; `POST /v1/attempts` accepts an assessment ID, a bounded set of responses, and an idempotency key. The server retrieves the current published questions, computes the grade and stores a signed/attributed result. The client-supplied score is ignored. All writes require per-user rate limits and input limits.

Administrator reads/writes: endpoints under `/v1/admin/` for settings, languages/translations, organization graph, curriculum revisions, enrollments, verified user details, approvals and certificate issuance. Enforce permission plus organization scope server-side, with optimistic concurrency/version checks, transactions where appropriate, and append-only audit events. Changing an answer key or pass threshold creates or publishes a new curriculum revision instead of retroactively altering an awarded grade.

Approval workflow: `POST /v1/admin/graduations/{requestId}/decisions` validates configured stage, approver permission and organization scope. Reject skipped or duplicate decisions, stale revisions and approval by an unauthorized candidate. The stage chain is an administrator-defined configuration, not a hardcoded church-to-union path.

Credential issuance: `POST /v1/admin/certificates/issue` is a transactional server command. Recompute completion and every required test result for the pinned curriculum revision, confirm all configured approvals, verified recipient identity and absence of an existing active issuance, then create immutable certificate material. `GET /v1/certificates/verify/{publicToken}` returns only minimal consent-appropriate public verification information, including current validity or revocation; never expose email, phone, answers or full user records. A screenshot or client-rendered preview must never be treated as a credential.

## 3. Client contract

A typed backend adapter should expose authenticated session, bootstrap/configuration, curriculum, progress, attempt submission, approval and certificate retrieval. The present synchronous `getStored*` functions must be replaced behind an explicit async boundary rather than made to look secure by adding client role checks. Every UI needs loading, missing-configuration, unauthorized, offline and retry states. Do not silently fall back to bundled people, default organization IDs, fabricated pass marks, enrollment dates or certificates when the backend is unavailable.

Translations are keyed by administrator-created locale codes and stable UI/content keys. The selected language must resolve to a published compatible course revision; translated versions must not double-count a learner's course requirements. Certificate wording, signer title, branding and passing criteria come from versioned server configuration.

## 4. Migration and release procedure

1. Confirm VOP-specific hosting provider, owning organization, data residency, free/paid limits and access controls; do not provision by assumption.
2. Provision an isolated database, identity provider and secret store. Add least-privilege server credentials only to provider secrets; never commit keys or expose privileged tokens with `VITE_` variables.
3. Import administrator-approved curricula, translations, settings and organization data after schema validation, stable-ID mapping and a dry run. **Never promote seeded users or historical localStorage grades and approvals to authentic records without independent verification.**
4. Create real users via the identity provider, assign scoped roles by an authenticated super administrator, and test cross-organization denial. Migrate legitimately verified historical learner records with provenance and reconciliation reports.
5. Replace all operational `localStorage` reads/writes, fake sign-in/account switching, client-side grading and certificate issuance with the adapter and server endpoints. Browser cache may store public content only, not identity authority or approval decisions.
6. Test normal and adversarial scenarios: forged user IDs/roles/scores, duplicate requests, concurrency, stale curriculum, missing/invalid questions, failed and partial approvals, revoked credentials, malformed imports, translation duplication, offline recovery, and data-access boundaries.
7. Run browser visual checks at the supplied reference-screen dimensions, accessibility checks, unit/integration/security tests, Android build and authenticated end-to-end tests. Merge and deploy only after the exact candidate SHA passes required checks.

**Current release gate:** the draft PR is a locally stored demonstration with explicitly unverified previews, not a production service. This document does not claim any of the server endpoints, roles, databases or issued certificates exist yet.
