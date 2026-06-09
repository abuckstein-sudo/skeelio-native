# Assignments / Homework Feature Recon Report

**Date:** June 9, 2026  
**Source:** Old web repo analysis (smart-study-buddy-56)  
**Status:** Complete data model mapping with question generation handoff

---

## 1. DATA MODEL

### Core Tables Touched

#### `assignments` (Main assignment table)
Stores teacher/parent-created learning missions. Each row = one subject-specific task.

**Columns:**
- `id` (uuid, PK)
- `parent_id` (uuid, FK → `users.id`) — owner/creator
- `child_id` (uuid, FK → `children.id`) — assigned to
- `subject` (enum: `"multiplication"` | `"division"` | `"addition"` | `"subtraction"` | `"spelling"` | `"word_problems"` | `"reading"` | `"conjugation"` | `"custom"`)
- `focus` (text, nullable) — scope within subject (e.g., `"7"` for ×7 table, `"multi_digit"` for division, `"fr-FR:présent"` for French conjugation)
- `mode` (enum: `"practice"` | `"quiz"`) — free-form or scored
- `question_count` (int) — how many problems in the assignment
- `due_date` (timestamp, nullable)
- `status` (enum: `"pending"` | `"in_progress"` | `"complete"`)
- `created_at` (timestamp)
- `completed_at` (timestamp, nullable)
- `custom_questions` (jsonb, nullable) — **only for subject="custom"**; array of `CustomQuestion` objects

**Type:** `AssignmentRow` (src/lib/db.ts:1151)

---

#### `learning_plan_sessions` (Links assignments to curriculum plans)
Intermediate table connecting learning plans to assignments by week/session.

**Columns:**
- `id` (uuid, PK)
- `plan_id` (uuid, FK → `learning_plans.id`)
- `child_id` (uuid, FK → `children.id`)
- `scheduled_date` (date, nullable)
- `week_number` (int)
- `session_number` (int)
- `subject` (text) — e.g., `"multiplication"`
- `focus` (text, nullable)
- `assignment_id` (uuid, FK → `assignments.id`, **nullable**) — **OPTIONAL link to an assignment**
- `status` (enum: `"pending"` | `"complete"`)
- `created_at` (timestamp)

**Type:** `LearningPlanSession` (src/lib/db.ts:237)

---

#### `learning_plans` (Curriculum/holiday plans)
Parent-created multi-week study programs with assigned sessions.

**Columns:**
- `id` (uuid, PK)
- `parent_id` (uuid, FK → `users.id`)
- `child_id` (uuid, FK → `children.id`)
- `name` (text) — e.g., "Summer Holiday Math Plan"
- `start_date` (date)
- `end_date` (date)
- `sessions_per_week` (int)
- `session_length_minutes` (int)
- `subject_config` (jsonb) — `{ [subject]: { sessions_per_week: int; focus?: string } }`
- `star_target` (int) — reward milestone
- `reward_description` (text, nullable)
- `reward_type` (text) — e.g., `"book"`, `"outing"`
- `stars_earned` (int)
- `status` (text) — `"active"`
- `created_at` (timestamp)

**Type:** `LearningPlan` (src/lib/db.ts:219)

---

#### `sessions` (Practice sessions)
Records a child's work on any subject (including assignments). Tracks time, correctness, etc.

**Columns:**
- `id` (uuid, PK)
- `child_id` (uuid, FK → `children.id`)
- `supervisor_type` (enum: `"parent"` | `"babysitter"` | `"alone"`)
- `supervisor_name` (text, nullable)
- `start_time` (timestamp)
- `end_time` (timestamp, nullable)
- `exercises_done` (int) — total problems/questions
- `correct_answers` (int)
- `incorrect_answers` (int)
- `accuracy_percentage` (int)
- `homework_status` (enum: `"done"` | `"almost"` | `"needs_help"`)
- `ai_summary` (text)
- `created_at` (timestamp)

