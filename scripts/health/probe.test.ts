import { describe, expect, it, vi } from 'vitest';

import { readProbeEnvironment, runHealthProbe, type ProbeEnvironment } from './probe.ts';

const NOW = new Date('2026-07-10T08:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const DEVICE_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const DIGEST_ID = '44444444-4444-4444-8444-444444444444';
const PRESET_ID = '99999999-9999-4999-8999-999999999999';
const BOUNDARY_ID = '88888888-8888-4888-8888-888888888888';

const configuredEnvironment: ProbeEnvironment = {
  supabaseUrl: 'https://status-test.supabase.co',
  anonKey: 'public-placeholder',
  healthEmail: 'synthetic-account-label',
  healthPassword: 'local-placeholder',
  dailyQwenEnabled: false,
  mode: 'auto',
};

describe('synthetic health probes', () => {
  it('publishes not configured without exposing which values are missing', async () => {
    const snapshot = await runHealthProbe(
      readProbeEnvironment({}),
      null,
      { now: () => NOW, fetch: vi.fn() as unknown as typeof fetch },
    );
    expect(snapshot.overallStatus).toBe('not_configured');
    expect(snapshot.checks.every((check) => check.status === 'not_configured')).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/email|password|anon.key|supabase.url/i);
  });

  it('classifies a banned synthetic user as degraded rather than a product outage', async () => {
    const fetcher = makeFrequentFetcher({ signInStatus: 400, signInCode: 'user_banned' });
    const snapshot = await runHealthProbe(configuredEnvironment, null, { now: () => NOW, fetch: fetcher });
    const account = snapshot.checks.find((check) => check.id === 'synthetic_account');
    expect(account).toMatchObject({ status: 'degraded', errorCode: 'health_account_disabled' });
    expect(snapshot.overallStatus).toBe('degraded');
  });

  it('treats confirmed service responses as outage but network ambiguity as unknown', async () => {
    const outage = await runHealthProbe(configuredEnvironment, null, {
      now: () => NOW,
      fetch: makeFrequentFetcher({ gatewayStatus: 503, edgeStatus: 503, signInStatus: 503 }),
    });
    expect(outage.overallStatus).toBe('outage');

    const ambiguous = await runHealthProbe(configuredEnvironment, null, {
      now: () => NOW,
      fetch: vi.fn(async () => {
        throw new TypeError('network unavailable with raw detail');
      }) as unknown as typeof fetch,
    });
    expect(ambiguous.overallStatus).toBe('unknown');
    expect(JSON.stringify(ambiguous)).not.toContain('raw detail');
  });

  it('surfaces owner-profile RLS and Edge CORS contract failures as degraded', async () => {
    const rlsFailure = await runHealthProbe(configuredEnvironment, null, {
      now: () => NOW,
      fetch: makeFrequentFetcher({ profileStatus: 403 }),
    });
    expect(rlsFailure.checks.find((check) => check.id === 'database_rls')).toMatchObject({
      status: 'degraded',
      errorCode: 'rls_contract_failed',
    });

    const edgeFailure = await runHealthProbe(configuredEnvironment, null, {
      now: () => NOW,
      fetch: makeFrequentFetcher({ invalidEdgeCors: true }),
    });
    expect(edgeFailure.checks.find((check) => check.id === 'edge_functions')).toMatchObject({
      status: 'degraded',
      errorCode: 'edge_contract_failed',
    });
  });

  it('runs Qwen lifecycle at most daily and reports deterministic fallback honestly', async () => {
    const environment = { ...configuredEnvironment, dailyQwenEnabled: true, mode: 'daily' as const };
    const fetcher = makeLifecycleFetcher({ classificationSource: 'edge_deterministic_fallback' });
    const snapshot = await runHealthProbe(environment, null, {
      now: () => NOW,
      fetch: fetcher,
      randomUuid: uuidSequence(),
    });
    expect(snapshot.validationEvidence.find((check) => check.id === 'qwen_classification')).toMatchObject({
      status: 'degraded',
      errorCode: 'qwen_fallback',
    });
    expect(snapshot.overallStatus).toBe('operational');
    expect(snapshot.validationEvidence.find((check) => check.id === 'qwen_digest')?.status).toBe('operational');
    expect(snapshot.validationEvidence.find((check) => check.id === 'privacy_cleanup')?.status).toBe('operational');

    const secondFetcher = makeLifecycleFetcher({});
    const notDue = await runHealthProbe(environment, snapshot, {
      now: () => new Date(NOW.getTime() + 23 * 60 * 60 * 1_000),
      fetch: secondFetcher,
      randomUuid: uuidSequence(),
    });
    expect(notDue.validationEvidence).toEqual(snapshot.validationEvidence);
    expect(secondFetcher.calls.some((call) => call.startsWith('POST ') && call.includes('classify-notification'))).toBe(false);
  });

  it('passes the complete active-boundary Qwen and cleanup lifecycle', async () => {
    const environment = { ...configuredEnvironment, dailyQwenEnabled: true, mode: 'daily' as const };
    const fetcher = makeLifecycleFetcher({});
    const snapshot = await runHealthProbe(environment, null, {
      now: () => NOW,
      fetch: fetcher,
      randomUuid: uuidSequence(),
    });

    expect(snapshot.overallStatus).toBe('operational');
    expect(snapshot.validationEvidence.map((check) => check.status)).toEqual([
      'operational',
      'operational',
      'operational',
    ]);
    expect(fetcher.calls.some((call) => call.startsWith('POST ') && call.includes('/rest/v1/boundary_modes'))).toBe(true);
    expect(fetcher.calls.some((call) => call.startsWith('POST ') && call.includes('/rest/v1/boundary_presets'))).toBe(true);
    expect(fetcher.calls.some((call) => call.includes('/rest/v1/boundary_modes?select=id&limit=1'))).toBe(true);
    expect(fetcher.calls.some((call) => call.includes('/rest/v1/boundary_presets?select=id&limit=1'))).toBe(true);
  });

  it('reports Qwen model, zero-retention, and cleanup failures without publishing provider data', async () => {
    const environment = { ...configuredEnvironment, dailyQwenEnabled: true, mode: 'daily' as const };
    const modelFailure = await runHealthProbe(environment, null, {
      now: () => NOW,
      fetch: makeLifecycleFetcher({ classificationModel: 'unexpected-provider-model' }),
      randomUuid: uuidSequence(),
    });
    expect(modelFailure.validationEvidence[0]).toMatchObject({ status: 'degraded', errorCode: 'qwen_model_invalid' });

    const retentionFailure = await runHealthProbe(environment, null, {
      now: () => NOW,
      fetch: makeLifecycleFetcher({ retainedPreview: true }),
      randomUuid: uuidSequence(),
    });
    expect(retentionFailure.validationEvidence[0]).toMatchObject({
      status: 'degraded',
      errorCode: 'retention_contract_failed',
    });

    const cleanupFailure = await runHealthProbe(environment, null, {
      now: () => NOW,
      fetch: makeLifecycleFetcher({ cleanupStatus: 500 }),
      randomUuid: uuidSequence(),
    });
    expect(cleanupFailure.validationEvidence.find((check) => check.id === 'privacy_cleanup')).toMatchObject({
      status: 'outage',
      errorCode: 'cleanup_failed',
    });
    expect(cleanupFailure.overallStatus).toBe('operational');
    expect(JSON.stringify(cleanupFailure)).not.toMatch(/unexpected-provider-model|project checkpoint|11111111/i);
  });

  it('fails daily cleanup evidence if a synthetic account preset survives deletion', async () => {
    const environment = { ...configuredEnvironment, dailyQwenEnabled: true, mode: 'daily' as const };
    const snapshot = await runHealthProbe(environment, null, {
      now: () => NOW,
      fetch: makeLifecycleFetcher({ retainedPreset: true }),
      randomUuid: uuidSequence(),
    });

    expect(snapshot.validationEvidence.find((check) => check.id === 'privacy_cleanup')).toMatchObject({
      status: 'outage',
      errorCode: 'cleanup_failed',
    });
    expect(snapshot.overallStatus).toBe('operational');
  });
});

