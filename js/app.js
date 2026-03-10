// ============================================================
// Hawaiʻi Dashboard - Main App
//
// Renders metric cards, manages the detail modal, and
// coordinates live API updates from api.js.
// ============================================================

const App = {
    sparklineCharts: [],
    detailChart: null,

    // Hawaiʻi Governors - for chart overlay
    GOVERNORS: [
        { name: 'Lingle', party: 'R', start: 2002, end: 2010 },
        { name: 'Abercrombie', party: 'D', start: 2010, end: 2014 },
        { name: 'Ige', party: 'D', start: 2014, end: 2022 },
        { name: 'Green', party: 'D', start: 2022, end: 2027 },
    ],

    // Define the areas and their metrics (order matters for display)
    AREA_ORDER: [
        { area: 'Safety & Justice', metrics: ['violent_crime_rate'] },
        { area: 'Public Health', metrics: ['ypll_under75', 'uninsured_rate'] },
        { area: 'K-12 Education', metrics: ['acgr'] },
        { area: 'Higher Education', metrics: ['ba_or_higher_pct'] },
        { area: 'Employment', metrics: ['unemployment_rate'] },
        { area: 'Economic Prosperity', metrics: ['real_per_capita_income'] },
        { area: 'Cost of Living', metrics: ['renter_cost_burden_pct', 'unsheltered_homeless_rate'] },
        { area: 'Infrastructure', metrics: ['road_poor_pct', 'broadband_subscription_pct'] },
        { area: 'Environment', metrics: ['renewables_share_gen'] },
        { area: 'Energy Cost', metrics: ['residential_price_cpkwh', 'net_energy_import_pct'] },
        { area: 'Food Security', metrics: ['food_insecurity_rate'] },
        { area: 'Fiscal Stewardship', metrics: ['rainy_day_fund_pct'] },
        { area: 'Public Confidence', metrics: ['voter_participation_rate', 'net_domestic_migration_rate'] },
        { area: 'Business Climate', metrics: ['estabs_entry_rate', 'net_employer_formation'] },
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
            console.log('Live API update skipped:', err.message);
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

                card.innerHTML = `
                    <div class="card-header">
                        <div class="card-icon">${metricData.areaIcon}</div>
                        <div class="card-area">${areaGroup.area}</div>
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

                // Click handler
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

    openModal(slug, areaName) {
        const overlay = document.getElementById('modal-overlay');
        const metricData = DASHBOARD_DATA[slug];
        if (!metricData) return;

        // Set modal content
        document.getElementById('modal-icon').textContent = metricData.areaIcon;
        document.getElementById('modal-title').textContent = metricData.metric;
        document.getElementById('modal-area').textContent = areaName || metricData.area;
        document.getElementById('modal-why').textContent = metricData.whyItMatters;
        document.getElementById('modal-how').textContent = metricData.howToRead;
        const insightSection = document.getElementById('modal-insight-section');
        const insightText = document.getElementById('modal-insight');
        if (metricData.insight) {
            insightText.textContent = metricData.insight;
            insightSection.style.display = '';
        } else {
            insightSection.style.display = 'none';
        }
        const officialLine = metricData.officialName
            ? `<div class="modal-official">Federal metric: ${metricData.officialName}</div>`
            : '';
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
            ['Why It Matters', m.whyItMatters],
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

    closeModal() {
        const overlay = document.getElementById('modal-overlay');
        overlay.classList.remove('active');
        document.body.style.overflow = '';

        // Destroy chart
        if (this.detailChart) {
            this.detailChart.destroy();
            this.detailChart = null;
        }
    },
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
