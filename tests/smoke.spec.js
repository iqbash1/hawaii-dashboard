// @ts-check
/**
 * Hawaii Dashboard Smoke Tests
 *
 * Critical-path tests that catch regressions before they reach production.
 * Run: cd tests && npm test
 * CI:  runs automatically on every push to main via .github/workflows/tests.yml
 */

const { test, expect } = require('@playwright/test');

// ---------------------------------------------------------------------------
// Homepage
// ---------------------------------------------------------------------------

test.describe('Homepage', () => {
    test('loads without JS errors', async ({ page }) => {
        const jsErrors = [];
        page.on('pageerror', (err) => jsErrors.push(err.message));

        await page.goto('/');
        await page.waitForSelector('.card[data-metric]', { timeout: 10_000 });

        expect(jsErrors, `JS errors on page load: ${jsErrors.join('; ')}`).toHaveLength(0);
    });

    test('renders 26 metric cards', async ({ page }) => {
        await page.goto('/');
        const cards = await page.locator('.card[data-metric]').all();
        expect(cards.length).toBe(26);
    });

    test('each card shows a value and sparkline canvas', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.card[data-metric]');

        // Spot-check first card has a hero value and a canvas
        const firstCard = page.locator('.card[data-metric]').first();
        await expect(firstCard.locator('.card-hawaii-value')).toBeVisible();
        await expect(firstCard.locator('canvas')).toBeVisible();
    });
});

// ---------------------------------------------------------------------------
// Modal tabs (regression: adding overflow-x to .modal-tabs hid all but 1 tab)
// ---------------------------------------------------------------------------

test.describe('Metric modal tabs', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Click a ranked metric that has all 3 tabs: violent_crime_rate
        await page.locator('[data-metric="violent_crime_rate"]').click();
        await expect(page.locator('#modal-overlay')).toBeVisible();
    });

    test('all three tabs are visible', async ({ page }) => {
        await expect(page.locator('#tab-detail')).toBeVisible();
        await expect(page.locator('#tab-rankings')).toBeVisible();
        await expect(page.locator('#tab-rank-history')).toBeVisible();
    });

    test('Trend tab shows chart', async ({ page }) => {
        await page.locator('#tab-detail').click();
        await expect(page.locator('#modal-chart')).toBeVisible();
    });

    test('Rank tab shows rankings chart', async ({ page }) => {
        await page.locator('#tab-rankings').click();
        await expect(page.locator('#modal-rankings')).toBeVisible();
        await expect(page.locator('#modal-rankings canvas')).toBeVisible();
    });

    test('Rank history tab renders without error', async ({ page }) => {
        const jsErrors = [];
        page.on('pageerror', (err) => jsErrors.push(err.message));

        await page.locator('#tab-rank-history').click();
        await expect(page.locator('#modal-rank-history')).toBeVisible();

        expect(jsErrors).toHaveLength(0);
    });

    test('modal closes on X button', async ({ page }) => {
        await page.locator('#modal-close').click();
        await expect(page.locator('#modal-overlay')).not.toBeVisible();
    });
});

// ---------------------------------------------------------------------------
// 5-year comparison badges
// ---------------------------------------------------------------------------

test.describe('5-year comparison badges', () => {
    test('ranked metric shows rank comparison badge', async ({ page }) => {
        await page.goto('/');
        // violent_crime_rate has rank data and year history
        const card = page.locator('[data-metric="violent_crime_rate"]');
        await expect(card.locator('.comp-rank')).toBeVisible();
    });

    test('food_insecurity_rate shows year-over-year badge (range-key format)', async ({ page }) => {
        await page.goto('/');
        // food_insecurity_rate uses "YYYY-YYYY" rolling-average range keys.
        // buildVsYearHtml must handle this format or the badge will be missing.
        const card = page.locator('[data-metric="food_insecurity_rate"]');
        const badges = card.locator('.card-comp');
        await expect(badges.first()).toBeVisible();
        const count = await badges.count();
        expect(count, 'food_insecurity_rate should show at least 1 comparison badge').toBeGreaterThanOrEqual(1);
    });

    // Regression: buildVsYearHtml used bare keyEnd() which broke when refactored to this.keyEnd().
    // This test verifies all 26 cards render their comparison badges (proving renderCards() ran fully).
    test('all 26 cards render without JS errors (buildVsYearHtml regression)', async ({ page }) => {
        const jsErrors = [];
        page.on('pageerror', (err) => jsErrors.push(err.message));

        await page.goto('/');
        await page.waitForSelector('[data-metric]', { timeout: 10_000 });

        const cards = await page.locator('[data-metric]').all();
        expect(cards.length, 'all 26 metric cards should render').toBe(26);
        expect(jsErrors, `JS errors during renderCards: ${jsErrors.join('; ')}`).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// County-level tab
// ---------------------------------------------------------------------------

test.describe('County-level tab', () => {
    test('shows county chart for a metric that has county data', async ({ page }) => {
        await page.goto('/');
        // unemployment_rate has county data (first entry in COUNTY_DATA)
        await page.locator('[data-metric="unemployment_rate"]').click();
        await expect(page.locator('#modal-overlay')).toBeVisible();

        // Wait for county tab to become visible (it is hidden when no county data)
        const countyTab = page.locator('#tab-county');
        await expect(countyTab).toBeVisible({ timeout: 5_000 });
        await countyTab.click();

        await expect(page.locator('#modal-county')).toBeVisible();
        await expect(page.locator('#county-chart')).toBeVisible();
    });
});

// ---------------------------------------------------------------------------
// Deep-link / URL routing
// ---------------------------------------------------------------------------

test.describe('URL routing', () => {
    test('direct URL opens correct modal', async ({ page }) => {
        await page.goto('/#violent_crime_rate');
        await expect(page.locator('#modal-overlay')).toBeVisible();
        // Modal title should contain the metric name
        const title = await page.locator('#modal-title').textContent();
        expect(title).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// Five-year-change page
// ---------------------------------------------------------------------------

test.describe('Five-year-change page', () => {
    test('loads without JS errors', async ({ page }) => {
        const jsErrors = [];
        page.on('pageerror', (err) => jsErrors.push(err.message));

        await page.goto('/five-year-change/');
        // Rows exist in collapsed accordions; wait for DOM attachment, not visibility
        await page.waitForSelector('.fyc-row', { state: 'attached', timeout: 10_000 });

        expect(jsErrors, `JS errors: ${jsErrors.join('; ')}`).toHaveLength(0);
    });

    test('renders metric rows', async ({ page }) => {
        await page.goto('/five-year-change/');
        // Rows are in collapsed accordions; wait for DOM attachment
        await page.waitForSelector('.fyc-row', { state: 'attached' });
        const rows = await page.locator('.fyc-row').all();
        expect(rows.length).toBeGreaterThan(20);
    });
});
