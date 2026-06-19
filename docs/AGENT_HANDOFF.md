# Skeelio Agent Handoff

Last updated: 2026-06-19

## Purpose

Skeelio is an Expo/React Native app backed by Supabase. The product helps parents turn schoolwork into child-friendly practice, track progress, and keep children motivated with stars and rewards.

The two active product pillars are:

- Worksheet/photo tutoring: parents scan or upload worksheets, Skeelio extracts school methods, generates practice, and shows parent-visible proof/progress.
- School homework management: parents capture or type the daily agenda, Skeelio turns it into a child checklist, links or creates practice where possible, tracks time, and supports parent review.

Current high-priority goal: make school homework feel useful and low-friction for Aaron and his wife in Expo Go before pushing more builds to Apple.

## Current Repo State

- Local path: `/home/aaronb/skeelio-native`
- Current branch: `feature/onboarding-child-settings`
- Latest known commit: `b6d2a23 Polish parent homework preview flow`
- Current uncommitted work includes this handoff document and the 2026-06-19 mastery/evidence-source changes unless a later message says they were committed.
- Apple/TestFlight latest submitted build in this sprint: iOS build number `5`, commit `561398f Organize parent home and link generic homework practice`.
- Latest local/GitHub app changes after that TestFlight build are on `feature/onboarding-child-settings`; they were not pushed to Apple unless a later message says otherwise.

Use Expo SDK 54 docs before changing Expo APIs. The repo `AGENTS.md` says:

```text
# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.
```

## Stack

- Expo `~54.0.34`
- Expo Router `~6.0.23`
- React `19.1.0`
- React Native `0.81.5`
- Supabase JS `^2.107.0`
- TypeScript `~5.9.2`
- Main scripts:
  - `npm run lint`
  - `npx expo start --tunnel --clear`
  - `npx expo export --platform ios --output-dir /tmp/skeelio-local-export-test`
  - `npx tsc --noEmit` exists but currently fails on known unrelated baseline errors.

Important local dev note: Expo Go should use the `exp://...` URL. Opening the `https://...exp.direct` URL directly can hit the web renderer, and this app's web path has crashed around AsyncStorage.

## Important Files

- Parent dashboard: `app/(app)/parent.tsx`
- Child dashboard route: `app/(app)/child-home/[childId].tsx`
- Child dashboard body: `components/ChildDashboardBody.tsx`
- Assignment creator/tools: `app/(app)/assign.tsx`
- Homework practice route: `app/(app)/homework/[assignmentId].tsx`
- Scan route: `app/(app)/scan.tsx`
- Embedded camera modal: `components/CameraCaptureModal.tsx`
- School homework parent UI: `components/SchoolHomeworkManager.tsx`
- School homework logic/parser/storage helpers: `lib/schoolHomework.ts`
- Homework timer/lock helpers: `lib/homeworkTime.ts`
- Assignments: `lib/assignments.ts`
- Spelling lists/practice: `lib/spelling.ts`
- Rewards/shop parent manager: `components/RewardsManager.tsx`
- Supabase client: `lib/supabase.ts`
- Homework agenda extraction edge function: `supabase/functions/extract-school-homework/index.ts`
- Worksheet/practice generation edge function: `supabase/functions/generate-practice/index.ts`
- Math mastery config/gates: `lib/masteryConfig.ts`, `lib/tutorConfig.ts`, `lib/tutor/ability.ts`

## Recent Product Decisions

- School homework is not just another generated assignment. It has its own dated layer:
  - `school_homework_days`
  - `school_homework_items`
  - `school_homework_materials`
  - `child_homework_limits`
- Generated assignments may be linked from homework items via `linked_assignment_id`, but the agenda/checklist remains the source of truth for the child daily flow.
- Parent dashboard tab labels/roles:
  - `Homework`: daily school agenda/homework manager only.
  - `Assign`: opens assignment tools directly.
  - `Progress`: child snapshot and proof/progress sections.
  - `Rewards`: reward manager/shop controls.
- Saved homework days should look compact and finished in parent view, similar to the child dashboard, with an edit action to reopen the full input/material workflow.
- Agenda sharing should use the native share sheet and clearly say it was sent from Skeelio. The current reliable version shares organized text plus signed links for uploaded attachments.
- Signature tasks are parent-only tasks and should not become child homework practice.
- Touching outside the child PIN modal should dismiss it.
- The child profile control in the parent dashboard should use a pencil/edit icon, not a gear.
- Reward deletion should use a trash icon and language-appropriate confirmation text.

## School Homework Behavior

Parents can save homework for a selected date manually or from an agenda photo. The date selector supports week navigation and future-day entry.

Parser examples and behavior:

- `relire R22 à R24` or reading-like text becomes `reading` and usually needs material.
- `Pratique Liste 26` becomes `spelling`, tries to match an existing saved spelling list, and needs material if no list is found.
- `Tables multiplication par coeur 1x à 5x`, `Table 6`, `9x`, etc. become multiplication practice when tables are detected.
- Division text becomes `division`; division table support exists in the parser path.
- `Faire signer quiz 4` and typo-tolerant variants become `signature` and are marked `waiting_parent`.
- Worksheet-like lines containing terms such as `fiche`, `worksheet`, `cahier`, `exercice`, or `page` become `worksheet` and need material.
- Generic items can now be connected to setup actions including photo, document, text, and practice creation.

Material support:

- Photo attachments are uploaded to the Supabase `worksheets` storage bucket.
- Document attachments are uploaded to the same bucket.
- Text materials are saved in `school_homework_materials.text_content`.
- New uploaded photos/documents can be shared later via signed URLs.
- Older inline photo materials may not have a shareable storage URL.

