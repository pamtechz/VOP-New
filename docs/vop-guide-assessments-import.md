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

Live execution and verification results will be appended after the controlled
import completes.
