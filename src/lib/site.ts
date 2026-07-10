export const SITE_NAME = 'PAUSE AI';
export const SITE_SUBTITLE = 'AI Boundary Broker for Cross-App Notifications';
export const SITE_DESCRIPTION =
  'PAUSE AI gives people a calm, private boundary between incoming notifications and their attention.';

export function withBase(path = '/'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `/PAUSEAI_Status${normalized}`;
}
