import { currentRelease } from '../data/release.ts';

export const HEALTH_SCHEMA_VERSION = 1 as const;

export const HEALTH_STATUSES = ['operational', 'degraded', 'outage', 'unknown', 'not_configured'] as const;
export const EVIDENCE_KINDS = ['live', 'daily', 'release', 'manual'] as const;
export const PUBLIC_ERROR_CODES = [
  'configuration_missing',
  'auth_service_error',
  'health_account_unavailable',
  'health_account_disabled',
  'database_service_error',
  'rls_contract_failed',
  'edge_service_error',
  'edge_contract_failed',
  'network_ambiguous',
  'probe_timeout',
  'response_invalid',
  'daily_disabled',
  'qwen_fallback',
  'qwen_model_invalid',
  'qwen_digest_invalid',
  'cleanup_failed',
  'retention_contract_failed',
  'history_invalid',
  'probe_internal_error',
] as const;

export type HealthStatus = (typeof HEALTH_STATUSES)[number];
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export type PublicErrorCode = (typeof PUBLIC_ERROR_CODES)[number];

export type HealthCheck = {
  id: HealthCheckId;
  label: string;
  status: HealthStatus;
  evidenceKind: EvidenceKind;
  checkedAt: string;
  latencyMs?: number;
  summary: string;
  errorCode?: PublicErrorCode;
};

export type HealthSnapshot = {
  schemaVersion: typeof HEALTH_SCHEMA_VERSION;
  generatedAt: string;
  overallStatus: HealthStatus;
  stale: boolean;
  checks: HealthCheck[];
  releaseEvidence: HealthCheck[];
  validationEvidence: HealthCheck[];
};

export type HealthSampleCheck = Pick<HealthCheck, 'id' | 'status' | 'checkedAt'> & {
  latencyMs?: number;
};

export type HealthSample = {
  generatedAt: string;
  overallStatus: HealthStatus;
  stale: boolean;
  checks: HealthSampleCheck[];
};

export type HealthHistory = {
  schemaVersion: typeof HEALTH_SCHEMA_VERSION;
  generatedAt: string;
  samples: HealthSample[];
};

type CheckDefinition = {
  label: string;
  evidenceKind: EvidenceKind;
  summaries: Record<HealthStatus, string>;
};

const commonNotConfigured = 'Synthetic health monitoring is not configured.';

