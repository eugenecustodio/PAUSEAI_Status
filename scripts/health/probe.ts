import {
  buildHealthSnapshot,
  createHealthCheck,
  createPendingValidation,
  createReleaseEvidence,
  type HealthCheck,
  type HealthSnapshot,
  type HealthStatus,
  type PublicErrorCode,
} from '../../src/lib/health.ts';
import { edgeFunctions } from '../../src/data/release.ts';

export const EDGE_FUNCTIONS = edgeFunctions;

export type ProbeMode = 'auto' | 'frequent' | 'daily' | 'skip';

export type ProbeEnvironment = {
  supabaseUrl?: string;
  anonKey?: string;
  healthEmail?: string;
  healthPassword?: string;
  dailyQwenEnabled: boolean;
  mode: ProbeMode;
};

export type ProbeDependencies = {
  fetch: typeof fetch;
  now: () => Date;
  randomUuid: () => string;
};

type AuthSession = {
  accessToken: string;
  userId: string;
};

type FrequentProbeResult = {
  checks: HealthCheck[];
  session?: AuthSession;
};

type FailureTarget = 'auth' | 'account' | 'database' | 'edge' | 'classification' | 'digest' | 'cleanup';

class ProbeFailure extends Error {
  constructor(
    readonly target: FailureTarget,
    readonly status: HealthStatus,
    readonly publicCode: PublicErrorCode,
  ) {
    super('probe_failed');
  }
}

const DEFAULT_DEPENDENCIES: ProbeDependencies = {
  fetch,
  now: () => new Date(),
  randomUuid: () => crypto.randomUUID(),
};

const REQUEST_TIMEOUT_MS = 15_000;
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1_000;

export function readProbeEnvironment(environment: NodeJS.ProcessEnv = process.env): ProbeEnvironment {
  const modeValue = environment.PAUSE_PROBE_MODE;
  return {
    supabaseUrl: normalizeBaseUrl(environment.PAUSE_SUPABASE_URL),
    anonKey: nonEmpty(environment.PAUSE_SUPABASE_ANON_KEY),
    healthEmail: nonEmpty(environment.PAUSE_HEALTH_EMAIL),
    healthPassword: nonEmpty(environment.PAUSE_HEALTH_PASSWORD),
    dailyQwenEnabled: environment.PAUSE_DAILY_QWEN_ENABLED === 'true',
    mode: modeValue === 'frequent' || modeValue === 'daily' || modeValue === 'skip' ? modeValue : 'auto',
  };
}

export async function runHealthProbe(
  environment: ProbeEnvironment,
  previous: HealthSnapshot | null,
  dependencies: Partial<ProbeDependencies> = {},
): Promise<HealthSnapshot> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const now = deps.now();
  const generatedAt = now.toISOString();

  if (environment.mode === 'skip') {
    if (!previous) {
      return buildHealthSnapshot({
        generatedAt,
        checks: createUnverifiedFrequentChecks(generatedAt),
        releaseEvidence: createReleaseEvidence(),
        validationEvidence: createPendingValidation(generatedAt, environment.dailyQwenEnabled),
        now,
      });
    }

    return buildHealthSnapshot({
      generatedAt,
      checks: previous.checks,
      releaseEvidence: createReleaseEvidence(),
      validationEvidence: environment.dailyQwenEnabled
        ? previous.validationEvidence
        : createPendingValidation(generatedAt, false),
      now,
    });
  }

  const frequent = await runFrequentProbe(environment, deps);
  let validationEvidence: HealthCheck[];

  if (!environment.dailyQwenEnabled) {
    validationEvidence = createPendingValidation(generatedAt, false);
  } else if (environment.mode === 'frequent' || !isDailyProbeDue(previous, now)) {
    validationEvidence = previous?.validationEvidence ?? createPendingValidation(generatedAt, true);
  } else if (!frequent.session || !environment.supabaseUrl || !environment.anonKey) {
    validationEvidence = createPendingValidation(generatedAt, true);
  } else {
    validationEvidence = await runDailyProbe(environment, frequent.session, deps);
  }

  return buildHealthSnapshot({
    generatedAt,
    checks: frequent.checks,
    releaseEvidence: createReleaseEvidence(),
    validationEvidence,
    now,
  });
}

