# Worksheet AI QA and Advancement Audit

Date: 2026-06-16
Branch inspected: `feature/onboarding-child-settings`

This is an audit report, not an implementation plan. The goal is to map the current system, identify launch risks, and define how to build a useful worksheet QA dataset without overfitting to one CE1 child's worksheets.

Product framing: worksheet scanning is not a side feature. It is Skeelio's main product pillar. The core promise is that Skeelio can understand the child's real school context from actual school materials, identify both the skill and the classroom method, and tutor from that context. Spelling drills, multiplication practice, rewards, dashboards, and generic assignments are supporting systems around that pillar.

## Executive Summary

Skeelio currently has two partly separate learning systems:

1. Worksheet scans create either:
   - a spelling list plus spelling assignment, or
   - a `tutor_episodes` row with AI-generated lesson/practice metadata.
2. Adaptive math advancement uses `learning_attempts`, tier ladders, and centralized gates in `masteryConfig.ts` / `tutorConfig.ts`.

The biggest launch risk is not one specific prompt bug. It is that worksheet understanding, assignment generation, school-method extraction, and advancement evidence are not yet governed by one shared contract. Some paths record first-try or unaided evidence, some record generic correctness, and worksheet-derived skill progress lives mostly in `tutor_episodes` rather than the same tier model as math practice.

Recommended next step: build a worksheet QA harness around `absorb-worksheet` before changing advancement rules. That harness should verify not only "what skill is this?" but also "how is school teaching this?" Then centralize a small "learning evidence" model so every path can say whether a result is placement evidence, mastery evidence, review evidence, or just homework completion.

## Worksheet AI Pipeline Map

### Entry Point

`app/(app)/scan.tsx`

- Photo is selected/captured, resized to width 1500, JPEG-compressed at 0.5, and converted to base64.
- The app calls Supabase function `absorb-worksheet` with `{ image: dataUrl }`.
- The app only validates that `concept.label`, `domain`, and `language` exist before showing the review screen.

Relevant code:

- `processImage`: `app/(app)/scan.tsx`
- `callAbsorbWorksheet`: `app/(app)/scan.tsx`
- `handleAssign`: `app/(app)/scan.tsx`

### Server Function

`supabase/functions/absorb-worksheet/index.ts`

The function does several jobs:

- Classifies the page:
  - `language`
  - `domain`
  - `source_type`
  - `grade_band`
  - `concept`
  - `sub_skills`
- Generates a mini-lesson.
- Generates practice items.
- Applies special handling for spelling lists.
- Applies special handling for language/conjugation.
- Verifies math answers with `mathjs`.
- Verifies language answers by asking the model to solve its own generated questions.
- Tops up missing sub-skill coverage if too few valid items survive.

This means one function is currently responsible for OCR, classification, pedagogy, content generation, answer verification, and fallback recovery.

### Assignment Creation

After review:

- `source_type === "spelling_list"` plus `spelling_words` creates:
  - a spelling list via `createSpellingList`
  - spelling items via `createSpellingItems`
  - a spelling assignment via `createSpellingAssignment`
- Other worksheet scans create:
  - a `tutor_episodes` row
  - `source: "photo"`
  - `status: "pending"`
  - persisted `concept`, `lesson`, `domain`, `language`, `grade_band`, and optional image path

Notably, the scan review does not persist the generated `practice` items. The episode later calls `generate-practice` again from the concept/lesson context.

### Worksheet Episode Runtime

`app/(app)/episode.tsx`

Episode practice:

- Starts from route-provided `episodeData`.
- Calls `generate-practice` using concept, grade band, language, domain, avoid list, and session seed.
- Has a deterministic local bank only for plural concepts.
- Records first attempts to `episode_attempts`.
- Completes `tutor_episodes` with:
  - `status = complete`
  - `mastered`
  - `items_attempted`
  - `first_try_correct`
  - `unaided_streak_max`

Mastery for worksheet episodes is based on:

- 12-item window
- at least 10 first-try correct
- at least 6 distinct items

Those thresholds come from `SKILL_SESSION`.

## Worksheet AI QA Risks

### 1. Classification and Generation Are Too Coupled

The initial model call classifies the worksheet and generates practice at the same time. If classification is wrong, the generated content is often wrong too, and the review screen may still look plausible.

Recent examples already showed this:

- spelling list misread as vocabulary
- conjugation exercise titled as vocabulary
- generated questions not anchored to the scanned page

Launch implication: QA must score classification separately from generated practice quality.

