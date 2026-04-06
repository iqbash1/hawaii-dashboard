// ============================================================
// Hawaiʻi Dashboard - Main App
//
// Renders metric cards, manages the detail modal, handles
// URL routing, and manages data export. Data is updated
// annually from federal sources via the automated pipeline.
// Build: 2026-04-04
// ============================================================

const STATE_ABBREVS = {
    'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
    'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
    'Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS',
    'Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA',
    'Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT',
    'Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM',
    'New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK',
    'Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
    'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
    'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
    'Hawai\u02BBi':'HI','Hawaii':'HI',
};

const AREA_ICONS = {
    'Safety & Health': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0D7C8F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    'Housing & Cost of Living': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0D7C8F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    'Economy & Workforce': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0D7C8F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    'Education': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0D7C8F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 3 3 6 3s6-1 6-3v-5"/></svg>',
    'Infrastructure, Resilience & Trust': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0D7C8F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="22" height="4" rx="1"/><line x1="6" y1="10" x2="6" y2="20"/><line x1="18" y1="10" x2="18" y2="20"/><line x1="3" y1="20" x2="21" y2="20"/></svg>',
};

// Per-metric templates for the "Copy brief" feature.
// Each entry has an `intro` (sentence opener with {{value}} / {{period}})
// and a `caveat` ("Keep in mind" closer).
const BRIEF_TEMPLATES = {
    violent_crime_rate: {
        intro: "Hawai\u02BBi's violent crime rate is {{value}} ({{period}})",
        caveat: "pre-1985 coverage is incomplete, so long-run comparisons should lean on the later series."
    },
    property_crime_rate: {
        intro: "Hawai\u02BBi's property crime rate is {{value}} ({{period}})",
        caveat: "pre-1985 coverage is incomplete, so long-run comparisons should lean on the later series."
    },
    pcp_per_100k: {
        intro: "Hawai\u02BBi has {{value}} primary care physicians per 100,000 residents ({{period}})",
        caveat: "this measures provider supply, not actual patient access or wait times."
    },
    uninsured_rate: {
        intro: "Hawai\u02BBi's uninsured rate is {{value}} ({{period}})",
        caveat: "this is a survey estimate, so small differences may not be meaningful."
    },
    suicide_rate: {
        intro: "Hawai\u02BBi's suicide rate is {{value}} ({{period}})",
        caveat: "Hawai\u02BBi's small population makes this rate volatile, so single-year swings can mislead."
    },
    renter_cost_burden_pct: {
        intro: "{{value}} of Hawai\u02BBi renters were housing-cost burdened in {{period}}",
        caveat: "the 30% threshold is a convention, not a hard affordability cliff."
    },
    home_price_to_income: {
        intro: "Hawai\u02BBi's home price-to-income ratio is {{value}} ({{period}})",
        caveat: "this does not capture mortgage rates or other financing costs."
    },
    residential_price_cpkwh: {
        intro: "Hawai\u02BBi's residential electricity price is {{value}} ({{period}})",
        caveat: "the series changes across time, with different methodology before and after 1990."
    },
    unsheltered_homeless_rate: {
        intro: "Hawai\u02BBi's unsheltered homeless rate is {{value}} ({{period}})",
        caveat: "this is based on a one-night count and likely understates the true number."
    },
    food_insecurity_rate: {
        intro: "Hawai\u02BBi's food insecurity rate is {{value}} ({{period}})",
        caveat: "this is a 3-year rolling average, so it lags current conditions."
    },
    unemployment_rate: {
        intro: "Hawai\u02BBi's unemployment rate is {{value}} ({{period}})",
        caveat: "this excludes discouraged workers and is not a count of everyone without a job."
    },
    labor_force_participation: {
        intro: "Hawai\u02BBi's labor force participation rate is {{value}} ({{period}})",
        caveat: "this shows who is working or looking for work, not job quality or wages."
    },
    labor_productivity: {
        intro: "Hawai\u02BBi's labor productivity index is {{value}} ({{period}})",
        caveat: "productivity is not the same as worker pay or living standards."
    },
    real_per_capita_income: {
        intro: "Hawai\u02BBi's cost-adjusted per capita income is {{value}} ({{period}})",
        caveat: "this is an average, not the income of a typical household."
    },
    estabs_entry_rate: {
        intro: "Hawai\u02BBi's new business entry rate is {{value}} ({{period}})",
        caveat: "this covers employer businesses only, not all new firms."
    },
    net_employer_formation: {
        intro: "Hawai\u02BBi's net employer business formation rate is {{value}} ({{period}})",
        caveat: "net change can hide a lot of churn underneath."
    },
    naep_math_8: {
        intro: "Hawai\u02BBi's NAEP 8th grade math score is {{value}} ({{period}})",
        caveat: "this is a scale score, not a proficiency rate."
    },
    naep_reading_8: {
        intro: "Hawai\u02BBi's NAEP 8th grade reading score is {{value}} ({{period}})",
        caveat: "this is a scale score, not a proficiency rate."
    },
    acgr: {
        intro: "Hawai\u02BBi's high school graduation rate is {{value}} ({{period}})",
        caveat: "this tracks on-time diplomas, not college or career readiness."
    },
    ba_or_higher_pct: {
        intro: "{{value}} of Hawai\u02BBi adults have a bachelor's degree or higher ({{period}})",
        caveat: "this measures credential share, not skill or workforce fit."
    },
    broadband_subscription_pct: {
        intro: "{{value}} of Hawai\u02BBi households have broadband access ({{period}})",
        caveat: "this measures access, not speed or connection quality."
    },
    renewables_share_gen: {
        intro: "{{value}} of Hawai\u02BBi's electricity generation came from renewables in {{period}}",
        caveat: "this is a generation share, not Hawai\u02BBi's full energy mix or total consumption."
    },
    net_domestic_migration_rate: {
        intro: "Hawai\u02BBi's net migration rate is {{value}} ({{period}})",
        caveat: "this shows net movement, not why people are leaving or arriving."
    },
    road_poor_pct: {
        intro: "{{value}} of Hawai\u02BBi roads were rated in poor condition in {{period}}",
        caveat: "this is not a complete inventory of every road, especially local roads."
    },
    rainy_day_fund_pct: {
        intro: "Hawai\u02BBi's rainy day fund was {{value}} of general fund spending in {{period}}",
        caveat: "this covers the stabilization fund only, not total reserves."
    },
    voter_participation_rate: {
        intro: "Hawai\u02BBi's voter participation rate was {{value}} in {{period}}",
        caveat: "this is based on eligible voters, not all adults."
    },
};

// Metrics where zero is a genuine data value (not missing data).
// For all other metrics, zero in the time series means data was not reported.
const ZERO_IS_VALID = new Set(['net_employer_formation', 'rainy_day_fund_pct', 'net_domestic_migration_rate']);

