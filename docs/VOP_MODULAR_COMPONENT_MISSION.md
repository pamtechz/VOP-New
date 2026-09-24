# VOP Modular Component Mission

## Objective
Make VOP modular so every major component has a clear contract, shared authorization model, tenant/scope boundary, data service, UI surface, and regression gate. Components communicate through stable services and shared types instead of duplicating authorization or reaching directly into another module's storage.

## Component priority by system influence
1. Identity + Tenant Context — establishes who the user is and the active tenant/hierarchy.
2. Authorization + Permission Matrix — determines whether downstream operations are allowed.
3. Data Access Boundaries — Firestore rules, server APIs, public/authenticated reads, ownership enforcement.
4. Organisation + Hierarchy Management — defines the scope graph consumed by users, curriculum, mentoring, certificates and analytics.
5. User / Membership / Invitation Lifecycle — establishes memberships, roles, ownership and continuity.
6. Curriculum / Content — guides, lessons, quizzes, paths, topics and seasons.
7. Global Resource Governance — languages, translations, materials, radio and playlists.
8. Mentoring + Prayer / Support — assignment-scoped operational workflows.
9. Certification — configuration, template, issuance, verification and tenant isolation.
10. Analytics + Audit — consumes authoritative events without widening access.
11. Sharing + QR / Deep Links — references canonical resources without transferring ownership.
12. UI Localization + Role-specific Navigation — presentation over the capability model.
13. Responsive / Accessibility / UX Regression — final cross-module presentation gate.

## Module contract
- Types: shared domain types and input/output contracts.
- Service: normal entry point for module data operations.
- Authorization: permission + tenant scope + ownership/assignment.
- UI: pages/components consuming module state.
- Events/audit: meaningful state changes without duplicating business logic.
- Tests: positive and negative authorization cases.
- Dependencies: explicit upstream modules only.

## Communication rule
UI -> module service -> authenticated API -> authorization -> data layer.
Public content: UI -> public content service -> API/Firestore -> publication rules.
Do not let a child module bypass the authorization/data service because another module happens to expose the same collection.

## Governing authorization equation
User + role + active membership + hierarchy scope + organization scope + resource scope + ownership/assignment + action = decision.
The permission matrix is a capability gate. It never expands scope, ownership, membership or hierarchy authority.

## Super Admin rule
Super Admin is platform-wide by default. An organization target is optional and is required only when an operation intentionally targets organization-owned content. System-wide resources use platform/shared scope and do not require an organization selector.

## Completion rule
A component is complete only when its UI, service/API, authorization, data boundary, ownership, localization and regression checks agree. A hidden UI action is not an authorization boundary.