**Type:** `SessionRow` (src/lib/db.ts:118)

---

#### `answers` (Individual answer records)
One row per question answered in any session (including assignments).

**Columns:**
- `id` (uuid, PK)
- `session_id` (uuid, FK → `sessions.id`, nullable)
- `child_id` (uuid, FK → `children.id`, nullable)
- `question_id` (uuid, FK → `questions.id`, nullable)
- `user_answer` (int, nullable) — for math, the numeric answer
- `is_correct` (bool)
- `ai_feedback` (text) — hint or explanation
- `user_id` (uuid, nullable)
- `created_at` (timestamp)

**Type:** `AnswerRow` (src/lib/db.ts:144)

---

#### `learning_attempts` (Detailed learning analytics)
Richer logging for individual attempts (used for adaptive engine feedback).

**Columns:**
- `user_id` (uuid) — parent/observer auth uid
- `child_id` (uuid)
- `subject` (text) — e.g., `"custom"`
- `topic` (text) — e.g., assignment focus or custom question topic
- `skill` (text, nullable) — sub-skill or first 50 chars of question
- `difficulty_level` (int, nullable)
- `question_type` (text) — e.g., `"multiple_choice"`, `"fill_blank"`
- `question_text` (text)
- `correct_answer` (text)
- `user_answer` (text, nullable)
- `was_correct` (bool)
- `response_time_ms` (int, nullable)
- `ai_hint_used` (bool, nullable)
- `mistake_type` (text, nullable)
- `ai_analysis` (text, nullable)
- `ai_strategy` (text, nullable)
- `student_feedback` (text, nullable)
- `learning_mode` (text, nullable)

**Type:** `LearningAttemptInput` (src/lib/db.ts:159)

---

#### `spelling_lists` & `spelling_practice_sessions` (Spelling assignments)
Spelling assignments create a list, then track practice.

**Related for spelling:**
- `spelling_lists` — stores list metadata
- `spelling_list_items` — individual words
- `spelling_practice_sessions` — a session practicing a list
- `spelling_practice_attempts` — individual word attempt in session

---

#### `questions` (Static question bank)
Pre-populated math problems (multiplication, division, addition, subtraction).

---

### Custom Question Schema (Inline in `assignments.custom_questions`)

When `subject="custom"`, the assignment stores an array of `CustomQuestion` objects:

```typescript
type CustomQuestion = {
  question: string;           // The prompt/question text
  question_type: "multiple_choice" | "fill_blank" | "sentence_writing" | "short_answer";
  options?: string[];         // Only for multiple_choice (exactly 4)
  correct_answer: string;     // Expected answer
  explanation: string;        // Brief coaching tip or hint
  difficulty: number;         // 1-5 scale
};
```

These are stored as JSONB in `assignments.custom_questions` and passed to the child practice route.

---

## 2. CREATION FLOW

### Who Creates Assignments?

**Parent** (via `parent.tsx` route, authenticated as `auth.uid()`).

### The Creation Sequence

#### **Path A: Manual Assignment Creation**

1. **Parent navigates to** `parent.tsx` → "Assignments" tab → "Add assignment" button
2. **Parent selects:**
   - Child (from dropdown)
   - Subject (multiplication, division, addition, subtraction, spelling, word_problems, reading, conjugation, custom)
   - Focus (e.g., "7" for ×7 table; "fr-FR:présent" for conjugation; auto-selected for subject-specific)
   - Mode (practice or quiz)
   - Question count (default varies by subject)
3. **Parent clicks "Create assignment"**
4. **DB Action:**
   ```typescript
   await createAssignment({
     parent_id: parentId,
     child_id: childId,
     subject,
     focus,
     mode,
     question_count,
     // custom_questions: undefined (not set here)
   })
   ```
   - Inserts row into `assignments` with `status="pending"`
   - Returns new `AssignmentRow`