export const CHECK_DEFINITIONS = {
  auth_gateway: {
    label: 'Supabase Auth gateway',
    evidenceKind: 'live',
    summaries: {
      operational: 'Supabase Auth answered the latest synthetic reachability probe.',
      degraded: 'Supabase Auth answered with a service-level error.',
      outage: 'Supabase Auth returned a confirmed service outage.',
      unknown: 'Supabase Auth could not be verified from the latest runner.',
      not_configured: commonNotConfigured,
    },
  },
  synthetic_account: {
    label: 'Synthetic health account',
    evidenceKind: 'live',
    summaries: {
      operational: 'The dedicated synthetic account signed in and is active.',
      degraded: 'The synthetic account could not complete sign-in.',
      outage: 'The synthetic account is confirmed unavailable.',
      unknown: 'Synthetic account state could not be verified.',
      not_configured: commonNotConfigured,
    },
  },
  database_rls: {
    label: 'Database and Row Level Security',
    evidenceKind: 'live',
    summaries: {
      operational: 'The synthetic owner profile was read through Row Level Security.',
      degraded: 'The owner-scoped RLS query did not pass validation.',
      outage: 'Supabase returned a confirmed database service outage.',
      unknown: 'Database and RLS health could not be verified.',
      not_configured: commonNotConfigured,
    },
  },
  edge_functions: {
    label: 'Edge Function availability',
    evidenceKind: 'live',
    summaries: {
      operational: 'All nine deployed Edge Functions answered safe availability checks.',
      degraded: 'At least one Edge Function failed its availability contract.',
      outage: 'Edge Functions returned a confirmed service outage.',
      unknown: 'Edge Function availability could not be verified.',
      not_configured: commonNotConfigured,
    },
  },
  qwen_classification: {
    label: 'Qwen classification',
    evidenceKind: 'daily',
    summaries: {
      operational: 'Qwen provenance and model validation passed on synthetic content.',
      degraded: 'The classifier used its deterministic safety fallback instead of Qwen.',
      outage: 'The daily classification endpoint returned a confirmed service outage.',
      unknown: 'Daily Qwen classification has not been verified.',
      not_configured: 'Daily Qwen verification is disabled; no current daily result is available.',
    },
  },
  qwen_digest: {
    label: 'Qwen digest guidance',
    evidenceKind: 'daily',
    summaries: {
      operational: 'Qwen digest guidance passed model and persistence validation.',
      degraded: 'Digest generation used deterministic guidance instead of Qwen.',
      outage: 'The daily digest endpoint returned a confirmed service outage.',
      unknown: 'Daily Qwen digest guidance has not been verified.',
      not_configured: 'Daily Qwen verification is disabled; no current daily result is available.',
    },
  },
  privacy_cleanup: {
    label: 'Zero-retention cleanup',
    evidenceKind: 'daily',
    summaries: {
      operational: 'Synthetic cloud data was deleted and Cloud AI was left disabled.',
      degraded: 'The synthetic cleanup lifecycle did not complete.',
      outage: 'Synthetic privacy cleanup failed after a daily probe.',
      unknown: 'The daily synthetic cleanup lifecycle has not been verified.',
      not_configured: 'Daily privacy lifecycle validation is disabled; no current daily result is available.',
    },
  },
  mobile_tests: {
    label: 'Mobile application tests',
    evidenceKind: 'release',
    summaries: {
      operational: `${currentRelease.mobileTests.tests} mobile tests across ${currentRelease.mobileTests.suites} suites passed in the release gate.`,
      degraded: 'The mobile release test gate reported failures.',
      outage: 'The mobile release test gate did not complete.',
      unknown: 'Mobile release test evidence is unavailable.',
      not_configured: 'Mobile release tests are not configured.',
    },
  },
  backend_tests: {
    label: 'Backend handler tests',
    evidenceKind: 'release',
    summaries: {
      operational: `${currentRelease.backendTests} Supabase contract and handler tests passed in the release gate.`,
      degraded: 'The backend release test gate reported failures.',
      outage: 'The backend release test gate did not complete.',
      unknown: 'Backend release test evidence is unavailable.',
      not_configured: 'Backend release tests are not configured.',
    },
  },
  edge_release: {
    label: 'Deployed Edge Functions',
    evidenceKind: 'release',
    summaries: {
      operational: `${currentRelease.edgeFunctionCount} production Edge Functions are recorded in release evidence.`,
      degraded: 'The Edge Function release inventory is incomplete.',
      outage: 'The Edge Function release was not completed.',
      unknown: 'Edge Function release evidence is unavailable.',
      not_configured: 'Edge Function deployment is not configured.',
    },
  },
  expo_sdk: {
    label: 'Expo SDK release gate',
    evidenceKind: 'release',
    summaries: {
      operational: `Expo SDK ${currentRelease.expo.sdk} and Expo Doctor ${currentRelease.expo.doctorPassed} of ${currentRelease.expo.doctorTotal} are verified.`,
      degraded: 'The Expo SDK release gate reported warnings.',
      outage: 'The Expo SDK release gate failed.',
      unknown: 'Expo SDK release evidence is unavailable.',
      not_configured: 'Expo release validation is not configured.',
    },
  },
  android_build: {
    label: 'Android production build',
    evidenceKind: 'release',
    summaries: {
      operational: `PAUSE ${currentRelease.version} Android versionCode ${currentRelease.androidVersionCode} production AAB completed on EAS.`,
      degraded: 'The Android release build completed with unresolved checks.',
      outage: 'The Android release build failed.',
      unknown: 'Android build evidence is unavailable.',
      not_configured: 'Android production builds are not configured.',
    },
  },
  retention_job: {
    label: 'Retention cleanup job',
    evidenceKind: 'release',
    summaries: {
      operational: 'The cloud preview-retention cleanup job passed release validation.',
      degraded: 'The retention cleanup release validation reported a warning.',
      outage: 'The retention cleanup release validation failed.',
      unknown: 'Retention cleanup release evidence is unavailable.',
      not_configured: 'Retention cleanup scheduling is not configured.',
    },
  },
  physical_android_qa: {
    label: 'Physical Android and OEM QA',
    evidenceKind: 'manual',
    summaries: {
      operational: 'Physical Android and OEM behavior has been manually verified.',
      degraded: 'Physical Android QA found behavior requiring follow-up.',
      outage: 'Physical Android QA found a release-blocking failure.',
      unknown: 'The latest physical Android QA result is unknown.',
      not_configured: 'Physical Android and OEM QA remains a manual pending check.',
    },
  },
} as const satisfies Record<string, CheckDefinition>;

