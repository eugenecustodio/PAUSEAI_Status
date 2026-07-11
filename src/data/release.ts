export interface ReleaseEvidence {
  label: string;
  value: string;
  detail: string;
  href?: string;
}

/**
 * Canonical public record for the latest verified PAUSE production release.
 *
 * Pages, health snapshots, and release copy should derive their numbers from
 * this object. Historical journal entries intentionally retain the evidence
 * that was true when they were published.
 */
export const currentRelease = {
  version: '0.1.0',
  androidVersionCode: 5,
  verifiedAt: '2026-07-11T10:53:32.621Z',
  mobileTests: {
    suites: 37,
    tests: 429,
  },
  backendTests: 53,
  edgeFunctionCount: 9,
  expo: {
    sdk: 56,
    doctorPassed: 21,
    doctorTotal: 21,
  },
  androidBuild: {
    id: '8b4b2bf3-4daf-491f-a368-bdc08c98590a',
    url: 'https://expo.dev/accounts/anothergenee/projects/pause-boundary-broker/builds/8b4b2bf3-4daf-491f-a368-bdc08c98590a',
  },
} as const;

export const releaseEvidence: ReleaseEvidence[] = [
  {
    label: 'Mobile verification',
    value: `${currentRelease.mobileTests.tests} tests`,
    detail: `${currentRelease.mobileTests.suites} automated suites passed for versionCode ${currentRelease.androidVersionCode}.`,
  },
  {
    label: 'Backend verification',
    value: `${currentRelease.backendTests} tests`,
    detail: 'Supabase contract and handler suites passed at the production release gate.',
  },
  {
    label: 'Deployed backend',
    value: `${currentRelease.edgeFunctionCount} functions`,
    detail: 'Production Supabase Edge Functions were verified at release.',
  },
  {
    label: 'Runtime',
    value: `Expo SDK ${currentRelease.expo.sdk}`,
    detail: `Expo Doctor passed ${currentRelease.expo.doctorPassed} of ${currentRelease.expo.doctorTotal} project checks.`,
  },
  {
    label: 'Android release',
    value: `versionCode ${currentRelease.androidVersionCode}`,
    detail: `PAUSE ${currentRelease.version} production AAB completed through EAS Build.`,
    href: currentRelease.androidBuild.url,
  },
];

export const edgeFunctions = [
  'classify-notification',
  'delete-account',
  'delete-cloud-data',
  'generate-digest',
  'manual-override',
  'register-device',
  'register-push-token',
  'request-account-deletion',
  'update-monitoring-rules',
] as const;
