# PAUSE AI Showcase & Health Dashboard

The public product story and operational evidence site for **PAUSE AI — AI Boundary Broker for Cross-App Notifications**.

Production: <https://eugenecustodio.github.io/PAUSEAI_Status/>

This repository contains only the static showcase, sanitized health data, and team-authored progress updates. It does not distribute the Android bundle, expose the mobile application's private implementation, collect visitor data, or call Supabase from a visitor's browser.

## What the site shows

- A cinematic introduction to PAUSE AI and its “Own the interruption” product story.
- Clearly labelled live, daily, release, and manual evidence on the System Status page.
- Dated progress notes sourced from Markdown in `src/content/updates`.
- An accessible system architecture and a plain-language privacy model.
- A locally hosted, replaceable product video with no autoplay audio or third-party tracking.

“Live” on this site means the latest successful scheduled synthetic probe—not a browser request and not a contractual uptime guarantee. The history reports **probe success rate**. Stale, ambiguous, or missing evidence is shown as such instead of being forced green.

## Local development

Use Node `22.13.0`, which is pinned in `.nvmrc`.

```bash
nvm use
npm ci
npm run dev
```

The local server prints its URL. Production uses the GitHub project-page base path `/PAUSEAI_Status/`; use the site's route helpers for internal links and assets.

Run the complete local gate before opening a pull request:

```bash
npm run validate
npm run test:e2e
npm run security:scan
```

Pull-request checks do not receive production health credentials. The static build must remain useful when probes are not configured.

## Publishing a progress update

Add a Markdown file under `src/content/updates`. Front matter is strictly validated at build time:

```yaml
---
title: A concise public title
date: 2026-07-10
category: milestone # milestone | backend | privacy | release
status: complete # complete | in_progress | pending
summary: One public sentence used on update cards and in metadata.
authorLabel: PAUSE AI Team
evidenceLinks:
  - label: Public evidence label
    url: https://example.com/public-evidence
---
```

Write for a public audience. Include what changed, what evidence exists, and what remains. Do not paste private application source, credentials, account details, raw provider output, notification content, or internal exception text. See [CONTRIBUTING.md](CONTRIBUTING.md) for the review checklist.

## Health operations

The scheduled Pages workflow loads the prior sanitized snapshot, runs due probes, builds the static site, updates the orphan `status-data` branch, and deploys even when a probe is degraded or unknown. Only a dedicated synthetic Supabase account may be used.

Secret setup, manual refresh, status semantics, Qwen enablement, and rollback procedures are documented in [docs/STATUS_OPERATIONS.md](docs/STATUS_OPERATIONS.md). The public data boundary is intentional: health JSON is allowlisted and must never contain credentials, emails, user IDs, notification content, raw responses, or arbitrary error text.

## Media replacement

The product video has a stable public path:

```text
public/media/pause-app-video.mp4
```

Replace that file to publish a future Remotion render without changing page code. Keep the same filename, update the local poster when the visuals change, preserve a vertical mobile-friendly aspect ratio, and verify playback and fallback behavior before merging. Do not add a public AAB to `public/`.

## License and security

Repository visibility does not grant permission to publish the private mobile application or its assets elsewhere. If a credential or sensitive payload appears in a commit, do not merely delete the latest file: stop deployment, rotate the credential, and remove the value from Git history before continuing.