export type HealthCheckId = keyof typeof CHECK_DEFINITIONS;

const ERROR_SUMMARY_OVERRIDES: Partial<
  Record<HealthCheckId, Partial<Record<PublicErrorCode, string>>>
> = {
  qwen_classification: {
    qwen_fallback: 'The classifier used its deterministic safety fallback instead of Qwen.',
    qwen_model_invalid: 'Qwen provenance or model validation did not pass.',
    retention_contract_failed: 'Zero-retention validation did not pass after synthetic classification.',
    response_invalid: 'The daily classification response did not pass its public contract.',
    edge_service_error: 'The daily classification lifecycle did not complete at the Edge layer.',
    database_service_error: 'The daily classification setup could not be verified in the database.',
    rls_contract_failed: 'The daily classification setup did not pass owner-scoped validation.',
    probe_internal_error: 'The daily classification lifecycle did not complete.',
  },
  qwen_digest: {
    qwen_fallback: 'Digest generation used deterministic guidance instead of Qwen.',
    qwen_digest_invalid: 'Qwen digest provenance or model validation did not pass.',
    edge_service_error: 'The daily digest lifecycle did not complete at the Edge layer.',
    retention_contract_failed: 'Digest validation was skipped after retention validation failed.',
    probe_internal_error: 'The daily digest lifecycle did not complete.',
  },
};

const healthStatusSet = new Set<string>(HEALTH_STATUSES);
const evidenceKindSet = new Set<string>(EVIDENCE_KINDS);
const publicErrorCodeSet = new Set<string>(PUBLIC_ERROR_CODES);
const checkIdSet = new Set<string>(Object.keys(CHECK_DEFINITIONS));
const LIVE_STALE_MS = 2 * 60 * 60 * 1_000;
const DAILY_STALE_MS = 36 * 60 * 60 * 1_000;
const HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_HISTORY_SAMPLES = 512;

export function createHealthCheck(
  id: HealthCheckId,
  status: HealthStatus,
  checkedAt: string,
  options: { latencyMs?: number; errorCode?: PublicErrorCode } = {},
): HealthCheck {
  const definition = CHECK_DEFINITIONS[id];
  const summary = resolveCheckSummary(id, status, options.errorCode);
  const check: HealthCheck = {
    id,
    label: definition.label,
    status,
    evidenceKind: definition.evidenceKind,
    checkedAt: requireIsoDate(checkedAt, 'checkedAt'),
    summary,
  };

  if (options.latencyMs !== undefined) {
    check.latencyMs = requireLatency(options.latencyMs);
  }

  if (options.errorCode !== undefined) {
    if (!publicErrorCodeSet.has(options.errorCode)) {
      throw new Error('invalid_public_error_code');
    }
    check.errorCode = options.errorCode;
  }

  return check;
}

export function createReleaseEvidence(checkedAt = currentRelease.verifiedAt): HealthCheck[] {
  return [
    createHealthCheck('mobile_tests', 'operational', checkedAt),
    createHealthCheck('backend_tests', 'operational', checkedAt),
    createHealthCheck('edge_release', 'operational', checkedAt),
    createHealthCheck('expo_sdk', 'operational', checkedAt),
    createHealthCheck('android_build', 'operational', checkedAt),
    createHealthCheck('retention_job', 'operational', checkedAt),
    createHealthCheck('physical_android_qa', 'not_configured', checkedAt),
  ];
}

export function createPendingValidation(checkedAt: string, enabled: boolean): HealthCheck[] {
  const status = enabled ? 'unknown' : 'not_configured';
  const errorCode = enabled ? undefined : ('daily_disabled' as const);
  return [
    createHealthCheck('qwen_classification', status, checkedAt, { errorCode }),
    createHealthCheck('qwen_digest', status, checkedAt, { errorCode }),
    createHealthCheck('privacy_cleanup', status, checkedAt, { errorCode }),
  ];
}

