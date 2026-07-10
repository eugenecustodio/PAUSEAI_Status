# Contributing to the PAUSE AI status site

This site is public and operationally sensitive. Keep every contribution useful to visitors without turning the repository, build logs, or generated status files into a source of private application data.

## Start locally

```bash
nvm use 22.13.0
npm ci
npm run dev
```

Create a branch, keep changes focused, and run the local release gate before requesting review:

```bash
npm run validate
npm run test:e2e
npm run security:scan
```

Node `22.13.0` is the supported contributor version. Do not solve dependency warnings by forcing an unrelated major upgrade; update the lockfile deliberately and include the validation result in the pull request.

## Add or revise an update

1. Create a descriptive kebab-case `.md` file in `src/content/updates`.
2. Copy the front-matter shape from [README.md](README.md). The schema rejects unknown fields, invalid categories or statuses, malformed dates, and non-URL evidence links.
3. Write a short public narrative: change, evidence, remaining limitation.
4. Label release-gate numbers as release evidence. Do not describe a test count or old smoke result as live health.
5. Link only to material intended to be public. Never link directly to an AAB.
6. Run `npm run check` and inspect the update at both desktop and mobile widths.

Use `complete` only when the scoped update is finished. Use `in_progress` when the main artifact exists but an explicit follow-up gate remains, and `pending` when work has not passed its evidence gate.

## Content and accessibility review

- Use “PAUSE AI” publicly and “AI Boundary Broker for Cross-App Notifications” as the descriptive subtitle.
- Keep headings in semantic order and link text meaningful outside its sentence.
- Do not communicate status through color alone.
- Confirm keyboard focus remains visible and meaningful animation respects reduced-motion preferences.
- Do not add analytics, remote fonts, autoplay audio, a contact form, teammate profiles, a public download, or browser-side Supabase calls.
- Keep `Problems_UI_Related` images and other unapproved source materials out of the repository.

## Health-code changes

Health changes require extra review because an apparently harmless field can publish private data.

- Use only the dedicated synthetic account. Never run probes as a teammate or real user.
- Keep the public `HealthSnapshot`/`HealthCheck` shape allowlisted. Do not serialize arbitrary objects, exception messages, environment entries, provider responses, emails, user IDs, tokens, or notification text.
- Treat timeout, runner, DNS, and network ambiguity as `unknown`, not a confirmed outage.
- Preserve the stale thresholds: two hours for frequent checks and 36 hours for daily Qwen evidence.
- A probe failure must still produce and deploy an honest sanitized snapshot.
- The daily lifecycle must disable Cloud AI and invoke deletion from `finally`, then verify cleanup.
- GitHub Actions must never receive a Supabase service-role key or Qwen/DashScope key.

Production credentials are not available to pull requests. Mock every probe state—including missing configuration, invalid or banned synthetic user, RLS failure, Edge failure, Qwen fallback, cleanup failure, staleness, and malformed history—without making network requests.

## Media changes

Replace `public/media/pause-app-video.mp4` in place so the stable URL remains unchanged. Update its poster when needed, keep playback user-initiated and lazy-loaded, and run the Playwright video fallback checks. Do not commit render caches, source credentials, or an Android application bundle.

## Pull-request checklist

- [ ] `npm run validate` passes on Node 22.13.0.
- [ ] `npm run test:e2e` passes at desktop and mobile widths.
- [ ] `npm run security:scan` reports no secret-shaped material.
- [ ] Direct routes work under `/PAUSEAI_Status/`.
- [ ] Public claims have an evidence kind and honest timestamp or limitation.
- [ ] No credentials, identities, payloads, raw errors, tracking, or downloadable app artifacts were added.
- [ ] New animation and UI work remains keyboard-accessible and reduced-motion safe.

## Security response

If sensitive material reaches a branch or log, stop. Notify the repository owner through the team's existing private channel, rotate or revoke the exposed value at its provider, and clean the complete Git history before deployment. Redaction alone is not credential rotation.
