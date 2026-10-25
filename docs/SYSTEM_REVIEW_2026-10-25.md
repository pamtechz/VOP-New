# VOP system review — 25 October 2026

## Status and scope

This review continues the recovered `audit/system-completion-20261025` integration, including canonical curriculum ownership, shared visibility and suggestions, Flutter authoring/desktop changes, and accessible modal actions. It is not a declaration that every feature works in production. The checkout contains 90 integration commits beyond the fetched mainline before this review's corrections.

Reviewed evidence includes API dispatch, tenant ownership helpers, curriculum suggestion transactions, public/mobile catalogue regression coverage, browser storage and localization, dependency advisories, build output, CI configuration, and the open PR descriptions (#278–285). Production cloud configuration and authenticated browser/device journeys were not verified.

## Corrections in this pass

| Finding | Correction and verification |
|---|---|
| A management authorization helper preferred `organizationId` over canonical `ownerOrganizationId`, unlike other ownership checks. Inconsistent records could authorize the wrong organization. | Prefer canonical ownership and reject conflicting `ownerTenantId` for organization administrators. Behavioral tests cover canonical owner, foreign legacy reference, foreign tenant, and legacy records without canonical metadata. |
| Suggestion review authorized ownership before starting a transaction. Concurrent transfer could leave the earlier authorization stale. | Compare the transaction's current ownership fields with the authorized snapshot before either approving or rejecting. Any ownership change requires a reload. Behavioral emulator tests now cover ownership transfer, deletion, intervening edits and simultaneous approvals. |
| Suggestion submission cleared the user's correction before the network request succeeded. Rapid submissions could overlap. | Preserve inputs on failure, clear only unchanged submitted fields on success, and use an immediate mutation lock. |
| Localization read/write exceptions could break rendering or language selection when browser storage was disabled or full. | Catch persistence failures and keep an explicit session selection so an old persisted language cannot undo the failed-write choice. Runtime regression test included. |
| Local health, public catalogue, and mobile routes attempted to load nonexistent API files. | Route through the same consolidated admin handler as production; verify route/query mapping. Return HTTP 400 for malformed JSON before invoking a handler. |
| Two integration assertions referenced the previous mobile access helper and desktop navigation signature. | Update assertions to require current visibility-aware access checks and compact permission-aware navigation. No authorization or quality gate relaxed. |
| Shared curriculum introduced additional untranslated controls. | Register 24 labels using the existing localization mechanism and English fallback text. This does not supply reviewed Bemba/Tonga translations. |
| Development dependency scan found five affected package families. | Update compatible lockfile resolutions for body-parser, fast-uri, ip-address, undici and zod (8 installed packages changed). Keep application dependencies and declared versions unchanged. Subsequent online npm audit reports zero known vulnerabilities. |

## Verification

| Check | Result |
|---|---|
| Node 22.16.0 / npm 10.9.2 production build | Passed |
| Unit/regression suite | 438 passed, 0 failed |
| Serverless TypeScript | Passed |
| Architecture gate | Passed |
| UI localization inventory | 2014 candidates; limit 2017 — passed |
| Lint | Exit 0 with existing warnings; not warning-free |
| Flutter scaffold checks | 4 passed; these do not compile Flutter |
| Online npm dependency audit after patches | 0 known vulnerabilities, including development dependencies |
| Working-tree patch whitespace | Passed |
| Private-key pattern / tracked key-file scan | No matching private key in the scanned source; only `.env.example` matched the environment-file inventory. This is not a repository-history or cloud credential audit. |
| Production bundle budget | Passed: total JS 3,009,485 bytes versus the unchanged 3,010,000-byte limit. All other size limits passed. |
| Firestore rules / emulator integration | Java 21.0.13: 15 rule assertions passed; 171 authenticated API integration tests passed, including ownership-transfer concurrency. |
| Flutter analyze, tests, Android/web builds | Not run: Flutter SDK unavailable here |
| Authenticated browser/device acceptance | Not performed |
| Exact-head self-hosted GitHub CI / staging / production | Must pass on the published integration commit; not established by local checks |

The bundle investigation rejected alternate chunk configurations: removing the editor grouping created a 761,090-byte editor chunk, and a separate React group increased total bytes. The original grouping and all budget thresholds remain intact.

## Remaining work in priority order

1. Bundle gate repaired: module profiling led to a shared translation namespace helper. All 240 editor translation keys retain their exact runtime values, and the existing budget passes. Rendered browser acceptance remains required.
2. Run the required KASAINSTITUTE checks with Node 22, Java 21+, and the repository-pinned Flutter toolchain. Include Firestore/Auth emulator integrations, cross-tenant negatives, suggestion ownership-transfer concurrency, and trusted-source checks.
3. Perform authenticated Legacy/Classic/Android acceptance: create → edit → publish → browse → enroll → lesson checks → quiz → guide final → certificate. Include independent learners, owning organization admins, foreign organizations, hierarchy roles and Super Admin. Check database IDs remain stable after retries and failed saves.
4. Verify narrow modals, desktop navigation, keyboard operation, language switching, offline downloads, sign-out/account switching, and reconnect replay on real browser/device sessions. Source assertions cannot prove those experiences.
5. Verify current production secrets/configuration, credential rotation evidence, backup destination and a restore drill, historical quiz-answer migration state, deployed Firestore rules/indexes, scheduled operations and payment/provider configuration. Earlier handoff concerns are leads to verify, not newly proven outages.
6. Complete the source-backed feature matrix for prayer, mentoring, Scripture/challenges, notifications, certificates, billing, account lifecycle and localization. Inspect live results before describing any area as complete.
7. Merge and deploy only after all required acceptance and release gates pass. Confirm the served commit and both Legacy/Classic routes after deployment, then close superseded PRs.

## What to retain, remove and add

- **Retain:** both Legacy and Classic, the shared backend, canonical curriculum IDs, server-side ownership checks, private assessment keys, and trusted-device offline consent. Their removal would conflict with required product journeys.
- **Remove after verified integration:** superseded overlapping PR branches (#278–285), redundant implementations of ownership decisions, and obsolete source assertions that merely encode earlier syntax. Confirm unique changes are preserved before closing or deleting anything.
- **Add next:** behavioral API/UI tests around the failures above, a reusable authenticated multi-role acceptance suite across clients, a current feature/release evidence matrix, and a tested backup/restore checkpoint. These offer more immediate reliability value than adding more user-facing modules while release gates remain blocked.
- **Defer:** broader structured lesson-body suggestion editing until the existing owner-reviewed title/description workflow is proven with concurrent edits, transfer, deletion, tenant isolation and retry tests.

No production merge, deployment, data migration, credential rotation, or destructive cleanup is claimed by this report.

## Follow-up validation checkpoint

Module profiling identified repeated translation namespaces in three editor components. Factoring their common prefix into `createUiTranslator` reduced the clean production output by 5,379 bytes while preserving every translation key and all features. A runtime test verifies dictionary lookup, English fallback, and locale switching. No budget was increased.

The first full emulator run exposed obsolete author-only expectations after the authorized organization-owner policy change. Corrected role fixtures now test owner/admin success, nonauthor editor denial, foreign admin denial, canonical ID/count stability, immutable ownership, and instructor-note privacy. The containing 21-test program suite and full 171-test API suite pass. The new six-test collaboration suite uses real Firestore transactions and deterministically inserts ownership transfer, deletion and author edits between authorization and transaction start; concurrent approval succeeds once.

Production read-only verification: Vercel project `vop-new` (`prj_zxOpr6AsBlSI0PuzQtflJmL2RPrU`) reports production deployment `dpl_9fZHPMC6WRJv623BnKEBnL6YzQhx` READY at main commit `ce10eaa627577e67481d9675c7ebf4c067f3af68`. Public `/api/health` independently reports that commit and a healthy database. Environment metadata confirms Firebase Admin, CRON_SECRET, Resend and MTN configuration names exist; values were not retrieved. `FIRESTORE_BACKUP_BUCKET` is absent from the returned project environment metadata. Credential validity/rotation history and a production backup/restore drill remain unverified.

KASAINSTITUTE was observed processing run 40196508075 for another branch; that result is not validation of this integration commit. Source changes from PR #284 remain subject to reconciliation: its separate collaboration endpoint/opt-in model must not be blindly merged over the existing shared backend or the Flutter parity changes.

## Browser checkpoint and publishing blocker

The follow-up dialog change keeps the title and actions outside a scrolling body and traps/returns keyboard focus. Real Chromium checks passed at 1440, 768, 390 and 320 pixels with no page errors or horizontal overflow. The additional editor typing/persistence check initially failed because toolbar rerendering inside the DOM selection event cleared the caret. The follow-up moves toolbar refresh to Plate onChange, after Slate synchronization. Typing, stable section/block identity and bold toolbar state now pass in the real browser suite. The browser gate is wired into KASAINSTITUTE validation.

After the dialog change, build and bundle pass at 3,009,485 JS bytes against the unchanged 3,010,000 limit. Production still serves ce10eaa6. Publishing e88960c0 was rejected by automatic approval review, which requested explicit permission for that exact checkpoint and destination. No PR, merge or deployment was created. The browser regression is now repaired; later local changes still require exact-head CI and review before release.

## Completed code fixes and current external gates

The seven-check browser suite is green, including keyboard focus at four widths, actual editor typing, callback persistence, stable section/block IDs and active bold formatting state. All 438 unit tests, serverless types, architecture, localization, content verification and lint pass locally (lint retains existing warnings). The bundle remains within every unchanged budget, at 3,009,485 total JS bytes. The current online dependency audit reports zero known vulnerabilities.

Added `npm run verify:restore` and its KASAINSTITUTE workflow gate. In two separate emulator lifetimes, it exports actual Firestore data and Auth accounts, imports the checkpoint, signs in the restored accounts, reads authorized tenant data and confirms that foreign access and private instructor-note reads are still denied. All traffic is guarded to demo-project loopback endpoints; temporary exports are removed afterward. Direct local emulator endpoints are used because firebase-tools 15.34.1 incorrectly forces its external ProxyAgent on loopback requests despite NO_PROXY. No network proxy settings or production access controls were disabled. This drill does not replace a production managed export and isolated GCP recovery exercise.

The repository-pinned Flutter SDK was fetched and verified at commit 5fc346839b5d0eef006ed8404392afb4dfae428d. Bootstrap then triggered an automatic-review rejection for cloud instance metadata access; no workaround or metadata/credential probing was attempted. Native acceptance remains an external gate. Earlier KASAINSTITUTE Android success was for another branch, not this integration; its web job was cancelled during compilation.

Publishing was previously rejected by automatic approval review because explicit permission for the exact checkpoint/destination was not recognized. No further publishing workaround was attempted. This branch remains local, with no draft PR, merge, production deployment or superseded-branch deletion. The final public-health reread timed out at the proxy; this does not establish a production outage. The last successfully verified production commit remains ce10eaa6.