export function createFallbackSnapshot(now = new Date()): HealthSnapshot {
  const checkedAt = now.toISOString();
  return buildHealthSnapshot({
    generatedAt: checkedAt,
    checks: [
      createHealthCheck('auth_gateway', 'unknown', checkedAt, { errorCode: 'network_ambiguous' }),
      createHealthCheck('synthetic_account', 'unknown', checkedAt, { errorCode: 'probe_internal_error' }),
      createHealthCheck('database_rls', 'unknown', checkedAt, { errorCode: 'probe_internal_error' }),
      createHealthCheck('edge_functions', 'unknown', checkedAt, { errorCode: 'probe_internal_error' }),
    ],
    releaseEvidence: createReleaseEvidence(),
    validationEvidence: createPendingValidation(checkedAt, false),
    now,
  });
}

export function buildHealthSnapshot(input: {
  generatedAt: string;
  checks: HealthCheck[];
  releaseEvidence: HealthCheck[];
  validationEvidence: HealthCheck[];
  now?: Date;
}): HealthSnapshot {
  const generatedAt = requireIsoDate(input.generatedAt, 'generatedAt');
  const now = input.now ?? new Date(generatedAt);
  const checks = input.checks.map(parseHealthCheck);
  const releaseEvidence = input.releaseEvidence.map(parseHealthCheck);
  const validationEvidence = input.validationEvidence.map(parseHealthCheck);
  const liveChecks = checks.filter((check) => check.evidenceKind === 'live' && check.status !== 'not_configured');
  const stale = isSnapshotStale({ generatedAt, checks, validationEvidence }, now);
  const effectiveStatuses = liveChecks.map((check) =>
    isCheckStale(check, now) ? ('unknown' as const) : check.status,
  );

  return {
    schemaVersion: HEALTH_SCHEMA_VERSION,
    generatedAt,
    overallStatus: aggregateHealthStatus(effectiveStatuses.length > 0 ? effectiveStatuses : ['not_configured']),
    stale,
    checks,
    releaseEvidence,
    validationEvidence,
  };
}

export function aggregateHealthStatus(statuses: readonly HealthStatus[]): HealthStatus {
  if (statuses.includes('outage')) return 'outage';
  if (statuses.includes('degraded')) return 'degraded';
  if (statuses.includes('unknown')) return 'unknown';
  if (statuses.includes('operational')) return 'operational';
  return 'not_configured';
}

export function isCheckStale(check: Pick<HealthCheck, 'evidenceKind' | 'checkedAt' | 'status'>, now = new Date()): boolean {
  if (check.status === 'not_configured' || (check.evidenceKind !== 'live' && check.evidenceKind !== 'daily')) {
    return false;
  }

  const checkedAt = Date.parse(check.checkedAt);
  if (!Number.isFinite(checkedAt)) return true;
  const age = now.getTime() - checkedAt;
  if (age < -5 * 60 * 1_000) return true;
  return age > (check.evidenceKind === 'live' ? LIVE_STALE_MS : DAILY_STALE_MS);
}

export function isSnapshotStale(
  snapshot: Pick<HealthSnapshot, 'generatedAt' | 'checks' | 'validationEvidence'>,
  now = new Date(),
): boolean {
  const generatedAge = now.getTime() - Date.parse(snapshot.generatedAt);
  if (!Number.isFinite(generatedAge) || generatedAge > LIVE_STALE_MS || generatedAge < -5 * 60 * 1_000) return true;
  return snapshot.checks.some((check) => check.evidenceKind === 'live' && isCheckStale(check, now));
}

export function parseHealthSnapshot(value: unknown): HealthSnapshot {
  const record = requireStrictObject(value, [
    'schemaVersion',
    'generatedAt',
    'overallStatus',
    'stale',
    'checks',
    'releaseEvidence',
    'validationEvidence',
  ]);

  if (record.schemaVersion !== HEALTH_SCHEMA_VERSION) throw new Error('unsupported_health_schema');
  const generatedAt = requireIsoDate(record.generatedAt, 'generatedAt');
  const checks = requireArray(record.checks, 'checks').map(parseHealthCheck);
  const releaseEvidence = requireArray(record.releaseEvidence, 'releaseEvidence').map(parseHealthCheck);
  const validationEvidence = requireArray(record.validationEvidence, 'validationEvidence').map(parseHealthCheck);
  if (!healthStatusSet.has(String(record.overallStatus))) throw new Error('invalid_overall_status');
  if (typeof record.stale !== 'boolean') throw new Error('invalid_stale_flag');

  const rebuilt = buildHealthSnapshot({ generatedAt, checks, releaseEvidence, validationEvidence, now: new Date(generatedAt) });
  if (rebuilt.overallStatus !== record.overallStatus || rebuilt.stale !== record.stale) {
    throw new Error('inconsistent_health_snapshot');
  }
  return rebuilt;
}

