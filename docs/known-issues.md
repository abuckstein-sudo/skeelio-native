# Known Issues

## Release Process

- Full TypeScript checking is noisy because Supabase Deno functions and app code share the same check.
- Supabase changes are live-impacting; there is not yet a staging Supabase project.
- EAS/TestFlight is configured, but the first tester setup still depends on App Store Connect state.

## Product

- Parent dashboard progress is useful but not yet deeply explanatory.
- Child homepage can be clearer about next action, completed work, and where rewards fit.
- Worksheet completion review is basic; it should become a proper review screen.
- Error states for scan/upload/generation need friendlier recovery paths.

## Learning

- `conjugation_questions` is the current source of truth, but it needs a deliberate audit and expansion.
- Worksheet generation needs better confidence scoring and fallback behavior.
- Mastery currently counts worksheet activity more simply than the eventual model should.

## Rewards And Objectives

- Stars are tracked in the `rewards` table and shown in the app, but the child-facing shop is not built.
- The child home star-shop button currently leads to a coming-soon alert.
- Parent-created objectives are not yet a complete product surface.
- We need a clear relationship between parent objectives, assignments, stars, rewards, and mastery.

