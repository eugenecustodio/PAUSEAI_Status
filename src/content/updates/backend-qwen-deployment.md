---
title: Supabase and Qwen path verified end to end
date: 2026-07-10
category: backend
status: complete
summary: Nine Supabase Edge Functions, owner-scoped RLS, deterministic fallbacks, and strict Qwen classification and digest contracts passed the backend release gate.
authorLabel: PAUSE AI Team
---

PAUSE AI's backend release gate passed against the linked Supabase project. The deployed surface contains **nine Edge Functions**, protected by authentication and row-level security, with **53 backend tests across two suites** validating handler contracts and fallback behavior.

The strict smoke test exercised temporary synthetic users, cross-user RLS denial, device and rule synchronization, zero-retention behavior, classification, digest generation, cloud-data cleanup, and account deletion. Qwen returned the expected provider and model provenance for both classification and digest guidance, while deterministic policy remained responsible for the final broker action.

This release evidence does not make the public dashboard's Qwen result continuously live. Daily synthetic Qwen status will stay marked as pending until the previously exposed provider credential is rotated and the strict backend smoke passes again with its replacement. No Qwen credential is stored in this website or in its GitHub Actions configuration.