5. **Post-Insert Server-Side Generation (non-blocking):**
   - If `subject="word_problems"`: calls `generateWordProblemsFn` → generates and stores `CustomQuestion[]` (via OpenAI)
   - If `subject="division"` and `focus="multi_digit"`: calls `generateDivisionFn` (custom logic)
   - Other subjects: questions pulled from static bank at play time

---

#### **Path B: Homework Scan → Auto-Create Assignments**

1. **Parent navigates to** Assignments tab → "Scan homework photos" → uploads image(s)
2. **Image Analysis (server):**
   - `analyzeHomeworkPhoto` (server function, uses OpenAI Vision)
   - Extracts and classifies homework content
   - Returns `HomeworkAnalysisResult`:
     ```typescript
     type HomeworkAnalysisResult = {
       photo_type: "reading_text" | "worksheet" | "reference" | "mixed";
       assignments: HomeworkAssignment[];  // What was detected
       unrecognized: string[];
     }
     ```

3. **Parent Reviews & Confirms:**
   - UI shows detected assignments with mode/question-count toggles
   - Parent adjusts as needed, then clicks "Create all assignments"

4. **Bulk Creation via `createAssignmentsFromScan`:**
   - For each detected `HomeworkAssignment`:
     - **Spelling:** creates `spelling_list` + `spelling_list_items`, then `assignment` with spelling focus
     - **Multiplication/Division:** creates separate assignment per table (if multiple tables detected) or one generic
     - **Conjugation/Reading:** creates with appropriate focus (e.g., `"fr-FR:présent"`)
     - **Custom (worksheet/reading):** creates `assignment` with `subject="custom"`, calls AI to generate `custom_questions`
   - Each calls `createAssignment` under the hood, then posts to generation functions if applicable

---

#### **Manual Custom Question Input**

For `subject="custom"`, parent can manually enter questions via:
- `updateAssignmentCustomQuestions(assignmentId, customQuestions: CustomQuestion[])`

**UNCERTAIN:** Whether the UI for manual custom-question entry exists in the old web repo; code supports it but I didn't locate a UI component for editing custom questions post-creation.

---

## 3. QUESTION GENERATION HANDOFF

### Server Functions (Edge Functions in Supabase terms)

#### **Word Problems Generation**
- **Function:** `generateWordProblemsForChild` (src/lib/ai.functions.ts:970)
- **Inputs:**
  - `childId: string`
  - `count: number` (how many problems)
- **Process:**
  1. Builds child context (performance, interests, grade level) via `buildChildContext`
  2. Calls OpenAI `gpt-4o-mini` with system prompt ensuring realistic scenarios
  3. Generates `count` problems as `CustomQuestion[]`
  4. **IMPORTANT:** Returns both `problems` and `debug` object (to help diagnose failures)
- **Output:**
  ```typescript
  {
    problems: CustomQuestion[];
    debug: {
      stage: string;
      contextLen?: number;
      keyPresent?: boolean;
      modelCallOk?: boolean;
      rawResponseLen?: number;
      parseOk?: boolean;
      error?: string;
    }
  }
  ```
- **Writing Back:** Parent flow (src/routes/parent.tsx:1609) receives result, logs it; **does NOT explicitly update assignment**. This seems to rely on the server function's internal mutation or a missing link.

**UNCERTAIN:** Exactly where the generated `CustomQuestion[]` is stored. The code shows the generation is called but doesn't show an explicit `updateAssignmentCustomQuestions` call in the parent creation flow for word_problems.

---

#### **Homework Photo Analysis**
- **Function:** `analyzeHomeworkPhoto` (src/lib/ai.functions.ts:1434)
- **Inputs:**
  ```typescript
  {
    imageBase64: string;
    mimeType: string;
    childGradeLevel: string;
    childLanguages: string[];
  }
  ```
- **Process:**
  1. Converts base64 to data URL
  2. Calls OpenAI Vision (GPT-4 or compatible)
  3. Classifies photo (reference / worksheet / reading_text / mixed)
  4. Extracts exercises or reference material
  5. For custom subjects, generates `custom_questions` inline