Homework time:

- Parents can set a daily homework minute limit.
- Active homework time is tracked in `school_homework_days.total_active_seconds`.
- When a child reaches the limit, the app can lock the child out until parent unlocks or next day.
- Parent UI has "Unlock today".

## Math Mastery And Advancement

The adaptive math ladder uses unaided evidence only: opening a hint before answering keeps the attempt as practice, but not as mastery credit. Current gate values are centralized in `lib/masteryConfig.ts`:

- 12 weighted unaided evidence points required per tier.
- 85% weighted unaided correctness required.
- At least 6 non-homework unaided attempts required before advancement.
- Evidence weights:
  - adaptive practice: 1.0
  - assigned homework: 0.5
  - word problems: 1.0
  - legacy/unknown: 1.0
- Fact tiers now require coverage of the relevant fact groups instead of the old always-true coverage flag.

This means parent-assigned homework can reinforce progress, but it should no longer promote a child by itself. Legacy attempts with no `evidence_source` are treated as `unknown` so existing children do not lose already-recorded progress.

## Supabase Changes In This Sprint

Relevant migrations include:

- `20260617113000_school_homework_days.sql`
- `20260617122000_school_homework_materials.sql`
- `20260617131000_school_homework_division_kind.sql`
- `20260617133500_child_homework_limits.sql`
- `20260618140000_school_homework_documents.sql`
- `20260619114500_learning_attempt_evidence_source.sql`
- `20260616132000_objectives_star_shop.sql`

Relevant edge functions:

- `generate-practice`: used for worksheet/photo generated practice; was deployed during the CE1 worksheet calibration work.
- `extract-school-homework`: accepts agenda image base64 and returns strict JSON with `items`, `rawText`, and `language`.

Do not print or commit env values. Local `.env.local` exists in the working setup for Supabase public env vars and should remain ignored.

## Recent Commit Trail

Most recent commits on `feature/onboarding-child-settings`:

- `b6d2a23 Polish parent homework preview flow`
- `561398f Organize parent home and link generic homework practice`
- `bdf1575 Add document uploads for school homework`
- `a36facb Add agenda photo homework extraction`
- `53ff58c Fix spelling homework photo routing`
- `68d99ad Create spelling practice from homework photos`
- `e16912d Add homework summary and spelling setup`
- `ec7d8a6 Fix homework timer focus and image viewer`
- `2976310 Add homework timer limits`
- `560499c Improve homework parser and materials`
- `c961cd4 Polish weekly school homework`
- `36449d5 Add school homework materials`
- `3f98cf7 Classify extracted table homework`
- `04bb909 Recognize single-table homework`
- `484b4c8 Link school homework practice`
- `255f646 Add manual school homework checklist`
- `cb735dd Calibrate CE1 worksheet practice`

## Verification Baseline

Recent checks reported during the sprint:

- `npm run lint` passes with existing warnings.
- `npx expo export --platform ios --output-dir /tmp/skeelio-local-export-test` passed after the parent homework preview/share changes.
- `npx tsc --noEmit` still fails because of unrelated pre-existing TypeScript errors elsewhere in the repo. Do not assume a new change caused all TS output; inspect touched-file errors specifically.
- Earlier `deno check` could not run locally because `deno` was not installed.

## Known Risks And Constraints

- Full TypeScript baseline is noisy. Use focused checks around touched files/functions, plus lint/export, until the baseline is cleaned.
- Expo tunnel reliability has been flaky at times. Persistent `tmux` sessions helped keep Metro/tunnel alive.
- Use the native `exp://` Expo Go URL, not the web URL.
- Sharing multiple physical files in one native share action is platform-dependent. Current implementation intentionally uses text plus signed attachment links.
- Signed attachment links depend on materials having storage paths. Inline legacy image data cannot be shared as a URL.
- The homework agenda extraction uses an OpenAI vision call through Supabase edge functions; failures should surface as retryable parent-facing errors.
- Expo Go can test JS behavior, but native permission strings and bundle identifiers matter for development/TestFlight builds.

## Likely Next Tasks

- Have Aaron and his wife test the current parent Homework tab in Expo Go.
- Fix any UI issues in the saved/compact homework day presentation.
- Validate agenda sharing on iOS share sheet with WhatsApp, Mail, Telegram, and iMessage.
- Check that uploaded image/document signed links open correctly for recipients.
- Validate child dashboard flow for:
  - linked multiplication practice,
  - linked spelling practice,
  - reading/worksheet material opening,
  - signature tasks staying parent-only,
  - daily lockout/unlock behavior.
- Consider a richer share export later, such as a single generated PDF, if text plus links is not enough.
- Continue avoiding Apple/TestFlight pushes until Aaron explicitly asks.

## How To Resume Safely

1. Check status:

   ```bash
   cd /home/aaronb/skeelio-native
   git status --short --branch
   ```

2. Confirm branch:

   ```bash
   git checkout feature/onboarding-child-settings
   git pull --ff-only origin feature/onboarding-child-settings
   ```

3. Start Expo Go:

   ```bash
   npx expo start --tunnel --clear
   ```

4. For validation:

   ```bash
   npm run lint
   npx expo export --platform ios --output-dir /tmp/skeelio-local-export-test
   ```

5. If doing Supabase work, inspect existing migrations/functions first, preserve deployed behavior, and do not expose secrets in logs or chat.

## Older Claude Packet

There is an older narrow review packet at `docs/claude-review-embedded-camera.md`. It focuses on the embedded camera sprint and is still useful for camera lifecycle/permission context, but it is not a full current project handoff.