export async function runFrequentProbe(
  environment: ProbeEnvironment,
  dependencies: ProbeDependencies = DEFAULT_DEPENDENCIES,
): Promise<FrequentProbeResult> {
  const checkedAt = dependencies.now().toISOString();
  const hasGatewayConfig = Boolean(environment.supabaseUrl && environment.anonKey);
  const hasAccountConfig = Boolean(environment.healthEmail && environment.healthPassword);

  if (!hasGatewayConfig) {
    return {
      checks: createNotConfiguredFrequentChecks(checkedAt),
    };
  }

  const [authGateway, edgeFunctions] = await Promise.all([
    probeAuthGateway(environment, dependencies),
    probeEdgeFunctions(environment, dependencies),
  ]);

  if (!hasAccountConfig) {
    return {
      checks: [
        authGateway,
        createHealthCheck('synthetic_account', 'not_configured', checkedAt, { errorCode: 'configuration_missing' }),
        createHealthCheck('database_rls', 'not_configured', checkedAt, { errorCode: 'configuration_missing' }),
        edgeFunctions,
      ],
    };
  }

  const accountResult = await probeSyntheticAccount(environment, dependencies);
  const databaseRls = accountResult.session
    ? await probeDatabaseRls(environment, accountResult.session, dependencies)
    : createHealthCheck('database_rls', 'unknown', checkedAt, {
        errorCode: accountResult.check.status === 'degraded' ? 'health_account_unavailable' : 'network_ambiguous',
      });

  return {
    checks: [authGateway, accountResult.check, databaseRls, edgeFunctions],
    ...(accountResult.session ? { session: accountResult.session } : {}),
  };
}

export function isDailyProbeDue(previous: HealthSnapshot | null, now = new Date()): boolean {
  const prior = previous?.validationEvidence.find((check) => check.id === 'qwen_classification');
  if (!prior || prior.status === 'not_configured') return true;
  const checkedAt = Date.parse(prior.checkedAt);
  return !Number.isFinite(checkedAt) || now.getTime() - checkedAt >= DAILY_INTERVAL_MS;
}

async function probeAuthGateway(environment: ProbeEnvironment, dependencies: ProbeDependencies): Promise<HealthCheck> {
  const checkedAt = dependencies.now().toISOString();
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(
      dependencies.fetch,
      `${environment.supabaseUrl}/auth/v1/health`,
      { headers: { apikey: environment.anonKey! } },
    );
    const latencyMs = elapsed(startedAt);
    if (response.ok) return createHealthCheck('auth_gateway', 'operational', checkedAt, { latencyMs });
    if (response.status >= 500) {
      return createHealthCheck('auth_gateway', 'outage', checkedAt, { latencyMs, errorCode: 'auth_service_error' });
    }
    return createHealthCheck('auth_gateway', 'degraded', checkedAt, { latencyMs, errorCode: 'auth_service_error' });
  } catch (error) {
    return createHealthCheck('auth_gateway', 'unknown', checkedAt, { errorCode: networkCode(error) });
  }
}