- **Output:**
  ```typescript
  type HomeworkAnalysisResult = {
    photo_type: "reading_text" | "worksheet" | "reference" | "mixed";
    assignments: HomeworkAssignment[];
    unrecognized: string[];
  }
  
  type HomeworkAssignment = {
    subject: string;
    language: "fr-FR" | "en-CA";
    topic: string;
    details: Record<string, unknown>;          // subject-specific (words[], tables[], tense, etc.)
    custom_questions?: HomeworkCustomQuestion[];  // for "custom" subject only
    suggested_question_count?: number;
    confidence: number 0-1;
    unsupported: string | null;
  }
  ```
- **Writing Back:** `createAssignmentsFromScan` consumes these and creates assignments; for `subject="custom"`, passes `custom_questions` to `createAssignment`.

---

#### **Division Method Extraction**
- **Function:** `extractMethodFromWorksheet` (src/lib/ai.functions.ts:2512)
- **Used for:** Determining which division method (long division, short division, etc.) a child learned
- **Output:** Method name + confidence
- **Relationship to assignments:** Mentioned in code but not directly tied to assignment generation; seems auxiliary for teaching-method tracking.

---

#### **Custom Answer Grading**
- **Function:** `gradeCustomAnswer` (src/lib/ai.functions.ts)
- **Inputs:** question, correct_answer, child_answer, question_type, childGradeLevel
- **Output:** `{ is_correct: bool; feedback: string; model_answer: string }`
- **When Used:** In the custom practice flow (child.$id.custom.tsx) for fill_blank, sentence_writing, short_answer questions (not multiple_choice, which are exact-match)

---

## 4. CHILD PLAY FLOW ("My Homework")

### Summary

Child logs in, sees **two categories** of assignments on home page:
1. **Regular assignments** (not tied to a plan)
2. **Plan assignments** (tied to active learning plan, filtered by week)

Also displays **free practice** buttons if no assignments pending.

### Detailed Steps

#### **Step 1: Child Home (child.$id.index.tsx)**

1. Page loads assignments via `getAssignmentsForChild(childId)`
2. Filters into:
   - `activeAssignments` = all with `status !== "complete"`
   - `planAssignments` = linked to current week's plan sessions
   - `regularAssignments` = standalone

3. UI renders cards for each active assignment:
   - Subject icon + name
   - Focus label (e.g., "×7 table", "French · Présent")
   - Mode badge (Practice / Quiz)
   - Status (Pending / In Progress)

---

#### **Step 2: Child Starts Assignment**

1. Child clicks assignment card → calls `startSession`:
   ```typescript
   const sess = await createSession({
     child_id: childId,
     mode: subject,  // e.g., "custom"
     supervisor_type: "alone",
   });
   ```
   - Inserts row into `sessions` with `start_time`
   - Stores session in `session-store` (in-memory state)

2. Routes to appropriate subject page with search params:
   - `assignmentId=<id>`
   - `questionCount=<count>` (from assignment)
   - `quiz=true/false` (from assignment.mode)

---

#### **Step 3: Answering Questions (Subject-Specific)**

**For custom assignments** (subject="custom"):
- Route: `child.$id.custom.tsx`
- Fetches assignment: `getAssignmentsForChild` → finds by `assignmentId`
- Loads `assignment.custom_questions` (jsonb array)
- Shuffles and displays questions

**For math assignments** (multiplication, division, addition, subtraction):
- Route: `child.$id.practice.tsx` (or .division, .addition, .subtraction)
- If `assignmentId` provided: **fetches from assignment's `focus` and `question_count`**
- Queries static question bank (from `questions` table) filtered by subject + focus
- OR pulls from pre-generated pool if word_problems or multi_digit division

**For spelling:**
- Route: child.$id.spelling_.$listId.tsx
- Loads `spelling_lists` + `spelling_list_items`
- Plays back words with spelling practice

