---
title: Privacy controls now fail closed
date: 2026-07-10
category: privacy
status: complete
summary: Account-scoped queues, zero-hour default retention, explicit Cloud AI consent, safer native event handling, and verifiable deletion closed the highest-risk privacy gaps.
authorLabel: PAUSE AI Team
---

The privacy hardening pass moved PAUSE AI's sensitive paths to fail-closed defaults. Local records and retries are owner-scoped, account changes stop in-flight work, and legacy unscoped data is quarantined. Cloud AI defaults to off and requires explicit consent; a persistent owner-scoped deny latch prevents a missing preference from silently enabling it.

Notification preview retention now defaults to **zero hours**. That preference is reconciled with Supabase, expired cloud previews are purged on a schedule, and digest guidance excludes preview text. Native pending events have an expiry, acknowledgement flow, explicit clearing, and zero-retention scrubbing so a privacy action cannot later resurrect captured content.

Cloud deletion also switches Cloud AI off locally and remotely. The public health system exercises this lifecycle only with a dedicated synthetic account and publishes an allowlisted result—never notification content, account identifiers, provider responses, or credentials.