async function probeSyntheticAccount(
  environment: ProbeEnvironment,
  dependencies: ProbeDependencies,
): Promise<{ check: HealthCheck; session?: AuthSession }> {
  const checkedAt = dependencies.now().toISOString();
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(
      dependencies.fetch,
      `${environment.supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          apikey: environment.anonKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: environment.healthEmail, password: environment.healthPassword }),
      },
    );
    const latencyMs = elapsed(startedAt);

    if (!response.ok) {
      if (response.status >= 500) {
        return {
          check: createHealthCheck('synthetic_account', 'unknown', checkedAt, {
            latencyMs,
            errorCode: 'auth_service_error',
          }),
        };
      }
      const responseCode = await readProviderCode(response);
      const disabled = responseCode === 'user_banned' || responseCode === 'user_disabled';
      return {
        check: createHealthCheck('synthetic_account', 'degraded', checkedAt, {
          latencyMs,
          errorCode: disabled ? 'health_account_disabled' : 'health_account_unavailable',
        }),
      };
    }

    const body = await safeJson(response);
    const accessToken = readString(body, 'access_token');
    const user = readObject(body, 'user');
    const userId = user ? readString(user, 'id') : null;
    if (!accessToken || !userId || !isUuid(userId)) {
      return {
        check: createHealthCheck('synthetic_account', 'degraded', checkedAt, {
          latencyMs,
          errorCode: 'response_invalid',
        }),
      };
    }

    return {
      check: createHealthCheck('synthetic_account', 'operational', checkedAt, { latencyMs }),
      session: { accessToken, userId },
    };
  } catch (error) {
    return {
      check: createHealthCheck('synthetic_account', 'unknown', checkedAt, { errorCode: networkCode(error) }),
    };
  }
}

async function probeDatabaseRls(
  environment: ProbeEnvironment,
  session: AuthSession,
  dependencies: ProbeDependencies,
): Promise<HealthCheck> {
  const checkedAt = dependencies.now().toISOString();
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(
      dependencies.fetch,
      `${environment.supabaseUrl}/rest/v1/profiles?select=id&id=eq.${encodeURIComponent(session.userId)}&limit=1`,
      { headers: authenticatedHeaders(environment, session) },
    );
    const latencyMs = elapsed(startedAt);
    if (!response.ok) {
      if (response.status >= 500) {
        return createHealthCheck('database_rls', 'outage', checkedAt, {
          latencyMs,
          errorCode: 'database_service_error',
        });
      }
      return createHealthCheck('database_rls', 'degraded', checkedAt, {
        latencyMs,
        errorCode: 'rls_contract_failed',
      });
    }
    const body = await safeJson(response);
    const valid = Array.isArray(body) && body.length === 1 && readString(body[0], 'id') === session.userId;
    return createHealthCheck('database_rls', valid ? 'operational' : 'degraded', checkedAt, {
      latencyMs,
      ...(valid ? {} : { errorCode: 'rls_contract_failed' as const }),
    });
  } catch (error) {
    return createHealthCheck('database_rls', 'unknown', checkedAt, { errorCode: networkCode(error) });
  }
}

async function probeEdgeFunctions(environment: ProbeEnvironment, dependencies: ProbeDependencies): Promise<HealthCheck> {
  const checkedAt = dependencies.now().toISOString();
  const startedAt = Date.now();
  const results = await Promise.all(
    EDGE_FUNCTIONS.map(async (functionName) => {
      try {
        const response = await fetchWithTimeout(
          dependencies.fetch,
          `${environment.supabaseUrl}/functions/v1/${functionName}`,
          {
            method: 'OPTIONS',
            headers: {
              apikey: environment.anonKey!,
              Origin: 'https://eugenecustodio.github.io',
              'Access-Control-Request-Method': 'POST',
            },
          },
        );
        if (response.status >= 500) return 'outage' as const;
        const allowedOrigin = response.headers.get('access-control-allow-origin');
        const allowedMethods = response.headers.get('access-control-allow-methods') ?? '';
        if (!response.ok || (allowedOrigin !== '*' && allowedOrigin !== 'https://eugenecustodio.github.io') || !allowedMethods.includes('POST')) {
          return 'degraded' as const;
        }
        return 'operational' as const;
      } catch {
        return 'unknown' as const;
      }
    }),
  );
  const status = aggregateProbeStatuses(results);
  const errorCode =
    status === 'unknown'
      ? ('network_ambiguous' as const)
      : status === 'outage'
        ? ('edge_service_error' as const)
        : status === 'degraded'
          ? ('edge_contract_failed' as const)
          : undefined;
  return createHealthCheck('edge_functions', status, checkedAt, {
    latencyMs: elapsed(startedAt),
    ...(errorCode ? { errorCode } : {}),
  });
}

async function runDailyProbe(
  environment: ProbeEnvironment,
  session: AuthSession,
  dependencies: ProbeDependencies,
): Promise<HealthCheck[]> {
  const checkedAt = dependencies.now().toISOString();
  let classificationCheck = createHealthCheck('qwen_classification', 'unknown', checkedAt, {
    errorCode: 'probe_internal_error',
  });
  let digestCheck = createHealthCheck('qwen_digest', 'unknown', checkedAt, { errorCode: 'probe_internal_error' });
  let cleanupCheck = createHealthCheck('privacy_cleanup', 'unknown', checkedAt, { errorCode: 'probe_internal_error' });

  try {
    await setZeroRetention(environment, session, dependencies);
    await setCloudAi(environment, session, dependencies, true);
    await createSyntheticPreset(environment, session, dependencies);
    await createSyntheticBoundary(environment, session, dependencies);
    const deviceId = await registerSyntheticDevice(environment, session, dependencies);
    await registerSyntheticRule(environment, session, deviceId, dependencies);
    const classification = await classifySyntheticNotification(environment, session, deviceId, dependencies);

    if (classification.provenanceValid) {
      classificationCheck = createHealthCheck('qwen_classification', 'operational', checkedAt, {
        latencyMs: classification.latencyMs,
      });
    } else {
      classificationCheck = createHealthCheck('qwen_classification', 'degraded', checkedAt, {
        latencyMs: classification.latencyMs,
        errorCode: classification.sourceIsQwen ? 'qwen_model_invalid' : 'qwen_fallback',
      });
    }

    const retainedPreviewIsNull = await verifyZeroRetention(
      environment,
      session,
      classification.notificationEventId,
      dependencies,
    );
    if (!retainedPreviewIsNull) {
      classificationCheck = createHealthCheck('qwen_classification', 'degraded', checkedAt, {
        latencyMs: classification.latencyMs,
        errorCode: 'retention_contract_failed',
      });
    }

    await ensureDigestEligible(
      environment,
      session,
      classification.notificationEventId,
      classification.brokerState,
      dependencies,
    );

    try {
      const digestLatency = await generateAndValidateDigest(environment, session, dependencies);
      digestCheck = createHealthCheck('qwen_digest', 'operational', checkedAt, { latencyMs: digestLatency });
    } catch (error) {
      const failure = normalizeFailure(error, 'digest');
      digestCheck = createHealthCheck('qwen_digest', failure.status, checkedAt, { errorCode: failure.publicCode });
    }
  } catch (error) {
    const failure = normalizeFailure(error, 'classification');
    classificationCheck = createHealthCheck('qwen_classification', failure.status, checkedAt, {
      errorCode: failure.publicCode,
    });
    digestCheck = createHealthCheck('qwen_digest', 'unknown', checkedAt, {
      errorCode: failure.publicCode === 'retention_contract_failed' ? 'retention_contract_failed' : 'probe_internal_error',
    });
  } finally {
    try {
      await cleanupSyntheticData(environment, session, dependencies);
      cleanupCheck = createHealthCheck('privacy_cleanup', 'operational', checkedAt);
    } catch (error) {
      const failure = normalizeFailure(error, 'cleanup');
      cleanupCheck = createHealthCheck('privacy_cleanup', failure.status === 'unknown' ? 'unknown' : 'outage', checkedAt, {
        errorCode: 'cleanup_failed',
      });
    }
  }

  return [classificationCheck, digestCheck, cleanupCheck];
}

async function createSyntheticPreset(
  environment: ProbeEnvironment,
  session: AuthSession,
  dependencies: ProbeDependencies,
): Promise<void> {
  const response = await requestJson(
    environment,
    session,
    '/rest/v1/boundary_presets?select=id',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: session.userId,
        name: 'Scheduled health preset',
        duration_minutes: 30,
        policy_json: {
          mode: 'quiet',
          allowSecurityAlerts: false,
          allowCalendarAlerts: false,
          allowTrustedKeywords: false,
          maxInterruptionsPerHour: 0,
        },
      }),
    },
    dependencies,
    'classification',
  );
  const row = Array.isArray(response) && response.length === 1 ? response[0] : null;
  const presetId = row ? readString(row, 'id') : null;
  if (!presetId || !isUuid(presetId)) {
    throw new ProbeFailure('classification', 'degraded', 'response_invalid');
  }
}

async function setZeroRetention(
  environment: ProbeEnvironment,
  session: AuthSession,
  dependencies: ProbeDependencies,
): Promise<void> {
  const response = await requestJson(
    environment,
    session,
    '/rest/v1/rpc/set_notification_retention_hours',
    { method: 'POST', body: JSON.stringify({ p_hours: 0 }) },
    dependencies,
    'database',
  );
  if (response === null || typeof response !== 'object') {
    throw new ProbeFailure('database', 'degraded', 'retention_contract_failed');
  }
}

async function setCloudAi(
  environment: ProbeEnvironment,
  session: AuthSession,
  dependencies: ProbeDependencies,
  enabled: boolean,
): Promise<void> {
  const response = await requestJson(
    environment,
    session,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(session.userId)}&select=cloud_ai_enabled,notification_retention_hours`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ cloud_ai_enabled: enabled }),
    },
    dependencies,
    'database',
  );
  const row = Array.isArray(response) && response.length === 1 ? response[0] : null;
  if (!row || readBoolean(row, 'cloud_ai_enabled') !== enabled) {
    throw new ProbeFailure('database', 'degraded', 'rls_contract_failed');
  }
  if (enabled && readNumber(row, 'notification_retention_hours') !== 0) {
    throw new ProbeFailure('database', 'degraded', 'retention_contract_failed');
  }
}

