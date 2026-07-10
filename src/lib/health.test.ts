import { describe, expect, it } from 'vitest';

import {
  aggregateHealthStatus,
  buildHealthSnapshot,
  calculateProbeSuccessRate,
  createFallbackSnapshot,
  createHealthCheck,
  createPendingValidation,
  createReleaseEvidence,
  isCheckStale,
  parseHealthHistory,
  parseHealthSnapshot,
  refreshHealthSnapshot,
  snapshotToSample,
  updateHealthHistory,
} from './health.ts';

const generatedAt = '2026-07-10T08:00:00.000Z';

describe('public health schema', () => {
  it('enforces outage and degraded precedence', () => {
    expect(aggregateHealthStatus(['operational', 'unknown'])).toBe('unknown');
    expect(aggregateHealthStatus(['operational', 'unknown', 'degraded'])).toBe('degraded');
    expect(aggregateHealthStatus(['degraded', 'outage', 'unknown'])).toBe('outage');
    expect(aggregateHealthStatus(['not_configured'])).toBe('not_configured');
  });

  it('rejects unknown fields and arbitrary public summaries', () => {
    const snapshot = createFallbackSnapshot(new Date(generatedAt));
    expect(() => parseHealthSnapshot({ ...snapshot, email: 'forbidden' })).toThrow('unknown_public_field');
    const tampered = structuredClone(snapshot);
    tampered.checks[0]!.summary = 'raw exception: account identifier';
    expect(() => parseHealthSnapshot(tampered)).toThrow('unsafe_check_summary');
  });

  it('marks live evidence stale after two hours and daily evidence after 36 hours', () => {
    const live = createHealthCheck('auth_gateway', 'operational', generatedAt);
    const daily = createHealthCheck('qwen_classification', 'operational', generatedAt);
    expect(isCheckStale(live, new Date('2026-07-10T09:59:59.000Z'))).toBe(false);
    expect(isCheckStale(live, new Date('2026-07-10T10:00:01.000Z'))).toBe(true);
    expect(isCheckStale(daily, new Date('2026-07-11T19:59:59.000Z'))).toBe(false);
    expect(isCheckStale(daily, new Date('2026-07-11T20:00:01.000Z'))).toBe(true);
  });

  it('re-evaluates stored green evidence at read time without trusting its old stale bit', () => {
    const snapshot = buildHealthSnapshot({
      generatedAt,
      checks: [
        createHealthCheck('auth_gateway', 'operational', generatedAt),
        createHealthCheck('synthetic_account', 'operational', generatedAt),
        createHealthCheck('database_rls', 'operational', generatedAt),
        createHealthCheck('edge_functions', 'operational', generatedAt),
      ],
      releaseEvidence: createReleaseEvidence(),
      validationEvidence: createPendingValidation(generatedAt, false),
      now: new Date(generatedAt),
    });
    expect(snapshot.overallStatus).toBe('operational');
    const refreshed = refreshHealthSnapshot(snapshot, new Date('2026-07-10T10:00:01.000Z'));
    expect(refreshed.stale).toBe(true);
    expect(refreshed.overallStatus).toBe('unknown');
  });

  it('retains only seven days of sanitized history and calculates probe success rate', () => {
    const now = new Date('2026-07-10T08:00:00.000Z');
    const recent = createFallbackSnapshot(new Date('2026-07-09T08:00:00.000Z'));
    const old = createFallbackSnapshot(new Date('2026-07-02T07:59:59.000Z'));
    const previous = {
      schemaVersion: 1 as const,
      generatedAt: now.toISOString(),
      samples: [snapshotToSample(old), snapshotToSample(recent)],
    };
    const next = updateHealthHistory(previous, createFallbackSnapshot(now), now);
    expect(next.samples.map((sample) => sample.generatedAt)).toEqual([recent.generatedAt, now.toISOString()]);
    expect(calculateProbeSuccessRate(next)).toEqual({ successful: 0, observed: 0, percentage: null });
  });

  it('rejects malformed or oversized status history', () => {
    const snapshot = createFallbackSnapshot(new Date(generatedAt));
    const history = updateHealthHistory(null, snapshot, new Date(generatedAt));
    expect(() => parseHealthHistory({ ...history, samples: [{ raw: 'provider response' }] }, new Date(generatedAt))).toThrow();
    expect(() => parseHealthHistory({ ...history, unexpected: true }, new Date(generatedAt))).toThrow('unknown_public_field');
  });
});
