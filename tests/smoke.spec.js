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

    test('county tab is hidden for metrics without county data', async ({ page }) => {
        await page.goto('/');
        // naep_math_8 has no county-level data - tab must remain hidden
        await page.locator('[data-metric="naep_math_8"]').click();
        await expect(page.locator('#modal-overlay')).toBeVisible();
        await expect(page.locator('#tab-county')).not.toBeVisible();
    });
});

// ---------------------------------------------------------------------------
// URL routing - hash and path-based routes must all open the correct view
// ---------------------------------------------------------------------------

test.describe('URL routing', () => {
    test('hash route opens correct modal', async ({ page }) => {
        await page.goto('/#violent_crime_rate');
        await expect(page.locator('#modal-overlay')).toBeVisible();
        const title = await page.locator('#modal-title').textContent();
        expect(title).toBeTruthy();
    });

    // /t/{slug}/ redirect pages serve the OG meta then redirect to /#slug
    test('/t/{slug}/ opens modal on trend tab', async ({ page }) => {
        await page.goto('/t/violent_crime_rate/');
        await expect(page.locator('#modal-overlay')).toBeVisible();
        await expect(page.locator('#modal-chart')).toBeVisible();
    });

    // /r/{slug}/ redirect pages redirect to /#slug/rankings
    test('/r/{slug}/ opens modal on rank tab', async ({ page }) => {
        await page.goto('/r/violent_crime_rate/');
        await expect(page.locator('#modal-overlay')).toBeVisible();
        await expect(page.locator('#modal-rankings canvas')).toBeVisible();
    });

    // /rh/{slug}/ redirect pages redirect to /#slug/rank-history
    test('/rh/{slug}/ opens modal on rank history tab', async ({ page }) => {
        await page.goto('/rh/violent_crime_rate/');
        await expect(page.locator('#modal-overlay')).toBeVisible();
        await expect(page.locator('#modal-rank-history')).toBeVisible();
    });

    // /rh/{slug}/{code}/ redirect pages redirect to /#slug/rank-history/{code}
    // slugToState('ca') must resolve to 'California' and the comparison dropdown must show the state
    test('/rh/{slug}/{code}/ opens rank history with comparison state active', async ({ page }) => {
        await page.goto('/rh/violent_crime_rate/ca/');
        await expect(page.locator('#modal-overlay')).toBeVisible();
        await expect(page.locator('#modal-rank-history')).toBeVisible();
        // The shared compare dropdown should have California selected
        const select = page.locator('#compare-select');
        await expect(select).toBeVisible();
        const selectedValue = await select.inputValue();
        expect(selectedValue).toBe('California');
    });
});

// ---------------------------------------------------------------------------
// Bottom Line brief (dynamic summary above all tabs)
// ---------------------------------------------------------------------------

test.describe('Bottom Line brief', () => {
    test('shows brief text with current value and rank', async ({ page }) => {
        await page.goto('/');
        await page.locator('[data-metric="violent_crime_rate"]').click();
        await expect(page.locator('#modal-overlay')).toBeVisible();

        const brief = page.locator('#modal-brief');
        await expect(brief).toBeVisible();
        const text = await brief.textContent();
        expect(text).toContain('Bottom line:');
        expect(text).toContain('ranking #');
        expect(text).toContain('Keep in mind:');
    });

    test('brief persists when switching tabs', async ({ page }) => {
        await page.goto('/');
        await page.locator('[data-metric="violent_crime_rate"]').click();
        await expect(page.locator('#modal-brief')).toBeVisible();

        // Switch to Rank tab - brief should still be visible
        await page.locator('#tab-rankings').click();
        await expect(page.locator('#modal-brief')).toBeVisible();
    });
});

// ---------------------------------------------------------------------------
// Jump to metric dropdown
// ---------------------------------------------------------------------------

test.describe('Jump to metric dropdown', () => {
    test('dropdown opens on click and contains metrics grouped by area', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.card[data-metric]');

        await page.locator('#metric-search-trigger').click();
        const dropdown = page.locator('#metric-search-dropdown');
        await expect(dropdown).toBeVisible();

        // Should have area group headers
        const headers = dropdown.locator('.metric-search-group-header');
        expect(await headers.count()).toBeGreaterThanOrEqual(5);

        // Should have metric items
        const items = dropdown.locator('.metric-search-item');
        expect(await items.count()).toBe(26);
    });

    test('selecting a metric opens its modal', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.card[data-metric]');

        await page.locator('#metric-search-trigger').click();
        await page.locator('.metric-search-item[data-slug="unemployment_rate"]').click();
        await expect(page.locator('#modal-overlay')).toBeVisible();
        const title = await page.locator('#modal-title').textContent();
        expect(title).toBe('Unemployment Rate');
    });
});

// ---------------------------------------------------------------------------
// Module loading (all JS modules load without errors)
// ---------------------------------------------------------------------------

test.describe('Module loading', () => {
    test('all modules are defined after page load', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.card[data-metric]');

        const modules = await page.evaluate(() => ({
            App: typeof App,
            Modal: typeof Modal,
            Export: typeof Export,
            Router: typeof Router,
            Compute: typeof Compute,
            ChartUtils: typeof ChartUtils,
        }));

        expect(modules.App).toBe('object');
        expect(modules.Modal).toBe('object');
        expect(modules.Export).toBe('object');
        expect(modules.Router).toBe('object');
        expect(modules.Compute).toBe('object');
        expect(modules.ChartUtils).toBe('object');
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

    test('renders one row per metric (26 rows)', async ({ page }) => {
        await page.goto('/five-year-change/');
        // Rows are in collapsed accordions; wait for DOM attachment
        await page.waitForSelector('.fyc-row', { state: 'attached' });
        const rows = await page.locator('.fyc-row').all();
        expect(rows.length).toBeGreaterThanOrEqual(26);
    });
});
