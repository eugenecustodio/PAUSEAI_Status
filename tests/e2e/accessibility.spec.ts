import { expect, test, type Locator, type Page } from '@playwright/test';

const homePath = '/PAUSEAI_Status/';

async function tabUntilFocused(page: Page, locator: Locator, attempts = 12): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await page.keyboard.press('Tab');
    if (await locator.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Element did not receive keyboard focus after ${attempts} Tab presses`);
}

test('skip navigation and the primary links work from the keyboard', async ({ page }) => {
  await page.goto(homePath);

  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();

  await page.keyboard.press('Enter');
  await expect(page.locator('main#main-content')).toBeFocused();

  await page.goto(homePath);
  const architecture = page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Architecture flow', exact: true });
  await tabUntilFocused(page, architecture);
  await expect(architecture).toBeFocused();

  const focusStyle = await architecture.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
  });
  expect(focusStyle.outlineStyle).not.toBe('none');
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/PAUSEAI_Status\/architecture\/$/);
  await expect(
    page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Architecture flow', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
});

test('prefers-reduced-motion removes non-essential motion and preserves content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(homePath, { waitUntil: 'networkidle' });

  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const hiddenReveals = await page.locator('[data-reveal]').evaluateAll((elements) =>
    elements.filter((element) => {
      const style = getComputedStyle(element);
      return style.opacity === '0' || style.visibility === 'hidden';
    }).length,
  );
  expect(hiddenReveals, 'Scroll-revealed content must remain visible with reduced motion').toBe(0);

  const longestActiveAnimation = await page.evaluate(() => {
    const durations = document.getAnimations().map((animation) => {
      const duration = animation.effect?.getComputedTiming().duration;
      return typeof duration === 'number' ? duration : 0;
    });
    return Math.max(0, ...durations);
  });
  expect(longestActiveAnimation).toBeLessThanOrEqual(1);
});
