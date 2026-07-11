# Status operations

This runbook covers the public PAUSE AI health dashboard. It is written for repository maintainers; no production credential value belongs in this file, an issue, a pull request, a command argument, or an Actions log.

## Evidence model

The dashboard intentionally separates four kinds of evidence:

| Kind | What it establishes | Typical age |
| --- | --- | --- |
| Live | Synthetic Auth, profile/RLS, database, and Edge availability checks | Every 30 minutes; stale after 2 hours |
| Daily | Synthetic preset, Qwen classification, digest, zero-retention, and verified cleanup lifecycle | At most every 24 hours when deliberately enabled; stale after 36 hours |
| Release | Test suites, EAS build, native verifier, and retention-job evidence from a named release gate | Changes only when a release is validated |
| Manual | Physical Android/OEM behavior that cannot be proved by CI | Pending until a human records the result |

The status labels mean:

- `operational`: the applicable probe completed and all required assertions passed.
- `degraded`: the system responded but one or more capabilities failed or used a fallback.
- `outage`: a scoped endpoint returned clear, repeatable evidence that the capability is unavailable.
- `unknown`: the runner, network, timeout, or evidence quality prevents a reliable conclusion.
- `not_configured`: a probe is deliberately unavailable because its required setup is absent or disabled.

The history reports **probe success rate**, not contractual uptime. Never relabel release evidence as live or infer an outage from runner ambiguity.

The public current-state label is derived from **live checks only**. Daily AI/privacy evidence can be degraded or unavailable without rewriting the latest Auth/RLS/Edge result. The daily lane must still show its own state prominently. Seven-day success calculations likewise derive only from live component checks, including when older history records contain daily samples.

## Current production release record

`src/data/release.ts` is the canonical public manifest for current release evidence. Update it only after all values have been verified together. Status summaries, proof cards, and build links must derive from that manifest rather than repeating numbers in page files. Historical update articles remain untouched because they describe the release that was current when each article was published.

The current record is PAUSE 0.1.0, Android versionCode 5, 429 mobile tests across 37 suites, 53 backend tests, nine deployed Edge Functions, Expo SDK 56 with Expo Doctor 21/21, verified July 11, 2026.

## Browser freshness contract

The status page installs `FreshnessController.astro`. It makes no fetches: on initial load, once per minute, and whenever the tab becomes visible, it compares the published timestamp with the browser clock. After two hours it changes only the displayed **current** status to Unknown while preserving the latest recorded result.

Any same-origin health preview, including the homepage preview, can opt in without adding another network request:

1. Import and render `FreshnessController.astro` once on the page.
2. Put `data-status-freshness-root`, `data-generated-at`, and `data-recorded-status` on the preview wrapper.
3. Mark the mutable badge with `data-current-status` and its text with `data-current-status-label`.
4. Optionally add `data-current-status-summary`, `data-current-freshness-label`, and a `data-stale-notice` element. Keep latest-recorded-result copy outside those hooks so it is never erased.

The pure `evaluateStatusFreshness` function in `src/lib/statusFreshness.ts` defines the two-hour boundary and is covered at 1:59 and 2:01. Do not implement another freshness timer in a page component.

## Create the synthetic account

Create a dedicated, non-human account through the project's normal Supabase Auth path. Do not reuse a teammate, tester, judge, or production user.

1. Choose a mailbox owned by the team and a unique generated password.
2. Create and confirm the user through normal Supabase Auth. Do not bypass the product's RLS model with a service role.
3. Sign in once and confirm the owner profile can be read only by that account.
4. Ensure the account begins with Cloud AI disabled and zero-hour preview retention.
5. Record the credentials only in GitHub Actions repository secrets as described below.

The account will create disposable preset, boundary, device, rule, notification, and digest data during the daily probe. The probe must delete that data in `finally`, verify every owner-scoped table is empty (including `boundary_presets`), and leave Cloud AI disabled even when an earlier assertion fails.

## Configure GitHub Actions

In **Repository settings → Secrets and variables → Actions**, create exactly these repository secrets:

- `PAUSE_SUPABASE_URL`
- `PAUSE_SUPABASE_ANON_KEY`
- `PAUSE_HEALTH_EMAIL`
- `PAUSE_HEALTH_PASSWORD`

Use the Supabase public project URL and anon key, plus only the dedicated synthetic account. Never add a service-role key or a Qwen/DashScope credential to this repository.

The same setup can be performed without putting values in shell history by running each command and entering its value at the prompt:

```bash
gh secret set PAUSE_SUPABASE_URL
gh secret set PAUSE_SUPABASE_ANON_KEY
gh secret set PAUSE_HEALTH_EMAIL
gh secret set PAUSE_HEALTH_PASSWORD
```

Keep the non-secret Actions variable `PAUSE_DAILY_QWEN_ENABLED` set to `false` initially:

```bash
gh variable set PAUSE_DAILY_QWEN_ENABLED --body false
```

Before changing it to `true`, the Supabase backend owner must rotate the Qwen credential that was previously exposed, update the server-side Supabase function secret, and rerun the strict private backend smoke successfully. The new provider key must stay in Supabase only.

## Run a manual refresh

The Pages workflow supports `auto`, `frequent`, `daily`, and `skip` probe modes.

```bash
# Re-run the safe Auth/RLS/Edge probes now.
gh workflow run pages.yml -f probe_mode=frequent

# Let the workflow decide which probes are due.
gh workflow run pages.yml -f probe_mode=auto

# Build from prior sanitized state without contacting Supabase.
gh workflow run pages.yml -f probe_mode=skip
```

Run the daily lifecycle only after Qwen credential rotation and strict-smoke confirmation:

```bash
gh variable set PAUSE_DAILY_QWEN_ENABLED --body true
gh workflow run pages.yml -f probe_mode=daily
```

Watch the newest run and then inspect both the public page and the sanitized artifact:

```bash
gh run list --workflow pages.yml --limit 3
gh run watch "$(gh run list --workflow pages.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

Confirm that `public/status/current.json` contains only the allowlisted schema, timestamps advance as expected, and no key resembles an email, identity, token, raw response, exception, notification, or environment name. A failed probe is expected to deploy `degraded` or `unknown`; do not suppress deployment to preserve a green screen.

## Investigate a non-operational result

1. Check the evidence kind and checked time. Stale evidence is not a fresh outage.
2. Read the allowlisted public error code and safe summary. Do not add raw exception output to make debugging easier.
3. Review the private Actions log for the failing step, taking care not to echo request headers, bodies, credentials, or provider output.
4. Re-run `frequent` once when runner/network ambiguity is plausible. Repeated, endpoint-specific failures may justify an outage; ambiguous failures remain unknown.
5. For daily failures, first confirm cleanup completed and Cloud AI is off. If cleanup is uncertain, disable daily probing and inspect the synthetic account privately.
6. Correct the service or probe and dispatch a new refresh. Never hand-edit the public snapshot to green.

If the synthetic user is invalid or banned, the Auth gateway can still be reachable while the account check is degraded. Repair or replace only the synthetic user; never switch the workflow to a real account.

## Sanitized state retention

Scheduled runs restore `public/status/current.json` and seven days of half-hour samples from the orphan `status-data` branch. That branch must contain sanitized public state only and must not be merged into `main`. Do not push logs, environment dumps, raw API bodies, or provider payloads to it.

Malformed prior history should be discarded or reduced to `unknown` by the validator, never trusted and rendered directly. Secret scanning and schema validation are release gates for both the site and status state.

## Replace the product video

Render the approved Remotion composition, review it for private or unapproved material, then replace:

```text
public/media/pause-app-video.mp4
```

Keep the filename stable. Replace the poster if the opening frame changes, keep audio user-initiated, and verify desktop/mobile playback plus the no-video fallback. Do not copy the Remotion source tree, render caches, or the Android AAB into this repository.

## Roll back Pages

Prefer a normal revert so `main` and the deployed site remain auditable:

1. In the Actions history, identify the last known-good `pages.yml` run and its commit.
2. Revert the offending merge or commits on a new branch; do not force-push `main` or `status-data`.
3. Run the pull-request checks and merge the revert.
4. If probes are part of the incident, manually dispatch `probe_mode=skip` so the corrected site builds from the last sanitized state.
5. Confirm every direct route under `/PAUSEAI_Status/`, then document the cause and follow-up in a public-safe update if appropriate.

An Actions re-run of an old workflow is useful for diagnosis but is not a durable rollback: the next `main` or scheduled run will deploy again. Restore the intended source on `main`.

## Credential incident

If any credential reaches Git, Actions output, a public JSON file, or a deployed asset:

1. Disable the affected workflow or daily Qwen variable.
2. Rotate/revoke the credential at its provider immediately.
3. Remove it from the full Git history and any retained Actions artifacts/logs.
4. Re-run secret scanning and inspect `dist` plus the `status-data` branch.
5. Restore probing only after a clean replacement and successful private validation.

Deleting the visible line or force-updating the snapshot is not remediation. Assume a public value has been copied.
