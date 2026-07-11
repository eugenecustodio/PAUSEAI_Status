import { describe, expect, it } from 'vitest';

import { evaluateStatusFreshness, LIVE_FRESHNESS_MS } from './statusFreshness.ts';

const generatedAt = '2026-07-11T00:00:00.000Z';
const generatedMs = Date.parse(generatedAt);

describe('browser-safe live freshness', () => {
  it('keeps a recorded result current at one hour and 59 minutes', () => {
    expect(
      evaluateStatusFreshness(generatedAt, 'operational', generatedMs + 119 * 60_000),
    ).toMatchObject({ isFresh: true, currentStatus: 'operational', recordedStatus: 'operational' });
  });

  it('downgrades current status at two hours and one minute without erasing the recorded result', () => {
    expect(
      evaluateStatusFreshness(generatedAt, 'operational', generatedMs + 121 * 60_000),
    ).toMatchObject({ isFresh: false, currentStatus: 'unknown', recordedStatus: 'operational' });
  });

  it('uses an inclusive two-hour freshness boundary and rejects invalid timestamps', () => {
    expect(evaluateStatusFreshness(generatedAt, 'degraded', generatedMs + LIVE_FRESHNESS_MS).isFresh).toBe(true);
    expect(evaluateStatusFreshness('invalid', 'operational', generatedMs)).toMatchObject({
      isFresh: false,
      ageMs: null,
      currentStatus: 'unknown',
    });
  });
});