async function createSyntheticBoundary(
  environment: ProbeEnvironment,
  session: AuthSession,
  dependencies: ProbeDependencies,
): Promise<void> {
  const now = dependencies.now();
  const response = await requestJson(
    environment,
    session,
    '/rest/v1/boundary_modes?select=id',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: session.userId,
        name: 'Scheduled health boundary',
        status: 'active',
        starts_at: new Date(now.getTime() - 60 * 1_000).toISOString(),
        ends_at: new Date(now.getTime() + 10 * 60 * 1_000).toISOString(),
        allow_security_alerts: false,
        allow_calendar_alerts: false,
        allow_trusted_keywords: false,
        max_interruptions_per_hour: 0,
        policy_json: { mode: 'quiet' },
      }),
    },
    dependencies,
    'classification',
  );
  const row = Array.isArray(response) && response.length === 1 ? response[0] : null;
  const boundaryId = row ? readString(row, 'id') : null;
  if (!boundaryId || !isUuid(boundaryId)) {
    throw new ProbeFailure('classification', 'degraded', 'response_invalid');
  }
}

async function registerSyntheticDevice(
  environment: ProbeEnvironment,
  session: AuthSession,
  dependencies: ProbeDependencies,
): Promise<string> {
  const deviceId = dependencies.randomUuid();
  const response = await invokeEdge(
    environment,
    session,
    'register-device',
    {
      deviceId,
      platform: 'android',
      deviceLabel: 'Scheduled health probe',
      notificationAccessGranted: true,
      appVersion: 'status-probe-1',
    },
    dependencies,
    'classification',
  );
  const returnedId = readString(response, 'deviceId');
  if (returnedId !== deviceId) throw new ProbeFailure('classification', 'degraded', 'response_invalid');
  return deviceId;
}

