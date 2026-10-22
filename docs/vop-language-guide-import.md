# VOP language guide import

Completed on 22 October 2026: 26 Bemba and 26 Tonga lessons are published and
linked to the existing VOP program. Every written field was read back and
verified, and a second connected preview reused all 52 lessons with zero writes.
English Discover remains pending authorized lesson files.

The atomic import updated 55 lesson/parent documents and created receipt
`curriculumImports/e96dfe54e062e7a5235f8450975f9bfa7aedd556341a854f879323b6ab9192cd`.
The isolated apply deployment was `dpl_FdqEX7VbVrvSYH7zM2F6yL1hKsNF` at commit
`77d0dd151a7818510e6e4df978df9688b6fa6f75`; the following read-only verification
was `dpl_A1wgYpf4PCagRcNvsmyMMFSpbfHv`. No application release was promoted.

The requested destination is the existing **VOP** program at
`https://vopafrica.vercel.app`. The public catalogue checked on 22 October 2026
returned program `program-8f8ef60d94fa4c16b8236a678fbf5e76` with no guide
references, and published Bemba guide `guide-a5f84243b5a6472b9134999b`, titled
`UKUSANGA`, with no published lessons. Private or draft records cannot be
inferred from that public response. The connected preview checks them before
writing and refuses conflicts.

| Guide | Language code | Prepared full lessons | Status |
| --- | --- | ---: | --- |
| Ukusanga | bem | 26 | Published; supplied text files and pasted closing lessons verified |
| Discover | en | 0 | Needs authorized user-supplied lesson files |
| Kojana | toi | 26 | Published from the supplied archive |

The 52 supplied translations contain 368 reading sections and reference 170
original illustrations. Text, images, section boundaries, order, source hashes
and original copyright attributions are retained. No assessment questions were
present in that archive; no questions, answers or certificates are fabricated.
New guides retain VOP's required-final-exam flag and are not certificate eligible.

All 26 Bemba lessons supplied on 22 October 2026 are recorded separately in
`content/ukusanga-supplied-lessons.json` and replace the archive transcriptions.
The 21 unique uploaded text files retain their exact file checksums. The five
closing lessons pasted into chat were checked against the publisher's linked
HTML and the complete archive reading text. The original supplied attribution,
`copyright © 2002 The Voice of Prophecy`, is retained. The source manifest
records the complete reading-text checksum and section count for every lesson.

The duplicate upload of lesson 5 and repeated pasted lesson 23 are included
once each. Lesson 21 restores four closing numbered sections and the remaining
text of section 4 omitted by the older archive parser. Each lesson contains one
chapter with an introduction section followed by its numbered source sections.
Numbered lists within a section remain reading content.

## Sources

- Bemba: https://languages.bibleschools.com/bemba/
- Tonga: https://languages.bibleschools.com/tonga/
- English: https://bibleschools.com/en/courses/1/lessons/1/steps/9

The English site is marked all rights reserved and links to the publisher's
legal notice at https://www.nadadventist.org/legal-notice/. The importer does
not scrape or republish its full lesson bodies. An English import requires a
user-supplied, authorized schemaVersion 2 master with all 26 lessons. Each
lesson must include its actual source URL, attribution and checksum. Deploy
any new authorized illustration files under `/lessons/assets/` before import.
If authorization is unavailable, use links to the publisher instead of copying
the full text. No empty Discover guide is silently presented as a finished
English course.

## Preview without any credentials or network

Run from the repository or extracted package root:

```bash
node tools/seed/seed-vop-guides.mjs
```

Expected: 26 Bemba lessons, 26 Tonga lessons, 368 sections; English marked
`needs_authorized_source`. Bemba files 11 and 12 show the number 10 inside the
original source documents. The import keeps filename order 11 and 12 and does
not silently rewrite their prose.

## Connect to the existing database

Use approved Google application-default credentials for the existing VOP
Firebase project. Do not paste private keys or tokens into chat or commit them.
From `tools/seed`, run `npm ci --ignore-scripts` to install its locked isolated
Firebase Admin dependency, then return to the package root. The project must
already have enabled language records for `bem` and `toi`.
The importer also accepts the existing server-side `FIREBASE_ADMIN_*`
configuration, verifies the project matches, and accepts case aliases in the
existing language registry without changing or duplicating those languages.

```bash
node tools/seed/seed-vop-guides.mjs --connect --project-id voiceofprophecy --program-id program-8f8ef60d94fa4c16b8236a678fbf5e76 --publish
```

This verifies database edition, reads existing private/draft records, and
prints the complete write count without applying it. The target program and
guide ownership must match. Existing Ukusanga is reused; unrelated guides and
program references are preserved. Content is written to the active
`guides/{guideId}/lessons/{lessonId}` hierarchy, not the old editorial staging
collection under `curricula/discover/languages`.

## Apply the reviewed preview

```bash
node tools/seed/seed-vop-guides.mjs --apply --project-id voiceofprophecy --confirm-project voiceofprophecy --program-id program-8f8ef60d94fa4c16b8236a678fbf5e76 --publish --backup-file /secure/vop-guide-import-before.json
```

Use a new private backup filename that exists on the executing machine.
Replace `/secure/...` with an appropriate private local path on Windows.
An existing backup is never overwritten. The backup is written before a
bounded atomic batch, which uses creation/update preconditions. A changed
program/guide or concurrent lesson creation causes the batch to fail rather
than overwriting newer work. A receipt is recorded under `curriculumImports`.
The script verifies document existence after committing. Repeat execution
recognizes its exact source fingerprints and makes no changes.
Read-back verification checks every written field, including all lesson bodies.
Prior parent metadata is retained in the private server-side import receipt as
well as the local backup, so it survives an ephemeral execution environment.

An approved server environment can run the isolated entry point at
`tools/seed/run-vop-guide-import.mjs --mode=preview` for the live read-only
preview and then `--mode=apply` for the exact reviewed import. Its explicit
target is the existing `voiceofprophecy` project and VOP program identified
above. It uses existing credentials without printing or exporting them. The
entry point writes a static status page under `tools/seed/import-report`; it
does not promote a deployment or replace the production application.

`--publish` makes the complete supplied translations available for study and
allows a new guide to join the already published program. Omit it when
preparing drafts under an unpublished program. Existing guides retain their
publication and sharing settings; archived or conflicting records require
deliberate review.

When the authorized English master is available, add
`--english-master /private/english.master.json --authorized-english` to the
same preview and apply commands. This also creates/reuses **Discover** in
English and adds it to VOP. The offline source file format is the same as
`content/lessons.master.json`; it must contain exactly lessons 01 through 26
for `lang: "en"`.

## Verification

Run `node --test tests/vopGuideSeed.test.mjs` from the full repository.
Coverage includes canonical reader/editor compatibility, preservation of all
368 sections, the supplied Bemba reading checksums, complete lesson 21,
actual source-image hashes, duplicate detection, repeat-run
idempotency, preservation of existing IDs/program assignments, and refusal
of changed content, disabled languages or archived guides.

After applying, verify guide references and lesson counts in the administrator
portal, open representative first and last lessons in Legacy and Classic, and
confirm image display using the same APIs. The public catalogue can confirm
published metadata counts but cannot prove authenticated lesson-body access.
