# Claude review packet: embedded camera sprint

## Goal

Review the `feature/embedded-camera` branch before we reuse the new embedded camera flow in first-assignment and child flows.

## Branch and commits

- Branch: `feature/embedded-camera`
- Base: local `master` after onboarding merge
- Relevant commits:
  - `6a27c81` Configure embedded camera permissions
  - `12b8450` Add reusable embedded camera capture modal
  - `924816f` Wire scan screen to embedded camera modal
  - `8cda53a` Harden embedded camera modal lifecycle
  - `49f6293` Gate embedded camera shutter until ready

Master onboarding merge:

- `69f8121` Merge onboarding carousel UI

## What changed

- Removed the old system-camera path from `app/(app)/scan.tsx` for the main `Take Photo` button.
- Added `components/CameraCaptureModal.tsx`, a reusable full-screen modal built on `expo-camera`.
- The modal supports camera permission prompts, permanently-denied settings recovery, live back-camera view, shutter capture, preview, retake, use photo, and a library shortcut.
- Wired only `scan.tsx` to the new modal.
- Left `processImage` and downstream worksheet absorb/storage flow unchanged.
- Left the existing separate scan-screen library button on its previous `pickImage` path.
- Added `expo-camera` with the SDK-matching version selected by `npx expo install`.
- Updated `app.json` with iOS bundle identifier and camera/photo-library permission strings.
- Configured camera/picker plugins so camera and photo-library usage descriptions are produced, but microphone usage is not.
- Applied Claude's hardening follow-up:
  - `CameraView` now receives `active={visible}` so the camera session is not held active while the modal is closed.
  - Camera capture and library picker async paths now catch failures and show a retryable inline error.
  - The library picker path is guarded against duplicate launches.
  - `scan.tsx` now lets the modal own closing after `onCaptured`; the caller only processes the URI.
  - The shutter is disabled until `CameraView` reports `onCameraReady`.

## Verification

- Aaron tested on iPhone via Expo Go and confirmed the app can access the camera.
- Final `npx tsc --noEmit` result before this packet:
  - Exit code: `2`
  - Error line count: `128`
  - Camera-related errors: none
  - Count unchanged from the known 128-error baseline.
- Permission introspection via `npx expo config --type introspect --json` found:
  - `NSCameraUsageDescription`: `Skeelio uses the camera to capture photos of worksheets so it can build practice from them.`
  - `NSPhotoLibraryUsageDescription`: `Skeelio accesses your photo library so you can choose a worksheet image to turn into practice.`
  - `NSMicrophoneUsageDescription`: none

## Known constraints

- This branch has not yet wired the modal into `assign.tsx` or `ChildDashboardBody`.
- Expo Go can test the JS modal behavior, but native permission strings and bundle identifier matter for dev/TestFlight builds.
- Local npm install had a WSL/Windows node_modules rename issue around the Windows Supabase CLI package. The lockfile was completed with `npm install --package-lock-only --ignore-scripts`, and `expo-camera@17.0.10` was present locally for typechecking.
- Existing TypeScript baseline still has 128 error lines unrelated to this camera work.

## Questions for Claude

1. Do you see any lifecycle or race-condition risks in `CameraCaptureModal.tsx`, especially around closing while capture/library selection is in progress?
2. Is the permission configuration correct for a photo-only iOS camera flow with no microphone prompt?
3. Is the `onCaptured(uri); onClose();` contract clean enough before reusing this modal in first-assignment and child flows?
4. Any UX or architecture concerns before this component becomes the shared photo-capture surface?

## Post-review note

Claude reviewed the first three camera commits and recommended the hardening items now captured in `8cda53a` and `49f6293`. The remaining product decision is whether to make `CameraCaptureModal` the single shared photo surface everywhere, including the library shortcut, before wiring assignment and child-dashboard flows.

## Please do not review

- Generated or ignored local files such as `node_modules`, `.expo`, `dist`, or native build output.
- The known baseline TypeScript errors unless they appear newly related to camera/photo capture.
- Product decisions outside this branch, except where they affect the reusable camera component.