async function registerSyntheticRule(
  environment: ProbeEnvironment,
  session: AuthSession,
  deviceId: string,
  dependencies: ProbeDependencies,
): Promise<void> {
  const response = await invokeEdge(
    environment,
    session,
    'update-monitoring-rules',
    {
      deviceId,
      rules: [
        {
          packageName: 'ai.pause.healthcheck',
          appLabel: 'PAUSE health probe',
          enabled: true,
          defaultAction: 'broker',
          priorityKeywords: [],
          quietKeywords: [],
          retentionHours: 0,
        },
      ],
    },
    dependencies,
    'classification',
  );
  if (typeof readNumber(response, 'rulesVersion') !== 'number') {
    throw new ProbeFailure('classification', 'degraded', 'response_invalid');
  }
}

async function classifySyntheticNotification(
  environment: ProbeEnvironment,
  session: AuthSession,
  deviceId: string,
  dependencies: ProbeDependencies,
): Promise<{
  notificationEventId: string;
  provenanceValid: boolean;
  sourceIsQwen: boolean;
  brokerState: string;
  latencyMs: number;
}> {
  const now = dependencies.now();
  const startedAt = Date.now();
  const response = await invokeEdge(
    environment,
    session,
    'classify-notification',
    {
      idempotencyKey: `scheduled-health-${now.toISOString()}-${dependencies.randomUuid()}`,
      deviceId,
      notification: {
        nativeId: `scheduled-${dependencies.randomUuid()}`,
        packageName: 'ai.pause.healthcheck',
        platform: 'android',
        postTime: now.getTime(),
        receivedAt: now.toISOString(),
        appLabel: 'PAUSE health probe',
        title: 'Scheduled product checkpoint',
        text: 'A project checkpoint is ready for review.',
        channelId: 'health-validation',
      },
    },
    dependencies,
    'classification',
  );
  const notificationEventId = readString(response, 'notificationEventId');
  const brokerState = readString(response, 'brokerState');
  if (!notificationEventId || !isUuid(notificationEventId)) {
    throw new ProbeFailure('classification', 'degraded', 'response_invalid');
  }
  const model = readString(response, 'modelUsed');
  const modelValid = Boolean(model && /^qwen[\w.-]*$/i.test(model));
  const sourceIsQwen = readString(response, 'classificationSource') === 'qwen';
  const provenanceValid =
    sourceIsQwen &&
    modelValid &&
    readNumber(response, 'qwenAttempts')! >= 1 &&
    readNullableString(response, 'fallbackReason') === null;
  if (!brokerState) throw new ProbeFailure('classification', 'degraded', 'response_invalid');
  return { notificationEventId, provenanceValid, sourceIsQwen, brokerState, latencyMs: elapsed(startedAt) };
}

