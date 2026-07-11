import { expect, test, type Page } from '@playwright/test';

const projectBase = '/PAUSEAI_Status';

const routes = [
  { path: '/', heading: /Own the\s*interruption/i },
  { path: '/status/', heading: /Status,\s*without guesswork/i },
  { path: '/updates/', heading: /Progress, without the theater/i },
  { path: '/updates/actual-ui-showcase-film/', heading: /New actual-UI showcase film is live/i },
  { path: '/updates/backend-qwen-deployment/', heading: /Supabase and Qwen path verified/i },
  { path: '/updates/five-day-build-milestone/', heading: /Five days from idea/i },
  { path: '/updates/privacy-hardening/', heading: /Privacy controls now fail closed/i },
  { path: '/updates/version-code-4-aab/', heading: /versionCode 4 production AAB/i },
  { path: '/updates/version-code-5-account-presets/', heading: /Account-synced presets verified/i },
  { path: '/architecture/', heading: /AI advises\. Your boundary decides/i },
  { path: '/privacy/', heading: /A boundary should respect yours/i },
] as const;

function directProjectPath(path: string): string {
  return `${projectBase}${path}`;
}

function watchForUnexpectedRequests(page: Page): string[] {
  const unexpected: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return;
    unexpected.push(`${request.resourceType()}:${url.origin}`);
  });
  return unexpected;
}

async function visibleNavigation(page: Page) {
  const desktop = page.getByRole('navigation', { name: 'Primary navigation' });
  if (await desktop.isVisible()) return desktop;
  await page.locator('.mobile-nav > summary').click();
  return page.getByRole('navigation', { name: 'Mobile navigation' });
}

for (const route of routes) {
  test(`${route.path} is a direct-link-safe, semantic static route`, async ({ page }) => {
    const unexpectedRequests = watchForUnexpectedRequests(page);
    const response = await page.goto(directProjectPath(route.path), { waitUntil: 'networkidle' });

    expect(response, 'The direct GitHub project-page path should return a document').not.toBeNull();
    expect(response?.ok(), `Unexpected HTTP ${response?.status()} for ${route.path}`).toBe(true);
    expect(new URL(page.url()).pathname).toBe(directProjectPath(route.path));

    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('main#main-content')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.heading);
    await expect(await visibleNavigation(page)).toBeVisible();

    const duplicateIds = await page.locator('[id]').evaluateAll((elements) => {
      const counts = new Map<string, number>();
      for (const element of elements) {
        counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([id]) => id);
    });
    expect(duplicateIds, `Duplicate element IDs on ${route.path}`).toEqual([]);

    const basePathViolations = await page.locator('a[href^="/"]').evaluateAll(
      (links, expectedBase) =>
        links
          .map((link) => link.getAttribute('href'))
          .filter((href): href is string => href !== null && !href.startsWith(`${expectedBase}/`)),
      projectBase,
    );
    expect(basePathViolations, 'Internal links must retain the GitHub project-page base path').toEqual([]);

    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth - document.body.clientWidth,
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(overflow.body, `Body has ${overflow.body}px of horizontal overflow`).toBeLessThanOrEqual(1);
    expect(overflow.document, `Document has ${overflow.document}px of horizontal overflow`).toBeLessThanOrEqual(1);

    expect(unexpectedRequests, 'Static pages must not call Supabase or any third party in the browser').toEqual([]);
  });
}

test('the primary navigation keeps every destination under the project base', async ({ page }) => {
  await page.goto(directProjectPath('/'));
  const navigation = await visibleNavigation(page);

  const expectedLinks = [
    ['Home', '/'],
    ['System status', '/status/'],
    ['Updates', '/updates/'],
    ['Architecture flow', '/architecture/'],
    ['Privacy', '/privacy/'],
  ] as const;

  for (const [name, path] of expectedLinks) {
    await expect(navigation.getByRole('link', { name, exact: true })).toHaveAttribute(
      'href',
      directProjectPath(path),
    );
  }
});

test('the branded 404 is noindex and offers base-safe recovery links', async ({ page }) => {
  const response = await page.goto(directProjectPath('/not-a-real-route/'));

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/not part of the signal/i);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');

  const recovery = page.getByRole('navigation', { name: 'Page recovery' });
  await expect(recovery.getByRole('link', { name: /Go home/i })).toHaveAttribute(
    'href',
    directProjectPath('/'),
  );
  await expect(recovery.getByRole('link', { name: 'Check system status' })).toHaveAttribute(
    'href',
    directProjectPath('/status/'),
  );
  await expect(recovery.getByRole('link', { name: 'Read updates' })).toHaveAttribute(
    'href',
    directProjectPath('/updates/'),
  );
});
