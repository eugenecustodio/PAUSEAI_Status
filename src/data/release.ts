export interface ReleaseEvidence {
  label: string;
  value: string;
  detail: string;
  href?: string;
}

export const releaseEvidence: ReleaseEvidence[] = [
  {
    label: 'Mobile verification',
    value: '420 tests',
    detail: '36 automated suites passed at the versionCode 4 release gate.',
  },
  {
    label: 'Backend verification',
    value: '53 tests',
    detail: 'Two Supabase Edge Function handler suites passed.',
  },
  {
    label: 'Deployed backend',
    value: '9 functions',
    detail: 'Nine production Supabase Edge Functions were verified at release.',
  },
  {
    label: 'Runtime',
    value: 'Expo SDK 56',
    detail: 'Expo Doctor passed 21 of 21 project checks.',
  },
  {
    label: 'Android release',
    value: 'versionCode 4',
    detail: 'Production AAB completed through EAS Build.',
    href: 'https://expo.dev/accounts/anothergenee/projects/pause-boundary-broker/builds/b13b4810-847e-4853-8e93-e61261ae4585',
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
