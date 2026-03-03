/**
 * Gift Cards E2E tests — full browser flows via Playwright.
 *
 * Runs in the `app` project (authenticated as playwright.e2e@test.sqirl.net).
 * Covers the gift card list page and detail page workflows.
 */
import { test, expect } from '@playwright/test';

test.describe('Gift Cards page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/gift-cards');
    await expect(page.getByRole('heading', { name: /Gift Cards/i })).toBeVisible();
  });

  // ── Page structure ─────────────────────────────────────────────────────────

  test('renders Add Card button and Active/Archived tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Add Card/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Active/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Archived/i })).toBeVisible();
  });

  // ── Add card via brand picker ──────────────────────────────────────────────

  test('adds a gift card and it appears in the active list', async ({ page }) => {
    const cardNum = `E2E-${Date.now()}`;

    await page.getByRole('button', { name: /Add Card/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Search for brand
    await page.getByPlaceholder(/Search brands/i).fill('Amazon');
    await page.getByText('Amazon').first().click();

    // Fill card number
    await page.getByLabel(/Card number/i).fill(cardNum);

    // Fill balance
    await page.getByLabel(/Opening balance/i).fill('75');

    // Submit
    await page.getByRole('button', { name: /Add Gift Card/i }).click();

    // Card should appear on the list
    await expect(page.getByText(cardNum)).toBeVisible();
  });

  // ── Card detail navigation ─────────────────────────────────────────────────

  test('clicking a card navigates to detail page', async ({ page }) => {
    // Add a card first
    await page.getByRole('button', { name: /Add Card/i }).click();
    await page.getByPlaceholder(/Search brands/i).fill('Steam');
    await page.getByText('Steam').first().click();
    await page.getByLabel(/Card number/i).fill(`STM-NAV-${Date.now()}`);
    await page.getByLabel(/Opening balance/i).fill('20');
    await page.getByRole('button', { name: /Add Gift Card/i }).click();

    // Click on the card
    await page.getByText('Steam').first().click();
    await expect(page.url()).toContain('/gift-cards/');
    await expect(page.getByText(/Balance/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Update Balance/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add Transaction/i })).toBeVisible();
  });

  // ── Update balance ─────────────────────────────────────────────────────────

  test('updates balance and transaction appears in history', async ({ page }) => {
    // Add a card
    await page.getByRole('button', { name: /Add Card/i }).click();
    await page.getByPlaceholder(/Search brands/i).fill('Google Play');
    await page.getByText('Google Play').first().click();
    await page.getByLabel(/Card number/i).fill(`GP-BAL-${Date.now()}`);
    await page.getByLabel(/Opening balance/i).fill('50');
    await page.getByRole('button', { name: /Add Gift Card/i }).click();

    // Navigate to detail
    await page.getByText('Google Play').first().click();

    // Update balance
    await page.getByRole('button', { name: /Update Balance/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel(/New balance/i).fill('35');
    await page.getByLabel(/Note/i).fill('Manual adjustment');
    await page.getByRole('button', { name: /Save/i }).click();

    // Balance on screen reflects new value
    await expect(page.getByText('$35')).toBeVisible();

    // Transaction appears in history
    await expect(page.getByText('balance_update')).toBeVisible();
  });

  // ── Add transaction ────────────────────────────────────────────────────────

  test('adds a spend transaction and balance decreases', async ({ page }) => {
    await page.getByRole('button', { name: /Add Card/i }).click();
    await page.getByPlaceholder(/Search brands/i).fill('Netflix');
    await page.getByText('Netflix').first().click();
    await page.getByLabel(/Card number/i).fill(`NF-TXN-${Date.now()}`);
    await page.getByLabel(/Opening balance/i).fill('30');
    await page.getByRole('button', { name: /Add Gift Card/i }).click();

    await page.getByText('Netflix').first().click();
    await page.getByRole('button', { name: /Add Transaction/i }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel(/Amount/i).fill('-10');
    // Set date
    await page.getByLabel(/Date/i).fill('2026-03-01');
    await page.getByLabel(/Location/i).fill('Online');
    await page.getByRole('button', { name: /Save Transaction/i }).click();

    await expect(page.getByText('$20')).toBeVisible();
    await expect(page.getByText('spend')).toBeVisible();
  });

  // ── Archive tab ────────────────────────────────────────────────────────────

  test('archived cards appear only in Archived tab', async ({ page }) => {
    // Add card
    await page.getByRole('button', { name: /Add Card/i }).click();
    await page.getByPlaceholder(/Search brands/i).fill('Spotify');
    await page.getByText('Spotify').first().click();
    await page.getByLabel(/Card number/i).fill(`SP-ARCH-${Date.now()}`);
    await page.getByLabel(/Opening balance/i).fill('15');
    await page.getByRole('button', { name: /Add Gift Card/i }).click();

    // Navigate to detail, archive it
    await page.getByText('Spotify').first().click();
    await page.getByRole('button', { name: /Archive/i }).click();
    await page.goBack();

    // Should not appear in Active tab
    const activeList = page.locator('[data-testid="active-cards"]');
    await expect(activeList.getByText('Spotify')).not.toBeVisible();

    // Should appear in Archived tab
    await page.getByRole('button', { name: /Archived/i }).click();
    await expect(page.getByText('Spotify')).toBeVisible();
  });

  // ── PIN masking ────────────────────────────────────────────────────────────

  test('PIN is masked by default and toggles on icon click', async ({ page }) => {
    // Add card with PIN
    await page.getByRole('button', { name: /Add Card/i }).click();
    await page.getByPlaceholder(/Search brands/i).fill('Woolworths');
    await page.getByText('Woolworths').first().click();
    await page.getByLabel(/Card number/i).fill(`WW-PIN-${Date.now()}`);
    await page.getByLabel(/Opening balance/i).fill('40');
    await page.getByLabel(/PIN/i).fill('4567');
    await page.getByRole('button', { name: /Add Gift Card/i }).click();

    await page.getByText('Woolworths').first().click();

    // PIN should appear masked
    await expect(page.getByText('••••')).toBeVisible();

    // Click eye icon to reveal
    await page.getByRole('button', { name: /Show PIN/i }).click();
    await expect(page.getByText('4567')).toBeVisible();

    // Click again to mask
    await page.getByRole('button', { name: /Hide PIN/i }).click();
    await expect(page.getByText('••••')).toBeVisible();
  });

  // ── Delete card ────────────────────────────────────────────────────────────

  test('delete removes card from active list', async ({ page }) => {
    await page.getByRole('button', { name: /Add Card/i }).click();
    await page.getByPlaceholder(/Search brands/i).fill('Xbox');
    await page.getByText('Xbox').first().click();
    await page.getByLabel(/Card number/i).fill(`XBX-DEL-${Date.now()}`);
    await page.getByLabel(/Opening balance/i).fill('25');
    await page.getByRole('button', { name: /Add Gift Card/i }).click();

    await page.getByText('Xbox').first().click();

    page.on('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /Delete/i }).click();

    // Should navigate back to list
    await expect(page.url()).toMatch(/\/gift-cards$/);
    await expect(page.getByText('XBX-DEL')).not.toBeVisible();
  });
});