async function ensureDigestEligible(
  environment: ProbeEnvironment,
  session: AuthSession,
  eventId: string,
  brokerState: string,
  dependencies: ProbeDependencies,
): Promise<void> {
  if (['vaulted', 'manual_review', 'unclear', 'snoozed'].includes(brokerState)) return;
  const response = await invokeEdge(
    environment,
    session,
    'manual-override',
    { notificationEventId: eventId, action: 'mark_can_wait' },
    dependencies,
    'digest',
  );
  if (readString(response, 'notificationEventId') !== eventId || readString(response, 'brokerState') !== 'vaulted') {
    throw new ProbeFailure('digest', 'degraded', 'qwen_digest_invalid');
  }
}

async function verifyZeroRetention(
  environment: ProbeEnvironment,
  session: AuthSession,
  eventId: string,
  dependencies: ProbeDependencies,
): Promise<boolean> {
  const response = await requestJson(
    environment,
    session,
    `/rest/v1/notification_events?select=id,title_preview,text_preview_redacted,expires_at&id=eq.${encodeURIComponent(eventId)}&limit=1`,
    { method: 'GET' },
    dependencies,
    'database',
  );
  const row = Array.isArray(response) && response.length === 1 ? response[0] : null;
  return Boolean(
    row &&
      readString(row, 'id') === eventId &&
      readNullableString(row, 'title_preview') === null &&
      readNullableString(row, 'text_preview_redacted') === null &&
      readNullableString(row, 'expires_at') === null,
  );
}

