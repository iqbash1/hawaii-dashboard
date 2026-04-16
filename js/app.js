// ============================================================
// Hawaiʻi Dashboard - Main App
//
// Renders metric cards, manages the detail modal, handles
// URL routing, and manages data export. Data is updated
// annually from federal sources via the automated pipeline.
// Build: 2026-04-04
// ============================================================

const STATE_ABBREVS = { // eslint-disable-line no-unused-vars
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
const BRIEF_TEMPLATES = { // eslint-disable-line no-unused-vars
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
        scaleTemplate: ", or {{scale}}",
        caveat: "the 30% threshold is a convention, not a hard affordability cliff.",
        thresholdVariants: {
            "50": {
                intro: "{{value}} of Hawai\u02BBi renters were severely housing-cost burdened in {{period}}",
                caveat: "this captures the most acute distress; the true share may be higher because the ACS undercounts some low-income renters."
            }
        }
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
        scaleTemplate: ", or {{scale}}",
        caveat: "this is based on a one-night count and likely understates the true number.",
        thresholdVariants: {
            "all": {
                intro: "Hawai\u02BBi's total homeless rate is {{value}} ({{period}})",
                caveat: "this includes both sheltered and unsheltered; the one-night count methodology means the true number is likely higher."
            }
        }
    },
    food_insecurity_rate: {
        intro: "Hawai\u02BBi's food insecurity rate is {{value}} ({{period}})",
        scaleTemplate: ", or {{scale}}",
        caveat: "this is a 3-year rolling average, so it lags current conditions.",
        thresholdVariants: {
            "verylow": {
                intro: "Hawai\u02BBi's very low food security rate is {{value}} ({{period}})",
                caveat: "this captures only the most severe cases where households reduced food intake; the broader food insecurity rate is higher."
            }
        }
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
        intro: "Hawai\u02BBi's real per capita income is {{value}} in constant 2017 dollars ({{period}})",
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
        intro: "More people left Hawai\u02BBi than arrived: {{value}} per 10,000 residents in {{period}}",
        caveat: "this shows net movement, not why people are leaving or arriving."
    },
    road_poor_pct: {
        intro: "{{value}} of Hawai\u02BBi roads were rated in poor condition in {{period}}",
        scaleTemplate: ", or {{scale}}",
        caveat: "this is not a complete inventory of every road, especially local roads.",
        thresholdVariants: {
            "notgood": {
                intro: "{{value}} of Hawai\u02BBi roads were rated substandard in {{period}}",
                caveat: "this combines poor and acceptable/mediocre ratings; the 'poor only' view isolates the worst roads."
            }
        }
    },
    rainy_day_fund_pct: {
        intro: "Hawai\u02BBi's rainy day fund was {{value}} of general fund spending in {{period}}",
        caveat: "this covers the stabilization fund only, not total reserves."
    },
    voter_participation_rate: {
        intro: "Only {{value}} of eligible Hawai\u02BBi voters cast a ballot in {{period}}",
        caveat: "this is based on eligible voters, not all adults."
    },
};

// Threshold toggle config: maps each metric with severity variants to its
// toggle metadata. Adding a new threshold metric means adding one entry here
// plus the data — zero code changes elsewhere.
const THRESHOLD_CONFIG = { // eslint-disable-line no-unused-vars
    renter_cost_burden_pct: {
        defaultKey: '30',
        variantKey: '50',
        urlSegment: 'severe',
        ariaLabel: 'Cost burden threshold',
        buttons: [
            { key: '30', label: '30%+', title: 'Renters paying 30%+ of income on housing (federal affordability threshold)' },
            { key: '50', label: '50%+', title: 'Renters paying 50%+ of income on housing (severely burdened)' },
        ]
    },
    food_insecurity_rate: {
        defaultKey: 'base',
        variantKey: 'verylow',
        urlSegment: 'verylow',
        ariaLabel: 'Food security threshold',
        buttons: [
            { key: 'base', label: 'Insecure', title: 'All food-insecure households (low + very low food security combined)' },
            { key: 'verylow', label: 'Severe', title: 'Very low food security only (households that reduced food intake)' },
        ]
    },
    road_poor_pct: {
        defaultKey: 'base',
        variantKey: 'notgood',
        urlSegment: 'notgood',
        ariaLabel: 'Road condition threshold',
        buttons: [
            { key: 'base', label: 'Poor', title: 'Roads rated Poor by ride quality (IRI > 170)' },
            { key: 'notgood', label: 'Substandard', title: 'Roads rated Poor + Acceptable combined (IRI > 95)' },
        ]
    },
    unsheltered_homeless_rate: {
        defaultKey: 'base',
        variantKey: 'all',
        urlSegment: 'total',
        ariaLabel: 'Homeless count scope',
        buttons: [
            { key: 'base', label: 'Unsheltered', title: 'Unsheltered homeless only (sleeping outdoors, in vehicles, or places not meant for habitation)' },
            { key: 'all', label: 'Total', title: 'All homeless (sheltered + unsheltered combined)' },
        ]
    },
};