**For reading:**
- Route: child.$id.reading.tsx
- Loads reading_texts + reading_questions

**For conjugation:**
- Route: child.$id.conjugation.tsx
- Loads conjugation_questions filtered by language + tense

---

#### **Step 4: Recording Answers**

**During each question:**

1. **Math routes:** Call `recordAnswer`:
   ```typescript
   await recordAnswer({
     session_id: sessionId,
     child_id: childId,
     question_id: questionId,      // from questions table
     user_answer: answerNumber,
     is_correct: boolean,
     ai_feedback?: string
   });
   ```
   - Inserts into `answers` table

2. **Custom routes:** Call `logLearningAttempt`:
   ```typescript
   await logLearningAttempt({
     user_id: parentId,
     child_id: childId,
     subject: "custom",
     topic: focus,
     question_type: "multiple_choice",
     question_text: q.question,
     correct_answer: q.correct_answer,
     user_answer: given,
     was_correct: correct,
     response_time_ms: timeMs
   });
   ```
   - Inserts into `learning_attempts` table
   - If question_type is not multiple_choice, call `gradeCustomAnswer` via OpenAI first

3. **In-memory tracking:** Updates `session-store`:
   - `correct` count (incremented if correct)
   - `total` count (incremented always)
   - `answers` array (for session summary)

---

#### **Step 5: Session Completion**

1. After all questions answered, routes to `child.$id.end.tsx`
2. Calls `endSession(sessionId, { exercises_done, correct_answers, homework_status, ai_summary })`:
   ```typescript
   await endSession(sessionId, {
     exercises_done: totalQuestions,
     correct_answers: correctCount,
     homework_status: "done",  // inferred from accuracy
     ai_summary: "<summary from AI>"
   });
   ```
   - Updates `sessions` row with `end_time`, accuracy, etc.

3. **If assignment-linked:**
   ```typescript
   await markAssignmentComplete(assignmentId);
   await awardPlanStarsForAssignment(assignmentId, correctCount);
   ```
   - Sets `assignments.status = "complete"`, `assignments.completed_at = now()`
   - Marks linked `learning_plan_session.status = "complete"`
   - Awards stars to `learning_plans.stars_earned`

4. **Stars awarded:**
   ```typescript
   await addStars(childId, correctCount);
   ```
   - Updates `children.stars` (global reward counter)
   - Inserts into `rewards` table (for streak tracking)

5. Renders celebration page, redirects to home (with `?allDone=true` to refresh assignments)

---

### Tracking Completion & Scoring

| Component | Table | Field | When Set |
|-----------|-------|-------|----------|
| Assignment marked done | `assignments` | `status="complete"`, `completed_at` | After session ends |
| Session recorded | `sessions` | `exercises_done`, `correct_answers`, `accuracy_percentage`, `homework_status` | `endSession()` |
| Individual answers | `answers` | `is_correct`, `user_answer` | `recordAnswer()` per question |
| Rich attempt logs | `learning_attempts` | `was_correct`, `response_time_ms`, `ai_analysis` | `logLearningAttempt()` per question (custom only) |
| Plan progress | `learning_plans` | `stars_earned` | `awardPlanStarsForAssignment()` |
| Plan session | `learning_plan_sessions` | `status="complete"`, `assignment_id` | `markPlanSessionComplete()` |

---

## 5. RLS & OWNERSHIP ASSUMPTIONS

### Auth Context

- **Parent auth uid:** Stored in `auth.uid()` (Supabase Auth)
- **Mirrored to `users` table:** `id = auth.uid()`, `role = "parent"`, `email`
- **RLS enabled:** Stated in auth-middleware.ts, but **no RLS policies found in migrations** — likely configured in Supabase UI or separate SQL

---

### Ownership Checks (Inferred from Code)