async function generateAndValidateDigest(
  environment: ProbeEnvironment,
  session: AuthSession,
  dependencies: ProbeDependencies,
): Promise<number> {
  const now = dependencies.now();
  const startedAt = Date.now();
  const response = await invokeEdge(
    environment,
    session,
    'generate-digest',
    {
      since: new Date(now.getTime() - 5 * 60 * 1_000).toISOString(),
      until: new Date(now.getTime() + 60 * 1_000).toISOString(),
      timezone: 'UTC',
    },
    dependencies,
    'digest',
  );
  const digestId = readString(response, 'digestId');
  const notificationCount = readNumber(response, 'notificationCount');
  if (!digestId || !isUuid(digestId) || notificationCount === null || notificationCount < 1) {
    throw new ProbeFailure('digest', 'degraded', 'qwen_digest_invalid');
  }

  const rows = await requestJson(
    environment,
    session,
    `/rest/v1/digests?select=id,model_used&id=eq.${encodeURIComponent(digestId)}&limit=1`,
    { method: 'GET' },
    dependencies,
    'digest',
  );
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  const model = row ? readString(row, 'model_used') : null;
  if (!row || readString(row, 'id') !== digestId || !model || !/^qwen[\w.-]*$/i.test(model)) {
    throw new ProbeFailure('digest', 'degraded', model?.includes('deterministic') ? 'qwen_fallback' : 'qwen_digest_invalid');
  }
  return elapsed(startedAt);
}

async function cleanupSyntheticData(
  environment: ProbeEnvironment,
  session: AuthSession,
  dependencies: ProbeDependencies,
): Promise<void> {
  let deletionSucceeded = false;
  let disableSucceeded = false;
  try {
    const response = await invokeEdge(
      environment,
      session,
      'delete-cloud-data',
      { confirmation: 'DELETE_MY_PAUSE_CLOUD_DATA' },
      dependencies,
      'cleanup',
    );
    deletionSucceeded = readBoolean(response, 'deletedCloudData') === true && readBoolean(response, 'accountDeleted') === false;
  } finally {
    try {
      await setCloudAi(environment, session, dependencies, false);
      disableSucceeded = true;
    } catch {
      disableSucceeded = false;
    }
  }

  if (!deletionSucceeded || !disableSucceeded) throw new ProbeFailure('cleanup', 'outage', 'cleanup_failed');
  const [profileRows, deviceRows, ruleRows, presetRows, boundaryRows, eventRows, digestRows] = await Promise.all([
    requestJson(
      environment,
      session,
      `/rest/v1/profiles?select=cloud_ai_enabled&id=eq.${encodeURIComponent(session.userId)}&limit=1`,
      { method: 'GET' },
      dependencies,
      'cleanup',
    ),
    requestJson(environment, session, '/rest/v1/device_installations?select=id&limit=1', { method: 'GET' }, dependencies, 'cleanup'),
    requestJson(environment, session, '/rest/v1/monitored_app_rules?select=id&limit=1', { method: 'GET' }, dependencies, 'cleanup'),
    requestJson(environment, session, '/rest/v1/boundary_presets?select=id&limit=1', { method: 'GET' }, dependencies, 'cleanup'),
    requestJson(environment, session, '/rest/v1/boundary_modes?select=id&limit=1', { method: 'GET' }, dependencies, 'cleanup'),
    requestJson(environment, session, '/rest/v1/notification_events?select=id&limit=1', { method: 'GET' }, dependencies, 'cleanup'),
    requestJson(environment, session, '/rest/v1/digests?select=id&limit=1', { method: 'GET' }, dependencies, 'cleanup'),
  ]);
  const profile = Array.isArray(profileRows) && profileRows.length === 1 ? profileRows[0] : null;
  const empty = [deviceRows, ruleRows, presetRows, boundaryRows, eventRows, digestRows].every(
    (rows) => Array.isArray(rows) && rows.length === 0,
  );
  if (!profile || readBoolean(profile, 'cloud_ai_enabled') !== false || !empty) {
    throw new ProbeFailure('cleanup', 'outage', 'cleanup_failed');
  }
}

async function invokeEdge(
  environment: ProbeEnvironment,
  session: AuthSession,
  functionName: string,
  body: unknown,
  dependencies: ProbeDependencies,
  target: FailureTarget,
): Promise<unknown> {
  return requestJson(
    environment,
    session,
    `/functions/v1/${functionName}`,
    { method: 'POST', body: JSON.stringify(body) },
    dependencies,
    target,
  );
}

