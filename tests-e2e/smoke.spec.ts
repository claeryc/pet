// Smoke test: the game loads with no errors, and every Feed, Play and Menu
// item opens without an error. Runs with `npm run e2e` (not part of vitest).

import { expect, test, type Page } from '@playwright/test';

// Collects console errors and uncaught page errors.
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

// A grown-up pet with every menu showing and every guide read, so nothing
// pops up in the way. Written straight into the save, then the page reloads.
async function seedAdult(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createNewGame } = await import('/src/game/state.ts');
    const { GUIDES } = await import('/src/game/guides.ts');
    const { SAVE_VERSION } = await import('/src/storage/storage.ts');
    const s = createNewGame(Date.now());
    s.pet = { ...s.pet, stage: 'adult', character: 'sprig', variant: null, named: true, name: 'Mochi', destinedTheme: null };
    s.showAllMenus = true;
    s.guidesRead = [...GUIDES];
    s.gold = 5000;
    localStorage.setItem('cozy-pixel-pet-save', JSON.stringify({ version: SAVE_VERSION, state: s }));
  });
}

// Loads the seeded game fresh and waits for the bottom buttons.
async function openGame(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
  await page.waitForTimeout(300);
}

// The items in one drawer: Feed and Play list options, Menu shows tiles.
const DRAWERS = [
  { name: 'Feed', items: '.drawer-option' },
  { name: 'Play', items: '.drawer-option' },
  { name: 'Menu', items: '.menu-tile' },
] as const;

test('the game opens with no errors', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
  // Nothing is wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const drawer of DRAWERS) {
  test(`every ${drawer.name} item opens with no errors`, async ({ page }) => {
    const errors = watchErrors(page);
    await seedAdult(page);
    await openGame(page);
    const open = async () => {
      await page.getByRole('button', { name: drawer.name, exact: true }).click();
      await page.waitForTimeout(400);
      return page.locator(`.drawer.is-open ${drawer.items}:visible`);
    };
    const count = await (await open()).count();
    expect(count, `${drawer.name} has items`).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      // Start each item from a fresh load, so one item can't hide another.
      await openGame(page);
      const items = await open();
      const item = items.nth(i);
      const label = (await item.textContent())?.trim().slice(0, 40);
      if (await item.isDisabled()) continue;
      await item.click();
      await page.waitForTimeout(800);
      expect(errors, `after ${drawer.name} > ${label}`).toEqual([]);
    }
  });
}