| Resource | Owner Column | Owner Value |
|----------|--------------|------------|
| `assignments` | `parent_id` | Created by parent's auth.uid() |
| `children` | `parent_id` | Parent owns list of children |
| `learning_plans` | `parent_id` | Parent owns plans |
| `learning_plan_sessions` | (no direct parent_id) | Implicit via `plan_id` → `learning_plans.parent_id` |
| `sessions` | (no user_id, implicit via child_id) | Child owns (links to their ID) |
| `answers` | `child_id` (and optionally `user_id`) | Child owns answers; `user_id` can be parent observer |
| `learning_attempts` | `user_id` + `child_id` | `user_id` = parent/observer; `child_id` = child |

---

### Permission Model (UNCERTAIN)

- **Parent can see all assignments** for their children (not explicitly enforced in code, assumes RLS handles it)
- **Child can see** only their own assignments (home page queries by `child_id`)
- **Sibling isolation:** Not explicitly checked in code; relies on RLS or app-level filtering
- **Babysitter mode:** Sessions can be marked with `supervisor_type="babysitter"` and `supervisor_name`, but **no separate RLS for babysitters found**

**UNCERTAIN:** Full RLS policy details; code trusts the client-side filtering + server-side Supabase enforcement.

---

## 6. MAPPING TO NATIVE ADAPTIVE ENGINE

### High-Level Integration Points

#### **Where Assignments Override Normal Flow**

In the native app, the **next-step selector** (adaptive engine) normally picks the next topic based on child's skill mastery and curriculum.

**Assignments change this:**

1. **On child home page:** Check for active assignments
   - If `assignments.filter(a => a.status !== "complete").length > 0`: show "Your Homework" or "Missions" section
   - If there are missions pending, show them **above** free practice / adaptive selector

2. **When child clicks an assignment:**
   - Override the selector; lock the child into that assignment
   - The assignment's `subject` + `focus` + `question_count` define the session entirely
   - No skill-based auto-progression (unlike free practice)

3. **After completion:**
   - Mark assignment complete
   - Award stars (potentially to an associated learning plan)
   - Return to home (selector becomes available again for next practice)

---

#### **Data Available to Native Engine**

The native app can query:

- **Child's active assignments:** `getAssignmentsForChild(childId)` → filter for `status !== "complete"`
- **Assignment details:** subject, focus, question_count, mode, custom_questions (if any)
- **Learning plan context:** `getPlanAssignmentIdsForWeek(planId, currentWeek)` → get this week's assignment IDs
- **Completion tracking:** `markAssignmentComplete(id)` + `awardPlanStarsForAssignment(id, score)`

---

#### **Native Implementation Checklist**

1. **Home screen:**
   - ✓ Query assignments on child load
   - ✓ Display active assignments before free practice
   - ✓ Show count or progress bar (e.g., "3 of 5 missions complete")

2. **Question selection:**
   - ✓ When assignment active, pull questions from:
     - **Static bank** (multiplication, addition, subtraction) filtered by `focus`
     - **Custom bank** (custom_questions from jsonb)
     - **Spelling list** (spelling_list_items)
     - **Reading passages** (reading_texts + reading_questions)
   - ✓ Do NOT use skill mastery or adaptive difficulty; use assignment's `question_count` and `focus`

3. **Grading & completion:**
   - ✓ Record answers in `answers` table (or `learning_attempts` for richness)
   - ✓ Update `sessions` row at end
   - ✓ Call `markAssignmentComplete()` when done
   - ✓ Call `awardPlanStarsForAssignment()` if linked to plan

4. **Question generation (server-side):**
   - ✓ For word_problems: call `generateWordProblemsForChild(childId, count)` post-creation
   - ✓ For custom (from scan): call `analyzeHomeworkPhoto()` then `createAssignmentsFromScan()`
   - ✓ For custom (manual): parent calls `updateAssignmentCustomQuestions()` if needed
   - ⚠ For division multi-digit: call `generateDivisionFn()` (details unclear, likely internal generation)

