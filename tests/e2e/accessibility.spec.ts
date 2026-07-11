import { expect, test, type Locator, type Page } from '@playwright/test';

const homePath = '/PAUSEAI_Status/';

async function tabUntilFocused(page: Page, locator: Locator, attempts = 12): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await page.keyboard.press('Tab');
    if (await locator.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Element did not receive keyboard focus after ${attempts} Tab presses`);
}

async function visibleNavigation(page: Page): Promise<Locator> {
  const menu = page.locator('.mobile-nav > summary');
  if (await menu.isVisible()) {
    await menu.click();
    return page.getByRole('navigation', { name: 'Mobile navigation' });
  }
  return page.getByRole('navigation', { name: 'Primary navigation' });
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
  const architecture = (await visibleNavigation(page))
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
    (await visibleNavigation(page)).getByRole('link', { name: 'Architecture flow', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
});

test('the compact navigation provides readable 44px mobile targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(homePath);

  const menu = page.locator('.mobile-nav > summary');
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox?.height).toBeGreaterThanOrEqual(44);

  await menu.focus();
  await page.keyboard.press('Enter');
  const navigation = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(navigation).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(navigation).toBeHidden();
  await expect(menu).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(navigation).toBeVisible();
  const targetHeights = await navigation.getByRole('link').evaluateAll((links) =>
    links.map((link) => link.getBoundingClientRect().height),
  );
  expect(targetHeights.length).toBeGreaterThan(0);
  expect(Math.min(...targetHeights)).toBeGreaterThanOrEqual(44);

  const smallestLabel = await navigation.getByRole('link').evaluateAll((links) =>
    Math.min(...links.map((link) => Number.parseFloat(getComputedStyle(link).fontSize))),
  );
  expect(smallestLabel).toBeGreaterThanOrEqual(15);
});

test('every visible navigation link keeps a 44px target', async ({ page }) => {
  await page.goto(homePath);

  const mobileMenu = page.locator('.mobile-nav > summary');
  if (await mobileMenu.isVisible()) await mobileMenu.click();

  const targetHeights = await page.locator('nav a').evaluateAll((links) =>
    links
      .map((link) => link.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => rect.height),
  );
  expect(targetHeights.length).toBeGreaterThan(0);
  expect(Math.min(...targetHeights)).toBeGreaterThanOrEqual(44);
});

test('the complete homepage remains visible without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(homePath);

  await expect(page.getByRole('heading', { level: 1, name: /Own the interruption/i })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /See the boundary in motion/i })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /A product record you can inspect/i })).toBeVisible();

  const hiddenSections = await page.locator('main > section').evaluateAll((sections) =>
    sections.filter((section) => {
      const style = getComputedStyle(section);
      return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
    }).length,
  );
  expect(hiddenSections).toBe(0);
  await context.close();
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
