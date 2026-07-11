import type { HealthStatus } from './health.ts';

export const LIVE_FRESHNESS_MS = 2 * 60 * 60 * 1_000;
const MAX_FUTURE_DRIFT_MS = 5 * 60 * 1_000;
const VALID_STATUSES = new Set<HealthStatus>([
  'operational',
  'degraded',
  'outage',
  'unknown',
  'not_configured',
]);

export type CurrentFreshness = {
  isFresh: boolean;
  ageMs: number | null;
  recordedStatus: HealthStatus;
  currentStatus: HealthStatus;
};

export function evaluateStatusFreshness(
  generatedAt: string,
  recordedStatus: HealthStatus,
  nowMs = Date.now(),
  thresholdMs = LIVE_FRESHNESS_MS,
): CurrentFreshness {
  const generatedMs = Date.parse(generatedAt);
  const ageMs = Number.isFinite(generatedMs) ? nowMs - generatedMs : null;
  const isFresh =
    ageMs !== null &&
    ageMs >= -MAX_FUTURE_DRIFT_MS &&
    ageMs <= thresholdMs;

  return {
    isFresh,
    ageMs,
    recordedStatus,
    currentStatus: isFresh ? recordedStatus : 'unknown',
  };
}

/**
 * Re-evaluates every `[data-status-freshness-root]` without making a request.
 *
 * Integration contract:
 * - root: `data-generated-at`, `data-recorded-status`, optional
 *   `data-freshness-threshold-ms`;
 * - mutable status target: `data-current-status`;
 * - text targets: `data-current-status-label`, `data-current-status-summary`,
 *   and `data-current-freshness-label`;
 * - optional alert: `data-stale-notice` (the controller toggles `hidden`).
 *
 * A separate latest-recorded-result element should remain outside these
 * mutable hooks so a stale current state never erases the last probe result.
 */
export function refreshStatusFreshness(root: ParentNode = document, nowMs = Date.now()): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-status-freshness-root]')) {
    const generatedAt = element.dataset.generatedAt ?? '';
    const recorded = element.dataset.recordedStatus;
    const threshold = Number(element.dataset.freshnessThresholdMs);
    const recordedStatus = VALID_STATUSES.has(recorded as HealthStatus)
      ? (recorded as HealthStatus)
      : 'unknown';
    const state = evaluateStatusFreshness(
      generatedAt,
      recordedStatus,
      nowMs,
      Number.isFinite(threshold) && threshold > 0 ? threshold : LIVE_FRESHNESS_MS,
    );

    element.dataset.currentStatus = state.currentStatus;
    element.dataset.currentFreshness = state.isFresh ? 'fresh' : 'stale';

    for (const statusTarget of element.querySelectorAll<HTMLElement>('[data-current-status]')) {
      statusTarget.dataset.healthStatus = state.currentStatus;
      statusTarget.dataset.currentStatus = state.currentStatus;
      statusTarget.setAttribute('aria-label', `Current system status: ${statusLabel(state.currentStatus)}`);
    }
    setText(element, '[data-current-status-label]', statusLabel(state.currentStatus));
    setText(
      element,
      '[data-current-status-summary]',
      state.isFresh
        ? currentSummary(state.currentStatus)
        : `Current health is unknown because the latest live check is older than two hours. The last recorded result was ${statusLabel(recordedStatus).toLowerCase()}.`,
    );
    setText(element, '[data-current-freshness-label]', freshnessLabel(state));

    for (const notice of element.querySelectorAll<HTMLElement>('[data-stale-notice]')) {
      notice.hidden = state.isFresh;
    }
  }
}

export function installStatusFreshnessController(
  root: Document = document,
  intervalMs = 60_000,
): () => void {
  const refresh = () => refreshStatusFreshness(root);
  const onVisibilityChange = () => {
    if (root.visibilityState === 'visible') refresh();
  };
  refresh();
  const interval = window.setInterval(refresh, intervalMs);
  root.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    window.clearInterval(interval);
    root.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

function setText(root: ParentNode, selector: string, value: string): void {
  for (const target of root.querySelectorAll<HTMLElement>(selector)) target.textContent = value;
}

function statusLabel(status: HealthStatus): string {
  return status === 'not_configured'
    ? 'Not configured'
    : status[0].toUpperCase() + status.slice(1);
}

function currentSummary(status: HealthStatus): string {
  if (status === 'operational') return 'Every configured live component passed its latest synthetic check.';
  if (status === 'degraded') return 'A live component responded but did not satisfy its full operating contract.';
  if (status === 'outage') return 'A live component returned confirmed evidence of an outage.';
  if (status === 'not_configured') return 'Live synthetic monitoring is not configured.';
  return 'The latest live check could not establish a reliable current result.';
}

function freshnessLabel(state: CurrentFreshness): string {
  if (state.ageMs === null || state.ageMs < 0) return state.isFresh ? 'Current' : 'Stale · timestamp unavailable';
  const minutes = Math.max(0, Math.floor(state.ageMs / 60_000));
  if (minutes < 1) return state.isFresh ? 'Current · just checked' : 'Stale';
  const age = minutes < 60
    ? `${minutes}m old`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m old`;
  return `${state.isFresh ? 'Current' : 'Stale'} · ${age}`;
}
