# Product Backlog

This is the working product backlog after the first TestFlight candidate.

## Near Term

1. Fix TestFlight-only bugs found by Aaron or family testers.
2. Improve parent dashboard clarity.
3. Improve child homepage assignment flow.
4. Improve worksheet completion/review.
5. Improve scan/upload/generation error recovery.

## Parent Objectives

Parents should be able to create objectives for a child, such as:

- Improve French conjugation this week.
- Finish 3 worksheet sessions.
- Practice spelling words daily.
- Earn enough stars for a chosen reward.

Open design questions:

- Is an objective a lightweight goal or a structured learning plan?
- Does each objective have a due date?
- Do objectives automatically generate assignments?
- Can objectives be linked to scanned worksheets?
- How should progress be shown to parents and children?

Likely data needs:

- Objective title and description.
- Child id.
- Subject/skill area.
- Target count or target stars.
- Optional due date.
- Status: active, completed, paused, archived.
- Optional reward.

## Stars And Shop

Existing pieces:

- Stars are already awarded in several practice flows.
- Stars are stored in `rewards`.
- Child and parent surfaces already display stars.
- Child home has a star-shop button stub.

Desired loop:

1. Child completes meaningful work.
2. Child earns stars.
3. Parent defines rewards or shop items.
4. Child spends or saves stars.
5. Parent approves redemption when needed.

Open design questions:

- Are shop items global per family or per child?
- Are rewards parent-created only, or does the app provide defaults?
- Should redemption require parent approval?
- Are stars spent, or are they milestones?
- How do rewards avoid encouraging rushed low-quality work?

## Learning Quality

- Expand and audit `conjugation_questions`.
- Add better verb metadata: group, tense, regularity, frequency, grade band, allowed/blocked flags.
- Improve worksheet extraction confidence.
- Improve generated practice diversity.
- Make worksheet work feed mastery in a more intentional way.

## Release Infrastructure

- Keep TestFlight release checklist current.
- Consider a staging Supabase project before larger backend changes.
- Split TypeScript checks so app code and Supabase Deno functions are validated correctly.
- Consider EAS Update later for safe JS-only patches, after the TestFlight flow is stable.