type FrequentOptions = {
  gatewayStatus?: number;
  edgeStatus?: number;
  signInStatus?: number;
  signInCode?: string;
  profileStatus?: number;
  invalidEdgeCors?: boolean;
};

function makeFrequentFetcher(options: FrequentOptions = {}): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/auth/v1/health')) return jsonResponse({}, options.gatewayStatus ?? 200);
    if (url.includes('/functions/v1/')) {
      return jsonResponse(
        {},
        options.edgeStatus ?? 200,
        options.invalidEdgeCors ? {} : corsHeaders(),
      );
    }
    if (url.includes('/auth/v1/token')) {
      return jsonResponse(
        options.signInStatus && options.signInStatus !== 200
          ? { error_code: options.signInCode ?? 'invalid_credentials' }
          : { access_token: 'private-session-value', user: { id: USER_ID } },
        options.signInStatus ?? 200,
      );
    }
    if (url.includes('/rest/v1/profiles')) {
      return jsonResponse(options.profileStatus ? {} : [{ id: USER_ID }], options.profileStatus ?? 200);
    }
    throw new Error(`Unexpected test request: ${url}`);
  }) as unknown as typeof fetch;
}

type LifecycleOptions = {
  classificationSource?: 'qwen' | 'edge_deterministic_fallback';
  classificationModel?: string;
  digestModel?: string;
  retainedPreview?: boolean;
  cleanupStatus?: number;
  brokerState?: string;
  retainedPreset?: boolean;
};

