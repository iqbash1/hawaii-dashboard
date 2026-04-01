// ============================================================
// Hawaiʻi Dashboard - Main App
//
// Renders metric cards, manages the detail modal, and
// uses embedded data updated quarterly.
// Build: 2026-04-01
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

const App = {
    sparklineCharts: [],
    detailChart: null,
    countyChart: null,

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
        { area: 'Infrastructure, Resilience & Trust', metrics: ['road_poor_pct', 'broadband_subscription_pct', 'renewables_share_gen', 'rainy_day_fund_pct', 'pension_funded_ratio', 'voter_participation_rate', 'net_domestic_migration_rate'] },
    ],

    init() {
        // Render cards from embedded data (updated quarterly)
        this.renderCards();

        // Set up modal events
        this.setupModal();

        // Handle permalink routing (path-based /t/slug/ or legacy hash #slug)
        this.handleRoute();
        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('popstate', () => this.handleRoute());

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
    buildVsAvgHtml(metricData, slug) {
        const latest = this.getLatestValue(metricData.hawaii);
        const latestAvg = this.getLatestValue(metricData.otherStateAvg);
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
                <div class="comp-label">State avg</div>
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

    // --- Card Rendering ---

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

                const latest = this.getLatestValue(effective.hawaii);
                const latestAvg = this.getLatestValue(effective.otherStateAvg);
                const isDecimal = ChartUtils.isDecimalPctMetric(effective);
                const unitSuffix = ['per 100K', 'per 10K', 'per 1,000'].includes(effective.unit)
                    ? `<span class="card-unit">${effective.unit}</span>`
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

                // Click rank → open rankings directly
                const rankEl = card.querySelector('.comp-rank');
                if (rankEl) {
                    rankEl.addEventListener('click', (e) => {
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

    /** Parse a year label to the start year: "2022" → 2022, "2022-2024" → 2022 */
    parseYearLabel(label) {
        const match = label.toString().match(/(\d{4})/);
        return match ? parseInt(match[1]) : null;
    },

    /** Extract the end year from a year key: "2022" → 2022, "2022-2024" → 2024 */
    keyEnd(k) {
        const p = String(k).split('-');
        return Number(p[p.length - 1]);
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
        // Vintage line: data years and update cadence
        const hiYears = Object.keys(effective.hawaii).sort();
        const vintageStart = this.parseYearLabel(hiYears[0]);
        const vintageEnd = this.keyEnd(hiYears[hiYears.length - 1]);
        const vintageText = `Data: ${vintageStart}-${vintageEnd}  ·  ${metricData.updateCadence || 'Annual'}  ·  ${metricData.source}`;
        document.getElementById('modal-vintage').textContent = vintageText;
        document.getElementById('modal-why').innerHTML = metricData.whyItMatters;
        document.getElementById('modal-how').textContent = metricData.howToRead;
        document.getElementById('modal-trend-section').style.display = 'none';

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
            <span class="csv-sep">&middot;</span>
            <a href="#" class="share-link" id="share-link">Share</a>
            <span class="csv-sep">&middot;</span>
            <a href="#" class="print-link" id="print-link">Print</a>
        `;
        document.getElementById('csv-download').addEventListener('click', (e) => {
            e.preventDefault();
            this.downloadData(slug);
        });
        // Share logic: detect active tab to build correct URL with matching OG tags
        const getShareUrl = () => {
            const activeTab = document.querySelector('.modal-tab.active');
            const tabId = activeTab ? activeTab.id : 'tab-detail';
            const prefix = tabId === 'tab-rankings' ? 'r' : tabId === 'tab-county' ? 'c' : 't';
            return 'https://hawaiidashboard.org/' + prefix + '/' + slug + '/';
        };
        const copyToClipboard = (text) => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(text).catch(() => {
                    // Fallback for HTTP or restricted contexts
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                });
            }
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return Promise.resolve();
        };
        const copyShare = (feedbackEl, resetContent) => {
            copyToClipboard(getShareUrl());
            // Always show feedback (clipboard works on HTTPS in production)
            if (typeof resetContent === 'string') {
                feedbackEl.textContent = 'Copied!';
                setTimeout(() => { feedbackEl.textContent = resetContent; }, 2000);
            } else {
                feedbackEl.classList.add('copied');
                feedbackEl.title = 'Copied!';
                const label = feedbackEl.querySelector('.share-label');
                if (label) label.textContent = 'Copied!';
                setTimeout(() => {
                    feedbackEl.classList.remove('copied');
                    feedbackEl.title = 'Copy link';
                    if (label) label.textContent = 'Share';
                }, 2000);
            }
        };
        document.getElementById('share-link').addEventListener('click', (e) => {
            e.preventDefault();
            copyShare(document.getElementById('share-link'), 'Share');
        });
        document.getElementById('modal-share-btn').addEventListener('click', (e) => {
            e.preventDefault();
            copyShare(document.getElementById('modal-share-btn'));
        });
        document.getElementById('print-link').addEventListener('click', (e) => {
            e.preventDefault();
            const origTitle = document.title;
            const activeTab = document.querySelector('.modal-tab.active');
            const tabLabel = activeTab ? activeTab.textContent.trim().split(/\s/)[0] : 'Detail';
            document.title = `${metricData.metric} - ${tabLabel} - Hawaii Dashboard`;
            window.print();
            document.title = origTitle;
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

        const statsEl = document.getElementById('modal-stats');
        statsEl.innerHTML = '';
        statsEl.style.display = 'none';

        // Chart uses effective data (trimmed to rankings year)
        const canvas = document.getElementById('modal-chart');
        const skeleton = document.getElementById('modal-chart-skeleton');
        if (skeleton) skeleton.style.display = 'none';
        canvas.style.display = '';

        const labels = Object.keys(effective.hawaii);
        const govBoxes = this.getGovernorBoxes(labels);

        this.detailChart = ChartUtils.createDetailChart(canvas, effective, govBoxes);
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${effective.metric} trend: Hawaiʻi vs other state average`);

        // Chart note: always shows smoothing disclosure; also shows trim-year note when applicable
        const chartNoteEl = document.getElementById('modal-chart-note');
        if (chartNoteEl) {
            // Detect range-key data (e.g. "2022-2024") -- means each point is a multi-year average
            const firstKey = Object.keys(effective.hawaii)[0] || '';
            const isRangeKey = /^\d{4}-\d{4}$/.test(firstKey);
            const smoothingNote = isRangeKey
                ? 'Each data point is a 3-year average. Trend line is smoothed for readability.'
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
                // Build table and show it
                this.buildDataTable(effective, slug);
                chartContainer.style.display = 'none';
                modalTableContainer.style.display = '';
                freshToggle.textContent = 'View as chart';
            }
        });

        // Show modal
        overlay.classList.add('active');
        document.body.classList.add('modal-open');
        document.body.style.overflow = 'hidden';
        document.getElementById('modal').scrollTop = 0;

        // Update URL for permalink (use /t/ path for clean sharing)
        history.replaceState(null, '', '/t/' + slug + '/');

        // If requested, switch to the specified tab immediately
        if (initialView === 'rankings' && hasStateData) {
            this.switchTab('rankings', slug);
        } else if (initialView === 'county' && hasCountyData) {
            this.switchTab('county', slug);
        } else if (initialView === 'rank-history' && hasStateData) {
            this.switchTab('rank-history', slug);
        }
    },

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
            this.currentSlug = slug;
            history.replaceState(null, '', '/r/' + slug + '/');

            // Auto-scroll modal so Hawaii's bar is visible in rankings
            setTimeout(() => {
                const modal = document.querySelector('.modal');
                const canvas = document.getElementById('rankings-chart');
                if (modal && canvas && slug) {
                    const rankings = this.getStateRankings(slug);
                    if (rankings) {
                        const hiIdx = rankings.stateValues.findIndex(s =>
                            s.state === "Hawai\u02BBi" || s.state === "Hawaii");
                        if (hiIdx >= 0) {
                            const canvasRect = canvas.getBoundingClientRect();
                            const modalRect = modal.getBoundingClientRect();
                            const pct = hiIdx / rankings.stateValues.length;
                            const barY = canvasRect.top - modalRect.top + modal.scrollTop + (canvasRect.height * pct);
                            modal.scrollTop = Math.max(0, barY - (modalRect.height / 2));
                        }
                    }
                }
            }, 200);
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
        // Scroll to top for Detail/County tabs (Rankings handles its own scroll)
        if (tab !== 'rankings') {
            document.querySelector('.modal').scrollTop = 0;
        }
    },

    /**
     * Generate and download a multi-tab xlsx for the given metric.
     * Sheet order: Raw Data → Chart Data → Rankings → All Data → County Data (if avail) → Methodology
     * Raw data (state-data.js) is the single source of truth.
     * Rankings = wide grid (State × Year). All Data = long format (Year | State | Value | Rank | N).
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

                // Sort states by latest-year rank (best first); unlisted states go to end
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
            m.officialName ? ['Federal Name', m.officialName] : [],
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
        if (m.insight) methRows.push(['Context', m.insight]);
        if (m.crossInsight) methRows.push(['Cross-metric Context', m.crossInsight]);
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

        // Compute distribution stats (shared between dot strip and rankings chart)
        const sortedVals = stateValues.map(s => s.value).sort((a, b) => a - b);
        const distStats = {
            q1: sortedVals[Math.floor(sortedVals.length * 0.25)],
            median: sortedVals[Math.floor(sortedVals.length * 0.5)],
            q3: sortedVals[Math.floor(sortedVals.length * 0.75)],
            fmt: (v) => ChartUtils.formatValue(v, metricData.unit, false),
        };

        // Create chart with distribution lines
        const canvas = document.getElementById('rankings-chart');
        this.rankingsChart = ChartUtils.createRankingsChart(
            canvas, stateValues, metricData.goodDirection, metricData.unit, distStats
        );
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${metricData.metric} rankings: all 50 states sorted best to worst, Hawaiʻi ranked #${hawaiiRank}`);

        // Hide the separate dot strip container (now integrated into chart)
        const dotStripEl = document.getElementById('dot-strip-container');
        if (dotStripEl) dotStripEl.innerHTML = '';

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

    buildDotStrip(stateValues, unit, hawaiiRank, distStats) {
        const container = document.getElementById('dot-strip-container');
        if (!container) return;
        container.innerHTML = '';

        const n = stateValues.length;
        if (n < 3) return;

        const values = stateValues.map(s => s.value);
        const sorted = [...values].sort((a, b) => a - b);
        const { q1, median, q3 } = distStats;
        const minVal = sorted[0];
        const maxVal = sorted[n - 1];
        const range = maxVal - minVal || 1;
        const pad = range * 0.06;
        const scaleMin = minVal - pad;
        const scaleMax = maxVal + pad;

        // Hawaii index in the sorted-by-rank array (stateValues is already sorted best-to-worst)
        const hiIdx = hawaiiRank - 1;
        const hiVal = stateValues[hiIdx]?.value;
        const hiState = stateValues[hiIdx]?.state;

        // States to label: lowest (rank 1), highest (rank N), and Hawaii's immediate neighbors
        const labelIndices = new Set();
        labelIndices.add(0);           // best
        labelIndices.add(n - 1);       // worst
        if (hiIdx > 0) labelIndices.add(hiIdx - 1);   // neighbor above
        if (hiIdx < n - 1) labelIndices.add(hiIdx + 1); // neighbor below
        labelIndices.add(hiIdx);       // Hawaii itself

        const fmt = (v) => ChartUtils.formatValue(v, unit, false);

        // SVG dimensions
        const svgW = 700;
        const svgH = 72;
        const padL = 12;
        const padR = 12;
        const plotW = svgW - padL - padR;
        const dotY = 30;

        const px = (v) => padL + ((v - scaleMin) / (scaleMax - scaleMin)) * plotW;

        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
        svg.setAttribute('class', 'dot-strip-svg');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', `Distribution of all ${n} states`);

        // IQR box
        const iqr = document.createElementNS(ns, 'rect');
        iqr.setAttribute('x', px(q1));
        iqr.setAttribute('y', dotY - 10);
        iqr.setAttribute('width', px(q3) - px(q1));
        iqr.setAttribute('height', 20);
        iqr.setAttribute('rx', 3);
        iqr.setAttribute('fill', 'rgba(13, 124, 143, 0.06)');
        iqr.setAttribute('stroke', 'rgba(13, 124, 143, 0.15)');
        iqr.setAttribute('stroke-width', '1');
        svg.appendChild(iqr);

        // Median tick
        const medLine = document.createElementNS(ns, 'line');
        medLine.setAttribute('x1', px(median));
        medLine.setAttribute('y1', dotY - 12);
        medLine.setAttribute('x2', px(median));
        medLine.setAttribute('y2', dotY + 12);
        medLine.setAttribute('stroke', 'rgba(13, 124, 143, 0.35)');
        medLine.setAttribute('stroke-width', '1.5');
        svg.appendChild(medLine);

        // Median label
        const medLabel = document.createElementNS(ns, 'text');
        medLabel.setAttribute('x', px(median));
        medLabel.setAttribute('y', 12);
        medLabel.setAttribute('text-anchor', 'middle');
        medLabel.setAttribute('font-size', '9');
        medLabel.setAttribute('font-weight', '500');
        medLabel.setAttribute('fill', 'rgba(13, 124, 143, 0.5)');
        medLabel.setAttribute('font-family', 'Inter, sans-serif');
        medLabel.textContent = 'Median';
        svg.appendChild(medLabel);

        // HTML tooltip (shared across all dots)
        let tooltip = document.getElementById('dot-strip-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'dot-strip-tooltip';
            tooltip.style.cssText = 'position:absolute;background:#333;color:#fff;padding:4px 8px;border-radius:4px;font-size:11px;font-family:Inter,sans-serif;pointer-events:none;opacity:0;transition:opacity 0.15s;z-index:100;white-space:nowrap;';
            document.body.appendChild(tooltip);
        }

        const showTooltip = (e, text) => {
            tooltip.textContent = text;
            tooltip.style.opacity = '1';
            const rect = e.target.getBoundingClientRect();
            tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
            tooltip.style.top = (rect.top - 28) + 'px';
        };
        const hideTooltip = () => { tooltip.style.opacity = '0'; };

        // Hover label group (hidden by default, shown on dot hover)
        let activeHoverGroup = null;
        const showDotLabel = (dot, s, i, x) => {
            if (activeHoverGroup) activeHoverGroup.remove();
            dot.setAttribute('r', '6');
            dot.setAttribute('fill', '#7A8A9A');
            const g = document.createElementNS(ns, 'g');
            g.setAttribute('class', 'dot-hover-label');
            const abbr = this.abbreviateState(s.state);
            const label = document.createElementNS(ns, 'text');
            label.setAttribute('x', x);
            label.setAttribute('y', dotY - 14);
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('font-size', '8.5');
            label.setAttribute('font-weight', '600');
            label.setAttribute('fill', '#555');
            label.setAttribute('font-family', 'Inter, sans-serif');
            label.textContent = `${abbr} ${fmt(s.value)}`;
            g.appendChild(label);
            svg.appendChild(g);
            activeHoverGroup = g;
        };
        const hideDotLabel = (dot) => {
            dot.setAttribute('r', '3.5');
            dot.setAttribute('fill', '#C3CDD7');
            if (activeHoverGroup) { activeHoverGroup.remove(); activeHoverGroup = null; }
        };

        // All state dots (non-labeled ones first, smaller)
        stateValues.forEach((s, i) => {
            if (labelIndices.has(i)) return;
            const x = px(s.value);
            const dot = document.createElementNS(ns, 'circle');
            dot.setAttribute('cx', x);
            dot.setAttribute('cy', dotY);
            dot.setAttribute('r', 3.5);
            dot.setAttribute('fill', '#C3CDD7');
            dot.setAttribute('stroke', '#fff');
            dot.setAttribute('stroke-width', '0.5');
            dot.setAttribute('class', 'dot-strip-dot');
            dot.style.cursor = 'pointer';
            dot.addEventListener('mouseenter', () => showDotLabel(dot, s, i, x));
            dot.addEventListener('mouseleave', () => hideDotLabel(dot));
            dot.addEventListener('click', () => showDotLabel(dot, s, i, x));
            svg.appendChild(dot);
        });

        // Labeled state dots (neighbors, min, max) with collision detection
        // Hawaii label always placed first, then others skip if too close
        const placedLabels = []; // array of {x, halfW} for collision checks
        const minLabelGap = 40; // minimum px gap between label centers

        const wouldCollide = (x) => {
            return placedLabels.some(p => Math.abs(x - p.x) < minLabelGap);
        };

        const addLabeledDot = (idx, isHawaii) => {
            const s = stateValues[idx];
            if (!s) return;
            const x = px(s.value);
            const r = isHawaii ? 6 : 4.5;
            const fill = isHawaii ? '#0D7C8F' : '#7A8A9A';

            const dot = document.createElementNS(ns, 'circle');
            dot.setAttribute('cx', x);
            dot.setAttribute('cy', dotY);
            dot.setAttribute('r', r);
            dot.setAttribute('fill', fill);
            dot.setAttribute('stroke', '#fff');
            dot.setAttribute('stroke-width', isHawaii ? '2' : '1');
            dot.setAttribute('class', 'dot-strip-dot');
            const tipText = `${this.abbreviateState(s.state)}: ${fmt(s.value)} (#${idx + 1})`;
            dot.addEventListener('mouseenter', (e) => { showTooltip(e, tipText); });
            dot.addEventListener('mouseleave', hideTooltip);
            dot.addEventListener('click', (e) => { showTooltip(e, tipText); });
            svg.appendChild(dot);

            // Skip text labels if they would collide with an already-placed label
            if (!isHawaii && wouldCollide(x)) return;

            const shortName = isHawaii ? 'Hawai\u02BBi' : this.abbreviateState(s.state);
            const label = document.createElementNS(ns, 'text');
            label.setAttribute('x', x);
            label.setAttribute('y', dotY + 22);
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('font-size', isHawaii ? '9' : '8');
            label.setAttribute('font-weight', isHawaii ? '700' : '500');
            label.setAttribute('fill', isHawaii ? '#0D7C8F' : '#888');
            label.setAttribute('font-family', 'Inter, sans-serif');
            label.textContent = shortName;
            svg.appendChild(label);

            const valLabel = document.createElementNS(ns, 'text');
            valLabel.setAttribute('x', x);
            valLabel.setAttribute('y', dotY + 32);
            valLabel.setAttribute('text-anchor', 'middle');
            valLabel.setAttribute('font-size', '7.5');
            valLabel.setAttribute('font-weight', '400');
            valLabel.setAttribute('fill', isHawaii ? '#0D7C8F' : '#aaa');
            valLabel.setAttribute('font-family', 'Inter, sans-serif');
            valLabel.textContent = fmt(s.value);
            svg.appendChild(valLabel);

            placedLabels.push({ x });
        };

        // Hawaii first (always placed), then others check for collision
        addLabeledDot(hiIdx, true);
        [...labelIndices].filter(i => i !== hiIdx).forEach(i => addLabeledDot(i, false));

        // Label
        const labelDiv = document.createElement('div');
        labelDiv.className = 'dot-strip-label';
        labelDiv.textContent = `Distribution of all ${n} states`;
        container.appendChild(labelDiv);
        container.appendChild(svg);
    },

    abbreviateState(name) {
        return STATE_ABBREVS[name] || name.slice(0, 2).toUpperCase();
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

        // Build latest year ranking list
        const latestYear = years[years.length - 1];
        const latestVals = yearData[latestYear];
        if (m.goodDirection === 'up') latestVals.sort((a, b) => b.value - a.value);
        else latestVals.sort((a, b) => a.value - b.value);
        latestVals.forEach((entry, idx) => {
            latestYearRanked.push({ state: entry.state, rank: idx + 1 });
        });

        // Find Hawaii's key
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

    showRankHistory(slug) {
        const rankHistory = this.computeRankHistory(slug);
        if (!rankHistory) return;
        const metricData = DASHBOARD_DATA[slug];

        document.getElementById('modal-rank-history').style.display = 'block';

        // Update header text
        const yearRange = this.parseYearLabel(String(rankHistory.years[0])) + '-' + this.keyEnd(rankHistory.years[rankHistory.years.length - 1]);
        document.getElementById('rank-history-subtitle').textContent =
            `${metricData.metric} - Rank over time (${yearRange})`;
        document.getElementById('rank-history-rank').textContent =
            rankHistory.hiRank ? `Hawai\u02BBi: #${rankHistory.hiRank} of ${rankHistory.total} (${rankHistory.years[rankHistory.years.length - 1]})` : '';

        // Reset comparison UI
        document.getElementById('rank-history-compare').style.display = 'none';
        const benchHint = document.getElementById('rank-history-hint');
        if (benchHint) benchHint.style.display = '';

        // Create the chart
        const canvas = document.getElementById('rank-history-chart');
        if (this.rankHistoryChart) { this.rankHistoryChart.destroy(); this.rankHistoryChart = null; }

        // Force a synchronous layout reflow so Chart.js reads the correct canvas
        // width (not 0 from a previously-hidden parent element).
        void canvas.offsetWidth;

        const rankGovBoxes = this.getGovernorBoxes(rankHistory.years.map(String));

        this.rankHistoryChart = ChartUtils.createRankHistoryChart(
            canvas, rankHistory, metricData, rankGovBoxes,
            // onCompare callback
            (stateName) => {
                const el = document.getElementById('rank-history-compare');
                const nameEl = document.getElementById('rank-history-compare-name');
                const hintEl = document.getElementById('rank-history-hint');
                if (stateName) {
                    nameEl.textContent = stateName;
                    el.style.display = '';
                    if (hintEl) hintEl.style.display = 'none';
                } else {
                    el.style.display = 'none';
                    if (hintEl) hintEl.style.display = '';
                }
            }
        );

        // Wire clear button
        const clearBtn = document.getElementById('rank-history-clear');
        clearBtn.onclick = (e) => {
            e.preventDefault();
            if (this.rankHistoryChart && this.rankHistoryChart._clearComparison) {
                this.rankHistoryChart._clearComparison();
            }
            document.getElementById('rank-history-compare').style.display = 'none';
            const hintEl = document.getElementById('rank-history-hint');
            if (hintEl) hintEl.style.display = '';
        };

        // Render policy narrative if available for this metric
        const narrativeEl = document.getElementById('rank-history-narrative');
        const narr = metricData.rankHistoryNarrative;
        if (narr && narrativeEl) {
            let html = `<div class="rh-narr-section">
                <h3 class="rh-narr-heading">Hawai\u02BBi\u2019s track record</h3>
                <p class="rh-narr-text">${narr.summary}</p>
            </div>`;

            if (narr.benchmarks && narr.benchmarks.length) {
                html += `<div class="rh-narr-section">
                    <h3 class="rh-narr-heading">States to learn from</h3>`;
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
                    <h3 class="rh-narr-heading">Directions worth exploring</h3>`;
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
                    <h3 class="rh-narr-heading">What to avoid</h3>
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

    showCounty(slug) {
        const countyData = typeof COUNTY_DATA !== 'undefined' && COUNTY_DATA[slug];
        if (!countyData) return;
        const metricData = DASHBOARD_DATA[slug];

        document.getElementById('modal-detail-view').style.display = 'none';
        document.getElementById('modal-rankings').style.display = 'none';
        document.getElementById('modal-county').style.display = 'block';

        const isSmoothed = countyData.smoothCounty === true;
        document.getElementById('county-subtitle').textContent =
            `${metricData.metric} by County${isSmoothed ? ' (3-year rolling avg)' : ''}`;

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

    closeModal() {
        const overlay = document.getElementById('modal-overlay');
        overlay.classList.remove('active');
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';

        // Reset URL to root
        history.replaceState(null, '', '/');

        // Reset table toggle state
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

    /** Handle permalink routing: /t/{slug}/ (detail), /r/{slug}/ (rankings), /c/{slug}/ (county), or legacy #{slug} */
    handleRoute() {
        let slug = '';
        let view = '';

        // Check path-based routes: /t/{slug}/ (detail), /r/{slug}/ (rankings), /c/{slug}/ (county), /rh/{slug}/ (rank-history)
        const detailMatch = window.location.pathname.match(/^\/t\/([^/]+)\/?$/);
        const rankMatch = window.location.pathname.match(/^\/r\/([^/]+)\/?$/);
        const countyMatch = window.location.pathname.match(/^\/c\/([^/]+)\/?$/);
        const rankHistoryMatch = window.location.pathname.match(/^\/rh\/([^/]+)\/?$/);
        if (detailMatch) {
            slug = detailMatch[1];
        } else if (rankMatch) {
            slug = rankMatch[1];
            view = 'rankings';
        } else if (countyMatch) {
            slug = countyMatch[1];
            view = 'county';
        } else if (rankHistoryMatch) {
            slug = rankHistoryMatch[1];
            view = 'rank-history';
        }

        // Fall back to legacy hash route: #{slug} or #{slug}/rankings
        if (!slug) {
            const hash = window.location.hash.slice(1);
            if (!hash) return;
            const parts = hash.split('/');
            slug = parts[0];
            view = parts[1] || '';
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
        this.openModal(slug, areaName, initialView);
    },
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