// Metrics where zero is a genuine data value (not missing data).
// For all other metrics, zero in the time series means data was not reported.
const ZERO_IS_VALID = new Set(['net_employer_formation', 'rainy_day_fund_pct', 'net_domestic_migration_rate']);

const App = {
    sparklineCharts: [],
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

        Modal.setupModal();

        this.renderQuestionDropdown();

        // Restore bundle from URL param on load (e.g. /?bundle=affordability)
        const initBundle = new URLSearchParams(window.location.search).get('bundle');
        if (initBundle) this.activateBundle(initBundle);

        this.initMetricSearch();

        // Handle permalink routing (path-based /t/slug/ or legacy hash #slug)
        Router.handleRoute();
        window.addEventListener('hashchange', () => Router.handleRoute());
        window.addEventListener('popstate', () => Router.handleRoute());

    },

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------

    /** Cache for computed chart data from STATE_DATA */
    _chartDataCache: {},

    // ----------------------------------------------------------------
    // Threshold Resolvers
    // ----------------------------------------------------------------
    /**
     * Return DASHBOARD_DATA[slug] merged with the active threshold overlay.
     * When no threshold is active (default), returns the base 30%+ data.
     */
    getActiveMetricData(slug) {
        const base = DASHBOARD_DATA[slug];
        if (!base) return null;
        const th = typeof Modal !== 'undefined' && Modal._activeThreshold && Modal._activeThreshold[slug];
        if (!th || !base.thresholdVariants || !base.thresholdVariants[th]) return base;
        return { ...base, ...base.thresholdVariants[th] };
    },

    /**
     * Return STATE_DATA[slug] merged with the active threshold overlay.
     * When no threshold is active, returns the base state data unchanged.
     */
    getActiveStateData(slug) {
        const sd = typeof STATE_DATA !== 'undefined' && STATE_DATA[slug];
        if (!sd) return null;
        const th = typeof Modal !== 'undefined' && Modal._activeThreshold && Modal._activeThreshold[slug];
        if (!th || !sd.thresholdVariants || !sd.thresholdVariants[th]) return sd;
        return { ...sd, ...sd.thresholdVariants[th] };
    },

    /**
     * Return COUNTY_DATA[slug] merged with the active threshold overlay.
     * When no threshold is active, returns the base county data unchanged.
     */
    getActiveCountyData(slug) {
        const cd = typeof COUNTY_DATA !== 'undefined' && COUNTY_DATA[slug];
        if (!cd) return null;
        const th = typeof Modal !== 'undefined' && Modal._activeThreshold && Modal._activeThreshold[slug];
        if (!th || !cd.thresholdVariants || !cd.thresholdVariants[th]) return cd;
        return { ...cd, ...cd.thresholdVariants[th] };
    },

    // ----------------------------------------------------------------
    // Resident-Scale Translation
    // ----------------------------------------------------------------
    /**
     * Translate a metric value into a human-scale phrase like "1 in 4 renter
     * households" or "about 94,000 renter households." Prefers ratio form when
     * the value rounds cleanly to 1/N where N is in a small denominator list.
     * Returns null if the metric has no scale config or value is missing.
     *
     * @param {string} slug - Metric ID (uses active variant's value automatically)
     * @param {number} value - Raw value from the series (decimal 0.506 OR 28.2 per-10K)
     * @returns {string|null} Formatted translation or null
     */
    computeScaleTranslation(slug, value) {
        if (value === null || value === undefined) return null;
        const base = DASHBOARD_DATA[slug];
        if (!base || !base.scale) return null;
        const scale = base.scale;
        const denom = scale.denominator;
        if (!denom || denom <= 0) return null;

        // Convert rate to a fraction (share of denominator), based on metric unit
        const unit = base.unit || '';
        const isDec = ChartUtils.isDecimalPctMetric(base);
        let fraction;
        if (isDec) {
            fraction = value;
        } else if (unit === '%') {
            fraction = value / 100;
        } else if (unit === 'per 100K') {
            fraction = value / 100000;
        } else if (unit === 'per 10K') {
            fraction = value / 10000;
        } else if (unit === 'per 1,000') {
            fraction = value / 1000;
        } else {
            // Not a rate — skip (e.g. $ amounts, scale scores, ratios)
            return null;
        }

        if (fraction <= 0 || !isFinite(fraction)) return null;

        // Try ratio form only when the fraction is meaningful (>=5%).
        // For very small rates, ratio like "1 in 100" can be misleading
        // because absolute tolerance allows too-wide matches.
        if (fraction >= 0.05) {
            const ratioCandidates = [2, 3, 4, 5, 6, 10, 20, 25, 50];
            let bestN = null;
            let bestDiff = Infinity;
            for (const N of ratioCandidates) {
                const candidate = 1 / N;
                const relDiff = Math.abs(fraction - candidate) / candidate;
                if (relDiff < bestDiff) {
                    bestDiff = relDiff;
                    bestN = N;
                }
            }
            // Use ratio only if the actual value is within 10% of the clean fraction (relative).
            if (bestN !== null && bestDiff <= 0.10) {
                return `about 1 in ${bestN} ${scale.unit}`;
            }
        }

        // Absolute form: count = fraction × denominator, rounded nicely
        const count = fraction * denom;
        const formattedCount = App._formatScaleCount(count);
        // Use the pre-rounded denominator value directly (with plain formatting
        // if numeric, or as-is if a string like "1.4 million").
        const denomRounded = scale.denominatorRounded != null
            ? App._formatDenominator(scale.denominatorRounded)
            : null;
        if (denomRounded) {
            return `about ${formattedCount} of Hawai\u02BBi's ${denomRounded} ${scale.unit}`;
        }
        return `about ${formattedCount} ${scale.unit}`;
    },

    /** Format a pre-rounded denominator: preserve the rounded value, add commas or "million" suffix. */
    _formatDenominator(n) {
        if (typeof n === 'string') return n;
        if (n >= 1000000) {
            const millions = n / 1000000;
            const fixed = millions >= 10 ? millions.toFixed(0) : millions.toFixed(1);
            return fixed + ' million';
        }
        return n.toLocaleString('en-US');
    },

    /** Format a count with appropriate rounding and commas/abbreviations. */
    _formatScaleCount(n, isDenominator) {
        if (n >= 1000000) {
            const millions = n / 1000000;
            const fixed = millions >= 10 ? millions.toFixed(0) : millions.toFixed(1);
            return fixed + ' million';
        }
        // Round to 2 significant figures for readability
        let rounded;
        if (n >= 100000) {
            rounded = Math.round(n / 10000) * 10000;
        } else if (n >= 10000) {
            rounded = Math.round(n / 1000) * 1000;
        } else if (n >= 1000) {
            rounded = Math.round(n / 100) * 100;
        } else if (n >= 100) {
            rounded = Math.round(n / 10) * 10;
        } else {
            rounded = Math.round(n);
        }
        return rounded.toLocaleString('en-US');
    },

    /**
     * Compute hawaii + otherStateAvg time series from STATE_DATA.
     * This is the SINGLE SOURCE OF TRUTH for both chart versions:
     * card sparklines and modal detail charts derive from the same
     * per-state data that drives rankings.
     */
    computeChartData(slug) {
        // Threshold-aware cache key
        const th = typeof Modal !== 'undefined' && Modal._activeThreshold && Modal._activeThreshold[slug];
        const cacheKey = th ? `${slug}__th${th}` : slug;
        if (this._chartDataCache[cacheKey]) return this._chartDataCache[cacheKey];

        const sd = this.getActiveStateData(slug);
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
        this._chartDataCache[cacheKey] = result;
        return result;
    },

    // Delegate to Compute (pure, testable in Node.js via compute.js)
    parseYearLabel(label) { return Compute.parseYearLabel(label); },
    keyEnd(k) { return Compute.keyEnd(k); },
    getLatestValue(obj, az) { return Compute.getLatestValue(obj, az); },
    /** Get governor term boxes for the chart x-axis labels */
    getGovernorBoxes(labels) {
        if (!labels || labels.length === 0) return [];
        const boxes = [];
        const years = labels.map(l => this.parseYearLabel(l));
        this.GOVERNORS.forEach(gov => {
            let firstIdx = -1, lastIdx = -1;
            years.forEach((year, idx) => {
                if (year !== null && year >= gov.start && year < gov.end) {
                    if (firstIdx === -1) firstIdx = idx;
                    lastIdx = idx;
                }
            });
            if (firstIdx !== -1) {
                boxes.push({ name: gov.name, party: gov.party, startIdx: firstIdx, endIdx: lastIdx });
            }
        });
        return boxes;
    },

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
        const metricData = this.getActiveMetricData(slug);
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
        const hasRankings = this.getActiveStateData(slug);
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

    /** Extract per-state latest-year values from STATE_DATA */
    getStateRankings(slug) {
        const sd = this.getActiveStateData(slug);
        if (!sd || !sd.data) return null;
        const metricData = this.getActiveMetricData(slug);

        const firstKey = Object.keys(sd.data)[0];
        const isPCPStyle = sd.data[firstKey] && typeof sd.data[firstKey].name === 'string';

        let stateValues = [];
        let year = '';

        if (isPCPStyle) {
            const yearCounts = {};
            Object.values(sd.data).forEach(entry => {
                Object.keys(entry).forEach(k => {
                    if (k !== 'name') yearCounts[k] = (yearCounts[k] || 0) + 1;
                });
            });
            year = Object.keys(yearCounts).sort()
                .reverse().find(y => yearCounts[y] >= 25) || Object.keys(yearCounts).sort().pop();
            Object.values(sd.data).forEach(entry => {
                if (entry[year] != null) {
                    stateValues.push({ state: entry.name, value: entry[year] });
                }
            });
        } else {
            const years = Object.keys(sd.data).sort();
            year = years.reverse().find(y => Object.values(sd.data[y]).filter(v => v != null).length >= 25)
                || years[0];
            const yearData = sd.data[year];
            if (!yearData) return null;
            const isDecimal = ChartUtils.isDecimalPctMetric(metricData);
            Object.entries(yearData).forEach(([state, value]) => {
                if (value != null) {
                    const displayVal = isDecimal ? value * 100 : value;
                    stateValues.push({ state, value: displayVal });
                }
            });
        }

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
     * Compute year-by-year national rankings from STATE_DATA.
     * @param {string} slug - Metric ID
     * @returns {{ years, stateRanks, stateValues, latestYearRanked, hiKey, hiRank, total } | null}
     */
    computeRankHistory(slug) {
        const sd = this.getActiveStateData(slug);
        if (!sd || !sd.data) return null;
        const m = this.getActiveMetricData(slug);
        const isDec = ChartUtils.isDecimalPctMetric(m);

        const firstKey = Object.keys(sd.data)[0];
        const isPCP = sd.data[firstKey] && typeof sd.data[firstKey].name === 'string';

        const yearData = {};

        if (isPCP) {
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

        const stateRanks = {};
        const stateValues = {};
        const latestYearRanked = [];

        for (const yr of years) {
            const vals = yearData[yr];
            if (m.goodDirection === 'up') vals.sort((a, b) => b.value - a.value);
            else vals.sort((a, b) => a.value - b.value);

            vals.forEach((entry, idx) => {
                const rank = idx + 1;
                if (!stateRanks[entry.state]) stateRanks[entry.state] = {};
                stateRanks[entry.state][yr] = rank;
                if (!stateValues[entry.state]) stateValues[entry.state] = {};
                stateValues[entry.state][yr] = entry.value;
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
                const isDecimal = ChartUtils.isDecimalPctMetric(effective);
                const unitSuffix = effective.unitLabel
                    ? `<span class="card-unit">${effective.unitLabel}</span>`
                    : '';

                const monthlyHtml = effective.latestMonthly
                    ? `<div class="card-latest-monthly">Latest: ${ChartUtils.formatValue(effective.latestMonthly.value, effective.unit, false)} (${effective.latestMonthly.period})</div>`
                    : '';
                card.innerHTML = `
                    <div class="card-metric">${effective.metric}</div>
                    <div class="card-hero">
                        <span class="card-hawaii-value">${ChartUtils.formatCardValue(latest.value, effective.unit, isDecimal)}</span>
                        ${unitSuffix}
                        <span class="card-year">(${latest.year})</span>
                    </div>
                    ${monthlyHtml}
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
                        Modal.openModal(slug, areaGroup.area);
                    }
                });

                const rankEl = card.querySelector('.comp-rank');
                if (rankEl) {
                    rankEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        Modal.openModal(slug, areaGroup.area, 'rankings');
                    });
                }

                card.addEventListener('click', () => {
                    Modal.openModal(slug, areaGroup.area);
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
     * Render the "I have a question..." dropdown from BUNDLES and wire
     * click handlers to activate/deactivate question bundles.
     */
    renderQuestionDropdown() {
        const trigger  = document.getElementById('question-search-trigger');
        const dropdown = document.getElementById('question-search-dropdown');
        const label    = trigger?.querySelector('.question-search-label');
        const countEl  = trigger?.querySelector('.question-search-count');
        const clearEl  = document.getElementById('question-search-clear');
        if (!trigger || !dropdown || typeof BUNDLES === 'undefined') return;

        let isOpen = false;
        const defaultLabel = 'I have a question\u2026';

        // Populate from BUNDLES
        BUNDLES.forEach(b => {
            const li = document.createElement('li');
            li.className = 'question-search-item';
            li.setAttribute('role', 'option');
            li.setAttribute('data-bundle', b.id);
            li.textContent = b.title;
            li.addEventListener('click', () => {
                close();
                if (this._activeBundle && this._activeBundle.id === b.id) {
                    this.clearBundle();
                } else {
                    this.activateBundle(b.id);
                    this._trackEvent('question_selected', { bundle_id: b.id, bundle_title: b.title });
                }
            });
            dropdown.appendChild(li);
        });

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

        // Show selected question in the trigger itself
        this._updateQuestionTrigger = (bundle) => {
            if (bundle) {
                label.textContent = bundle.title;
                countEl.textContent = bundle.metrics.length + (bundle.metrics.length === 1 ? ' metric' : ' metrics');
                countEl.style.display = '';
                clearEl.style.display = '';
                trigger.classList.add('active');
            } else {
                label.textContent = defaultLabel;
                countEl.style.display = 'none';
                clearEl.style.display = 'none';
                trigger.classList.remove('active');
            }
        };

        trigger.addEventListener('click', (e) => {
            // If clicking the clear button, clear instead of opening dropdown
            if (e.target === clearEl || clearEl.contains(e.target)) {
                e.stopPropagation();
                this.clearBundle();
                return;
            }
            isOpen ? close() : open();
        });

        document.addEventListener('click', (e) => {
            if (isOpen && !trigger.contains(e.target) && !dropdown.contains(e.target)) {
                close();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen) close();
        });
    },

    /**
     * Activate a named bundle: dim non-matching cards and update the URL.
     * @param {string} bundleId - Bundle identifier (e.g. 'affordability')
     */
    activateBundle(bundleId) {
        const bundle = (typeof BUNDLES !== 'undefined') && BUNDLES.find(b => b.id === bundleId);
        if (!bundle) return;
        this._activeBundle = bundle;

        // Update the question trigger to show selected state
        if (this._updateQuestionTrigger) this._updateQuestionTrigger(bundle);

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

        // Reset the question trigger to default state
        if (this._updateQuestionTrigger) this._updateQuestionTrigger(null);

        const grid = document.getElementById('dashboard-grid');
        grid.classList.remove('bundle-active');
        document.querySelectorAll('.card.bundle-match').forEach(c => c.classList.remove('bundle-match'));

        const url = new URL(window.location.href);
        url.searchParams.delete('bundle');
        history.replaceState(null, '', url.pathname + (url.search !== '?' ? url.search : ''));
    },


    // Modal functions extracted to js/modal.js

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
                    Modal.openModal(slug, areaGroup.area);
                    this._trackEvent('metric_searched', { slug, metric_name: m.metric });
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

    // ── Scroll depth tracking ──────────────────────────────────────
    const scrollSections = [
        { el: document.querySelector('.dashboard-grid'), name: 'cards' },
        { el: document.getElementById('go-deeper'), name: 'go_deeper' },
        { el: document.querySelector('.footer'), name: 'footer' },
    ];
    const scrollObs = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
            if (e.isIntersecting) {
                App._trackEvent('section_reached', { section: e.target.dataset.trackSection });
                scrollObs.unobserve(e.target);
            }
        });
    }, { threshold: 0.1 });
    scrollSections.forEach((s) => {
        if (s.el) { s.el.dataset.trackSection = s.name; scrollObs.observe(s.el); }
    });

    // ── Go Deeper outbound link tracking ───────────────────────────
    document.getElementById('go-deeper')?.addEventListener('click', (e) => {
        const a = e.target.closest('a[href]');
        if (!a) return;
        const col = a.closest('.go-deeper-col');
        const heading = col?.querySelector('.go-deeper-heading')?.textContent || '';
        App._trackEvent('outbound_click', {
            link_label: a.textContent.trim(),
            link_url: a.href,
            section: heading,
        });
    });
});
