// ============================================================
// Hawaiʻi Dashboard - Main App
//
// Renders metric cards, manages the detail modal, and
// uses embedded data updated quarterly.
// ============================================================

const AREA_ICONS = {
    'Safety & Justice': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    'Public Health': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></svg>',
    'Cost of Living': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    'Energy': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    'Food Security': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
    'Employment': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
    'Economic Prosperity': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    'Business Climate': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    'K-12 Education': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    'Higher Education': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 3 3 6 3s6-1 6-3v-5"/></svg>',
    'Infrastructure': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="22" height="4" rx="1"/><line x1="6" y1="10" x2="6" y2="20"/><line x1="18" y1="10" x2="18" y2="20"/><line x1="3" y1="20" x2="21" y2="20"/></svg>',
    'Fiscal Stewardship': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
    'Public Confidence': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
};

const App = {
    sparklineCharts: [],
    detailChart: null,

    // Hawaiʻi Governors - for chart overlay
    GOVERNORS: [
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
        { area: 'Safety & Justice', metrics: ['violent_crime_rate'] },
        { area: 'Public Health', metrics: ['pcp_per_100k', 'uninsured_rate'] },
        { area: 'Cost of Living', metrics: ['renter_cost_burden_pct', 'home_price_to_income', 'unsheltered_homeless_rate'] },
        { area: 'Energy', metrics: ['residential_price_cpkwh', 'renewables_share_gen'] },
        { area: 'Food Security', metrics: ['food_insecurity_rate'] },
        { area: 'Employment', metrics: ['unemployment_rate'] },
        { area: 'Economic Prosperity', metrics: ['labor_productivity', 'real_per_capita_income'] },
        { area: 'Business Climate', metrics: ['estabs_entry_rate', 'net_employer_formation'] },
        { area: 'K-12 Education', metrics: ['acgr'] },
        { area: 'Higher Education', metrics: ['ba_or_higher_pct'] },
        { area: 'Infrastructure', metrics: ['road_poor_pct', 'broadband_subscription_pct'] },
        { area: 'Fiscal Stewardship', metrics: ['rainy_day_fund_pct'] },
        { area: 'Public Confidence', metrics: ['voter_participation_rate', 'net_domestic_migration_rate'] },
    ],

    init() {
        // Render cards from embedded data (updated quarterly)
        this.renderCards();

        // Set up modal events
        this.setupModal();

        // Handle permalink hash routing
        this.handleHashRoute();
        window.addEventListener('hashchange', () => this.handleHashRoute());
    },

    // --- Helpers ---

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
                    if (val == null) continue;
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

    /** Get the latest non-null/non-zero value from a data object */
    getLatestValue(obj) {
        const entries = Object.entries(obj).filter(([k, v]) => v !== null && v !== undefined && v !== 0);
        if (entries.length === 0) return { year: null, value: null };
        const last = entries[entries.length - 1];
        return { year: last[0], value: last[1] };
    },

    /** Get the second-to-last non-null/non-zero value */
    getPriorValue(obj) {
        const entries = Object.entries(obj).filter(([k, v]) => v !== null && v !== undefined && v !== 0);
        if (entries.length < 2) return { year: null, value: null };
        const prev = entries[entries.length - 2];
        return { year: prev[0], value: prev[1] };
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
    buildVsAvgHtml(metricData) {
        const latest = this.getLatestValue(metricData.hawaii);
        const latestAvg = this.getLatestValue(metricData.otherStateAvg);
        if (latest.value === null || latestAvg.value === null) return '';

        const diff = latest.value - latestAvg.value;
        const isBetter = metricData.goodDirection === 'up' ? diff > 0 : diff < 0;
        const isDecimal = ChartUtils.isDecimalPctMetric(metricData);
        const avgFormatted = ChartUtils.formatCardValue(latestAvg.value, metricData.unit, isDecimal);

        return `
            <div class="card-comp ${isBetter ? 'positive' : 'negative'}">
                <div class="comp-label">vs Other States</div>
                <div class="comp-verdict">${isBetter ? 'Better' : 'Worse'}</div>
                <div class="comp-detail">avg ${avgFormatted}</div>
            </div>
        `;
    },

    /** Build "vs Prior Year" comparison HTML for a card */
    buildVsYearHtml(metricData) {
        const latest = this.getLatestValue(metricData.hawaii);
        const prior = this.getPriorValue(metricData.hawaii);
        if (latest.value === null || prior.value === null) return '';

        const change = latest.value - prior.value;
        const pctChange = prior.value !== 0 ? ((change / Math.abs(prior.value)) * 100) : 0;
        const isImproving = metricData.goodDirection === 'up' ? change > 0 : change < 0;
        const isFlat = Math.abs(pctChange) < 0.1;

        const arrow = change > 0 ? '\u2191' : change < 0 ? '\u2193' : '\u2192';
        const absPct = Math.abs(pctChange);
        let pctLabel;
        if (isFlat) pctLabel = '\u2192 Flat';
        else if (absPct > 100) pctLabel = `${arrow} ${absPct.toFixed(0)}%`;
        else pctLabel = `${arrow} ${absPct.toFixed(1)}%`;

        const cls = isFlat ? 'neutral' : (isImproving ? 'positive' : 'negative');
        const word = isFlat ? 'Flat' : (isImproving ? 'Improving' : 'Worsening');

        const isDecimal = ChartUtils.isDecimalPctMetric(metricData);
        const formattedPrior = ChartUtils.formatCardValue(prior.value, metricData.unit, isDecimal);

        return `
            <div class="card-comp ${cls}">
                <div class="comp-label">vs Prior Year</div>
                <div class="comp-verdict">${pctLabel}</div>
                <div class="comp-detail">${word}</div>
                <div class="comp-context">from ${formattedPrior} in ${prior.year}</div>
            </div>
        `;
    },

    // --- Card Rendering ---

    renderCards() {
        const grid = document.getElementById('dashboard-grid');
        grid.innerHTML = '';

        // Destroy existing sparklines
        this.sparklineCharts.forEach(c => c && c.destroy());
        this.sparklineCharts = [];

        // One card per metric, ordered by area
        this.AREA_ORDER.forEach(areaGroup => {
            areaGroup.metrics.forEach(slug => {
                const effective = this.getEffectiveData(slug);
                if (!effective) return;

                const card = document.createElement('div');
                card.className = 'card';
                card.dataset.metric = slug;

                const latest = this.getLatestValue(effective.hawaii);
                const isDecimal = ChartUtils.isDecimalPctMetric(effective);
                const unitSuffix = ['per 100K', 'per 10K', 'per 1,000'].includes(effective.unit)
                    ? `<span class="card-unit">${effective.unit}</span>`
                    : '';

                // Compute rank badge if state data available
                let rankBadge = '';
                const hasRankings = typeof STATE_DATA !== 'undefined' && STATE_DATA[slug];
                if (hasRankings) {
                    const rankings = this.getStateRankings(slug);
                    if (rankings && rankings.hawaiiRank > 0) {
                        rankBadge = `<span class="card-rank-badge" data-slug="${slug}" data-area="${areaGroup.area}">Rank #${rankings.hawaiiRank}</span>`;
                    }
                }

                card.innerHTML = `
                    <div class="card-header">
                        <div class="card-icon">${AREA_ICONS[areaGroup.area] || ''}</div>
                        <div class="card-area">${areaGroup.area}</div>
                        ${rankBadge}
                    </div>
                    <div class="card-metric">${effective.metric}</div>
                    <div class="card-hero">
                        <span class="card-hawaii-value">${ChartUtils.formatCardValue(latest.value, effective.unit, isDecimal)}</span>
                        ${unitSuffix}
                    </div>
                    <div class="card-sparkline">
                        <canvas></canvas>
                    </div>
                    <div class="card-comparisons">
                        ${this.buildVsAvgHtml(effective)}
                        ${this.buildVsYearHtml(effective)}
                    </div>
                `;

                // Click badge → open rankings directly
                const badge = card.querySelector('.card-rank-badge');
                if (badge) {
                    badge.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.openModal(slug, areaGroup.area, 'rankings');
                    });
                }

                // Click card → open detail
                card.addEventListener('click', () => {
                    this.openModal(slug, areaGroup.area);
                });

                grid.appendChild(card);

                // Create sparkline
                const canvas = card.querySelector('.card-sparkline canvas');
                const chart = ChartUtils.createSparkline(canvas, effective, effective.goodDirection);
                this.sparklineCharts.push(chart);
            });
        });
    },

    // --- Modal ---

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

    /** Parse a year label (handles "2012", "2012-2013", "2006–2008" etc.) to a numeric year */
    parseYearLabel(label) {
        const str = label.toString();
        // Handle range formats: "2012-2013", "2006–2008"
        const match = str.match(/(\d{4})/);
        return match ? parseInt(match[1]) : null;
    },

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

    openModal(slug, areaName, initialView) {
        const overlay = document.getElementById('modal-overlay');
        const metricData = DASHBOARD_DATA[slug];
        if (!metricData) return;

        // Use effective data (trimmed to rankings year) for chart/stats
        const effective = this.getEffectiveData(slug);

        // Set modal content (text from original metricData)
        document.getElementById('modal-icon').innerHTML = AREA_ICONS[areaName || metricData.area] || '';
        document.getElementById('modal-title').textContent = metricData.metric;
        document.getElementById('modal-area').textContent = areaName || metricData.area;
        document.getElementById('modal-why').innerHTML = metricData.whyItMatters;
        document.getElementById('modal-how').textContent = metricData.howToRead;
        const insightSection = document.getElementById('modal-insight-section');
        const insightText = document.getElementById('modal-insight');
        if (metricData.insight) {
            insightText.textContent = metricData.insight;
            insightSection.style.display = '';
        } else {
            insightSection.style.display = 'none';
        }

        // Footer source line
        const officialLine = metricData.officialName
            ? `<div class="modal-official">Federal metric: ${metricData.officialName}</div>`
            : '';
        const hasStateData = typeof STATE_DATA !== 'undefined' && STATE_DATA[slug];
        document.getElementById('modal-source').innerHTML = `
            ${officialLine}
            Source: <a href="${metricData.sourceUrl}" target="_blank" rel="noopener">${metricData.source}</a>
            <span class="csv-sep">&middot;</span>
            <a href="#" class="csv-download" id="csv-download">Download .xlsx</a>
        `;
        document.getElementById('csv-download').addEventListener('click', (e) => {
            e.preventDefault();
            this.downloadData(slug);
        });

        // Set up tabs
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
            tabRankings.innerHTML = `Rank ${rankLabel}`;

            tabDetail.onclick = () => this.switchTab('detail', slug);
            tabRankings.onclick = () => this.switchTab('rankings', slug);
        } else {
            tabBar.style.display = 'none';
        }

        // Reset to detail view first
        this.hideRankings();

        // Stats use effective data so they match both charts
        const latest = this.getLatestValue(effective.hawaii);
        const latestAvg = this.getLatestValue(effective.otherStateAvg);
        const prior = this.getPriorValue(effective.hawaii);
        const isDecimal = ChartUtils.isDecimalPctMetric(effective);

        // vs Other States
        let vsAvgClass = 'neutral';
        let vsAvgWord = '-';
        if (latest.value !== null && latestAvg.value !== null) {
            const diff = latest.value - latestAvg.value;
            const isBetter = effective.goodDirection === 'up' ? diff > 0 : diff < 0;
            vsAvgClass = isBetter ? 'positive' : 'negative';
            vsAvgWord = isBetter ? 'Better' : 'Worse';
        }

        // vs Prior Year
        let vsYearHtml = '';
        if (latest.value !== null && prior.value !== null) {
            const change = latest.value - prior.value;
            const pctChange = prior.value !== 0 ? ((change / Math.abs(prior.value)) * 100) : 0;
            const isImproving = effective.goodDirection === 'up' ? change > 0 : change < 0;
            const isFlat = Math.abs(pctChange) < 0.1;
            const arrow = change > 0 ? '\u2191' : change < 0 ? '\u2193' : '\u2192';
            const absPct = Math.abs(pctChange);
            let pctLabel = isFlat ? 'Flat' : (absPct > 100 ? `${arrow} ${absPct.toFixed(0)}%` : `${arrow} ${absPct.toFixed(1)}%`);
            const cls = isFlat ? 'neutral' : (isImproving ? 'positive' : 'negative');
            const word = isFlat ? 'Flat' : (isImproving ? 'Improving' : 'Worsening');

            vsYearHtml = `
                <div class="stat-card">
                    <div class="stat-label">vs Prior Year</div>
                    <div class="stat-value ${cls}">${pctLabel}</div>
                    <div class="stat-sub ${cls}">${word}</div>
                </div>
            `;
        }

        // Show unit suffix for rate-based metrics so visitors understand the numbers
        const unitSuffix = ['per 100K', 'per 10K', 'per 1,000'].includes(effective.unit)
            ? `<div class="stat-unit">${effective.unit}</div>`
            : '';

        const statsContainer = document.getElementById('modal-stats');
        statsContainer.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Hawaiʻi (${latest.year || '\u2014'})</div>
                <div class="stat-value hawaii-color">${ChartUtils.formatValue(latest.value, effective.unit, isDecimal)}</div>
                ${unitSuffix}
            </div>
            <div class="stat-card">
                <div class="stat-label">Other State Avg (${latestAvg.year || '-'})</div>
                <div class="stat-value avg-color">${ChartUtils.formatValue(latestAvg.value, effective.unit, isDecimal)}</div>
                ${unitSuffix}
            </div>
            <div class="stat-card">
                <div class="stat-label">vs Other States</div>
                <div class="stat-value ${vsAvgClass}">${vsAvgWord}</div>
            </div>
            ${vsYearHtml}
        `;

        // Chart uses effective data (trimmed to rankings year)
        const canvas = document.getElementById('modal-chart');
        const labels = Object.keys(effective.hawaii);
        const govBoxes = this.getGovernorBoxes(labels);

        this.detailChart = ChartUtils.createDetailChart(canvas, effective, govBoxes);

        // Show modal
        overlay.classList.add('active');
        document.body.classList.add('modal-open');
        document.body.style.overflow = 'hidden';

        // Update URL hash for permalink
        if (window.location.hash !== '#' + slug) {
            history.replaceState(null, '', '#' + slug);
        }

        // If requested, switch to rankings tab immediately
        if (initialView === 'rankings' && hasStateData) {
            this.switchTab('rankings', slug);
        }
    },

    switchTab(tab, slug) {
        const tabDetail = document.getElementById('tab-detail');
        const tabRankings = document.getElementById('tab-rankings');

        if (tab === 'rankings') {
            tabDetail.classList.remove('active');
            tabRankings.classList.add('active');
            this.showRankings(slug);
            history.replaceState(null, '', '#' + slug + '/rankings');
        } else {
            tabRankings.classList.remove('active');
            tabDetail.classList.add('active');
            this.hideRankings();
            history.replaceState(null, '', '#' + slug);
        }
        document.querySelector('.modal').scrollTop = 0;
    },

    /**
     * Generate and download a multi-tab xlsx for the given metric.
     * Tab order: Raw Data → Chart Data → Rankings → Methodology
     * Raw data (state-data.js) is the single source of truth;
     * chart data and rankings are derived from it.
     */
    downloadData(slug) {
        const m = DASHBOARD_DATA[slug];
        if (!m) return;

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

        // --- Tab 2: "Chart Data" (Hawaiʻi + Other State Avg, derived from raw data) ---
        const effective = this.getEffectiveData(slug);
        const chartRows = [
            [`${m.metric} (${m.unit}) - Dashboard Chart Data`],
            [`Source: ${m.source}`],
            sd ? ['Note: Hawaiʻi and Other State Avg are computed from the Raw Data tab'] : [],
            [],
            ['Year', 'Hawai\u02BBi', 'Other State Avg'],
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

        // --- Tab 3: "Rankings" (state rankings for the latest year) ---
        if (sd) {
            const rankings = this.getStateRankings(slug);
            if (rankings && rankings.stateValues.length > 0) {
                const isDecimal = ChartUtils.isDecimalPctMetric(m);
                const rankRows = [
                    [`${m.metric} - State Rankings (${rankings.year})`],
                    [`${m.goodDirection === 'up' ? 'Higher is better' : 'Lower is better'}`],
                    [],
                    ['Rank', 'State', `Value (${m.unit})`],
                ];
                rankings.stateValues.forEach((sv, i) => {
                    rankRows.push([i + 1, sv.state, sv.value]);
                });
                const wsRank = XLSX.utils.aoa_to_sheet(rankRows);
                XLSX.utils.book_append_sheet(wb, wsRank, 'Rankings');
            }
        }

        // --- Tab 4: "Methodology" ---
        const methRows = [
            ['Metric', m.metric],
            m.officialName ? ['Official Name', m.officialName] : [],
            ['Unit', m.unit],
            ['Area', m.area],
            ['Good Direction', m.goodDirection === 'up' ? 'Higher is better' : 'Lower is better'],
            [],
            ['Source', m.source],
            ['Source URL', m.sourceUrl],
            [],
            ['Why It Matters', m.whyItMatters.replace(/<[^>]*>/g, '')],
            ['How To Read It', m.howToRead],
        ];
        if (m.insight) methRows.push(['Insight', m.insight]);
        if (sd) {
            methRows.push([], ['Calculation', sd.calculation || ''], ['Raw Variables', sd.rawVariables || '']);
        }
        methRows.push([], ['Other State Avg', 'Simple mean of 49 states (excluding HI and DC)']);
        methRows.push(['Dashboard', 'hawaiidashboard.org']);
        const wsMeth = XLSX.utils.aoa_to_sheet(methRows.filter(r => r.length > 0));
        XLSX.utils.book_append_sheet(wb, wsMeth, 'Methodology');

        XLSX.writeFile(wb, `hawaii-${slug}.xlsx`);
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
            // Pick latest year with at least 25 states for meaningful rankings
            const years = Object.keys(sd.data).sort();
            year = years.reverse().find(y => Object.keys(sd.data[y]).length >= 25)
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

    showRankings(slug) {
        const rankings = this.getStateRankings(slug);
        if (!rankings) return;

        const metricData = DASHBOARD_DATA[slug];
        const { stateValues, year, hawaiiRank, total } = rankings;

        // Hide detail view, show rankings
        document.getElementById('modal-detail-view').style.display = 'none';
        document.getElementById('modal-rankings').style.display = 'block';

        // Update subtitle and rank
        document.getElementById('rankings-subtitle').textContent =
            `${metricData.metric} (${metricData.unit}, ${year})`;
        const latestDetailYear = this.getLatestValue(metricData.hawaii).year;
        const yearNote = (year !== latestDetailYear)
            ? ` · Using ${year} data (latest with all states)`
            : '';
        document.getElementById('rankings-rank').textContent =
            `Hawai\u02BBi ranks #${hawaiiRank} of ${total} states${yearNote}`;

        // Create chart
        const canvas = document.getElementById('rankings-chart');
        this.rankingsChart = ChartUtils.createRankingsChart(
            canvas, stateValues, metricData.goodDirection, metricData.unit
        );

        // Show scroll hint
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
        document.getElementById('modal-detail-view').style.display = '';
        document.getElementById('modal-rankings').style.display = 'none';

        // Reset tab state
        const tabDetail = document.getElementById('tab-detail');
        const tabRankings = document.getElementById('tab-rankings');
        if (tabDetail) tabDetail.classList.add('active');
        if (tabRankings) tabRankings.classList.remove('active');

        // Clean up scroll hint listener
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

    closeModal() {
        const overlay = document.getElementById('modal-overlay');
        overlay.classList.remove('active');
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';

        // Clear URL hash
        history.replaceState(null, '', window.location.pathname + window.location.search);

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
    },

    /** Handle URL hash for permalink routing */
    handleHashRoute() {
        const hash = window.location.hash.slice(1);
        if (!hash) return;

        const parts = hash.split('/');
        const slug = parts[0];
        const view = parts[1];

        if (!DASHBOARD_DATA[slug]) return;

        let areaName = '';
        for (const areaGroup of this.AREA_ORDER) {
            if (areaGroup.metrics.includes(slug)) {
                areaName = areaGroup.area;
                break;
            }
        }

        const initialView = (view === 'rankings') ? 'rankings' : undefined;
        this.openModal(slug, areaName, initialView);
    },
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
