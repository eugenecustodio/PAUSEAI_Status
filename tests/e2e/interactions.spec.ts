import { expect, test } from '@playwright/test';

const projectBase = '/PAUSEAI_Status';

test('the product film is user-controlled, local, lazy, and replaceable at its stable path', async ({
  page,
  request,
}) => {
  await page.goto(`${projectBase}/`);

  const video = page.getByLabel('PAUSE AI 45-second product film');
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute('controls', '');
  expect(await video.getAttribute('autoplay')).toBeNull();
  await expect(video).toHaveAttribute('preload', 'none');
  await expect(video).toHaveAttribute('poster', `${projectBase}/media/pause-app-video-poster.png`);

  const source = video.locator('source[type="video/mp4"]');
  await expect(source).toHaveAttribute('src', `${projectBase}/media/pause-app-video.mp4`);
  const fallback = video.locator(`a[href="${projectBase}/media/pause-app-video.mp4"]`);
  await expect(fallback).toHaveCount(1);
  await expect(fallback).toContainText(/open the PAUSE AI product film/i);

  const videoResponse = await request.fetch(`${projectBase}/media/pause-app-video.mp4`, {
    method: 'HEAD',
  });
  expect(videoResponse.ok()).toBe(true);
  expect(videoResponse.headers()['content-type']).toContain('video/mp4');

  const posterResponse = await request.fetch(`${projectBase}/media/pause-app-video-poster.png`, {
    method: 'HEAD',
  });
  expect(posterResponse.ok()).toBe(true);
  expect(posterResponse.headers()['content-type']).toContain('image/png');
});

test('update filtering is accessible and restores the complete journal', async ({ page }) => {
  await page.goto(`${projectBase}/updates/`);

  const filters = page.getByLabel('Filter updates by category');
  const cards = page.locator('[data-update-card]:visible');
  const result = page.getByRole('status');
  await expect(filters.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(cards).toHaveCount(6);

  const backend = filters.getByRole('button', { name: 'Backend', exact: true });
  const all = filters.getByRole('button', { name: 'All', exact: true });
  await all.focus();
  await page.keyboard.press('ArrowRight');
  await expect(backend).toBeFocused();
  await expect(backend).toHaveAttribute('aria-pressed', 'true');
  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole('heading')).toContainText(/Supabase and Qwen/i);
  await expect(result).toHaveText('1 backend update shown.');

  await all.click();
  await expect(cards).toHaveCount(6);
  await expect(result).toHaveText('6 updates shown.');
});

test('updates remain one complete journal with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto(`${projectBase}/updates/`);
  await expect(page.locator('[data-update-card]')).toHaveCount(6);
  await expect(page.getByLabel('Filter updates by category')).toHaveCount(0);
  await expect(page.locator('astro-island')).toHaveCount(0);

  await context.close();
});

test('update statuses are humanized and chronology links remain base-safe', async ({ page }) => {
  await page.goto(`${projectBase}/updates/version-code-4-aab/`);

  await expect(page.locator('.article-status')).toHaveText('In progress');
  await expect(page.locator('main')).not.toContainText('in_progress');
  const chronology = page.getByRole('navigation', { name: 'Update chronology' });
  const links = await chronology.locator('a').evaluateAll((items) =>
    items.map((item) => item.getAttribute('href')),
  );
  expect(links.every((href) => href?.startsWith(`${projectBase}/updates/`))).toBe(true);
});

test('status uses explicit state text and separates each evidence layer', async ({ page }) => {
  await page.goto(`${projectBase}/status/`);
  const main = page.locator('main#main-content');

  for (const label of ['Live', 'Daily', 'Release', 'Manual']) {
    await expect(main.getByText(label, { exact: true }).first()).toBeVisible();
  }

  const statusElements = main.locator('[data-health-status]');
  expect(await statusElements.count(), 'Status should expose machine-readable state hooks').toBeGreaterThan(0);

  const states = await statusElements.evaluateAll((elements) =>
    elements.map((element) => ({
      state: element.getAttribute('data-health-status'),
      text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    })),
  );
  const allowedStates = new Set(['operational', 'degraded', 'outage', 'unknown', 'not_configured']);
  for (const item of states) {
    expect(allowedStates.has(item.state ?? ''), `Unexpected public status: ${item.state}`).toBe(true);
    expect(item.text.length, 'Status must have a visible text label; color alone is insufficient').toBeGreaterThan(0);
  }

  await expect(main).toContainText(/probe success rate/i);
  await expect(main).toContainText(/not (?:(?:a|an) )?(?:contractual )?uptime(?: promise| guarantee)?/i);
});

test('mobile status keeps every live-component evidence label readable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`${projectBase}/status/`);

  const labels = page.locator('.component-summary small');
  await expect(labels).toHaveCount(4);
  const readability = await labels.evaluateAll((items) =>
    items.map((item) => ({
      text: item.textContent?.trim(),
      clipped: item.scrollWidth > item.clientWidth || item.scrollHeight > item.clientHeight,
      whiteSpace: getComputedStyle(item).whiteSpace,
    })),
  );
  expect(readability.map((item) => item.text)).toEqual([
    'Supabase Auth gateway',
    'Synthetic health account',
    'Database and Row Level Security',
    'Edge Function availability',
  ]);
  expect(readability.every((item) => !item.clipped && item.whiteSpace !== 'nowrap')).toBe(true);
});