5. **Learning plans (advanced):**
   - ✓ If an active plan exists, **prioritize plan assignments** in "this week" before regular assignments
   - ✓ Show week/session structure if available
   - ✓ Link plan session completion to assignment completion

---

### Key Differences from Adaptive Flow

| Aspect | Adaptive (Free Practice) | Assignment (Homework) |
|--------|--------------------------|----------------------|
| **Topic selection** | Skill mastery driven | Parent-specified |
| **Question difficulty** | Auto-adjusted per child | Fixed by assignment |
| **Question bank** | Dynamic per skill | Static or pre-generated |
| **Completion criteria** | None (open-ended) | Fixed count + accuracy threshold (for quiz) |
| **Progress tracking** | Skill mastery updated | Assignment marked complete + stars awarded |
| **Motivation** | Intrinsic (badges, streaks) | Extrinsic (parent-assigned, plan rewards) |

---

## 7. UNCERTAIN / GAPS

1. **Word problem storage:** Code calls `generateWordProblemsFn` but I couldn't trace where the resulting `CustomQuestion[]` is persisted back to the assignment. Either:
   - Auto-updated via server function mutation
   - Returned to client and pushed back in a subsequent call
   - Stored elsewhere (e.g., separate generated_questions table)

2. **RLS policies:** No SQL migration files define RLS; assume configured in Supabase UI or external SQL scripts.

3. **Custom question UI:** Code supports `updateAssignmentCustomQuestions()` but I didn't find a parent-facing UI for post-creation editing of custom questions.

4. **Division multi-digit generation:** `generateDivisionFn` is called but function definition not fully traced. Likely internal generation logic.

5. **Babysitter permissions:** RLS model allows `supervisor_type="babysitter"` but no separate permission layer found; assume parent controls babysitter access.

6. **Homework image storage:** Images uploaded to `assignment-images` bucket in Supabase Storage, but cleanup/lifecycle policies not found.

7. **Plan star tracking:** `awardPlanStarsForAssignment()` is called, but the exact formula (accuracy → stars awarded) is not visible in the code.

---

## 8. FILES TO REFERENCE IN NATIVE PORT

| File | Purpose |
|------|---------|
| `src/lib/db.ts` | All table schemas (AssignmentRow, LearningPlanSession, etc.) + CRUD functions |
| `src/lib/ai.functions.ts` | Question generation & grading (OpenAI integration) |
| `src/routes/parent.tsx` | Assignment creation UI + homework scanning |
| `src/routes/child.$id.index.tsx` | Assignment listing & session start |
| `src/routes/child.$id.custom.tsx` | Custom question playback + grading |
| `src/routes/child.$id.practice.tsx`, `.division.tsx`, etc. | Math assignment playback |
| `src/lib/session-store.ts` | In-memory session state (answers, progress) |
| `supabase/migrations/` | (Sparse) schema snapshots |

---

## Summary

The **assignments/homework feature** is a parent-initiated task system that:

1. **Creates** assignments (subjects, focus, question counts) with optional AI-driven question generation
2. **Links** to learning plans for structured multi-week curricula
3. **Presents** to children as an override to the adaptive selector
4. **Tracks** completion and accuracy per assignment
5. **Rewards** with stars and plan progress

**Key data flows:**
- **Parent → Assignment:** Create via UI or homework scan (image → OpenAI Vision → structured extraction)
- **Assignment → Questions:** Static bank, custom JSONB, or server-side generation (OpenAI text)
- **Child → Answers:** Record per question in `answers`/`learning_attempts` tables
- **Completion → Rewards:** Mark assignment done, award stars, update plan progress

**Integration with native:**
- Query `assignments` table for active missions
- Override next-step selector if missions exist
- Record answers + session end
- Mark completion + award stars

---

*Report generated by: Aaron Buckstein (abuckstein@gmail.com)*  
*Analysis date: 2026-06-09*
