# VOP lesson quizzes and guide examinations

The authorized source is the user-supplied **English VOP-Guide-Soft-Copies.pdf**,
SHA-256 `7111161fbb65eefe004aaee8d48ad18b3bc1decaa699d1821593a7e7bf510019`.
Its 26 answer-sheet columns are on PDF pages 3, 7, …, 103. A numbered publisher
guide corresponds to one VOP lesson. Reading pages and sections remain unchanged.

Each factual answer-sheet option becomes one individually marked true/false
statement. The complete source pool contains **456 statements per language**.
The Bemba and Tonga questions follow the English source IDs and answer keys and
use the terminology of the corresponding supplied Ukusanga and Kojana lessons.
There are 26 lesson quizzes and one guide final in each language. Each final
selects two questions from every lesson, one true and one false, then shuffles
the 52 source IDs in a fixed reproducible order shared by the translations.

Personal faith decisions, requests for prayer and baptism intentions are
optional, ungraded reflections in the relevant quiz instructions. Printed contact
fields are not imported. Lesson 25 has no printed reflection question.

The printed source has inconsistent choose-one/select-all instructions and
several typographical errors. These are documented in the private payload:
lesson 2's incorrect count of true options and `work`/`Word`; lesson 3's truncated
reflection; lesson 9's `Line`/`Live` and `Heart-warning`/`heartwarming`; lesson 11
and 12's contradictory marking instructions; lesson 18's missing `rest`; and
clarification of the Satan distractor in lesson 22 and apostle distractor in
lesson 26. The lesson text determines the key. Historical and doctrinal claims
are represented as the teaching of the supplied guide, not updated independently.

## Private data and attachments

**Do not commit the assessment payload or answer keys to this public repository.**
Pass the authorized private JSON or gzip payload to the importer. For controlled
backend execution, provide it only as a private source file to an isolated Vercel
staging build on the existing VOP project. The static output contains only a
completion page, never source files or keys. Do not promote this build to the app.

The private bank is stored under `quizzes/{id}`. The corresponding learner
attachment is `guides/{guideId}/lessons/quiz-{id}` with `type: Test`, the proper
`attachedLessonId`, `sourceQuizId`, and `assessmentPath`. Guide finals use
`attachmentType: guide` and `assessmentKind: final_exam`. Public questions contain
only `key`, `question`, and `options`. Existing backend grading reads the private
bank and pins its immutable grading snapshot at the start of each attempt.

The importer preserves the guide's raw organization field to satisfy that
grading contract, while explicitly maintaining platform scope and sharing. It
inherits existing pass marks and attempt policies, uses score-only feedback and
does not alter learners, historical scores, certificates or reading records.

`seed-vop-assessments.mjs` defaults to offline validation. `--connect` produces a
read-only live plan after verifying the established Firebase Standard Native
database. Applying requires `--apply --confirm-project voiceofprophecy` and a
private backup path. A transaction rechecks the parent program, guides, all 78
reading fingerprints, inherited scoring policies and all attachment IDs. It
creates at most 162 documents and a server-only import receipt. Existing changed
assessments and duplicate foreign assessments abort the import. Exact-field
read-back must produce a second plan with zero writes.

Use `vercel.assessments.json` as the isolated build's `vercel.json`; its default
mode is preview. The production deployment provenance gate remains intact.

## Validation

The focused importer tests cover privacy, per-lesson/final attachment pairing,
cross-language identity and scoring, all-lesson exam coverage, changed reading
fingerprints, duplicate/conflicting records, inherited policy, legacy owner
metadata, exact-field comparison and repeat-import behavior. The real source
payload can be validated locally with `VOP_ASSESSMENT_TEST_PAYLOAD` without
including that payload in the repository. Existing quiz grading, attachment and
management visibility regression tests also apply.

## Verified live result — 23 October 2026

| Guide | Language | Lesson quizzes | Lesson question pool | Final exam |
| --- | --- | ---: | ---: | ---: |
| Discover | English | 26 | 456 | 52 questions |
| UKUSANGA | Bemba | 26 | 456 | 52 questions |
| Kojana | Tonga | 26 | 456 | 52 questions |

The controlled import created 81 private banks and 81 public attachments. All
162 documents passed exact-field read-back; both the immediate repeat plan and
a separate read-only deployment required **zero writes**. The current inherited
pass mark is 80%. The administration library displayed all 81 new published
assessments, 27 per guide, alongside two pre-existing unrelated records. English,
Bemba and Tonga lesson 1 editors each showed the correct guide and lesson target
and the translated prompts/options. Each guide final displayed 52 questions.

Execution evidence:

- Reviewed initial importer commit: `04334b4768308c6ae67351398426eb625b569d87`.
- Read-only preview: `dpl_66U4mP3dkbp28T66rbMrdej3fcRM`.
- Apply: `dpl_DQDJsuft1hXTbmQ3RdAXdEXDGinF`.
- Separate zero-write check: `dpl_4ZTiuvdHnqLGv6JEcxeLS3pqiFgB`.
- Initial receipt: `curriculumImports/31abee295dab36a2a68de62197013b971e6c8e3b3c9e9fbbf46dd78cc4a73796`.

The final wording review corrected `lyakufwa` to `lyakwafwa` in the Bemba lesson 1
reflection, and `ukulubembu` to `ukubembuka` in Bemba source question `D03-010`.
The latter also appears in the Bemba final. `correct-vop-assessment-wording.mjs`
permits exactly these edits against the previously verified bundle fingerprint,
checks the existing baseline in full, preserves all IDs, keys and scoring
policies, saves before snapshots for the six affected body documents, and
updates source provenance. It is an explicit corrective mode; the ordinary
importer still refuses changed existing records.

- Reviewed correction commit: `74eb50edf31361a266e81b4317d517599b2c97c7`.
- Correction: `dpl_9geyB9soqT3yhdeBcDjVah2acabh`.
- Correction receipt: `curriculumImports/7019d05de7b6f9d06c5305f3ab4c1d0be7c115b31b93e655a2b1c1291167c829`.
- Final private bundle SHA-256: `856db0db55cf62e44a2c3e0b40f309bfcd952a9366f0ad49e4df661e6ae2a51d`.
- Final read-back: 162 matching documents; repeat writes 0; grading keys changed 0.

Validation passed: 13 focused importer/correction tests with the supplied real
payload, 15 existing quiz grading/attachment/visibility tests, focused lint and
whitespace checks. No reading lessons, learner results or certificates changed.
The application production deployment was not replaced or promoted.
