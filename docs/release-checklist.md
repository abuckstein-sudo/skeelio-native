# Release Checklist

Use this before pushing a build to TestFlight.

## Preflight

- Confirm the intended release branch is `master`.
- Pull latest changes locally.
- Confirm Supabase-impacting changes are intentional before deploying them.
- Update tester notes if the release changes a visible flow.

## Verify

```bash
npm run lint
npx expo-doctor
npx expo export --platform ios --output-dir /tmp/skeelio-export-test
```

Known caveat: full `npx tsc --noEmit` is not yet a release gate because app TypeScript and Supabase Deno functions are currently checked together.

## Supabase

Deploy only changed edge functions:

```bash
npx supabase functions deploy FUNCTION_NAME --project-ref aalqeqjlspxqhxohubfi
```

Current live project:

- Project ref: `aalqeqjlspxqhxohubfi`
- Release-impacting worksheet functions: `absorb-worksheet`, `generate-practice`, `parent-insight`, `teach`

## Commit

```bash
git status --short --branch
git add ...
git commit -m "Clear release note"
git push origin master
```

## Build And Submit

```bash
source ~/.openclaw/secrets/eas.env
cd /home/aaronb/skeelio-native
npx eas-cli build --platform ios --profile production --auto-submit --wait
```

App Store Connect:

- ASC app id: `6780868103`
- TestFlight: https://appstoreconnect.apple.com/apps/6780868103/testflight/ios

## After Upload

- Wait for Apple processing.
- Add "What to Test" notes.
- Enable the new build for the intended tester group.
- Keep the prior TestFlight build available until the new one installs cleanly.

