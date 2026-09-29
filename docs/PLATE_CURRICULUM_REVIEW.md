# VOP curriculum authoring — Plate review for approval

**Status:** proposed, review-only. Nothing on this branch should merge or deploy until the review is accepted. The existing structured editor, Firestore model, quiz bank, learner progress and certificates remain the authoritative production flow.

## 1. Recommended learning model

```text
Organization / platform
  └── Program (example: Voice of Prophecy, Master Guide)
        └── Guide / Module (author-defined order)
              └── Lesson (stable progress / certification unit)
                    └── Chapter (optional title/grouping)
                          └── Section = one learner page
                                └── Plate document blocks / inline marks
```

Avoid treating paragraphs, headings, figures, or page numbers as independent Firestore records. Plate is the **authoring document**; chapters and sections are stable, typed *pedagogical boundaries*; quizzes, examinations, competency evidence, progress, and credentials are separately versioned, permission-checked domain objects. A heading is not automatically a page. The author deliberately selects **Start a new section here** at a paragraph boundary or adds a new section.

### Program, guide, and learner-entry mode

A program defines a recognizable curriculum/certificate track, e.g. "Voice of Prophecy", "Master Guide", or an organization's custom program. A guide/module belongs to a program and may be reused as an approved copy in another program or organization; never silently transfer ownership across tenants.

**The author's guide display mode is a presentation decision, not a new storage hierarchy:**

| Guide presentation | Learner sees on opening the guide | Assessment/progress unit |
| --- | --- | --- |
| **Lessons** (default) | Lesson 1, Lesson 2, etc.; opening a lesson shows section pages | Lesson progress, quizzes as configured |
| **Sections** | A chapter/section index grouped by lesson. Clicking a section opens that lesson directly at the specified page | Exactly the same lesson records and progress rules |

This choice avoids inventing a second "section-only" backend with incompatible enrollment, resumption, quiz, and certificate logic. Chapter names and section titles are authored, not hard-coded. The navigation should reflect published content and learner permissions.

A course/program can also expose a nested **Program → Modules/Guides → Lessons or Sections** sidebar. A guide-level final examination remains separate from the document and only appears when configured and eligible. Module/lesson, chapter, section, and block practice quizzes anchor to persisted IDs; their answer keys never enter public documents.

### Firestore storage (proposed follow-up after sign-off)

```text
programs/{programId}                             // tenant-aware program identity & rules
guides/{guideId}                                 // programId, learnerEntryMode, owner and scope
guides/{guideId}/lessons/{lessonId}               // chapters and validated Plate JSON
quizzes/{quizId}                                 // private answer bank, stable attachment IDs
enrollments/... / progress/...                    // unchanged logical lesson IDs
```

The current repository already has `learningPaths` and `guides`. Before introducing `programs`, audit existing learning paths to decide whether to migrate them or link them; **do not** alias any existing learning path to a program without data and product review. Resolve program tenancy, language, certificate policy, and sharing/forking before turning on the program selector. Platform Super Admin can author platform-wide; organization editors can only author in an authorized organization; hierarchy administrators are limited to authorized descendants. Direct Firestore writes cannot bypass the same checks enforced by the API.

## 2. Review prototype implemented in this branch

- Author opens an existing guide and its lesson; the **Try Plate editor** switch is opt-in. The classic editor remains available.
- Compact breadcrumb, chapter selector, section/page tabs, page title, and editorial canvas. The canvas provides headings, marks, quotations, lists, safe hyperlinks, safe public images and a **More** popup.
- At a paragraph boundary, **Start a new section here** separates the document into two pages. The new page gets a new section ID; retained paragraphs keep their stable block IDs. One section renders as one learner page.
- Duplicate chapter/section generates fresh IDs to avoid inherited quiz links. Cross-lesson moves still use the existing server transaction, permission and quiz-attachment guard.
- Server whitelists a safe Plate JSON subset; strips unapproved properties, rejects dangerous link/media schemes and private-network URLs, checks limits and prevents answer-bearing content. It derives old compatibility blocks and learner pages from the canonical document, rather than trusting client-supplied page counts.
- Read-only learner renderer displays the validated document without arbitrary HTML or executable embeds.
- Existing sections containing video/audio blocks remain **classic-only**, clearly flagged, until approved Plate audio/video node plugins are designed. Do not silently flatten or erase embeds.

### Still proposed, not implemented

- New first-class **program** registry, mapping existing learning paths, default enrollment, program navigation and distinct tenant-scoped program CRUD.
- Author-configurable **Lessons / Sections** guide navigation applied end-to-end to the learner catalog. This does not need a second storage hierarchy.
- Rich optional plugins such as images with captions, gallery, tables, Scripture reference cards, footnotes, reviewer comments, suggestions and vetted AI assistance. None is advertised as functional in this prototype.
- Bulk conversion of historical pages and advanced audio/video to Plate.
- Production browser/device visual QA, collaborative real-time coediting, autosave/revision history, RTL authoring behavior and accessiblity audit.

## 3. Publication and migration contract

1. New draft uses `schemaVersion: 2` and validated `section.document`. The server may project legacy `blocks`, `contentPages` and `pages` as compatibility views, never as editable competing sources of truth.
2. Saving an existing lesson retains its guide ID, lesson ID, anchor IDs and access scope. Blank drafts may exist but publication must require valid nonempty content, final-exam rules and authorized language.
3. Publishing saves an immutable/versioned snapshot for learner reading, resumption and certificate audit. Editing a published unit should produce a reviewable new version rather than mutate an issued credential's underlying evidence.
4. Every move/copy is server-authorized in the source and destination scope. Copy regenerates IDs and never copies confidential quiz answers; move is blocked where existing assessments are attached unless remapping is explicitly approved.
5. Existing legacy content remains readable. Migrate by copying to a draft and comparing section count, text/media, quiz anchors and rendered learner pages; rollback must be possible.

## 4. Suggested acceptance scenarios

- Create **VOP → a guide → a lesson → three sections**. Each page retains formatting and is independently reachable with previous/next and saved resume.
- Change the guide's *presentation* from lessons to sections: navigation changes, but quiz attempt history and completion percentages do not.
- Organize one chapter with multiple sections, then duplicate, reorder, or transfer it; all published quiz anchor invariants hold.
- Author a Bemba translation as an organization editor, confirm no edits to global English or another organization's content; platform Super Admin and tenant permissions remain separate.
- Import an older lesson that contains image/audio/video blocks, prove no media or anchored quizzes are lost.
- Verify keyboard-only, 320px phone, tablet, desktop, dark mode, screen-reader labels and final-exam / certificate eligibility.
- Test adversarial document content, answer-key leakage, image/link URL SSRF bypasses, oversized nested documents, lost-update concurrency and published content immutability.

**Approval needed before production change:** confirm whether "Program" should be a first-class entity or the current Learning Paths can be given program semantics after migration review; confirm that "Lessons/Sections" means two navigation modes over one stable lesson schema; confirm the approved media and collaboration/plugin list.