function makeLifecycleFetcher(options: LifecycleOptions): typeof fetch & { calls: string[] } {
  let cloudAiEnabled = false;
  let deleted = false;
  const calls: string[] = [];
  const mock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url}`);
    if (url.includes('/auth/v1/health')) return jsonResponse({});
    if (method === 'OPTIONS' && url.includes('/functions/v1/')) return jsonResponse({}, 200, corsHeaders());
    if (url.includes('/auth/v1/token')) {
      return jsonResponse({ access_token: 'private-session-value', user: { id: USER_ID } });
    }
    if (url.includes('/rest/v1/profiles?select=id')) return jsonResponse([{ id: USER_ID }]);
    if (url.includes('/rest/v1/rpc/set_notification_retention_hours')) return jsonResponse({ retention_hours: 0 });
    if (url.includes('/rest/v1/profiles?id=eq.') && method === 'PATCH') {
      const body = JSON.parse(String(init?.body)) as { cloud_ai_enabled: boolean };
      cloudAiEnabled = body.cloud_ai_enabled;
      return jsonResponse([{ cloud_ai_enabled: cloudAiEnabled, notification_retention_hours: 0 }]);
    }
    if (url.includes('/rest/v1/boundary_presets?select=id') && method === 'POST') {
      return jsonResponse([{ id: PRESET_ID }]);
    }
    if (url.includes('/rest/v1/boundary_modes?select=id') && method === 'POST') {
      return jsonResponse([{ id: BOUNDARY_ID }]);
    }
    if (url.endsWith('/functions/v1/register-device')) {
      const body = JSON.parse(String(init?.body)) as { deviceId: string };
      return jsonResponse({ deviceId: body.deviceId, registeredAt: NOW.toISOString(), serverTime: NOW.toISOString(), monitoringRulesVersion: 0 });
    }
    if (url.endsWith('/functions/v1/update-monitoring-rules')) {
      const body = JSON.parse(String(init?.body)) as { rules?: Array<{ defaultAction?: string }> };
      if (body.rules?.[0]?.defaultAction !== 'broker') return jsonResponse({ code: 'invalid_test_rule' }, 422);
      return jsonResponse({ rulesVersion: 1, syncedAt: NOW.toISOString() });
    }
    if (url.endsWith('/functions/v1/classify-notification')) {
      const source = options.classificationSource ?? 'qwen';
      return jsonResponse({
        notificationEventId: EVENT_ID,
        brokerState: options.brokerState ?? 'vaulted',
        classificationSource: source,
        modelUsed: options.classificationModel ?? (source === 'qwen' ? 'qwen3.7-plus' : 'deterministic-fallback'),
        qwenAttempts: source === 'qwen' ? 1 : 0,
        fallbackReason: source === 'qwen' ? null : 'http_error',
      });
    }
    if (url.endsWith('/functions/v1/manual-override')) {
      return jsonResponse({ notificationEventId: EVENT_ID, brokerState: 'vaulted', updatedAt: NOW.toISOString() });
    }
    if (url.includes('/rest/v1/notification_events?select=id,title_preview')) {
      return jsonResponse([
        {
          id: EVENT_ID,
          title_preview: options.retainedPreview ? 'forbidden retained value' : null,
          text_preview_redacted: null,
          expires_at: null,
        },
      ]);
    }
    if (url.endsWith('/functions/v1/generate-digest')) {
      return jsonResponse({ digestId: DIGEST_ID, notificationCount: 1, urgentCount: 0, digestText: 'Safe template.' });
    }
    if (url.includes('/rest/v1/digests?select=id,model_used')) {
      return jsonResponse([{ id: DIGEST_ID, model_used: options.digestModel ?? 'qwen3.7-plus' }]);
    }
    if (url.endsWith('/functions/v1/delete-cloud-data')) {
      if (options.cleanupStatus) return jsonResponse({ code: 'private_provider_failure' }, options.cleanupStatus);
      deleted = true;
      return jsonResponse({ deletedCloudData: true, accountDeleted: false, userId: USER_ID });
    }
    if (url.includes('/rest/v1/profiles?select=cloud_ai_enabled')) {
      return jsonResponse([{ cloud_ai_enabled: cloudAiEnabled }]);
    }
    if (url.includes('/rest/v1/boundary_presets?select=id&limit=1')) {
      return jsonResponse(deleted && !options.retainedPreset ? [] : [{ id: PRESET_ID }]);
    }
    if (
      url.includes('/rest/v1/device_installations?') ||
      url.includes('/rest/v1/monitored_app_rules?') ||
      url.includes('/rest/v1/boundary_modes?select=id&limit=1') ||
      url.includes('/rest/v1/notification_events?select=id&') ||
      url.includes('/rest/v1/digests?select=id&')
    ) {
      return jsonResponse(deleted ? [] : [{ id: 'private-id' }]);
    }
    throw new Error(`Unexpected test request: ${url}`);
  }) as unknown as typeof fetch & { calls: string[] };
  mock.calls = calls;
  return mock;
}

function uuidSequence(): () => string {
  const values = [DEVICE_ID, '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666'];
  return () => values.shift() ?? '77777777-7777-4777-8777-777777777777';
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