/**
 * Validates persisted status at its generation time, then re-evaluates its
 * freshness against the reader's clock. This prevents an old green snapshot
 * from remaining green merely because its persisted `stale` bit was false.
 */
export function refreshHealthSnapshot(value: unknown, now = new Date()): HealthSnapshot {
  const stored = parseHealthSnapshot(value);
  return buildHealthSnapshot({
    generatedAt: stored.generatedAt,
    checks: stored.checks,
    releaseEvidence: stored.releaseEvidence,
    validationEvidence: stored.validationEvidence,
    now,
  });
}

export function parseHealthCheck(value: unknown): HealthCheck {
  const record = requireStrictObject(value, [
    'id',
    'label',
    'status',
    'evidenceKind',
    'checkedAt',
    'latencyMs',
    'summary',
    'errorCode',
  ], true);
  if (!checkIdSet.has(String(record.id))) throw new Error('invalid_check_id');
  if (!healthStatusSet.has(String(record.status))) throw new Error('invalid_check_status');
  if (!evidenceKindSet.has(String(record.evidenceKind))) throw new Error('invalid_evidence_kind');

  const id = record.id as HealthCheckId;
  const status = record.status as HealthStatus;
  const definition = CHECK_DEFINITIONS[id];
  if (record.label !== definition.label || record.evidenceKind !== definition.evidenceKind) {
    throw new Error('invalid_check_metadata');
  }
  const errorCode =
    record.errorCode === undefined
      ? undefined
      : publicErrorCodeSet.has(String(record.errorCode))
        ? (record.errorCode as PublicErrorCode)
        : null;
  if (errorCode === null) throw new Error('invalid_public_error_code');
  const summary = resolveCheckSummary(id, status, errorCode);
  if (record.summary !== summary) throw new Error('unsafe_check_summary');

  const check: HealthCheck = {
    id,
    label: definition.label,
    status,
    evidenceKind: definition.evidenceKind,
    checkedAt: requireIsoDate(record.checkedAt, 'checkedAt'),
    summary,
  };
  if (record.latencyMs !== undefined) check.latencyMs = requireLatency(record.latencyMs);
  if (errorCode !== undefined) check.errorCode = errorCode;
  return check;
}

export function snapshotToSample(snapshot: HealthSnapshot): HealthSample {
  const parsed = parseHealthSnapshot(snapshot);
  return {
    generatedAt: parsed.generatedAt,
    overallStatus: parsed.overallStatus,
    stale: parsed.stale,
    checks: parsed.checks
      .filter((check) => check.evidenceKind === 'live')
      .map(({ id, status, checkedAt, latencyMs }) => ({
        id,
        status,
        checkedAt,
        ...(latencyMs === undefined ? {} : { latencyMs }),
      })),
  };
}

export function updateHealthHistory(
  previous: HealthHistory | null,
  snapshot: HealthSnapshot,
  now = new Date(snapshot.generatedAt),
): HealthHistory {
  const parsedPrevious = previous ? parseHealthHistory(previous, now) : null;
  const next = [...(parsedPrevious?.samples ?? []), snapshotToSample(snapshot)];
  const cutoff = now.getTime() - HISTORY_WINDOW_MS;
  const unique = new Map<string, HealthSample>();

  for (const sample of next) {
    const timestamp = Date.parse(sample.generatedAt);
    if (timestamp >= cutoff && timestamp <= now.getTime() + 5 * 60 * 1_000) unique.set(sample.generatedAt, sample);
  }

  return {
    schemaVersion: HEALTH_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    samples: [...unique.values()]
      .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt))
      .slice(-MAX_HISTORY_SAMPLES),
  };
}

export function parseHealthHistory(value: unknown, now = new Date()): HealthHistory {
  const record = requireStrictObject(value, ['schemaVersion', 'generatedAt', 'samples']);
  if (record.schemaVersion !== HEALTH_SCHEMA_VERSION) throw new Error('unsupported_history_schema');
  const generatedAt = requireIsoDate(record.generatedAt, 'generatedAt');
  const samples = requireArray(record.samples, 'samples').map(parseHealthSample);
  const cutoff = now.getTime() - HISTORY_WINDOW_MS;
  const seen = new Set<string>();

  const retainedSamples: HealthSample[] = [];
  for (const sample of samples) {
    const timestamp = Date.parse(sample.generatedAt);
    if (timestamp > now.getTime() + 5 * 60 * 1_000) throw new Error('history_sample_out_of_window');
    if (timestamp < cutoff) continue;
    if (seen.has(sample.generatedAt)) throw new Error('duplicate_history_sample');
    seen.add(sample.generatedAt);
    retainedSamples.push(sample);
  }
  if (retainedSamples.length > MAX_HISTORY_SAMPLES) throw new Error('history_too_large');

  return {
    schemaVersion: HEALTH_SCHEMA_VERSION,
    generatedAt,
    samples: retainedSamples.sort((left, right) => left.generatedAt.localeCompare(right.generatedAt)),
  };
}