async function requestJson(
  environment: ProbeEnvironment,
  session: AuthSession,
  path: string,
  init: RequestInit,
  dependencies: ProbeDependencies,
  target: FailureTarget,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchWithTimeout(dependencies.fetch, `${environment.supabaseUrl}${path}`, {
      ...init,
      headers: {
        ...authenticatedHeaders(environment, session),
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    throw new ProbeFailure(target, 'unknown', networkCode(error));
  }

  if (!response.ok) {
    const status: HealthStatus = response.status >= 500 ? 'outage' : 'degraded';
    const publicCode: PublicErrorCode =
      target === 'database'
        ? 'database_service_error'
        : target === 'cleanup'
          ? 'cleanup_failed'
          : target === 'digest'
            ? 'qwen_digest_invalid'
            : 'edge_service_error';
    throw new ProbeFailure(target, status, publicCode);
  }

  const body = await safeJson(response);
  if (body === undefined) throw new ProbeFailure(target, 'degraded', 'response_invalid');
  return body;
}

function authenticatedHeaders(environment: ProbeEnvironment, session: AuthSession): Record<string, string> {
  return {
    apikey: environment.anonKey!,
    Authorization: `Bearer ${session.accessToken}`,
  };
}

async function fetchWithTimeout(fetcher: typeof fetch, input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function safeJson(response: Response): Promise<unknown | undefined> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function readProviderCode(response: Response): Promise<string | null> {
  const body = await safeJson(response);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const value = record.error_code ?? record.code;
  return typeof value === 'string' && value.length < 80 ? value : null;
}

function createNotConfiguredFrequentChecks(checkedAt: string): HealthCheck[] {
  return (['auth_gateway', 'synthetic_account', 'database_rls', 'edge_functions'] as const).map((id) =>
    createHealthCheck(id, 'not_configured', checkedAt, { errorCode: 'configuration_missing' }),
  );
}

function createUnverifiedFrequentChecks(checkedAt: string): HealthCheck[] {
  return (['auth_gateway', 'synthetic_account', 'database_rls', 'edge_functions'] as const).map((id) =>
    createHealthCheck(id, 'unknown', checkedAt, { errorCode: 'probe_internal_error' }),
  );
}

function aggregateProbeStatuses(statuses: readonly HealthStatus[]): HealthStatus {
  if (statuses.includes('outage')) return 'outage';
  if (statuses.includes('degraded')) return 'degraded';
  if (statuses.includes('unknown')) return 'unknown';
  return 'operational';
}

function normalizeFailure(error: unknown, target: FailureTarget): ProbeFailure {
  return error instanceof ProbeFailure ? error : new ProbeFailure(target, 'unknown', 'probe_internal_error');
}

function networkCode(error: unknown): PublicErrorCode {
  return error instanceof DOMException && error.name === 'AbortError' ? 'probe_timeout' : 'network_ambiguous';
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
  const normalized = nonEmpty(value)?.replace(/\/+$/, '');
  if (!normalized) return undefined;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash
      ? parsed.origin
      : undefined;
  } catch {
    return undefined;
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function elapsed(startedAt: number): number {
  return Math.min(300_000, Math.max(0, Math.round(Date.now() - startedAt)));
}

function readObject(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === 'object' && !Array.isArray(nested) ? (nested as Record<string, unknown>) : null;
}

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const nested = (value as Record<string, unknown>)[key];
  return typeof nested === 'string' ? nested : null;
}

function readNullableString(value: unknown, key: string): string | null | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const nested = (value as Record<string, unknown>)[key];
  return nested === null || typeof nested === 'string' ? nested : undefined;
}

function readNumber(value: unknown, key: string): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const nested = (value as Record<string, unknown>)[key];
  return typeof nested === 'number' && Number.isFinite(nested) ? nested : null;
}

function readBoolean(value: unknown, key: string): boolean | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const nested = (value as Record<string, unknown>)[key];
  return typeof nested === 'boolean' ? nested : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