test('status freshness expires locally without erasing the latest recorded result', async ({ page }) => {
  await page.goto(`${projectBase}/status/`);
  const root = page.locator('[data-status-freshness-root]');
  const currentLabel = root.locator('[data-current-status-label]');
  const latestResult = root.locator('.signal-facts').getByText('Operational', { exact: true });

  await root.evaluate((element) => {
    element.setAttribute('data-generated-at', new Date(Date.now() - 119 * 60_000).toISOString());
    element.setAttribute('data-recorded-status', 'operational');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(root).toHaveAttribute('data-current-freshness', 'fresh');
  await expect(currentLabel).toHaveText('Operational');
  await expect(latestResult).toBeVisible();
  await expect(root.locator('[data-stale-notice]')).toBeHidden();

  await root.evaluate((element) => {
    element.setAttribute('data-generated-at', new Date(Date.now() - 121 * 60_000).toISOString());
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(root).toHaveAttribute('data-current-freshness', 'stale');
  await expect(currentLabel).toHaveText('Unknown');
  await expect(root.locator('[data-current-status-summary]')).toContainText(/last recorded result was operational/i);
  await expect(latestResult).toBeVisible();
  await expect(root.locator('[data-stale-notice]')).toBeVisible();
});

test('homepage freshness expires locally without hiding its latest recorded evidence', async ({ page }) => {
  await page.goto(`${projectBase}/`, { waitUntil: 'networkidle' });
  const root = page.locator('[data-health-preview][data-status-freshness-root]');
  const currentLabel = root.locator('[data-current-status-label]');
  const recordedResult = root.getByText(/Latest recorded result:/).locator('strong');
  const browserRequests: string[] = [];

  page.on('request', (request) => {
    if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
      browserRequests.push(request.url());
    }
  });

  await root.evaluate((element) => {
    element.setAttribute('data-generated-at', new Date(Date.now() - 119 * 60_000).toISOString());
    element.setAttribute('data-recorded-status', 'operational');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(root).toHaveAttribute('data-current-freshness', 'fresh');
  await expect(currentLabel).toHaveText('Operational');
  await expect(recordedResult).toHaveText('Operational');
  await expect(root.locator('[data-stale-notice]')).toBeHidden();

  await root.evaluate((element) => {
    element.setAttribute('data-generated-at', new Date(Date.now() - 121 * 60_000).toISOString());
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(root).toHaveAttribute('data-current-freshness', 'stale');
  await expect(currentLabel).toHaveText('Unknown');
  await expect(root.locator('[data-current-status-summary]')).toContainText(
    /last recorded result was operational/i,
  );
  await expect(recordedResult).toHaveText('Operational');
  await expect(root.locator('[data-stale-notice]')).toBeVisible();
  expect(browserRequests, 'Freshness rollover must not make a browser request').toEqual([]);
});

test('the canonical versionCode 5 release facts and external-link notices stay aligned', async ({
  page,
}) => {
  await page.goto(`${projectBase}/`);
  const proof = page.locator('.proof-band');

  await expect(proof).toContainText('429 tests');
  await expect(proof).toContainText('37 automated suites passed for versionCode 5');
  await expect(proof).toContainText('53 tests');
  await expect(proof).toContainText('9 functions');
  await expect(proof).toContainText('Expo SDK 56');
  await expect(proof).toContainText('Expo Doctor passed 21 of 21 project checks');

  const buildLink = proof.getByRole('link', { name: /Inspect build \(opens in a new tab\)/i });
  await expect(buildLink).toHaveAttribute(
    'href',
    'https://expo.dev/accounts/anothergenee/projects/pause-boundary-broker/builds/8b4b2bf3-4daf-491f-a368-bdc08c98590a',
  );
  await expect(buildLink).toHaveAttribute('target', '_blank');
  await expect(buildLink).toHaveAttribute('rel', 'noreferrer');

  await page.goto(`${projectBase}/status/`);
  await expect(
    page.getByRole('heading', { level: 2, name: 'PAUSE 0.1.0 · versionCode 5.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Inspect the EAS build \(opens in a new tab\)/i }),
  ).toHaveAttribute('target', '_blank');
});

test('the install manifest and standard icons remain base-safe and loadable', async ({ page, request }) => {
  await page.goto(`${projectBase}/`);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    `${projectBase}/site.webmanifest`,
  );

  const manifestResponse = await request.get(`${projectBase}/site.webmanifest`);
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.start_url).toBe(`${projectBase}/`);
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: `${projectBase}/icon-192.png`, sizes: '192x192' }),
      expect.objectContaining({ src: `${projectBase}/icon-512.png`, sizes: '512x512' }),
    ]),
  );

  for (const icon of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon.svg']) {
    const response = await request.get(`${projectBase}/${icon}`);
    expect(response.ok(), `${icon} should load beneath the project base`).toBe(true);
  }
});