### 2. `practice` From `absorb-worksheet` Is Mostly Review-Only

The scan review screen previews the returned practice examples, but standard non-spelling worksheet assignment stores only the episode metadata. The child episode then calls `generate-practice` later.

Launch implication: a worksheet may pass review preview but still fail at child runtime if `generate-practice` drifts from the scan scope.

### 3. Post-Processing Guards Are Helpful but Ad Hoc

Good guards exist:

- spelling list normalization
- fallback word extraction
- conjugation relabeling
- math number-in-question verification
- language answer self-checking
- missing sub-skill top-ups

But they are embedded in one edge function and do not have fixture coverage.

Launch implication: every prompt tweak can regress a previously fixed worksheet type.

### 4. Language Scope Is Fragile

The language path tries to preserve task type and scope, especially for conjugation. That is the right instinct. But the function infers conjugation with text heuristics such as `conjug`, `verbe`, `verb`, `futur`, and `tense`.

Launch implication: it may miss worksheet styles that use school-specific wording, abbreviations, handwritten instructions, or exercises with minimal headings.

### 5. There Is No Source Quality Field

The system does not appear to persist confidence, OCR quality, ambiguity, or "needs parent review" flags.

Launch implication: a low-confidence scan can look as authoritative as a clear one.

## Advancement / Next Skill Logic Map

### Adaptive Math Core

Files:

- `lib/masteryConfig.ts`
- `lib/tutorConfig.ts`
- `lib/tutor/ability.ts`
- `lib/tutor/selector.ts`
- `lib/tutor/status.ts`
- `app/(app)/practice.tsx`

Core model:

- Operations: addition, subtraction, multiplication, division.
- Each operation has tier ladders such as `A1`, `A2`, `M3`, etc.
- Attempts are stored in `learning_attempts`.
- Hints are recorded with `ai_hint_used`.
- Mastery is intended to be unaided:
  - minimum unaided attempts
  - minimum unaided correctness rate
  - coverage currently always true

This is the strongest part of the system. It is relatively explainable and tunable.

### Math Practice Runtime

`app/(app)/practice.tsx`

- Fetches all existing attempts for the selected topic.
- Computes current tier and band with `currentTierAndBand`.
- Routes to a lesson if the tier has no attempts.
- Generates `GATE.minAttemptsToAdvance` questions.
- Inserts each answer into `learning_attempts`, including tier and hint usage.
- Re-runs ability assessment at the end to show a result.

Risk: the end-of-session assessment refetch maps attempts without `ai_hint_used`, so hinted attempts can accidentally look unaided during the outcome message. The underlying saved data still has hint flags, but that particular summary path is weaker.

### Homework Runtime

`app/(app)/homework/[assignmentId].tsx`

- Loads parent-created assignments.
- Inserts answers into `learning_attempts`.
- Records `subject`, `topic`, `tier`, `skill`, question text, correctness, and hint usage.
- Marks assignment complete with score.

This is good for math assignments because it feeds the same `learning_attempts` table. It may be less appropriate for parent-created quizzes because homework completion can affect advancement unless we distinguish evidence type.

### Worksheet Episode Runtime

`app/(app)/episode.tsx`

- Uses `episode_attempts`, not `learning_attempts`.
- Computes episode-level `mastered`, `first_try_correct`, and streak.
- Parent/child surfaces show worksheet skills through `lib/worksheetSkills.ts`.

This is useful for worksheet-derived skills but not equivalent to math tier advancement. It can support "needs practice / mastered this worksheet concept" but should not automatically advance core math tiers without explicit mapping.

### Spelling Runtime

`app/(app)/spelling/[listId].tsx`

- Records attempts in `spelling_practice_attempts`.
- Counts first-attempt correct words.
- In practice mode, up to three attempts are allowed with hints/reveals.
- Assessment treats spelling attempts as unaided because there is no hint flag in the assessment query.

Risk: spelling evidence is not as clearly separated into first-try, aided, revealed, and final-correct as math.

### Conjugation Runtime

`app/(app)/conjugation/[sessionId].tsx`

- Uses `conjugation_practice_attempts`.
- Multiple-choice answer selection.
- Adds stars immediately for correct answers.
- Assessment combines conjugation table attempts with worksheet episodes that look like conjugation.

Risk: multiple-choice correctness is weaker evidence than typed production, but it is treated similarly in broad assessment.

### Parent Assessment

`lib/childAssessment.ts`

Builds canonical areas:

- Addition
- Subtraction
- Multiplication
- Division
- Word Problems
- French grammar
- Spelling
- Conjugation

Strengths:

- Math operations are explicitly marked authoritative.
- Math uses grade-expected tier benchmarks.
- Attempts with hints are filtered for core math.

Risks:

- Worksheet language episodes can mark grammar/conjugation as on track with a small amount of evidence.
- Spelling/conjugation evidence models differ from math.
- The status layer and ability layer use similar gates but not always the same attempt denominator.
- There is no unified evidence policy for "this should influence advancement" vs "this should only recommend review."

## Advancement Risks Before Outside Testing

### 1. Parent Assignments Can Affect Placement Too Much

Math homework writes to `learning_attempts`, so parent-created assignments can affect the same evidence stream as adaptive practice. That may be good if the assignment is aligned. It is risky if the assignment is too easy, too hard, quiz-like, or created for review.

Recommendation: add an `evidence_source` / `evidence_weight` concept before making more advancement changes.

### 2. Worksheet Scans Should Recommend Practice Before Granting Mastery

Worksheet episodes should be valuable evidence, but one scanned page should not automatically move a child forward in a core sequence unless it maps cleanly to a known skill and has enough unaided production.

Recommendation: for MVP, worksheet scans can create:

- recommended practice
- parent-visible skill notes
- weak evidence for assessment

But core tier advancement should remain driven by `learning_attempts` until mapping is explicit.

### 3. Hints and First-Try Evidence Are Not Uniform Across Subjects

Math has `ai_hint_used`. Worksheet episodes have first-try history. Spelling has attempt number and reveal behavior. Conjugation has multiple-choice attempts.

Recommendation: define common evidence dimensions:

- first_try
- aided
- revealed
- answer_mode: typed / multiple_choice / oral / parent_created / generated
- source: adaptive_practice / homework / worksheet_scan / spelling_list / conjugation_bank
- skill_key
- confidence

### 4. Coverage Is Placeholder in Math

`coverageMet` is currently always true in `tierStats`.

Recommendation: before outside launch, fact tiers should require coverage across relevant facts or factors. Otherwise a child can over-practice a narrow slice and appear solid.

### 5. Progress Text May Overstate Certainty

Labels like "Mastered" and "on track" are strong. They should reflect evidence quality, not just score.

Recommendation: keep MVP language conservative:

- "Looks solid"
- "Needs more practice"
- "Not enough data"
- "Ready to try next"

## Worksheet QA Dataset Plan

The QA dataset should store metadata, not just images.

Suggested manifest fields:

- `id`
- `source_url`
- `license_or_usage_note`
- `language`
- `country_or_school_system`
- `grade`
- `format`: printed_pdf, web_render, photo, handwritten, mixed
- `subject`
- `expected_source_type`
- `expected_domain`
- `expected_skill_label`
- `expected_sub_skills`
- `expected_assignment_kind`
- `must_anchor_to_page`: true/false
- `known_edge_cases`
- `pass_criteria`

### Initial QA Matrix

Minimum first batch:

- French CP/CE1 math: number comparison, addition/subtraction, money, time, word problems.
- French CE1/CE2 language: spelling list, plural/singular, gender agreement, conjugation present/future, vocabulary meanings.
- English Grade 1/2 math: addition/subtraction facts, place value, money/time, word problems.
- English Grade 1/2 ELA: spelling list, phonics, grammar, reading comprehension.
- Handwritten/photo variants:
  - real photos from Aaron's daughter's worksheets
  - printed worksheets photographed at angles
  - lightly annotated worksheets
  - generated handwritten copies of open/public-domain prompt text if licensing allows

## Seed Web Sources For Robust Examples

Do not bulk-copy copyrighted worksheets into the repo without checking license/terms. Use links and metadata first; download only clearly reusable/open resources or local private test images.

### French / France

- Eduscol CE1 math accompaniment PDF, May 14 2020: https://eduscol.education.gouv.fr/sites/default/files/document/0514-ce1-maths-ficheaccompagnement1286049pdf-87474.pdf
  - Good for CE1 numeration/comparison.
- Eduscol CE1 math accompaniment PDF, June 12 2020: https://eduscol.education.gouv.fr/sites/default/files/document/0612-ce1-fichesaccompagnement-maths1297016pdf-87528.pdf
  - Good for time/clock tasks.
- Eduscol CE1 math accompaniment PDF, June 16 2020: https://eduscol.education.gouv.fr/sites/default/files/document/0616-ce1-fichesaccompagnement-maths1298304pdf-87534.pdf
  - Good for number-line/spatial math tasks.