export function calculateProbeSuccessRate(history: HealthHistory): { successful: number; observed: number; percentage: number | null } {
  const parsed = parseHealthHistory(history, new Date(history.generatedAt));
  const statuses = parsed.samples.map(liveSampleStatus);
  const determinate = statuses.filter((status) =>
    status === 'operational' || status === 'degraded' || status === 'outage',
  );
  const successful = determinate.filter((status) => status === 'operational').length;
  return {
    successful,
    observed: determinate.length,
    percentage: determinate.length === 0 ? null : Math.round((successful / determinate.length) * 1_000) / 10,
  };
}

/** Derives history from live checks only, including legacy samples containing daily checks. */
export function liveSampleStatus(sample: HealthSample): HealthStatus {
  const liveStatuses = sample.checks
    .filter((check) => CHECK_DEFINITIONS[check.id].evidenceKind === 'live' && check.status !== 'not_configured')
    .map((check) => check.status);
  return aggregateHealthStatus(liveStatuses.length > 0 ? liveStatuses : ['not_configured']);
}

export function stringifyPublicSnapshot(snapshot: HealthSnapshot): string {
  return `${JSON.stringify(parseHealthSnapshot(snapshot), null, 2)}\n`;
}

export function stringifyPublicHistory(history: HealthHistory): string {
  return `${JSON.stringify(parseHealthHistory(history, new Date(history.generatedAt)), null, 2)}\n`;
}

function parseHealthSample(value: unknown): HealthSample {
  const record = requireStrictObject(value, ['generatedAt', 'overallStatus', 'stale', 'checks']);
  if (!healthStatusSet.has(String(record.overallStatus))) throw new Error('invalid_sample_status');
  if (typeof record.stale !== 'boolean') throw new Error('invalid_sample_stale');
  const checks = requireArray(record.checks, 'sample.checks').map((entry) => {
    const check = requireStrictObject(entry, ['id', 'status', 'checkedAt', 'latencyMs'], true);
    if (!checkIdSet.has(String(check.id))) throw new Error('invalid_sample_check_id');
    if (!healthStatusSet.has(String(check.status))) throw new Error('invalid_sample_check_status');
    const parsed: HealthSampleCheck = {
      id: check.id as HealthCheckId,
      status: check.status as HealthStatus,
      checkedAt: requireIsoDate(check.checkedAt, 'sample.checkedAt'),
    };
    if (check.latencyMs !== undefined) parsed.latencyMs = requireLatency(check.latencyMs);
    return parsed;
  });
  return {
    generatedAt: requireIsoDate(record.generatedAt, 'sample.generatedAt'),
    overallStatus: record.overallStatus as HealthStatus,
    stale: record.stale,
    checks,
  };
}

function requireStrictObject(value: unknown, keys: readonly string[], optionalKeys = false): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected_object');
  const record = value as Record<string, unknown>;
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) throw new Error('unknown_public_field');
  if (!optionalKeys && keys.some((key) => !(key in record))) throw new Error('missing_public_field');
  const required = optionalKeys ? keys.filter((key) => key !== 'latencyMs' && key !== 'errorCode') : [];
  if (required.some((key) => !(key in record))) throw new Error('missing_public_field');
  return record;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`invalid_${field}`);
  return value;
}

function requireIsoDate(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`invalid_${field}`);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) throw new Error(`invalid_${field}`);
  return value;
}

function requireLatency(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 300_000) {
    throw new Error('invalid_latency');
  }
  return value;
}

function resolveCheckSummary(
  id: HealthCheckId,
  status: HealthStatus,
  errorCode: PublicErrorCode | undefined,
): string {
  return (errorCode ? ERROR_SUMMARY_OVERRIDES[id]?.[errorCode] : undefined) ?? CHECK_DEFINITIONS[id].summaries[status];
}