const App = {
    sparklineCharts: [],
    detailChart: null,
    countyChart: null,
    _activeBundle: null,   // { id, title, description, metrics[] } or null

    COUNTY_COLORS: {
        'Honolulu': '#0D7C8F',
        'Hawai\u02BBi': '#E67E22',
        'Maui': '#8E44AD',
        'Kauai': '#27AE60',
    },

    // Hawaiʻi Governors - for chart overlay
    GOVERNORS: [
        { name: 'Quinn',    party: 'R', start: 1959, end: 1962 },
        { name: 'Burns',    party: 'D', start: 1962, end: 1974 },
        { name: 'Ariyoshi', party: 'D', start: 1974, end: 1986 },
        { name: 'Waihee', party: 'D', start: 1986, end: 1994 },
        { name: 'Cayetano', party: 'D', start: 1994, end: 2002 },
        { name: 'Lingle', party: 'R', start: 2002, end: 2010 },
        { name: 'Abercrombie', party: 'D', start: 2010, end: 2014 },
        { name: 'Ige', party: 'D', start: 2014, end: 2022 },
        { name: 'Green', party: 'D', start: 2022, end: 2027 },
    ],

    // Define the areas and their metrics (order matters for display)
    // Order follows a resident's "should I stay or leave?" calculus:
    // 1. What does daily life cost me?
    // 2. Can I earn enough and build something here?
    // 3. Is my family safe, healthy, and well-educated?
    // 4. Does the infrastructure and environment work?
    // 5. Is the government competent with my tax dollars?
    // 6. The verdict: are people actually staying?
    AREA_ORDER: [
        { area: 'Safety & Health', metrics: ['violent_crime_rate', 'property_crime_rate', 'pcp_per_100k', 'uninsured_rate', 'suicide_rate'] },
        { area: 'Housing & Cost of Living', metrics: ['renter_cost_burden_pct', 'home_price_to_income', 'unsheltered_homeless_rate', 'residential_price_cpkwh', 'food_insecurity_rate'] },
        { area: 'Economy & Workforce', metrics: ['unemployment_rate', 'labor_force_participation', 'labor_productivity', 'real_per_capita_income', 'estabs_entry_rate', 'net_employer_formation'] },
        { area: 'Education', metrics: ['naep_math_8', 'naep_reading_8', 'acgr', 'ba_or_higher_pct'] },
        { area: 'Infrastructure, Resilience & Trust', metrics: ['road_poor_pct', 'broadband_subscription_pct', 'renewables_share_gen', 'rainy_day_fund_pct', 'voter_participation_rate', 'net_domestic_migration_rate'] },
    ],

    /**
     * Initialize the dashboard: render cards, set up modal, bundle navigation,
     * metric search, and URL routing. Called once when DOM is ready.
     */
    init() {
        this.renderCards();

        this.setupModal();

        this.renderBundleChips();

        // Restore bundle from URL param on load (e.g. /?bundle=affordability)
        const initBundle = new URLSearchParams(window.location.search).get('bundle');
        if (initBundle) this.activateBundle(initBundle);

        this.initMetricSearch();

        // Handle permalink routing (path-based /t/slug/ or legacy hash #slug)
        this.handleRoute();
        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('popstate', () => this.handleRoute());

    },

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------

    /** Cache for computed chart data from STATE_DATA */
    _chartDataCache: {},

    /**
     * Compute hawaii + otherStateAvg time series from STATE_DATA.
     * This is the SINGLE SOURCE OF TRUTH for both chart versions:
     * card sparklines and modal detail charts derive from the same
     * per-state data that drives rankings.
     */
    computeChartData(slug) {
        if (this._chartDataCache[slug]) return this._chartDataCache[slug];

        const sd = typeof STATE_DATA !== 'undefined' && STATE_DATA[slug];
        if (!sd || !sd.data) return null;

        const HAWAII_NAMES = ['Hawaiʻi', 'Hawaii', "Hawai'i"];
        const isHawaii = (name) => HAWAII_NAMES.some(h => name === h);
        // DC and Puerto Rico are not states; always excluded from the 49-state average
        const NON_STATES = new Set(['District of Columbia', 'Puerto Rico']);

        // Detect FIPS-keyed vs year-keyed
        const firstKey = Object.keys(sd.data)[0];
        const isPCPStyle = sd.data[firstKey] && typeof sd.data[firstKey].name === 'string';

        const hawaii = {};
        const otherStateAvg = {};

        if (isPCPStyle) {
            // FIPS-keyed: { "15": { name: "Hawaii", "2021": 64.8 } }
            // Collect all years
            const yearValues = {}; // { year: { hi: val, others: [vals] } }
            Object.values(sd.data).forEach(entry => {
                const name = entry.name;
                if (NON_STATES.has(name)) return;
                Object.entries(entry).forEach(([k, v]) => {
                    if (k === 'name' || v == null) return;
                    if (!yearValues[k]) yearValues[k] = { hi: null, others: [] };
                    if (isHawaii(name)) {
                        yearValues[k].hi = v;
                    } else {
                        yearValues[k].others.push(v);
                    }
                });
            });
            for (const [year, vals] of Object.entries(yearValues)) {
                if (vals.hi !== null) hawaii[year] = vals.hi;
                if (vals.others.length > 0) {
                    const avg = vals.others.reduce((a,b) => a+b, 0) / vals.others.length;
                    otherStateAvg[year] = Math.abs(avg) > 100 ? Math.round(avg) : parseFloat(avg.toFixed(4));
                }
            }
        } else {
            // Year-keyed: { "2023": { "Alabama": 0.25, ... } }
            for (const [year, yearData] of Object.entries(sd.data)) {
                const otherVals = [];
                for (const [state, val] of Object.entries(yearData)) {
                    if (val == null || NON_STATES.has(state)) continue;
                    if (isHawaii(state)) {
                        hawaii[year] = val;
                    } else {
                        otherVals.push(val);
                    }
                }
                if (otherVals.length > 0) {
                    const avg = otherVals.reduce((a,b) => a+b, 0) / otherVals.length;
                    otherStateAvg[year] = Math.abs(avg) > 100 ? Math.round(avg) : parseFloat(avg.toFixed(4));
                }
            }
        }

        const result = { hawaii, otherStateAvg };
        this._chartDataCache[slug] = result;
        return result;
    },

    // getLatestValue and getPriorValue are delegated to Compute (see below)

    /**
     * For metrics with rankings, find the rankings year and return a
     * trimmed copy of the data so the line chart ends at that year.
     * This ensures the detail chart, stats, and rankings all refer to
     * the same endpoint.
     *
     * SINGLE SOURCE OF TRUTH: When STATE_DATA has per-state data for
     * a metric, hawaii/otherStateAvg are computed from it at runtime.
     * For metrics without STATE_DATA, falls back to DASHBOARD_DATA.
     */
    getEffectiveData(slug) {
        const metricData = DASHBOARD_DATA[slug];
        if (!metricData) return null;

        // Compute hawaii/otherStateAvg from STATE_DATA when available
        const computed = this.computeChartData(slug);

        // Merge: state-data values take precedence (verified per-state data),
        // but preserve data.js historical years that predate state-data coverage.
        // This ensures chart + rankings use the same source for overlapping years,
        // while keeping longer time series for the line chart.
        let mergedHawaii, mergedAvg;
        if (computed) {
            mergedHawaii = { ...metricData.hawaii, ...computed.hawaii };
            mergedAvg = { ...metricData.otherStateAvg, ...computed.otherStateAvg };
        } else {
            mergedHawaii = metricData.hawaii;
            mergedAvg = metricData.otherStateAvg;
        }

        const merged = {
            ...metricData,
            hawaii: mergedHawaii,
            otherStateAvg: mergedAvg,
        };

        // If we have rankings, trim chart data to end at rankings year
        const hasRankings = typeof STATE_DATA !== 'undefined' && STATE_DATA[slug];
        if (!hasRankings) return merged;

        const rankings = this.getStateRankings(slug);
        if (!rankings || !rankings.year) return merged;

        const endYear = rankings.year;

        // Trim year-keyed objects to <= endYear
        const trimToYear = (obj) => {
            const trimmed = {};
            for (const [k, v] of Object.entries(obj)) {
                if (k <= endYear) trimmed[k] = v;
            }
            return trimmed;
        };

        return {
            ...merged,
            hawaii: trimToYear(merged.hawaii),
            otherStateAvg: trimToYear(merged.otherStateAvg),
        };
    },

    /** Build "vs Other States" comparison HTML for a card */
    buildVsAvgHtml(metricData, slug) {
        const az = ZERO_IS_VALID.has(slug);
        const latest = this.getLatestValue(metricData.hawaii, az);
        const latestAvg = this.getLatestValue(metricData.otherStateAvg, az);
        if (latest.value === null || latestAvg.value === null) return '';

        const diff = latest.value - latestAvg.value;
        const isBetter = metricData.goodDirection === 'up' ? diff > 0 : diff < 0;
        const isDecimal = ChartUtils.isDecimalPctMetric(metricData);
        const avgFormatted = ChartUtils.formatCardValue(latestAvg.value, metricData.unit, isDecimal);

        let rankHtml = '';
        if (slug) {
            const hasRankings = typeof STATE_DATA !== 'undefined' && STATE_DATA[slug];
            if (hasRankings) {
                const rankings = this.getStateRankings(slug);
                if (rankings && rankings.hawaiiRank > 0) {
                    rankHtml = `<div class="comp-rank" data-slug="${slug}">Rank #${rankings.hawaiiRank} of ${rankings.total}</div>`;
                }
            }
        }

        return `
            <div class="card-comp ${isBetter ? 'positive' : 'negative'}">
                <div class="comp-label">Other state avg</div>
                <div class="comp-detail">${avgFormatted}</div>
                ${rankHtml}
            </div>
        `;
    },

    /** Build "vs Prior Year" comparison HTML for a card */
    buildVsYearHtml(metricData) {
        // Handles both plain year keys ("2022") and rolling-average range keys ("2022-2024").
        const sortedKeys = Object.keys(metricData.hawaii).sort((a, b) => this.keyEnd(a) - this.keyEnd(b));
        if (sortedKeys.length < 4) return '';
        const recent = sortedKeys.slice(-3);
        const prior = sortedKeys.slice(-6, -3);
        if (prior.length < 2) return '';
        const avg = (keys) => {
            const vals = keys.map(k => metricData.hawaii[k]).filter(v => v != null);
            return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        };
        const recentAvg = avg(recent);
        const priorAvg = avg(prior);
        if (recentAvg == null || priorAvg == null || priorAvg === 0) return '';

        const change = recentAvg - priorAvg;
        const pctChange = (change / Math.abs(priorAvg)) * 100;
        const isImproving = metricData.goodDirection === 'up' ? change > 0 : change < 0;
        const isFlat = Math.abs(pctChange) < 0.5;

        const arrow = change > 0 ? '\u2191' : change < 0 ? '\u2193' : '\u2192';
        const absPct = Math.abs(pctChange);
        let pctLabel;
        if (isFlat) pctLabel = '\u2192 Flat';
        else if (absPct > 100) pctLabel = `${arrow} ${absPct.toFixed(0)}%`;
        else pctLabel = `${arrow} ${absPct.toFixed(1)}%`;

        const cls = isFlat ? 'neutral' : (isImproving ? 'positive' : 'negative');
        // Compact labels: start year full, end year 2-digit - e.g. "2020-24 vs 2017-21"
        const priorLabel = `${this.parseYearLabel(prior[0])}-${String(this.keyEnd(prior[prior.length - 1])).slice(-2)}`;
        const recentLabel = `${this.parseYearLabel(recent[0])}-${String(this.keyEnd(recent[recent.length - 1])).slice(-2)}`;

        return `
            <div class="card-comp ${cls}">
                <div class="comp-label">${recentLabel} vs ${priorLabel}</div>
                <div class="comp-verdict">${pctLabel}</div>
            </div>
        `;
    },

    // ----------------------------------------------------------------
    // Card Rendering
    // ----------------------------------------------------------------
    /**
     * Render all metric cards grouped by policy area.
     * Creates area headings, card HTML, sparkline charts, and click handlers.
     */
    renderCards() {
        const grid = document.getElementById('dashboard-grid');
        grid.innerHTML = '';

        // Destroy existing sparklines
        this.sparklineCharts.forEach(c => c && c.destroy());
        this.sparklineCharts = [];

        // One card per metric, ordered by area, with section headings
        this.AREA_ORDER.forEach(areaGroup => {
            // Section heading for this area
            const section = document.createElement('div');
            section.className = 'area-section-heading';
            section.innerHTML = `<span class="area-section-icon">${AREA_ICONS[areaGroup.area] || ''}</span><span class="area-section-label">${areaGroup.area}</span>`;
            grid.appendChild(section);

            areaGroup.metrics.forEach(slug => {
                const effective = this.getEffectiveData(slug);
                if (!effective) return;

                const card = document.createElement('div');
                card.className = 'card';
                card.id = slug;
                card.dataset.metric = slug;

                const az = ZERO_IS_VALID.has(slug);
                const latest = this.getLatestValue(effective.hawaii, az);
                const latestAvg = this.getLatestValue(effective.otherStateAvg, az);
                const isDecimal = ChartUtils.isDecimalPctMetric(effective);
                const unitSuffix = effective.unitLabel
                    ? `<span class="card-unit">${effective.unitLabel}</span>`
                    : '';

                card.innerHTML = `
                    <div class="card-metric">${effective.metric}</div>
                    <div class="card-hero">
                        <span class="card-hawaii-value">${ChartUtils.formatCardValue(latest.value, effective.unit, isDecimal)}</span>
                        ${unitSuffix}
                        <span class="card-year">(${latest.year})</span>
                    </div>
                    <div class="card-sparkline">
                        <canvas></canvas>
                    </div>
                    <div class="card-comparisons">
                        ${this.buildVsAvgHtml(effective, slug)}
                        ${this.buildVsYearHtml(effective)}
                    </div>
                `;

                // Keyboard accessibility
                card.setAttribute('role', 'button');
                card.setAttribute('tabindex', '0');
                card.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.openModal(slug, areaGroup.area);
                    }
                });

                const rankEl = card.querySelector('.comp-rank');
                if (rankEl) {
                    rankEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.openModal(slug, areaGroup.area, 'rankings');
                    });
                }

                card.addEventListener('click', () => {
                    this.openModal(slug, areaGroup.area);
                });

                grid.appendChild(card);
            });
        });

        // Lazy-create sparklines as cards scroll into view
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const card = entry.target;
                const s = card.dataset.metric;
                const eff = this.getEffectiveData(s);
                if (!eff) return;
                const canvas = card.querySelector('.card-sparkline canvas');
                if (!canvas || canvas.dataset.rendered) return;
                canvas.dataset.rendered = '1';
                const chart = ChartUtils.createSparkline(canvas, eff, eff.goodDirection, ZERO_IS_VALID.has(s));
                this.sparklineCharts.push(chart);
                observer.unobserve(card);
            });
        }, { rootMargin: '200px' });

        grid.querySelectorAll('.card').forEach(card => observer.observe(card));

    },

    // ----------------------------------------------------------------
    // Bundle Navigation
    // ----------------------------------------------------------------
    /**
     * Render the bundle filter chips (Affordability, Keeping Residents, etc.)
     * and wire click handlers to activate/deactivate bundles.
     */
    renderBundleChips() {
        const container = document.getElementById('bundle-chips');
        if (!container || typeof BUNDLES === 'undefined') return;

        container.innerHTML = BUNDLES.map(b => `
            <button class="bundle-chip" data-bundle="${b.id}" title="${b.description}">
                ${b.title}
            </button>
        `).join('');

        container.querySelectorAll('.bundle-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this._activeBundle && this._activeBundle.id === btn.dataset.bundle) {
                    this.clearBundle();
                } else {
                    this.activateBundle(btn.dataset.bundle);
                }
            });
        });

        const clearBtn = document.getElementById('bundle-bar-clear');
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearBundle());
    },

    /**
     * Activate a named bundle: dim non-matching cards and update the URL.
     * @param {string} bundleId - Bundle identifier (e.g. 'affordability')
     */
    activateBundle(bundleId) {
        const bundle = (typeof BUNDLES !== 'undefined') && BUNDLES.find(b => b.id === bundleId);
        if (!bundle) return;
        this._activeBundle = bundle;

        document.querySelectorAll('.bundle-chip').forEach(c => {
            c.classList.toggle('active', c.dataset.bundle === bundleId);
        });

        const bar = document.getElementById('bundle-bar');
        if (bar) {
            bar.querySelector('.bundle-bar-name').textContent = bundle.title;
            bar.querySelector('.bundle-bar-desc').textContent = bundle.description + ' \u00b7 ' + bundle.metrics.length + ' metrics';
            bar.classList.add('visible');
        }

        // Dim non-bundle cards, highlight bundle cards
        const grid = document.getElementById('dashboard-grid');
        grid.classList.add('bundle-active');
        const bundleIds = new Set(bundle.metrics.map(m => m.id));
        document.querySelectorAll('.card[data-metric]').forEach(card => {
            card.classList.toggle('bundle-match', bundleIds.has(card.dataset.metric));
        });

        // Preserve bundle in URL without disrupting path routing
        const url = new URL(window.location.href);
        url.searchParams.set('bundle', bundleId);
        history.replaceState(null, '', url.pathname + url.search);

        // Scroll to first bundle card
        const firstMatch = document.querySelector('.card.bundle-match');
        if (firstMatch) firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    /**
     * Deactivate the active bundle and restore normal card display.
     */
    clearBundle() {
        this._activeBundle = null;

        document.querySelectorAll('.bundle-chip').forEach(c => c.classList.remove('active'));

        const bar = document.getElementById('bundle-bar');
        if (bar) bar.classList.remove('visible');

        const grid = document.getElementById('dashboard-grid');
        grid.classList.remove('bundle-active');
        document.querySelectorAll('.card.bundle-match').forEach(c => c.classList.remove('bundle-match'));

        const url = new URL(window.location.href);
        url.searchParams.delete('bundle');
        history.replaceState(null, '', url.pathname + (url.search !== '?' ? url.search : ''));
    },

    /** Render bundle nav inside the modal for the given slug (if a bundle is active) */
    renderBundleNav(slug) {
        const nav = document.getElementById('bundle-nav');
        if (!nav) return;
        const bundle = this._activeBundle;
        if (!bundle) { nav.classList.remove('visible'); return; }

        const ids = bundle.metrics.map(m => m.id);
        const idx = ids.indexOf(slug);
        if (idx === -1) { nav.classList.remove('visible'); return; }

        nav.classList.add('visible');
        nav.querySelector('.bundle-nav-label').textContent = bundle.title;
        nav.querySelector('.bundle-nav-counter').textContent = `${idx + 1} / ${ids.length}`;

        const prevBtn = nav.querySelector('.bundle-nav-prev');
        const nextBtn = nav.querySelector('.bundle-nav-next');

        prevBtn.disabled = idx === 0;
        nextBtn.disabled = idx === ids.length - 1;

        // Replace to avoid stacking listeners
        const newPrev = prevBtn.cloneNode(true);
        const newNext = nextBtn.cloneNode(true);
        prevBtn.parentNode.replaceChild(newPrev, prevBtn);
        nextBtn.parentNode.replaceChild(newNext, nextBtn);

        if (idx > 0) {
            const prevMetric = bundle.metrics[idx - 1];
            newPrev.addEventListener('click', () => {
                let area = '';
                for (const ag of this.AREA_ORDER) { if (ag.metrics.includes(prevMetric.id)) { area = ag.area; break; } }
                this.openModal(prevMetric.id, area, this._viewFromPrefix(prevMetric.view));
            });
        } else {
            newPrev.disabled = true;
        }

        if (idx < ids.length - 1) {
            const nextMetric = bundle.metrics[idx + 1];
            newNext.addEventListener('click', () => {
                let area = '';
                for (const ag of this.AREA_ORDER) { if (ag.metrics.includes(nextMetric.id)) { area = ag.area; break; } }
                this.openModal(nextMetric.id, area, this._viewFromPrefix(nextMetric.view));
            });
        } else {
            newNext.disabled = true;
        }
    },

    _viewFromPrefix(prefix) {
        if (prefix === 'r')  return 'rankings';
        if (prefix === 'rh') return 'rank-history';
        if (prefix === 'c')  return 'county';
        return undefined; // 't' = default detail view
    },

    // --- Modal ---

    /**
     * Wire overlay click, close button, and Escape key to closeModal().
     * Called once at init().
     */
    setupModal() {
        const overlay = document.getElementById('modal-overlay');
        const closeBtn = document.getElementById('modal-close');

        closeBtn.addEventListener('click', () => this.closeModal());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeModal();
        });
    },

    // Delegate to Compute (pure, testable in Node.js via compute.js)
    parseYearLabel(label) { return Compute.parseYearLabel(label); },
    keyEnd(k) { return Compute.keyEnd(k); },
    getLatestValue(obj, az) { return Compute.getLatestValue(obj, az); },
    getPriorValue(obj, az) { return Compute.getPriorValue(obj, az); },

    /** Get governor term boxes for the chart x-axis labels */
    getGovernorBoxes(labels) {
        if (!labels || labels.length === 0) return [];

        const boxes = [];
        const years = labels.map(l => this.parseYearLabel(l));

        this.GOVERNORS.forEach(gov => {
            // Find the first and last label index that falls within this governor's term
            let firstIdx = -1;
            let lastIdx = -1;

            years.forEach((year, idx) => {
                if (year !== null && year >= gov.start && year < gov.end) {
                    if (firstIdx === -1) firstIdx = idx;
                    lastIdx = idx;
                }
            });

            if (firstIdx !== -1) {
                boxes.push({
                    name: gov.name,
                    party: gov.party,
                    startIdx: firstIdx,
                    endIdx: lastIdx,
                });
            }
        });

        return boxes;
    },

    /** Convert a state name to its 2-letter code for use in URLs (e.g. "California" → "ca") */
    stateToSlug(name) {
        const code = STATE_ABBREVS[name];
        return code ? code.toLowerCase() : name.slice(0, 2).toLowerCase();
    },

    /** Reverse lookup: find the full state name from a 2-letter URL code (e.g. "ca" → "California") */
    slugToState(slug) {
        const upper = slug.toUpperCase();
        for (const [name, code] of Object.entries(STATE_ABBREVS)) {
            // Prefer the okina form for HI; skip bare 'Hawaii' duplicate entry
            if (code === upper && name !== 'Hawaii') return name;
        }
        return null;
    },

    // ----------------------------------------------------------------
    // Modal
    // ----------------------------------------------------------------
    /**
     * Open the detail modal for a given metric.
     * Highlights the active card, renders all tabs (Trend, Rank, Rank History, County),
     * charts, and narrative. Updates browser history and preserves bundle state.
     * @param {string} slug - Metric ID (e.g. 'violent_crime_rate')
     * @param {string} areaName - Policy area name (e.g. 'Safety & Health')
     * @param {string} [initialView] - Tab to open first: 'rankings' | 'rank-history' | 'county'
     * @param {string} [initialCompare] - State name to pre-select in rank-history compare dropdown
     */
    openModal(slug, areaName, initialView, initialCompare) {
        const overlay = document.getElementById('modal-overlay');
        const metricData = DASHBOARD_DATA[slug];
        if (!metricData) return;

        // Analytics: report which metric was opened
        this._trackEvent('modal_open', { slug, name: metricData.metric, area: metricData.area || areaName });

        // Store any initial rank-history comparison state for showRankHistory to consume
        this._pendingRhCompare = initialCompare || null;

        // Use effective data (trimmed to rankings year) for chart/stats
        const effective = this.getEffectiveData(slug);

        // Guard: validate required data before rendering to avoid silent crashes
        if (!effective || !effective.hawaii || !metricData.metric || !metricData.source) {
            console.error(`[HI-DASH] openModal: missing required data for slug "${slug}"`, { effective, metricData });
            overlay.classList.add('active');
            const titleEl = document.getElementById('modal-title');
            const whyEl   = document.getElementById('modal-why');
            if (titleEl) titleEl.textContent = 'Data unavailable';
            if (whyEl)   whyEl.textContent   = `Could not load data for "${slug}". Please try refreshing the page.`;
            return;
        }

        // Highlight the active card
        const prevActive = document.querySelector('.card.active');
        if (prevActive) prevActive.classList.remove('active');
        const activeCard = document.getElementById(slug);
        if (activeCard) activeCard.classList.add('active');

        document.getElementById('modal-icon').innerHTML = AREA_ICONS[areaName || metricData.area] || '';
        document.getElementById('modal-title').textContent = metricData.metric;
        document.getElementById('modal-unit-label').textContent = metricData.unitLabel || '';
        document.getElementById('modal-area').textContent = areaName || metricData.area;
        // Vintage line: data years and update cadence
        const hiYears = Object.keys(effective.hawaii).sort();
        const vintageStart = this.parseYearLabel(hiYears[0]);
        const vintageEnd = this.keyEnd(hiYears[hiYears.length - 1]);
        const vintageText = `Data: ${vintageStart}-${vintageEnd}  ·  ${metricData.updateCadence || 'Annual'}`;
        document.getElementById('modal-vintage').textContent = vintageText;
        const isRangeKeyMetric = hiYears.length > 0 && /^\d{4}-\d{4}$/.test(hiYears[0]);
        document.getElementById('trend-subtitle').innerHTML = isRangeKeyMetric
            ? `Hawai\u02BBi vs. other state average \u00B7 <strong>3-yr rolling avg</strong> \u00B7 ${vintageStart}\u2013${vintageEnd}`
            : `Hawai\u02BBi vs. other state average \u00B7 ${vintageStart}\u2013${vintageEnd}`;
        // Render the dynamic "Bottom line" brief
        const briefEl = document.getElementById('modal-brief');
        const briefText = this.computeBrief(slug);
        if (briefText) {
            briefEl.innerHTML = briefText
                .replace('Bottom line:', '<strong>Bottom line:</strong>')
                .replace('Keep in mind:', '<strong>Keep in mind:</strong>');
            briefEl.style.display = '';
        } else {
            briefEl.style.display = 'none';
        }

        document.getElementById('modal-why').innerHTML = metricData.whyItMatters;
        document.getElementById('modal-how').textContent = metricData.howToRead;

        // Potential drivers
        const driversSection = document.getElementById('modal-drivers-section');
        const driversText = document.getElementById('modal-drivers');
        if (metricData.potentialDrivers) {
            driversText.innerHTML = metricData.potentialDrivers;
            driversSection.style.display = '';
        } else {
            driversSection.style.display = 'none';
        }

        // Policy levers
        const policyLeversSection = document.getElementById('modal-policy-levers-section');
        const policyLeversText = document.getElementById('modal-policy-levers');
        if (metricData.policyLevers) {
            policyLeversText.textContent = metricData.policyLevers;
            policyLeversSection.style.display = '';
        } else {
            policyLeversSection.style.display = 'none';
        }

        // Data quality note
        const dataNoteCont = document.getElementById('modal-data-note');
        if (metricData.dataNote) {
            dataNoteCont.innerHTML = `<p>\u26A0 Data note: ${metricData.dataNote}</p>`;
            dataNoteCont.style.display = '';
        } else {
            dataNoteCont.style.display = 'none';
        }

        // Consolidated narrative vs per-tab narrative
        const consolidatedEl = document.getElementById('modal-consolidated');
        const narrativeBodyEl = document.getElementById('modal-narrative-body');
        if (metricData.useConsolidated) {
            consolidatedEl.innerHTML = this._buildConsolidatedNarrative(metricData);
            consolidatedEl.style.display = '';
            narrativeBodyEl.style.display = 'none';
        } else {
            consolidatedEl.style.display = 'none';
            narrativeBodyEl.style.display = '';
        }

        // Source definition bar - shown below the tab bar, visible on all tabs
        const officialEl = document.getElementById('modal-official-name');
        if (officialEl) {
            if (metricData.officialName) {
                officialEl.textContent = metricData.officialName;
                officialEl.style.display = '';
            } else {
                officialEl.textContent = '';
                officialEl.style.display = 'none';
            }
        }

        // Footer source line
        const hasStateData = typeof STATE_DATA !== 'undefined' && STATE_DATA[slug];
        document.getElementById('modal-source').innerHTML = `
            <div class="source-line">Source: <a href="${metricData.sourceUrl}" target="_blank" rel="noopener">${metricData.source}</a>
            <span class="csv-sep">&middot;</span>
            <a href="#" class="csv-download" id="csv-download">Download .xlsx</a>
            <span class="csv-sep">&middot;</span>
            <a href="#" class="print-link" id="print-link">Print</a></div>
        `;
        document.getElementById('csv-download').onclick = (e) => {
            e.preventDefault();
            this.downloadData(slug);
        };
        // Share helpers
        const getShareUrl = () => {
            const activeTab = document.querySelector('.modal-tab.active');
            const tabId = activeTab ? activeTab.id : 'tab-detail';
            const prefix = tabId === 'tab-rankings' ? 'r' : tabId === 'tab-county' ? 'c' : 't';
            return 'https://hawaiidashboard.org/' + prefix + '/' + slug + '/';
        };
        const copyToClipboard = (text) => {
            const execFallback = () => {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;opacity:0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(text).catch(execFallback);
            }
            execFallback();
            return Promise.resolve();
        };
        // Header share button (copy link)
        const copyShare = (feedbackEl) => {
            copyToClipboard(getShareUrl());
            feedbackEl.classList.add('copied');
            feedbackEl.title = 'Copied!';
            const label = feedbackEl.querySelector('.share-label');
            if (label) label.textContent = 'Copied!';
            setTimeout(() => {
                feedbackEl.classList.remove('copied');
                feedbackEl.title = 'Copy link';
                if (label) label.textContent = 'Share';
            }, 2000);
        };
        document.getElementById('modal-share-btn').onclick = (e) => {
            e.preventDefault();
            copyShare(document.getElementById('modal-share-btn'));
        };

        document.getElementById('print-link').onclick = (e) => {
            e.preventDefault();
            const origTitle = document.title;
            const activeTab = document.querySelector('.modal-tab.active');
            const tabLabel = activeTab ? activeTab.textContent.trim().split(/\s/)[0] : 'Detail';
            document.title = `${metricData.metric} - ${tabLabel} - Hawaii Dashboard`;
            window.print();
            document.title = origTitle;
        };

        const tabBar = document.getElementById('modal-tabs');
        const tabDetail = document.getElementById('tab-detail');
        const tabRankings = document.getElementById('tab-rankings');

        if (hasStateData) {
            tabBar.style.display = '';
            // Compute rank for tab label
            const rankings = this.getStateRankings(slug);
            const rankLabel = rankings && rankings.hawaiiRank > 0
                ? `<span class="tab-rank">#${rankings.hawaiiRank}</span>`
                : '';
            tabRankings.innerHTML = `<span>Rank ${rankLabel}</span><span class="tab-sub">National standing</span>`;

            tabDetail.onclick = () => this.switchTab('detail', slug);
            tabRankings.onclick = () => this.switchTab('rankings', slug);

            const tabRankHistory = document.getElementById('tab-rank-history');
            tabRankHistory.style.display = '';
            tabRankHistory.onclick = () => this.switchTab('rank-history', slug);
        } else {
            tabBar.style.display = 'none';
            document.getElementById('tab-rank-history').style.display = 'none';
        }

        // County tab - show only for metrics with county data
        const tabCounty = document.getElementById('tab-county');
        const hasCountyData = typeof COUNTY_DATA !== 'undefined' && COUNTY_DATA[slug];
        if (hasCountyData) {
            tabCounty.style.display = '';
            tabCounty.onclick = () => this.switchTab('county', slug);
            if (!hasStateData) tabBar.style.display = '';
        } else {
            tabCounty.style.display = 'none';
        }

        // Reset to detail view
        this.hideRankings();
        this.hideRankHistory();
        this.hideCounty();
        document.getElementById('modal-detail-view').style.display = '';
        const tabDetailEl = document.getElementById('tab-detail');
        if (tabDetailEl) { tabDetailEl.classList.add('active'); tabDetailEl.setAttribute('aria-selected', 'true'); }
        const tabRankingsEl = document.getElementById('tab-rankings');
        if (tabRankingsEl) { tabRankingsEl.classList.remove('active'); tabRankingsEl.setAttribute('aria-selected', 'false'); }
        const tabRankHistoryEl = document.getElementById('tab-rank-history');
        if (tabRankHistoryEl) { tabRankHistoryEl.classList.remove('active'); tabRankHistoryEl.setAttribute('aria-selected', 'false'); }
        if (tabCounty) { tabCounty.classList.remove('active'); tabCounty.setAttribute('aria-selected', 'false'); }

        // Chart uses effective data (trimmed to rankings year)
        const canvas = document.getElementById('modal-chart');
        const skeleton = document.getElementById('modal-chart-skeleton');
        if (skeleton) skeleton.style.display = 'none';
        canvas.style.display = '';

        const labels = Object.keys(effective.hawaii);
        const govBoxes = this.getGovernorBoxes(labels);

        this.detailChart = ChartUtils.createDetailChart(canvas, effective, govBoxes, ZERO_IS_VALID.has(slug));
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${effective.metric} trend: Hawaiʻi vs other state average`);

        // Chart note: always shows smoothing disclosure; also shows trim-year note when applicable
        const chartNoteEl = document.getElementById('modal-chart-note');
        if (chartNoteEl) {
            // Detect range-key data (e.g. "2022-2024") -- means each point is a multi-year average
            const firstKey = Object.keys(effective.hawaii)[0] || '';
            const isRangeKey = /^\d{4}-\d{4}$/.test(firstKey);
            const smoothingNote = isRangeKey
                ? 'Each point is a 3-year rolling average; the year range on the x-axis shows the window.'
                : 'Trend line is smoothed for readability. Dots mark actual data values.';
            const hasSD = typeof STATE_DATA !== 'undefined' && STATE_DATA[slug];
            if (hasSD) {
                const computed = this.computeChartData(slug);
                const fullHawaii = { ...metricData.hawaii, ...(computed ? computed.hawaii : {}) };
                const allLast = Object.keys(fullHawaii).sort().pop();
                const effectiveLast = Object.keys(effective.hawaii).sort().pop();
                if (allLast && effectiveLast && allLast > effectiveLast) {
                    chartNoteEl.textContent = `${smoothingNote}  Chart shows data through ${effectiveLast} - the latest year with complete state rankings data.`;
                } else {
                    chartNoteEl.textContent = smoothingNote;
                }
            } else {
                chartNoteEl.textContent = smoothingNote;
            }
            chartNoteEl.style.display = '';
        }

        // Table toggle (data accessibility feature)
        const tableToggleWrap = document.getElementById('table-toggle-wrap');
        const tableToggle = document.getElementById('table-toggle');
        const modalTableContainer = document.getElementById('modal-table-container');
        const chartContainer = canvas.parentElement;

        // Reset to chart view
        tableToggleWrap.style.display = '';
        modalTableContainer.style.display = 'none';
        chartContainer.style.display = '';
        tableToggle.textContent = 'View as table';

        // Remove previous listener by replacing the element
        const freshToggle = tableToggle.cloneNode(true);
        tableToggle.parentNode.replaceChild(freshToggle, tableToggle);

        freshToggle.addEventListener('click', (e) => {
            e.preventDefault();
            const showingTable = modalTableContainer.style.display !== 'none';
            if (showingTable) {
                // Switch back to chart
                modalTableContainer.style.display = 'none';
                chartContainer.style.display = '';
                freshToggle.textContent = 'View as table';
            } else {
                this.buildDataTable(effective, slug);
                chartContainer.style.display = 'none';
                modalTableContainer.style.display = '';
                freshToggle.textContent = 'View as chart';
            }
        });

        overlay.classList.add('active');
        document.body.classList.add('modal-open');
        document.body.style.overflow = 'hidden';
        document.getElementById('modal').scrollTop = 0;

        // Update URL for permalink (preserve bundle param if active)
        const bundleParam = this._activeBundle ? '?bundle=' + this._activeBundle.id : '';
        history.replaceState(null, '', '/t/' + slug + '/' + bundleParam);

        // Render bundle nav (if a bundle is active)
        this.renderBundleNav(slug);

        // If requested, switch to the specified tab immediately
        if (initialView === 'rankings' && hasStateData) {
            this.switchTab('rankings', slug);
        } else if (initialView === 'county' && hasCountyData) {
            this.switchTab('county', slug);
        } else if (initialView === 'rank-history' && hasStateData) {
            this.switchTab('rank-history', slug);
        }
    },

    /**
     * Switch the modal to a tab and render its content.
     * Destroys off-screen charts to free memory.
     * @param {string} tab - 'detail' | 'rankings' | 'rank-history' | 'county'
     * @param {string} slug - Metric ID
     */
    switchTab(tab, slug) {
        const tabDetail = document.getElementById('tab-detail');
        const tabRankings = document.getElementById('tab-rankings');
        const tabRankHistory = document.getElementById('tab-rank-history');
        const tabCounty = document.getElementById('tab-county');

        // Clear all tabs
        tabDetail.classList.remove('active');
        tabRankings.classList.remove('active');
        if (tabRankHistory) tabRankHistory.classList.remove('active');
        if (tabCounty) tabCounty.classList.remove('active');

        // Update ARIA selected state
        document.querySelectorAll('.modal-tab').forEach(t => t.setAttribute('aria-selected', 'false'));

        // Hide all views
        document.getElementById('modal-detail-view').style.display = 'none';
        document.getElementById('modal-rankings').style.display = 'none';
        document.getElementById('modal-rank-history').style.display = 'none';
        document.getElementById('modal-county').style.display = 'none';

        // Reset table toggle: hide on non-detail tabs, reset to chart view
        const tableToggleWrap = document.getElementById('table-toggle-wrap');
        const modalTableContainer = document.getElementById('modal-table-container');
        const tableToggle = document.getElementById('table-toggle');
        if (tab === 'detail') {
            tableToggleWrap.style.display = '';
            // Reset to chart view when returning to detail tab
            modalTableContainer.style.display = 'none';
            document.querySelector('.modal-chart-container').style.display = '';
            if (tableToggle) tableToggle.textContent = 'View as table';
        } else {
            tableToggleWrap.style.display = 'none';
            modalTableContainer.style.display = 'none';
            document.querySelector('.modal-chart-container').style.display = '';
            if (tableToggle) tableToggle.textContent = 'View as table';
        }

        // Destroy charts for hidden views to free memory
        // Note: detailChart is NOT destroyed here because it is only created
        // once in openModal() and not recreated on tab switch. It is destroyed
        // in closeModal() instead.
        if (tab !== 'rankings' && this.rankingsChart) {
            this.rankingsChart.destroy();
            this.rankingsChart = null;
        }
        if (tab !== 'rank-history' && this.rankHistoryChart) {
            this.rankHistoryChart.destroy();
            this.rankHistoryChart = null;
        }
        if (tab !== 'county' && this.countyChart) {
            this.countyChart.destroy();
            this.countyChart = null;
        }

        if (tab === 'rankings') {
            tabRankings.classList.add('active');
            tabRankings.setAttribute('aria-selected', 'true');
            this.showRankings(slug);
            history.replaceState(null, '', '/r/' + slug + '/');

        } else if (tab === 'rank-history') {
            tabRankHistory.classList.add('active');
            tabRankHistory.setAttribute('aria-selected', 'true');
            this.showRankHistory(slug);
            history.replaceState(null, '', '/rh/' + slug + '/');
        } else if (tab === 'county') {
            tabCounty.classList.add('active');
            tabCounty.setAttribute('aria-selected', 'true');
            this.showCounty(slug);
            history.replaceState(null, '', '/c/' + slug + '/');
        } else {
            tabDetail.classList.add('active');
            tabDetail.setAttribute('aria-selected', 'true');
            document.getElementById('modal-detail-view').style.display = '';
            history.replaceState(null, '', '/t/' + slug + '/');
        }
        // Always reset modal scroll to top on tab switch
        document.querySelector('.modal').scrollTop = 0;
    },

    // ----------------------------------------------------------------
    // Export (XLSX / Share / Print)
    // ----------------------------------------------------------------
    /**
     * Generate and download a multi-tab xlsx for the given metric.
     * Sheet order: Raw Data → Chart Data → Rankings → All Data → County Data (if avail) → Methodology
     * Raw data (state-data.js) is the single source of truth.
     * Rankings = wide grid (State × Year). All Data = long format (Year | State | Value | Rank | N).
     */
    downloadData(slug) {
        const m = DASHBOARD_DATA[slug];
        if (!m) return;

        // Lazy-load SheetJS on first download (~200KB saved on initial page load)
        if (typeof XLSX === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
            script.integrity = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw';
            script.crossOrigin = 'anonymous';
            script.onload = () => this.downloadData(slug);
            script.onerror = () => alert('Could not load the export library. Please try again.');
            document.head.appendChild(script);
            return;
        }

        const wb = XLSX.utils.book_new();
        const sd = typeof STATE_DATA !== 'undefined' && STATE_DATA[slug];

        // Detect FIPS-keyed structure (e.g. pcp_per_100k)
        let isFIPS = false;
        if (sd && sd.data) {
            const firstKey = Object.keys(sd.data)[0];
            isFIPS = sd.data[firstKey] && typeof sd.data[firstKey].name === 'string';
        }

        // --- Tab 1: "Raw Data" (per-state source data, single source of truth) ---
        if (sd && sd.data) {
            let stateRows;

            if (isFIPS) {
                // FIPS-keyed: { "15": { name: "Hawaiʻi", "2010": 89.2, ... } }
                // Transpose to Year × State format
                const allYears = new Set();
                const stateMap = {};
                Object.values(sd.data).forEach(entry => {
                    stateMap[entry.name] = entry;
                    Object.keys(entry).forEach(k => { if (k !== 'name') allYears.add(k); });
                });
                const years = [...allYears].sort();
                const stateNames = Object.keys(stateMap).sort();

                stateRows = [
                    [`${m.metric} (${m.unit}) - Raw Per-State Data`],
                    [`Source: ${sd.source}`],
                    sd.calculation ? [`Calculation: ${sd.calculation}`] : [],
                    [],
                    ['Year', ...stateNames],
                ];

                years.forEach(y => {
                    const row = [y];
                    stateNames.forEach(s => {
                        row.push(stateMap[s]?.[y] ?? '');
                    });
                    stateRows.push(row);
                });
            } else {
                // Year-keyed: { "2023": { "Alabama": 0.25, ... } }
                const allYears = Object.keys(sd.data).sort();
                const allStates = [...new Set(
                    Object.values(sd.data).flatMap(d => Object.keys(d))
                )].sort();

                stateRows = [
                    [`${m.metric} (${m.unit}) - Raw Per-State Data`],
                    [`Source: ${sd.source}`],
                    sd.calculation ? [`Calculation: ${sd.calculation}`] : [],
                    sd.rawVariables ? [`Raw variables: ${sd.rawVariables}`] : [],
                    [],
                    ['Year', ...allStates],
                ];

                allYears.forEach(y => {
                    const row = [y];
                    allStates.forEach(s => {
                        row.push(sd.data[y]?.[s] ?? '');
                    });
                    stateRows.push(row);
                });
            }

            const wsStates = XLSX.utils.aoa_to_sheet(stateRows.filter(r => r.length > 0));
            XLSX.utils.book_append_sheet(wb, wsStates, 'Raw Data');
        }

        // --- Tab 2: "Chart Data" (Hawaiʻi + Other-states average, derived from raw data) ---
        const effective = this.getEffectiveData(slug);
        const isDecimalPct = ChartUtils.isDecimalPctMetric(m);
        const sdYears = sd ? Object.keys(sd.data || {}).sort() : [];
        const effectiveYears = Object.keys(effective.hawaii).sort();
        const sdLastYear = sdYears[sdYears.length - 1];
        const effectiveLastYear = effectiveYears[effectiveYears.length - 1];
        const chartIsTrimmed = sd && sdLastYear && effectiveLastYear && effectiveLastYear < sdLastYear;
        const chartNotes = [];
        if (sd) chartNotes.push(['Note: Hawai\u02BBi and Other-states average are computed from the Raw Data tab']);
        if (isDecimalPct) chartNotes.push(['Unit note: Values are decimal fractions (e.g. 0.2162 = 21.62%). Multiply by 100 to convert to percent.']);
        if (chartIsTrimmed) chartNotes.push([`Year range note: Chart ends at ${effectiveLastYear}. Raw Data extends to ${sdLastYear}. Chart is trimmed to the latest year with complete state data for consistent rankings.`]);
        const chartRows = [
            [`${m.metric} (${m.unit}) - Dashboard Chart Data`],
            [`Source: ${m.source}`],
            ...chartNotes,
            [],
            ['Year', 'Hawai\u02BBi', 'Other-states average'],
        ];
        const chartYears = [...new Set([
            ...Object.keys(effective.hawaii),
            ...Object.keys(effective.otherStateAvg),
        ])].sort();
        chartYears.forEach(y => {
            chartRows.push([
                y,
                effective.hawaii[y] != null ? effective.hawaii[y] : '',
                effective.otherStateAvg[y] != null ? effective.otherStateAvg[y] : '',
            ]);
        });
        const wsChart = XLSX.utils.aoa_to_sheet(chartRows.filter(r => r.length > 0));
        XLSX.utils.book_append_sheet(wb, wsChart, 'Chart Data');

        // --- Tab 3: "Rankings" grid (State rows × Year columns) ---
        // --- Tab 4: "All Data" long format (Year | State | Value | Rank | N) ---
        if (sd) {
            const rankHistory = this.computeRankHistory(slug);
            if (rankHistory && rankHistory.years.length > 0) {
                const { years: rankYears, stateRanks, stateValues, latestYearRanked, hiKey } = rankHistory;

                const latestRankMap = {};
                latestYearRanked.forEach(e => { latestRankMap[e.state] = e.rank; });
                const allStates = Object.keys(stateRanks).sort((a, b) => {
                    const ra = latestRankMap[a] || 999;
                    const rb = latestRankMap[b] || 999;
                    return ra - rb;
                });

                // Wide grid: State rows, Year columns, rank values
                const rankRows = [
                    [`${m.metric} - National Rankings by Year`],
                    [`${m.goodDirection === 'up' ? 'Higher is better (rank 1 = highest value)' : 'Lower is better (rank 1 = lowest value)'}`],
                    [`Ranks are among states with available data that year. Hawaiʻi rows are marked with *.`],
                    [],
                    ['State', ...rankYears],
                ];
                allStates.forEach(state => {
                    const isHI = (state === hiKey);
                    const row = [isHI ? `${state} *` : state];
                    rankYears.forEach(yr => {
                        row.push(stateRanks[state][yr] != null ? stateRanks[state][yr] : '');
                    });
                    rankRows.push(row);
                });
                const wsRank = XLSX.utils.aoa_to_sheet(rankRows);
                XLSX.utils.book_append_sheet(wb, wsRank, 'Rankings');

                // Long format: one row per state per year, with value AND rank
                const longRows = [
                    [`${m.metric} - All States, All Years: Values and Rankings`],
                    [`${m.goodDirection === 'up' ? 'Higher is better - rank 1 = highest value' : 'Lower is better - rank 1 = lowest value'}. Hawaiʻi rows marked *.`],
                    [],
                    ['Year', 'State', `Value (${m.unit})`, 'Rank', 'Out of N States'],
                ];
                rankYears.forEach(yr => {
                    const yearEntries = allStates
                        .filter(state => stateRanks[state]?.[yr] != null)
                        .map(state => ({
                            state,
                            rank: stateRanks[state][yr],
                            value: stateValues[state]?.[yr],
                        }))
                        .sort((a, b) => a.rank - b.rank);
                    const n = yearEntries.length;
                    yearEntries.forEach(({ state, rank, value }) => {
                        const isHI = state === hiKey;
                        longRows.push([
                            yr,
                            isHI ? `${state} *` : state,
                            value != null ? value : '',
                            rank,
                            n,
                        ]);
                    });
                });
                const wsLong = XLSX.utils.aoa_to_sheet(longRows);
                XLSX.utils.book_append_sheet(wb, wsLong, 'All Data');
            }
        }

        // --- Tab 5: "County Data" (always included when available) ---
        const countyData = typeof COUNTY_DATA !== 'undefined' && COUNTY_DATA[slug];
        if (countyData) {
            const counties = countyData.counties || Object.keys(countyData.data);
            const allCountyYears = [...new Set(
                counties.flatMap(c => Object.keys(countyData.data[c] || {}))
            )].sort();

            const countyRows = [
                [`${m.metric} (${m.unit}) - County Data`],
                [],
                ['Year', ...counties],
            ];

            allCountyYears.forEach(y => {
                const row = [y];
                counties.forEach(c => {
                    row.push(countyData.data[c]?.[y] ?? '');
                });
                countyRows.push(row);
            });

            const wsCounty = XLSX.utils.aoa_to_sheet(countyRows);
            XLSX.utils.book_append_sheet(wb, wsCounty, 'County Data');
        }

        // --- Tab 6: "Methodology" (reproducibility reference) ---
        const methRows = [
            ['METRIC DEFINITION'],
            ['Metric', m.metric],
            m.officialName ? ['Metric definition', m.officialName] : [],
            ['Unit', m.unit],
            ['Area', m.area],
            ['Direction', m.goodDirection === 'up' ? 'Higher is better' : 'Lower is better'],
            [],
            ['DATA SOURCE'],
            ['Source', m.source],
            ['Source URL', m.sourceUrl],
        ];
        if (sd) {
            methRows.push(
                ['Calculation', sd.calculation || ''],
                ['Raw Variables', sd.rawVariables || ''],
                ['Source Table', sd.source || ''],
            );
        }
        methRows.push(
            [],
            ['COMPARATOR'],
            ['Other State Average', 'Simple mean of 49 states, excluding Hawai\u02BBi. DC excluded from rankings.'],
            ['Hawai\u02BBi Value', 'Pulled from same source, same variable, same year.'],
        );
        if (slug === 'real_per_capita_income') {
            methRows.push(
                [],
                ['COST-OF-LIVING ADJUSTMENT'],
                ['Method', 'BEA Regional Price Parities (RPPs)'],
                ['What RPPs do', 'Adjust nominal income by state-level price differences for goods, services, and housing.'],
                ['Reference', 'https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area'],
            );
        }
        methRows.push(
            [],
            ['DATA TRANSFORMATIONS'],
        );
        if (isDecimalPct) {
            methRows.push(
                ['Step 1 - Raw storage', `Values in the Raw Data tab are stored as decimal fractions (0 to 1). Example: 0.2162 = 21.62%.`],
                ['Step 2 - Chart Data tab', 'Hawaiʻi and Other-states average are the same decimal fractions as Raw Data. Multiply by 100 to display as percentages.'],
                ['Step 3 - Rankings / All Data tabs', 'Values are multiplied by 100 and shown as percentages (e.g. 21.62%).'],
                ['Step 4 - Other-state average', 'Computed as the simple mean of all non-Hawaiʻi state values for that year (decimal form), then displayed as a percentage.'],
            );
        } else {
            methRows.push(
                ['Step 1 - Raw storage', `Values are stored in display units (${m.unit}). No unit scaling is applied.`],
                ['Step 2 - Other-state average', 'Computed as the simple mean of all non-Hawaiʻi state values for that year.'],
            );
        }
        if (chartIsTrimmed) {
            methRows.push(
                ['Step - Year trimming', `Chart Data ends at ${effectiveLastYear} (the latest year with complete state data). Raw Data extends to ${sdLastYear}. This keeps Hawaiʻi, the other-state average, and rankings consistent with the same endpoint.`],
            );
        }
        methRows.push(
            [],
            ['NARRATIVE'],
            ['Why It Matters', m.whyItMatters.replace(/<[^>]*>/g, '')],
            ['How To Read It', m.howToRead],
        );
        if (m.potentialDrivers) methRows.push(['Potential Drivers', m.potentialDrivers.replace(/<[^>]*>/g, '')]);
        if (m.policyLevers) methRows.push(['Main Policy Levers', m.policyLevers]);
        if (m.dataNote) methRows.push([], ['Data Note', m.dataNote]);
        const reproText = isDecimalPct
            ? `Pull raw variables from the source URL for all 50 states. Apply the calculation formula. Results are decimal fractions (0\u20131). Divide by 100 if needed to match Raw Data tab. Compute Other-state average as the simple mean excluding Hawai\u02BBi. Multiply by 100 to display as percentages.`
            : `Pull raw variables from the source URL for all 50 states. Apply the calculation formula. Compute Other-state average as the simple mean excluding Hawai\u02BBi.`;
        methRows.push(
            [],
            ['REPRODUCIBILITY'],
            ['To reproduce', reproText],
            ['Dashboard', 'hawaiidashboard.org'],
            ['Data updated', document.getElementById('last-updated')?.textContent || ''],
        );
        const wsMeth = XLSX.utils.aoa_to_sheet(methRows.filter(r => r.length > 0));
        XLSX.utils.book_append_sheet(wb, wsMeth, 'Methodology');

        const safeName = m.metric.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
        XLSX.writeFile(wb, `Hawaii_${safeName}.xlsx`);

        // Download feedback
        const dlLink = document.getElementById('csv-download');
        if (dlLink) {
            const orig = dlLink.textContent;
            dlLink.textContent = 'Downloaded!';
            setTimeout(() => { dlLink.textContent = orig; }, 2000);
        }
    },

    /** Extract per-state latest-year values from STATE_DATA */
    getStateRankings(slug) {
        const sd = STATE_DATA[slug];
        if (!sd || !sd.data) return null;
        const metricData = DASHBOARD_DATA[slug];
        const unit = metricData.unit;

        // PCP uses FIPS-keyed structure: { "01": { name: "Alabama", "2021": 64.8 } }
        const firstKey = Object.keys(sd.data)[0];
        const isPCPStyle = sd.data[firstKey] && typeof sd.data[firstKey].name === 'string';

        let stateValues = [];
        let year = '';

        if (isPCPStyle) {
            // FIPS-keyed: find latest year with enough data for rankings
            const yearCounts = {};
            Object.values(sd.data).forEach(entry => {
                Object.keys(entry).forEach(k => {
                    if (k !== 'name') yearCounts[k] = (yearCounts[k] || 0) + 1;
                });
            });
            // Pick latest year with at least 25 states
            year = Object.keys(yearCounts).sort()
                .reverse().find(y => yearCounts[y] >= 25) || Object.keys(yearCounts).sort().pop();
            Object.values(sd.data).forEach(entry => {
                if (entry[year] != null) {
                    stateValues.push({ state: entry.name, value: entry[year] });
                }
            });
        } else {
            // Year-keyed: { "2023": { "Alabama": 0.25, ... } }
            // Pick latest year with at least 25 non-null state values for meaningful rankings
            const years = Object.keys(sd.data).sort();
            year = years.reverse().find(y => Object.values(sd.data[y]).filter(v => v != null).length >= 25)
                || years[0];
            const yearData = sd.data[year];
            if (!yearData) return null;
            const isDecimal = ChartUtils.isDecimalPctMetric(metricData);
            Object.entries(yearData).forEach(([state, value]) => {
                if (value != null) {
                    // Convert decimal-stored percentages for display
                    const displayVal = isDecimal ? value * 100 : value;
                    stateValues.push({ state, value: displayVal });
                }
            });
        }

        // Sort best-to-worst based on goodDirection
        if (metricData.goodDirection === 'up') {
            stateValues.sort((a, b) => b.value - a.value);
        } else {
            stateValues.sort((a, b) => a.value - b.value);
        }

        const hawaiiRank = stateValues.findIndex(s =>
            s.state === 'Hawaii' || s.state === 'Hawai\u02BBi'
        ) + 1;

        return { stateValues, year, hawaiiRank, total: stateValues.length };
    },

    /**
     * Render the Rankings tab: horizontal bar chart for all 50 states.
     * @param {string} slug - Metric ID
     */
    showRankings(slug) {
        const rankings = this.getStateRankings(slug);
        if (!rankings) return;

        const metricData = DASHBOARD_DATA[slug];
        const { stateValues, year, hawaiiRank, total } = rankings;

        document.getElementById('modal-detail-view').style.display = 'none';
        document.getElementById('modal-rankings').style.display = 'block';

        document.getElementById('rankings-subtitle').textContent = '';
        const latestDetailYear = this.getLatestValue(metricData.hawaii, ZERO_IS_VALID.has(slug)).year;
        const yearNote = (year !== latestDetailYear)
            ? ` \u00B7 ${year} (latest year with full state coverage)`
            : ` \u00B7 ${year}`;
        document.getElementById('rankings-rank').textContent =
            `Hawai\u02BBi ranks #${hawaiiRank} of ${total} states${yearNote}`;

        // Compute distribution stats (shared between dot strip and rankings chart)
        const sortedVals = stateValues.map(s => s.value).sort((a, b) => a - b);
        const distStats = {
            q1: sortedVals[Math.floor(sortedVals.length * 0.25)],
            median: sortedVals[Math.floor(sortedVals.length * 0.5)],
            q3: sortedVals[Math.floor(sortedVals.length * 0.75)],
            fmt: (v) => ChartUtils.formatValue(v, metricData.unit, false),
        };

        const canvas = document.getElementById('rankings-chart');
        this.rankingsChart = ChartUtils.createRankingsChart(
            canvas, stateValues, metricData.goodDirection, metricData.unit, distStats
        );
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${metricData.metric} rankings: all 50 states sorted best to worst, Hawaiʻi ranked #${hawaiiRank}`);

        const hint = document.getElementById('rankings-scroll-hint');
        if (hint) {
            hint.classList.remove('hidden');
            const modal = document.getElementById('modal');
            const onScroll = () => {
                const wrap = document.querySelector('.rankings-chart-wrap');
                if (!wrap) return;
                const wrapBottom = wrap.getBoundingClientRect().bottom;
                const modalBottom = modal.getBoundingClientRect().bottom;
                if (wrapBottom <= modalBottom + 50) {
                    hint.classList.add('hidden');
                    modal.removeEventListener('scroll', onScroll);
                }
            };
            modal.addEventListener('scroll', onScroll);
            this._rankingsScrollHandler = onScroll;
        }
    },


    hideRankings() {
        document.getElementById('modal-rankings').style.display = 'none';

        if (this._rankingsScrollHandler) {
            const modal = document.getElementById('modal');
            modal.removeEventListener('scroll', this._rankingsScrollHandler);
            this._rankingsScrollHandler = null;
        }

        if (this.rankingsChart) {
            this.rankingsChart.destroy();
            this.rankingsChart = null;
        }
    },

    hideRankHistory() {
        document.getElementById('modal-rank-history').style.display = 'none';
        if (this.rankHistoryChart) {
            this.rankHistoryChart.destroy();
            this.rankHistoryChart = null;
        }
    },

    /**
     * Compute year-by-year national rankings from STATE_DATA.
     * @param {string} slug - Metric ID
     * @returns {{ years, stateRanks, stateValues, latestYearRanked, hiKey, hiRank, total } | null}
     */
    computeRankHistory(slug) {
        const sd = typeof STATE_DATA !== 'undefined' && STATE_DATA[slug];
        if (!sd || !sd.data) return null;
        const m = DASHBOARD_DATA[slug];
        const isDec = ChartUtils.isDecimalPctMetric(m);

        const firstKey = Object.keys(sd.data)[0];
        const isPCP = sd.data[firstKey] && typeof sd.data[firstKey].name === 'string';

        // Collect all available years and state values per year
        const yearData = {}; // { year: [{ state, value }] }

        if (isPCP) {
            // FIPS-keyed: each entry has { name, "2020": val, ... }
            const allYears = new Set();
            Object.values(sd.data).forEach(entry => {
                Object.keys(entry).forEach(k => { if (k !== 'name') allYears.add(k); });
            });
            for (const yr of allYears) {
                const vals = [];
                Object.values(sd.data).forEach(entry => {
                    if (entry[yr] != null) {
                        vals.push({ state: entry.name, value: entry[yr] });
                    }
                });
                if (vals.length >= 25) yearData[yr] = vals;
            }
        } else {
            // Year-keyed: { "2023": { "Alabama": val, ... } }
            for (const yr of Object.keys(sd.data)) {
                const entries = Object.entries(sd.data[yr]).filter(([, v]) => v != null);
                if (entries.length >= 25) {
                    yearData[yr] = entries.map(([state, value]) => ({
                        state,
                        value: isDec ? value * 100 : value
                    }));
                }
            }
        }

        const years = Object.keys(yearData).sort();
        if (years.length === 0) return null;

        // For each year, sort and assign ranks
        const stateRanks = {};  // { stateName: { year: rank } }
        const stateValues = {}; // { stateName: { year: displayValue } }
        const latestYearRanked = []; // [{ state, rank }] for the latest year

        for (const yr of years) {
            const vals = yearData[yr];
            if (m.goodDirection === 'up') vals.sort((a, b) => b.value - a.value);
            else vals.sort((a, b) => a.value - b.value);

            vals.forEach((entry, idx) => {
                const rank = idx + 1;
                if (!stateRanks[entry.state]) stateRanks[entry.state] = {};
                stateRanks[entry.state][yr] = rank;
                if (!stateValues[entry.state]) stateValues[entry.state] = {};
                stateValues[entry.state][yr] = entry.value; // already in display units
            });
        }

        const latestYear = years[years.length - 1];
        const latestVals = yearData[latestYear];
        if (m.goodDirection === 'up') latestVals.sort((a, b) => b.value - a.value);
        else latestVals.sort((a, b) => a.value - b.value);
        latestVals.forEach((entry, idx) => {
            latestYearRanked.push({ state: entry.state, rank: idx + 1 });
        });

        const hiKey = Object.keys(stateRanks).find(s => s === 'Hawaii' || s === 'Hawai\u02BBi') || 'Hawaii';
        const hiLatest = latestYearRanked.find(s => s.state === hiKey);

        return {
            years,
            stateRanks,
            stateValues,
            latestYearRanked,
            hiKey,
            hiRank: hiLatest ? hiLatest.rank : null,
            total: latestYearRanked.length
        };
    },

    /**
     * Render the Rank History tab: rank-over-time chart with state compare dropdown.
     * @param {string} slug - Metric ID
     */
    showRankHistory(slug) {
        const rankHistory = this.computeRankHistory(slug);
        if (!rankHistory) return;
        const metricData = DASHBOARD_DATA[slug];

        document.getElementById('modal-rank-history').style.display = 'block';

        const yearRange = this.parseYearLabel(String(rankHistory.years[0])) + '-' + this.keyEnd(rankHistory.years[rankHistory.years.length - 1]);
        document.getElementById('rank-history-subtitle').textContent =
            `Rank over time \u00B7 ${yearRange}`;
        document.getElementById('rank-history-rank').textContent = '';

        // Consume any pending initial comparison state (set by openModal from URL routing)
        const pendingCompare = this._pendingRhCompare || null;
        this._pendingRhCompare = null;

        // Populate compare dropdown with all states except Hawai'i, sorted alphabetically
        const compareSelect = document.getElementById('rh-compare-select');
        const compareClear = document.getElementById('rh-compare-clear');
        if (compareSelect) {
            compareSelect.innerHTML = '<option value="">Select a state\u2026</option>';
            rankHistory.latestYearRanked
                .map(e => e.state)
                .filter(s => s !== rankHistory.hiKey)
                .sort()
                .forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s;
                    opt.textContent = s;
                    compareSelect.appendChild(opt);
                });
            compareSelect.value = '';
        }
        if (compareClear) compareClear.style.display = 'none';

        // onCompare callback: syncs dropdown + URL (also called by chart on label click)
        const onCompareFn = (stateName) => {
            if (compareSelect) compareSelect.value = stateName || '';
            if (compareClear) compareClear.style.display = stateName ? '' : 'none';
            if (stateName) {
                history.replaceState(null, '', '/rh/' + slug + '/' + this.stateToSlug(stateName) + '/');
            } else {
                history.replaceState(null, '', '/rh/' + slug + '/');
            }
        };

        // Create the chart
        const canvas = document.getElementById('rank-history-chart');
        if (this.rankHistoryChart) { this.rankHistoryChart.destroy(); this.rankHistoryChart = null; }

        // Force a synchronous layout reflow so Chart.js reads the correct canvas
        // width (not 0 from a previously-hidden parent element).
        void canvas.offsetWidth;

        const rankGovBoxes = this.getGovernorBoxes(rankHistory.years.map(String));

        this.rankHistoryChart = ChartUtils.createRankHistoryChart(
            canvas, rankHistory, metricData, rankGovBoxes,
            onCompareFn,
            pendingCompare
        );

        // If a comparison was pre-set from URL, sync dropdown + URL
        if (pendingCompare) onCompareFn(pendingCompare);

        // Wire dropdown change
        if (compareSelect) {
            compareSelect.onchange = () => {
                const selected = compareSelect.value;
                if (selected) {
                    if (this.rankHistoryChart && this.rankHistoryChart._setComparison) {
                        this.rankHistoryChart._setComparison(selected);
                    }
                } else {
                    if (this.rankHistoryChart && this.rankHistoryChart._clearComparison) {
                        this.rankHistoryChart._clearComparison();
                    }
                }
                onCompareFn(selected || null);
            };
        }

        // Wire clear button
        if (compareClear) {
            compareClear.onclick = () => {
                if (this.rankHistoryChart && this.rankHistoryChart._clearComparison) {
                    this.rankHistoryChart._clearComparison();
                }
                onCompareFn(null);
            };
        }

        // Render policy narrative if available for this metric
        const narrativeEl = document.getElementById('rank-history-narrative');
        const narr = metricData.rankHistoryNarrative;
        // Consolidated layout: narrative lives in modal-consolidated, not here
        if (metricData.useConsolidated) {
            if (narrativeEl) narrativeEl.style.display = 'none';
        } else if (narr && narrativeEl) {
            let html = `<div class="rh-narr-section">
                <h3 class="rh-narr-heading">Hawai\u02BBi\u2019s track record</h3>
                <p class="rh-narr-text">${narr.summary}</p>
            </div>`;

            if (narr.benchmarks && narr.benchmarks.length) {
                html += `<div class="rh-narr-section">
                    <h3 class="rh-narr-heading">States that improved</h3>`;
                narr.benchmarks.forEach(b => {
                    const srcHtml = b.source
                        ? `<a href="${b.source.url}" target="_blank" rel="noopener" class="rh-narr-source">\u2192 ${b.source.label}</a>`
                        : '';
                    html += `<div class="rh-narr-item">
                        <div class="rh-narr-state">${b.state}</div>
                        <p class="rh-narr-text">${b.text}</p>
                        ${srcHtml}
                    </div>`;
                });
                html += `</div>`;
            }

            if (narr.explore && narr.explore.length) {
                html += `<div class="rh-narr-section">
                    <h3 class="rh-narr-heading">What these comparisons suggest</h3>`;
                narr.explore.forEach(point => {
                    html += `<p class="rh-narr-text rh-narr-explore">${point}</p>`;
                });
                html += `</div>`;
            }

            if (narr.caution) {
                const srcHtml = narr.caution.source
                    ? `<a href="${narr.caution.source.url}" target="_blank" rel="noopener" class="rh-narr-source">\u2192 ${narr.caution.source.label}</a>`
                    : '';
                html += `<div class="rh-narr-section">
                    <h3 class="rh-narr-heading">Cautionary outcome</h3>
                    <div class="rh-narr-item">
                        <div class="rh-narr-state">${narr.caution.state}</div>
                        <p class="rh-narr-text">${narr.caution.text}</p>
                        ${srcHtml}
                    </div>
                </div>`;
            }

            narrativeEl.innerHTML = html;
            narrativeEl.style.display = '';
        } else if (narrativeEl) {
            narrativeEl.innerHTML = '';
            narrativeEl.style.display = 'none';
        }
    },

    /**
     * Render the County tab: multi-line chart for Honolulu, Hawaiʻi, Maui, and Kauai.
     * @param {string} slug - Metric ID
     */
    showCounty(slug) {
        const countyData = typeof COUNTY_DATA !== 'undefined' && COUNTY_DATA[slug];
        if (!countyData) return;
        const metricData = DASHBOARD_DATA[slug];

        document.getElementById('modal-detail-view').style.display = 'none';
        document.getElementById('modal-rankings').style.display = 'none';
        document.getElementById('modal-county').style.display = 'block';

        const isSmoothed = countyData.smoothCounty === true;
        document.getElementById('county-subtitle').textContent =
            `County breakdown${isSmoothed ? ' \u00B7 3-year rolling avg' : ''}`;

        // County reliability note
        const noteEl = document.getElementById('county-note');
        if (countyData.countyNote) {
            noteEl.textContent = countyData.countyNote;
            noteEl.style.display = '';
        } else {
            noteEl.style.display = 'none';
        }

        // Apply 3-year centered rolling average if flagged
        let chartData = countyData;
        if (isSmoothed) {
            const smoothed = { ...countyData, data: {} };
            for (const county of countyData.counties) {
                const raw = countyData.data[county];
                const years = Object.keys(raw).sort();
                const out = {};
                for (let i = 0; i < years.length; i++) {
                    const window = [];
                    for (let j = Math.max(0, i - 1); j <= Math.min(years.length - 1, i + 1); j++) {
                        if (raw[years[j]] != null) window.push(raw[years[j]]);
                    }
                    out[years[i]] = window.length ? +(window.reduce((a, b) => a + b, 0) / window.length).toFixed(4) : null;
                }
                smoothed.data[county] = out;
            }
            chartData = smoothed;
        }

        const canvas = document.getElementById('county-chart');
        const labels = Object.keys(Object.values(chartData.data)[0]).sort();
        const govBoxes = this.getGovernorBoxes(labels);

        const stateRef = countyData.hideStateLine ? null : metricData.hawaii;
        this.countyChart = ChartUtils.createCountyChart(
            canvas, chartData, metricData, govBoxes, this.COUNTY_COLORS, stateRef
        );
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${metricData.metric} by Hawaiʻi county: Honolulu, Hawaiʻi, Maui, Kauai`);
    },

    hideCounty() {
        document.getElementById('modal-county').style.display = 'none';
        if (this.countyChart) {
            this.countyChart.destroy();
            this.countyChart = null;
        }
    },

    buildDataTable(effective, slug) {
        const table = document.getElementById('data-table');
        const isDecimal = ChartUtils.isDecimalPctMetric(effective);
        const fmt = (v) => ChartUtils.formatValue(v, effective.unit, isDecimal);
        // Rankings values are already converted (decimal * 100), so format without double-conversion
        const fmtRank = (v) => ChartUtils.formatValue(v, effective.unit, false);
        const isHI = (name) => name === 'Hawaii' || name === 'Hawai\u02BBi' || name === "Hawai'i";

        let html = '';

        // Section 1: Other States for latest year (exclude Hawaii - shown separately below)
        const sd = typeof STATE_DATA !== 'undefined' && STATE_DATA[slug];
        if (sd && sd.data) {
            const rankings = this.getStateRankings(slug);
            if (rankings && rankings.stateValues.length > 0) {
                const dirLabel = effective.goodDirection === 'up' ? 'higher is better' : 'lower is better';
                const otherStates = rankings.stateValues.filter(sv => !isHI(sv.state));
                html += '<thead><tr class="section-header"><td colspan="3">'
                    + 'Other States (' + rankings.year + ') - ' + dirLabel
                    + '</td></tr><tr><th>Rank</th><th>State</th><th>Value</th></tr></thead><tbody>';
                otherStates.forEach((sv, i) => {
                    html += '<tr><td>' + (i + 1) + '</td><td>' + sv.state + '</td><td>' + fmtRank(sv.value) + '</td></tr>';
                });
                html += '</tbody>';
            }
        }

        // Section 2: Hawaii Time Series
        const years = Object.keys(effective.hawaii);
        html += '<thead><tr class="section-header"><td colspan="3">Hawaii Time Series</td></tr>'
            + '<tr><th>Year</th><th>Hawai\u02BBi</th><th>Other-states average</th></tr></thead><tbody>';
        for (const year of years) {
            const hi = effective.hawaii[year];
            const avg = effective.otherStateAvg[year];
            html += '<tr><td>' + year + '</td><td>' + fmt(hi) + '</td><td>' + (avg != null ? fmt(avg) : '-') + '</td></tr>';
        }
        html += '</tbody>';

        table.innerHTML = html;
    },

    /**
     * Close the detail modal, destroy all charts, remove card highlight,
     * clean up event listeners, and reset the URL.
     */
    closeModal() {
        const overlay = document.getElementById('modal-overlay');
        overlay.classList.remove('active');
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';

        const activeCard = document.querySelector('.card.active');
        if (activeCard) activeCard.classList.remove('active');

        // Reset URL to root (preserve bundle param if active)
        history.replaceState(null, '', this._activeBundle ? '/?bundle=' + this._activeBundle.id : '/');

        // Hide bundle nav
        const bundleNav = document.getElementById('bundle-nav');
        if (bundleNav) bundleNav.classList.remove('visible');

        document.getElementById('table-toggle-wrap').style.display = 'none';
        document.getElementById('modal-table-container').style.display = 'none';
        document.querySelector('.modal-chart-container').style.display = '';
        const chartNoteEl = document.getElementById('modal-chart-note');
        if (chartNoteEl) { chartNoteEl.style.display = 'none'; chartNoteEl.textContent = ''; }

        // Clean up scroll hint listener
        if (this._rankingsScrollHandler) {
            const modal = document.getElementById('modal');
            modal.removeEventListener('scroll', this._rankingsScrollHandler);
            this._rankingsScrollHandler = null;
        }

        // Destroy charts
        if (this.detailChart) {
            this.detailChart.destroy();
            this.detailChart = null;
        }
        if (this.rankingsChart) {
            this.rankingsChart.destroy();
            this.rankingsChart = null;
        }
        if (this.countyChart) {
            this.countyChart.destroy();
            this.countyChart = null;
        }
    },

    // ----------------------------------------------------------------
    // Routing
    // ----------------------------------------------------------------
    /** Handle permalink routing: /t/{slug}/ (detail), /r/{slug}/ (rankings), /c/{slug}/ (county), or legacy #{slug} */
    handleRoute() {
        let slug = '';
        let view = '';

        // Check path-based routes: /t/{slug}/ (detail), /r/{slug}/ (rankings), /c/{slug}/ (county),
        // /rh/{slug}/ (rank-history), /rh/{slug}/{state-slug}/ (rank-history with comparison)
        const detailMatch = window.location.pathname.match(/^\/t\/([^/]+)\/?$/);
        const rankMatch = window.location.pathname.match(/^\/r\/([^/]+)\/?$/);
        const countyMatch = window.location.pathname.match(/^\/c\/([^/]+)\/?$/);
        const rankHistoryCompareMatch = window.location.pathname.match(/^\/rh\/([^/]+)\/([^/]+)\/?$/);
        const rankHistoryMatch = window.location.pathname.match(/^\/rh\/([^/]+)\/?$/);
        let compareSlug = '';
        if (detailMatch) {
            slug = detailMatch[1];
        } else if (rankMatch) {
            slug = rankMatch[1];
            view = 'rankings';
        } else if (countyMatch) {
            slug = countyMatch[1];
            view = 'county';
        } else if (rankHistoryCompareMatch) {
            slug = rankHistoryCompareMatch[1];
            view = 'rank-history';
            compareSlug = rankHistoryCompareMatch[2];
        } else if (rankHistoryMatch) {
            slug = rankHistoryMatch[1];
            view = 'rank-history';
        }

        // Fall back to legacy hash route: #{slug} or #{slug}/rankings or #{slug}/rank-history/{state-slug}
        if (!slug) {
            const hash = window.location.hash.slice(1);
            if (!hash) return;
            const parts = hash.split('/');
            slug = parts[0];
            view = parts[1] || '';
            if (view === 'rank-history' && parts[2]) compareSlug = parts[2];
        }

        if (slug && !DASHBOARD_DATA[slug]) {
            history.replaceState(null, '', '/');
            return;
        }
        if (!slug) return;

        let areaName = '';
        for (const areaGroup of this.AREA_ORDER) {
            if (areaGroup.metrics.includes(slug)) {
                areaName = areaGroup.area;
                break;
            }
        }

        const initialView = ['rankings', 'county', 'rank-history'].includes(view) ? view : undefined;
        const initialCompare = compareSlug ? this.slugToState(compareSlug) : undefined;
        this.openModal(slug, areaName, initialView, initialCompare);
    },

    /**
     * Build consolidated narrative HTML for metrics with useConsolidated: true.
     * Assembles Why → National standing → County → Drivers → Lessons → Policy levers → Data notes.
     * @param {Object} m - Metric data object from DASHBOARD_DATA
     * @returns {string} HTML string
     * @private
     */
    _buildConsolidatedNarrative(m) {
        let h = '';

        // 1. Why it matters
        h += `<div class="cn-section">
            <h3 class="cn-heading">Why it matters</h3>
            <p class="cn-text">${m.whyItMatters}</p>
        </div>`;

        // 2. National standing (rank history summary)
        if (m.rankHistoryNarrative && m.rankHistoryNarrative.summary) h += `<div class="cn-section">
            <h3 class="cn-heading">National standing</h3>
            <p class="cn-text">${m.rankHistoryNarrative.summary}</p>
        </div>`;

        // 4. County breakdown
        if (m.countyNarrative) h += `<div class="cn-section">
            <h3 class="cn-heading">County breakdown</h3>
            <p class="cn-text">${m.countyNarrative}</p>
        </div>`;

        // 5. Potential drivers
        if (m.potentialDrivers) h += `<div class="cn-section">
            <h3 class="cn-heading">Potential drivers</h3>
            <p class="cn-text">${m.potentialDrivers}</p>
        </div>`;

        // 6. Lessons from other states (benchmarks + caution + explore)
        const narr = m.rankHistoryNarrative;
        if (narr && (narr.benchmarks?.length || narr.caution || narr.explore?.length)) {
            h += `<div class="cn-section"><h3 class="cn-heading">Lessons from other states</h3>`;
            (narr.benchmarks || []).forEach(b => {
                const src = b.source ? `<a href="${b.source.url}" target="_blank" rel="noopener" class="cn-source">\u2192 ${b.source.label}</a>` : '';
                h += `<div class="cn-item"><div class="cn-state cn-state--learn">${b.state}</div><p class="cn-text">${b.text}</p>${src}</div>`;
            });
            if (narr.caution) {
                const src = narr.caution.source ? `<a href="${narr.caution.source.url}" target="_blank" rel="noopener" class="cn-source">\u2192 ${narr.caution.source.label}</a>` : '';
                h += `<div class="cn-item"><div class="cn-state cn-state--caution">${narr.caution.state}</div><p class="cn-text">${narr.caution.text}</p>${src}</div>`;
            }
            if (narr.explore && narr.explore.length) {
                h += `<div class="cn-item">`;
                narr.explore.forEach(pt => { h += `<p class="cn-text">${pt}</p>`; });
                h += `</div>`;
            }
            h += `</div>`;
        }

        // 7. Policy levers
        if (m.policyLevers) h += `<div class="cn-section">
            <h3 class="cn-heading">Policy levers</h3>
            <p class="cn-text">${m.policyLevers}</p>
        </div>`;

        // 8. Data note
        if (m.dataNote) h += `<div class="cn-section cn-data-note">
            <p class="cn-text">\u26A0 ${m.dataNote}</p>
        </div>`;

        return h;
    },

    // ── Copy-brief helpers ─────────────────────────────────────────────

    /**
     * Compute a neutral trend phrase comparing two 3-year windows.
     * Uses the same window logic as the card 5-year change indicator.
     * @param {string} slug - Metric ID
     * @returns {string|null} e.g. "improved 8.2% from the 2019-21 to 2022-24 average"
     */
    computeTrendPhrase(slug) {
        const effective = this.getEffectiveData(slug);
        if (!effective || !effective.hawaii) return null;
        const m = DASHBOARD_DATA[slug];

        const sortedKeys = Object.keys(effective.hawaii)
            .sort((a, b) => this.keyEnd(a) - this.keyEnd(b));
        if (sortedKeys.length < 4) return null;

        const recent = sortedKeys.slice(-3);
        const prior  = sortedKeys.slice(-6, -3);
        if (prior.length < 2) return null;

        const avg = (keys) => {
            const vals = keys.map(k => effective.hawaii[k]).filter(v => v != null);
            return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        };
        const recentAvg = avg(recent);
        const priorAvg  = avg(prior);
        if (recentAvg == null || priorAvg == null || priorAvg === 0) return null;

        const change   = recentAvg - priorAvg;
        const pctChange = (change / Math.abs(priorAvg)) * 100;
        const isFlat    = Math.abs(pctChange) < 0.5;
        const isImproving = m.goodDirection === 'up' ? change > 0 : change < 0;

        const word    = isFlat ? 'held flat' : (isImproving ? 'improved' : 'worsened');
        const pctPart = isFlat ? '' : ` ${Math.abs(pctChange) > 100 ? Math.abs(pctChange).toFixed(0) : Math.abs(pctChange).toFixed(1)}%`;
        const priorLbl  = `${this.parseYearLabel(prior[0])}\u2013${String(this.keyEnd(prior[prior.length - 1])).slice(-2)}`;
        const recentLbl = `${this.parseYearLabel(recent[0])}\u2013${String(this.keyEnd(recent[recent.length - 1])).slice(-2)}`;

        return `${word}${pctPart} from the ${priorLbl} to ${recentLbl} average`;
    },

    /**
     * Build a paste-ready one-paragraph summary for a metric.
     * Values are computed live so the text stays current as data updates.
     * @param {string} slug - Metric ID
     * @returns {string|null} Plain-text paragraph
     */
    computeBrief(slug) {
        const m = DASHBOARD_DATA[slug];
        const tpl = BRIEF_TEMPLATES[slug];
        if (!m || !tpl) return null;

        const rankings = this.getStateRankings(slug);
        const effective = this.getEffectiveData(slug);
        if (!rankings || !effective || !effective.hawaii) return null;

        const az = ZERO_IS_VALID.has(slug);
        const latestHi  = this.getLatestValue(effective.hawaii, az);
        const latestAvg = this.getLatestValue(effective.otherStateAvg, az);
        if (latestHi.value === null || latestHi.value === undefined) return null;

        const isDecimal = ChartUtils.isDecimalPctMetric(m);
        const fmtValue  = ChartUtils.formatValue(latestHi.value, m.unit, isDecimal);
        const period    = rankings.year;
        const rank      = rankings.hawaiiRank;

        // Fill intro template
        let intro = tpl.intro
            .replace('{{value}}', fmtValue)
            .replace('{{period}}', period);

        // Above / below / at the Other State Average
        const hiVal  = isDecimal ? latestHi.value * 100  : latestHi.value;
        const avgVal = isDecimal ? latestAvg.value * 100 : latestAvg.value;
        const vsAvg  = hiVal > avgVal ? 'above' : hiVal < avgVal ? 'below' : 'at';

        const trend = this.computeTrendPhrase(slug);

        let brief = `Bottom line: ${intro}, ranking #${rank} nationally.`;
        if (trend) brief += ` It has ${trend},`;
        brief += ` and sits ${vsAvg} the Other State Average.`;
        if (tpl.caveat) brief += ` Keep in mind: ${tpl.caveat}`;

        return brief;
    },

    /**
     * Build the jump-to-metric dropdown from AREA_ORDER and wire
     * click, outside-click, Escape, and '/' keyboard handlers.
     */
    initMetricSearch() {
        const trigger  = document.getElementById('metric-search-trigger');
        const dropdown = document.getElementById('metric-search-dropdown');
        if (!trigger || !dropdown) return;

        let isOpen = false;

        // Populate once from AREA_ORDER so categories appear as section headers
        for (const areaGroup of this.AREA_ORDER) {
            const header = document.createElement('li');
            header.className = 'metric-search-group-header';
            header.setAttribute('aria-hidden', 'true');
            header.textContent = areaGroup.area;
            dropdown.appendChild(header);

            for (const slug of areaGroup.metrics) {
                const m = DASHBOARD_DATA[slug];
                if (!m) continue;
                const li = document.createElement('li');
                li.className = 'metric-search-item';
                li.setAttribute('role', 'option');
                li.setAttribute('data-slug', slug);
                li.textContent = m.metric || slug;
                li.addEventListener('click', () => {
                    close();
                    this.openModal(slug, areaGroup.area);
                    const card = document.getElementById(slug);
                    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
                dropdown.appendChild(li);
            }
        }

        const open = () => {
            dropdown.style.display = 'block';
            trigger.setAttribute('aria-expanded', 'true');
            isOpen = true;
        };

        const close = () => {
            dropdown.style.display = 'none';
            trigger.setAttribute('aria-expanded', 'false');
            isOpen = false;
        };

        trigger.addEventListener('click', () => { isOpen ? close() : open(); });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (isOpen && !trigger.contains(e.target) && !dropdown.contains(e.target)) {
                close();
            }
        });

        // Keyboard: Escape closes; '/' from anywhere toggles
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen) { close(); return; }
            const tag = (e.target.tagName || '').toUpperCase();
            if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                isOpen ? close() : open();
            }
        });
    },

    /**
     * Fire a named analytics event to all connected platforms (GA4, Clarity).
     * Add new platforms here; callers never need to change.
     * @param {string} eventName - Event name (e.g. 'modal_open')
     * @param {Object} params - Arbitrary event parameters
     * @private
     */
    _trackEvent(eventName, params) {
        // Google Analytics 4 / GTM
        if (window.dataLayer) {
            window.dataLayer.push({ event: eventName, ...params });
        }
        // Microsoft Clarity: tag the session with the metric slug for filtering
        if (window.clarity) {
            window.clarity('set', 'metric_slug', params.slug || '');
            window.clarity('event', eventName);
        }
    },
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