- Eduscol CE1 math accompaniment PDF, May 6 2020: https://eduscol.education.gouv.fr/sites/default/files/document/0506-ce1-maths-fichesaccompagnement1282777pdf-87462.pdf
  - Good for subtraction technique.
- French national assessment overview: https://www.education.gouv.fr/l-evaluation-des-acquis-des-eleves-en-cp-ce1-ce2-cm1-et-cm2-fiches-descriptives-des-exercices-342046
  - Good for official skill categories and grade expectations.
- Eduscol CE1 2024 assessment PDF: https://eduscol.education.fr/sites/default/files/document/24ce1pspdf-107301.pdf
  - Good for official task forms and teacher-facing evaluation framing.

### English / US / UK

- Open Up Resources OUR K-5 Math Grade 2: https://access.openupresources.org/curricula/our-k5-math-tn/en/grade-2/student.html
  - Strong open-curriculum math source. Useful for grade 2 skill coverage.
- Core Knowledge Grade 2 geometry/time/money PDF: https://www.coreknowledge.org/wp-content/uploads/2023/08/CKMath_G2U6_GeometryTimeAndMoney_SB_W2.pdf
  - The PDF includes CC BY 4.0 licensing text. Good for time/money/geometry examples.
- Kent District Library 1st grade workbook PDF: https://kdl.org/wp-content/uploads/sites/88/2021/05/1stGrade-Workbook.pdf
  - Useful printed English/math mixed workbook source; check reuse terms before storing.
- Year 2 activity booklet PDF: https://www.grangeprimaryacademy.org.uk/Portals/0/adam/Content/MAHiIsKSxEGrvf-7Fb7gkQ/Text/y2-activity-booklet-l_1.pdf
  - UK Year 2 mixed maths/English booklet; check reuse terms before storing.
- Bassingbourn Year 2 maths place value workbook: https://www.bassingbourn.cambs.sch.uk/assets/Year2MathsWorkbook.pdf
  - UK Year 2 place value workbook; check reuse terms before storing.
- K5 Learning Grade 2 worksheets: https://www.k5learning.com/free-math-worksheets/second-grade-2
  - Useful breadth for printed worksheet formats; likely not open-license for repo bundling.

### French-Language Learning Sources

These are useful for task-shape diversity, but they are not equivalent to French primary-school worksheets:

- QCFrench worksheets: https://www.qcfrench.com/worksheets/
- Lingua French grammar exercises: https://lingua.com/french/grammar/
- Camp Tournesol French printables: https://camptournesol.ca/free-printable-worksheets-for-kids/

### Handwritten Data

True elementary handwritten worksheet datasets are harder to source publicly and cleanly. Better approach:

- Use Aaron's real private worksheet photos for the most realistic handwritten/photographed cases.
- Create internal synthetic handwritten variants only from open/public-domain or self-authored worksheet text.
- Consider general handwriting OCR datasets only to stress OCR, not pedagogy:
  - Hugging Face handwritten OCR sample dataset: https://huggingface.co/datasets/JunaidMB/handwriting-ocr-images-dataset
  - MathWriting paper/dataset pointer: https://arxiv.org/html/2404.10690v1
  - Handwritten math expressions dataset listing: https://www.kaggle.com/datasets/govindaramsriram/handwritten-math-expressions-dataset/data

## Recommended Next Work

1. Build a `worksheet-fixtures/manifest.json` with 20 linked examples and expected outputs.
2. Add a local script that runs `absorb-worksheet` against selected fixtures and saves JSON outputs.
3. Score output on classification first:
   - language
   - domain
   - source type
   - skill label
   - sub-skills
   - assignment kind
4. Score generated practice second:
   - anchored to worksheet where required
   - age-appropriate
   - correct answer
   - correct language
   - no invented unsupported task type
5. Only after that, adjust prompts/code.
6. For advancement, design a shared evidence contract before changing thresholds.

## MVP Policy Recommendation

For outside testing, keep advancement conservative:

- Adaptive math tiers advance only from enough unaided `learning_attempts`.
- Worksheet scans create practice and parent-visible skill evidence, but do not advance core math tiers automatically.
- Parent-created assignments count as practice evidence, but should be distinguishable from adaptive placement evidence.
- Hinted/revealed/multiple-choice answers should not count the same as first-try typed answers.
- The UI should prefer "needs practice", "not enough data", and "ready to try next" over hard "mastered" unless evidence is strong.
