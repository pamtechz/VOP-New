# VOP language guide import

Completed on 22 October 2026: 26 Bemba and 26 Tonga lessons are published and
linked to the existing VOP program. Every written field was read back and
verified, and a second connected preview reused all 52 lessons with zero writes.
The user supplied the full English PDF on 23 October 2026. Its 26 reading
guides are prepared as lessons under the English Discover guide.

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
| Discover | en | 26 | Prepared from the user-supplied English PDF |
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

The English source is `English VOP-Guide-Soft-Copies.pdf`, supplied by the user,
SHA-256 `7111161fbb65eefe004aaee8d48ad18b3bc1decaa699d1821593a7e7bf510019`.
The original PDF is read-only and is not committed or uploaded by this importer.
`content/discover-english-supplied.master.json` contains 26 full reading lessons,
with 184 sections. Together the three languages contain 78 lessons and 552
sections. The publisher's Guide 1..26 is the VOP lesson number; DISCOVER is
the single parent guide. Topic text continues across PDF columns and physical
page breaks until the next main numbered heading, not the next physical page.

`tools/seed/import-english-pdf.py` uses the PDF text geometry and typography.
It excludes the right-hand answer-sheet column on each third sheet, checks that
each fourth sheet contains no reading text, joins printed drop capitals, and
verifies every extracted reading character. The source manifest records the
PDF reading-page range and section checksum for each lesson. No assessment
questions or answers are imported into learner-readable text. Source guide 4
prints two successive section headings as number 5. Both topics are retained
in source order with distinct stable VOP section IDs. Source attributions from
the supplied PDF are preserved.

## Preview without any credentials or network

Run from the repository or extracted package root:

```bash
node tools/seed/seed-vop-guides.mjs
```

Without English flags: 26 Bemba lessons, 26 Tonga lessons, 368 sections.
Add `--english-master content/discover-english-supplied.master.json --authorized-english`
to include all 78 lessons and 552 sections. Bemba files 11 and 12 show the number 10 inside the
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

The isolated execution entry point now explicitly includes the supplied English
master with `--authorized-english`. It creates/reuses **Discover** in English
and adds it to VOP while reusing the 52 existing Bemba/Tonga lessons unchanged.
The offline source file format matches `content/lessons.master.json` and contains
exactly lessons 01 through 26 for `lang: "en"`.

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
