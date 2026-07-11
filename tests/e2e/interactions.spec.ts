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

  for (const label of ['Live', 'Daily', 'Release', 'Manual pending']) {
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
