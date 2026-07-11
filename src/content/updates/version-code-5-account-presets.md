---
title: Account-synced presets verified in versionCode 5
date: 2026-07-11
category: release
status: complete
summary: Boundary preset duplication now persists through an owner-scoped Supabase path, appears in the existing creation flow, and is included in the finished versionCode 5 production AAB.
authorLabel: PAUSE AI Team
evidenceLinks:
  - label: View the versionCode 5 EAS production build
    url: https://expo.dev/accounts/anothergenee/projects/pause-boundary-broker/builds/8b4b2bf3-4daf-491f-a368-bdc08c98590a
---

PAUSE AI now lets a signed-in person duplicate a boundary into a reusable preset without changing the surrounding mobile interface. The saved preset appears in the existing creation flow and carries the full deterministic policy, including duration, digest timing, and app exceptions.

Presets are written locally first, then synchronized to an owner-scoped Supabase table protected by Row Level Security. An offline duplicate queues for retry; after successful cloud synchronization, the preset returns when the same account signs in after a reinstall. Account changes isolate local data, and privacy export, cloud deletion, and account deletion include the new records.

The release gate passed **429 automated tests across 37 suites**, **53 Supabase contract tests**, TypeScript checks, all **21 Expo Doctor checks**, an Android production export, and a live two-account RLS smoke test. EAS then completed Android **versionCode 5** as a signed production Store AAB. This evidence confirms the build and backend path; it does not claim Google Play publication or representative OEM acceptance testing.
