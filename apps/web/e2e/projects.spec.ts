import { expect, test } from '@playwright/test';
import { createDesign, waitForSaved } from './support';

test('projects: folders, moving designs (menu and drag) and stars', async ({ page }) => {
  // Two designs.
  await createDesign(page, 'instagram-post');
  await waitForSaved(page);
  await createDesign(page, 'presentation');
  await waitForSaved(page);

  await page.goto('/designs');
  await expect(page.getByTestId('design-card')).toHaveCount(2);

  // New folder.
  await page.getByTestId('new-folder').click();
  await page.getByTestId('folder-name').fill('Campaign');
  await page.getByTestId('save-folder').click();
  await expect(page.getByTestId('folder-card')).toHaveCount(1);
  await expect(page.getByTestId('folder-name-label')).toHaveText('Campaign');

  // Move the first design with its menu.
  const first = page.getByTestId('design-card').first();
  const firstTitle = await first.getByTestId('design-title').textContent();
  await first.hover();
  await first.getByTestId('design-menu').click();
  await page.getByRole('menuitem', { name: 'Move to folder' }).click();
  await page.getByTestId('move-to-folder').click();
  await expect(page.getByTestId('folder-card')).toContainText('1 designs');

  // Drag the other design onto the folder.
  await page.getByTestId('design-card').nth(1).dragTo(page.getByTestId('folder-card'));
  await expect(page.getByTestId('folder-card')).toContainText('2 designs');

  // Inside the folder: both designs; star one.
  await page.getByTestId('folder-link').click();
  await expect(page.getByTestId('projects-title')).toHaveText('Campaign');
  await expect(page.getByTestId('design-card')).toHaveCount(2);
  const second = page
    .getByTestId('design-card')
    .filter({ hasNotText: firstTitle ?? '' })
    .first();
  await second.hover();
  await second.getByTestId('design-menu').click();
  await page.getByTestId('design-star').click();
  // Starred designs come first.
  await expect(page.getByTestId('design-card').first().getByLabel('Starred')).toBeVisible();

  // Deleting the folder keeps the designs.
  await page.goto('/designs');
  await page.getByTestId('folder-card').hover();
  await page.getByTestId('folder-menu').click();
  await page.getByRole('menuitem', { name: 'Delete folder' }).click();
  await page.getByTestId('confirm-delete-folder').click();
  await expect(page.getByTestId('folder-card')).toHaveCount(0);
  await expect(page.getByTestId('design-card')).toHaveCount(2);
});

test('a design created inside a folder goes into it', async ({ page }) => {
  await page.goto('/designs');
  await page.getByTestId('new-folder').click();
  await page.getByTestId('folder-name').fill('Print');
  await page.getByTestId('save-folder').click();
  await page.getByTestId('folder-link').click();
  await page.getByTestId('create-in-folder').click();
  await page.getByTestId('create-search').fill('poster');
  await page.getByTestId('create-dialog').getByTestId('format-poster').click();
  await page.waitForURL(/\/design\//);
  await page.goto('/designs');
  await expect(page.getByTestId('folder-card')).toContainText('1 designs');
});
