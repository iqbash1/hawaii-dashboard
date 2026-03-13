// ============================================================
// Hawaiʻi Dashboard - Main App
//
// Renders metric cards, manages the detail modal, and
// coordinates live API updates from api.js.
// ============================================================

const AREA_ICONS = {
    'Safety & Justice': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    'Public Health': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></svg>',
    'Cost of Living': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    'Energy': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    'Food Security': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
    'Employment': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
    'Economic Prosperity': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    'Business Climate': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    'K-12 Education': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    'Higher Education': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 3 3 6 3s6-1 6-3v-5"/></svg>',
    'Infrastructure': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="22" height="4" rx="1"/><line x1="6" y1="10" x2="6" y2="20"/><line x1="18" y1="10" x2="18" y2="20"/><line x1="3" y1="20" x2="21" y2="20"/></svg>',
    'Environment': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d03135" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22c1.25-1.25 2.5-3 3.5-5.5C7 13 9 10 13 8c-2 4-3 7-3.5 9.5-.3 1.5-.4 3-.5 4.5"/><path d="M22 2s-4 0-8 2-7 5-9 10c4-1 7-2 10-4s5-5 7-8z"/></svg>',
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
        { area: 'Energy', metrics: ['residential_price_cpkwh', 'net_energy_import_pct'] },
        { area: 'Food Security', metrics: ['food_insecurity_rate'] },
        { area: 'Employment', metrics: ['unemployment_rate'] },
        { area: 'Economic Prosperity', metrics: ['labor_productivity', 'real_per_capita_income'] },
        { area: 'Business Climate', metrics: ['estabs_entry_rate', 'net_employer_formation'] },
        { area: 'K-12 Education', metrics: ['acgr'] },
        { area: 'Higher Education', metrics: ['ba_or_higher_pct'] },
        { area: 'Infrastructure', metrics: ['road_poor_pct', 'broadband_subscription_pct'] },
        { area: 'Environment', metrics: ['renewables_share_gen'] },
        { area: 'Fiscal Stewardship', metrics: ['rainy_day_fund_pct'] },
        { area: 'Public Confidence', metrics: ['voter_participation_rate', 'net_domestic_migration_rate'] },
    ],

    async init() {
        // Render cards immediately with embedded data
        this.renderCards();

        // Attempt live API updates in background
        try {
            await LiveAPI.fetchAll(DASHBOARD_DATA);
            // Re-render cards with updated data
            this.renderCards();
        } catch (err) {
            // Live API update skipped silently
        }

        // Set up modal events
        this.setupModal();
    },

    // --- Helpers ---

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

    /** Build "vs Other States" comparison HTML for a card */
    buildVsAvgHtml(metricData) {
        const latest = this.getLatestValue(metricData.hawaii);
        const latestAvg = this.getLatestValue(metricData.otherStateAvg);
        if (latest.value === null || latestAvg.value === null) return '';

        const diff = latest.value - latestAvg.value;
        const isBetter = metricData.goodDirection === 'up' ? diff > 0 : diff < 0;
        const avgFormatted = ChartUtils.formatCardValue(latestAvg.value, metricData.unit);

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

        return `
            <div class="card-comp ${cls}">
                <div class="comp-label">vs Prior Year</div>
                <div class="comp-verdict">${pctLabel}</div>
                <div class="comp-detail">${word}</div>
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
                const metricData = DASHBOARD_DATA[slug];
                if (!metricData) return;

                const card = document.createElement('div');
                card.className = 'card';
                card.dataset.metric = slug;

                const latest = this.getLatestValue(metricData.hawaii);
                const unitSuffix = ['per 100K', 'per 10K', 'per 1,000'].includes(metricData.unit)
                    ? `<span class="card-unit">${metricData.unit}</span>`
                    : '';

                // Compute rank badge if state data available
                let rankBadge = '';
                const hasRankings = typeof STATE_DATA !== 'undefined' && STATE_DATA[slug];
                if (hasRankings) {
                    const rankings = this.getStateRankings(slug);
                    if (rankings && rankings.hawaiiRank > 0) {
                        rankBadge = `<span class="card-rank-badge" data-slug="${slug}" data-area="${areaGroup.area}">Ranked #${rankings.hawaiiRank}</span>`;
                    }
                }

                card.innerHTML = `
                    <div class="card-header">
                        <div class="card-icon">${AREA_ICONS[areaGroup.area] || ''}</div>
                        <div class="card-area">${areaGroup.area}</div>
                        ${rankBadge}
                    </div>
                    <div class="card-metric">${metricData.metric}</div>
                    <div class="card-hero">
                        <span class="card-hawaii-value">${ChartUtils.formatCardValue(latest.value, metricData.unit)}</span>
                        ${unitSuffix}
                    </div>
                    <div class="card-sparkline">
                        <canvas></canvas>
                    </div>
                    <div class="card-comparisons">
                        ${this.buildVsAvgHtml(metricData)}
                        ${this.buildVsYearHtml(metricData)}
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
                const chart = ChartUtils.createSparkline(canvas, metricData, metricData.goodDirection);
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

        this._currentSlug = slug;

        // Set modal content
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
            ${LiveAPI.liveUpdates.includes(slug) ? ' <span style="color:var(--positive);">(Live data)</span>' : ''}
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
            tabRankings.innerHTML = `Rankings ${rankLabel}`;

            tabDetail.onclick = () => this.switchTab('detail', slug);
            tabRankings.onclick = () => this.switchTab('rankings', slug);
        } else {
            tabBar.style.display = 'none';
        }

        // Reset to detail view first
        this.hideRankings();

        // Stats - focused on the two key comparisons
        const latest = this.getLatestValue(metricData.hawaii);
        const latestAvg = this.getLatestValue(metricData.otherStateAvg);
        const prior = this.getPriorValue(metricData.hawaii);

        // vs Other States
        let vsAvgClass = 'neutral';
        let vsAvgWord = '-';
        if (latest.value !== null && latestAvg.value !== null) {
            const diff = latest.value - latestAvg.value;
            const isBetter = metricData.goodDirection === 'up' ? diff > 0 : diff < 0;
            vsAvgClass = isBetter ? 'positive' : 'negative';
            vsAvgWord = isBetter ? 'Better' : 'Worse';
        }

        // vs Prior Year
        let vsYearHtml = '';
        if (latest.value !== null && prior.value !== null) {
            const change = latest.value - prior.value;
            const pctChange = prior.value !== 0 ? ((change / Math.abs(prior.value)) * 100) : 0;
            const isImproving = metricData.goodDirection === 'up' ? change > 0 : change < 0;
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
        const unitSuffix = ['per 100K', 'per 10K', 'per 1,000'].includes(metricData.unit)
            ? `<div class="stat-unit">${metricData.unit}</div>`
            : '';

        const statsContainer = document.getElementById('modal-stats');
        statsContainer.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Hawaiʻi (${latest.year || '\u2014'})</div>
                <div class="stat-value hawaii-color">${ChartUtils.formatValue(latest.value, metricData.unit)}</div>
                ${unitSuffix}
            </div>
            <div class="stat-card">
                <div class="stat-label">Other State Avg</div>
                <div class="stat-value avg-color">${ChartUtils.formatValue(latestAvg.value, metricData.unit)}</div>
                ${unitSuffix}
            </div>
            <div class="stat-card">
                <div class="stat-label">vs Other States</div>
                <div class="stat-value ${vsAvgClass}">${vsAvgWord}</div>
            </div>
            ${vsYearHtml}
        `;

        // Chart with governor term overlay
        const canvas = document.getElementById('modal-chart');
        const labels = Object.keys(metricData.hawaii);
        const govBoxes = this.getGovernorBoxes(labels);

        this.detailChart = ChartUtils.createDetailChart(canvas, metricData, govBoxes);

        // Show modal
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

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
        } else {
            tabRankings.classList.remove('active');
            tabDetail.classList.add('active');
            this.hideRankings();
        }
        document.querySelector('.modal').scrollTop = 0;
    },

    /** Generate and download a multi-tab xlsx for the given metric */
    downloadData(slug) {
        const m = DASHBOARD_DATA[slug];
        if (!m) return;

        const wb = XLSX.utils.book_new();
        const sd = typeof STATE_DATA !== 'undefined' && STATE_DATA[slug];

        // --- Tab 1: "Chart Data" (what's shown in the dashboard chart) ---
        const chartRows = [
            [`${m.metric} (${m.unit})`],
            [`Source: ${m.source}`],
            [],
            ['Year', 'Hawai\u02BBi', 'Other State Avg'],
        ];
        const chartYears = [...new Set([
            ...Object.keys(m.hawaii),
            ...Object.keys(m.otherStateAvg),
        ])].sort();
        chartYears.forEach(y => {
            chartRows.push([
                y,
                m.hawaii[y] != null ? m.hawaii[y] : '',
                m.otherStateAvg[y] != null ? m.otherStateAvg[y] : '',
            ]);
        });
        const wsChart = XLSX.utils.aoa_to_sheet(chartRows);
        XLSX.utils.book_append_sheet(wb, wsChart, 'Chart Data');

        // --- Tab 2: "All States" (raw source data, all years × all states) ---
        if (sd && sd.data) {
            const allYears = Object.keys(sd.data).sort();
            const allStates = [...new Set(
                Object.values(sd.data).flatMap(d => Object.keys(d))
            )].sort();

            const stateRows = [
                [`${m.metric} (${m.unit}) - All States`],
                [`Source: ${sd.source}`],
                [`Calculation: ${sd.calculation}`],
                [`Raw variables: ${sd.rawVariables}`],
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

            const wsStates = XLSX.utils.aoa_to_sheet(stateRows);
            XLSX.utils.book_append_sheet(wb, wsStates, 'All States');
        }

        // --- Tab 3: "Methodology" ---
        const methRows = [
            ['Metric', m.metric],
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
            methRows.push([], ['Calculation', sd.calculation], ['Raw Variables', sd.rawVariables]);
        }
        methRows.push([], ['Other State Avg', 'Simple mean of 49 states (excluding HI and DC)']);
        methRows.push(['Dashboard', 'hawaiidashboard.org']);
        const wsMeth = XLSX.utils.aoa_to_sheet(methRows);
        XLSX.utils.book_append_sheet(wb, wsMeth, 'Methodology');

        XLSX.writeFile(wb, `${slug}.xlsx`);
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
            // FIPS-keyed: find latest year across all entries
            const allYears = new Set();
            Object.values(sd.data).forEach(entry => {
                Object.keys(entry).forEach(k => { if (k !== 'name') allYears.add(k); });
            });
            year = [...allYears].sort().pop();
            Object.values(sd.data).forEach(entry => {
                if (entry[year] != null) {
                    stateValues.push({ state: entry.name, value: entry[year] });
                }
            });
        } else {
            // Year-keyed: { "2023": { "Alabama": 0.25, ... } }
            const years = Object.keys(sd.data).sort();
            year = years[years.length - 1];
            const yearData = sd.data[year];
            if (!yearData) return null;
            Object.entries(yearData).forEach(([state, value]) => {
                if (value != null) {
                    // Percentages stored as decimals — convert for display
                    const displayVal = (unit === '%' && Math.abs(value) < 1) ? value * 100 : value;
                    stateValues.push({ state, value: displayVal });
                }
            });
        }

        // Override Hawaii's ranking value with DASHBOARD_DATA (which includes
        // live API updates) so Detail and Rankings views agree — but only if
        // DASHBOARD_DATA has data at least as recent as the rankings year.
        const liveLatest = this.getLatestValue(metricData.hawaii);
        if (liveLatest.value !== null && liveLatest.year && liveLatest.year >= year) {
            let liveDisplay = (unit === '%' && Math.abs(liveLatest.value) < 1)
                ? liveLatest.value * 100 : liveLatest.value;
            if (isPCPStyle) liveDisplay = liveLatest.value;
            const hiIdx = stateValues.findIndex(s =>
                s.state === 'Hawaii' || s.state === 'Hawai\u02BBi'
            );
            if (hiIdx >= 0) {
                stateValues[hiIdx].value = liveDisplay;
            }
            if (liveLatest.year > year) year = liveLatest.year;
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
        document.getElementById('rankings-rank').textContent =
            `Hawai\u02BBi ranks #${hawaiiRank} of ${total} states`;

        // Create chart
        const canvas = document.getElementById('rankings-chart');
        this.rankingsChart = ChartUtils.createRankingsChart(
            canvas, stateValues, metricData.goodDirection, metricData.unit
        );
    },

    hideRankings() {
        document.getElementById('modal-detail-view').style.display = '';
        document.getElementById('modal-rankings').style.display = 'none';

        // Reset tab state
        const tabDetail = document.getElementById('tab-detail');
        const tabRankings = document.getElementById('tab-rankings');
        if (tabDetail) tabDetail.classList.add('active');
        if (tabRankings) tabRankings.classList.remove('active');

        if (this.rankingsChart) {
            this.rankingsChart.destroy();
            this.rankingsChart = null;
        }
    },

    closeModal() {
        const overlay = document.getElementById('modal-overlay');
        overlay.classList.remove('active');
        document.body.style.overflow = '';

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
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
