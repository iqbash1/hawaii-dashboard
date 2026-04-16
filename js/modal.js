// ============================================================
// Hawaii Dashboard - Modal Module
//
// All modal rendering: open/close, tab switching, chart creation,
// rankings, rank history, county, data table, consolidated narrative,
// Bottom Line brief computation, and bundle navigation within modal.
//
// Depends on: App (data access), ChartUtils (chart creation),
//             Export (download), Router (URL slugs),
//             Compute (year parsing), DASHBOARD_DATA, STATE_DATA,
//             COUNTY_DATA, BRIEF_TEMPLATES, ZERO_IS_VALID, AREA_ICONS.
// ============================================================

const Modal = {
    detailChart: null,
    rankingsChart: null,
    rankHistoryChart: null,
    countyChart: null,
    _pendingRhCompare: null,
    _rankingsScrollHandler: null,
    /** Active threshold per slug. Empty = base (30%+). "50" = severe. */
    _activeThreshold: {},
    /** Build path suffix for the active threshold, or '' if default. */
    _thPath(slug) {
        const th = Modal._activeThreshold[slug];
        if (!th) return '';
        const config = typeof THRESHOLD_CONFIG !== 'undefined' && THRESHOLD_CONFIG[slug];
        if (!config) return '';
        return config.urlSegment + '/';
    },

    renderBundleNav(slug) {
        const nav = document.getElementById('bundle-nav');
        if (!nav) return;
        const bundle = App._activeBundle;
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
                for (const ag of App.AREA_ORDER) { if (ag.metrics.includes(prevMetric.id)) { area = ag.area; break; } }
                App._trackEvent('bundle_navigated', { slug: prevMetric.id, direction: 'prev', bundle_id: bundle.id });
                Modal.openModal(prevMetric.id, area, Modal._viewFromPrefix(prevMetric.view));
            });
        } else {
            newPrev.disabled = true;
        }

        if (idx < ids.length - 1) {
            const nextMetric = bundle.metrics[idx + 1];
            newNext.addEventListener('click', () => {
                let area = '';
                for (const ag of App.AREA_ORDER) { if (ag.metrics.includes(nextMetric.id)) { area = ag.area; break; } }
                App._trackEvent('bundle_navigated', { slug: nextMetric.id, direction: 'next', bundle_id: bundle.id });
                Modal.openModal(nextMetric.id, area, Modal._viewFromPrefix(nextMetric.view));
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

        closeBtn.addEventListener('click', () => Modal.closeModal());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) Modal.closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') Modal.closeModal();
        });
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
        const metricData = App.getActiveMetricData(slug);
        if (!metricData) return;

        // Analytics: report which metric was opened
        Modal._openTime = Date.now();
        Modal._openSlug = slug;
        App._trackEvent('modal_open', { slug, name: metricData.metric, area: metricData.area || areaName });

        // Store any initial rank-history comparison state for showRankHistory to consume
        Modal._pendingRhCompare = initialCompare || null;

        // Use effective data (trimmed to rankings year) for chart/stats
        const effective = App.getEffectiveData(slug);

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
        document.getElementById('modal-unit-text').textContent = metricData.unitLabel || '';
        document.getElementById('modal-area').textContent = areaName || metricData.area;
        // Vintage line: data years and update cadence
        const hiYears = Object.keys(effective.hawaii).sort();
        const vintageStart = App.parseYearLabel(hiYears[0]);
        const vintageEnd = App.keyEnd(hiYears[hiYears.length - 1]);
        const vintageText = `Data: ${vintageStart}-${vintageEnd}  ·  ${metricData.updateCadence || 'Annual'}`;
        document.getElementById('modal-vintage').textContent = vintageText;

        // Latest monthly callout (only for metrics with monthly source data)
        const monthlyEl = document.getElementById('modal-latest-monthly');
        if (metricData.latestMonthly) {
            const m = metricData.latestMonthly;
            const fmtVal = ChartUtils.formatValue(m.value, metricData.unit, false);
            monthlyEl.textContent = `Latest available: ${fmtVal} (${m.period})`;
            monthlyEl.style.display = '';
        } else {
            monthlyEl.style.display = 'none';
        }

        const isRangeKeyMetric = hiYears.length > 0 && /^\d{4}-\d{4}$/.test(hiYears[0]);
        const dirHint = metricData.goodDirection === 'up' ? 'higher is better' : 'lower is better';
        document.getElementById('trend-subtitle').innerHTML = isRangeKeyMetric
            ? `Hawai\u02BBi vs. other state average \u00B7 <strong>3-yr rolling avg</strong> \u00B7 ${dirHint}`
            : `Hawai\u02BBi vs. other state average \u00B7 ${dirHint}`;
        // Render the dynamic "Bottom line" brief
        const briefEl = document.getElementById('modal-brief');
        const briefText = Modal.computeBrief(slug);
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

        // Key levers
        const policyLeversSection = document.getElementById('modal-policy-levers-section');
        const policyLeversText = document.getElementById('modal-policy-levers');
        if (metricData.policyLevers) {
            policyLeversText.innerHTML = metricData.policyLevers;
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
            consolidatedEl.innerHTML = Modal._buildConsolidatedNarrative(metricData);
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

        // Threshold toggle (show for metrics with thresholdVariants + config)
        const toggleWrap = document.getElementById('threshold-toggle-wrap');
        const baseMetric = DASHBOARD_DATA[slug];
        const thConfig = typeof THRESHOLD_CONFIG !== 'undefined' && THRESHOLD_CONFIG[slug];
        if (toggleWrap) {
            if (baseMetric && baseMetric.thresholdVariants && thConfig) {
                toggleWrap.style.display = '';
                toggleWrap.setAttribute('aria-label', thConfig.ariaLabel);
                // Build buttons dynamically from config
                const activeTh = Modal._activeThreshold[slug] || thConfig.defaultKey;
                toggleWrap.innerHTML = thConfig.buttons.map((btn, i) =>
                    (i > 0 ? ' \u00B7 ' : ' \u00B7 ') +
                    '<button class="threshold-btn' + (btn.key === activeTh ? ' active' : '') + '" ' +
                    'data-threshold="' + btn.key + '" title="' + btn.title + '">' + btn.label + '</button>'
                ).join('');
                toggleWrap.querySelectorAll('.threshold-btn').forEach(btnEl => {
                    btnEl.onclick = () => {
                        const th = btnEl.dataset.threshold;
                        if (th === thConfig.defaultKey) {
                            delete Modal._activeThreshold[slug];
                        } else {
                            Modal._activeThreshold[slug] = th;
                        }
                        App._chartDataCache = {};
                        toggleWrap.querySelectorAll('.threshold-btn').forEach(b =>
                            b.classList.toggle('active', b.dataset.threshold === th)
                        );
                        Modal._refreshCurrentView(slug, areaName);
                    };
                });
            } else {
                toggleWrap.style.display = 'none';
                toggleWrap.innerHTML = '';
            }
        }

        // Footer source line
        const hasStateData = typeof STATE_DATA !== 'undefined' && STATE_DATA[slug];
        document.getElementById('modal-source').innerHTML = `
            <div class="source-line">
                <span>Source: <a href="${metricData.sourceUrl}" target="_blank" rel="noopener">${metricData.source}</a></span>
                <span class="source-actions"><a href="#" class="csv-download" id="csv-download">Download .xlsx</a>
                <span class="csv-sep">&middot;</span>
                <a href="#" class="print-link" id="print-link">Print</a></span>
            </div>
        `;
        document.getElementById('csv-download').onclick = (e) => {
            e.preventDefault();
            Export.downloadData(slug);
            App._trackEvent('data_exported', { slug, format: 'xlsx' });
        };
        // Share helpers
        const getShareUrl = () => {
            const activeTab = document.querySelector('.modal-tab.active');
            const tabId = activeTab ? activeTab.id : 'tab-detail';
            const prefix = tabId === 'tab-rankings' ? 'r' : tabId === 'tab-county' ? 'c' : 't';
            let url = 'https://hawaiidashboard.org/' + prefix + '/' + slug + '/' + Modal._thPath(slug);
            return url;
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
            const activeTab = document.querySelector('.modal-tab.active');
            App._trackEvent('metric_shared', { slug, tab: activeTab?.id?.replace('tab-', '') || 'detail' });
        };

        document.getElementById('print-link').onclick = (e) => {
            e.preventDefault();
            App._trackEvent('metric_printed', { slug });
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
            const rankings = App.getStateRankings(slug);
            const rankLabel = rankings && rankings.hawaiiRank > 0
                ? `<span class="tab-rank">#${rankings.hawaiiRank}</span>`
                : '';
            tabRankings.innerHTML = `<span>Rank ${rankLabel}</span><span class="tab-sub">National standing</span>`;

            tabDetail.onclick = () => Modal.switchTab('detail', slug);
            tabRankings.onclick = () => Modal.switchTab('rankings', slug);

            const tabRankHistory = document.getElementById('tab-rank-history');
            tabRankHistory.style.display = '';
            tabRankHistory.onclick = () => Modal.switchTab('rank-history', slug);
        } else {
            tabBar.style.display = 'none';
            document.getElementById('tab-rank-history').style.display = 'none';
        }

        // County tab - show only for metrics with county data
        const tabCounty = document.getElementById('tab-county');
        const hasCountyData = typeof COUNTY_DATA !== 'undefined' && COUNTY_DATA[slug];
        if (hasCountyData) {
            tabCounty.style.display = '';
            tabCounty.onclick = () => Modal.switchTab('county', slug);
            if (!hasStateData) tabBar.style.display = '';
        } else {
            tabCounty.style.display = 'none';
        }

        // Reset to detail view
        Modal.hideRankings();
        Modal.hideRankHistory();
        Modal.hideCounty();
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
        const govBoxes = App.getGovernorBoxes(labels);

        try {
            Modal.detailChart = ChartUtils.createDetailChart(canvas, effective, govBoxes, ZERO_IS_VALID.has(slug));
        } catch (e) {
            canvas.parentElement.classList.add('chart-error');
            canvas.style.display = 'none';
        }
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
                const computed = App.computeChartData(slug);
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
                Modal.buildDataTable(effective, slug);
                chartContainer.style.display = 'none';
                modalTableContainer.style.display = '';
                freshToggle.textContent = 'View as chart';
                App._trackEvent('table_viewed', { slug });
            }
        });

        overlay.classList.add('active');
        document.body.classList.add('modal-open');
        document.body.style.overflow = 'hidden';
        document.getElementById('modal').scrollTop = 0;

        // Update URL for permalink (preserve bundle param if active, and threshold if set)
        const bundleParam = App._activeBundle ? '?bundle=' + App._activeBundle.id : Modal._thPath(slug);
        history.replaceState(null, '', '/t/' + slug + '/' + bundleParam);

        // Render bundle nav (if a bundle is active)
        Modal.renderBundleNav(slug);

        // If requested, switch to the specified tab immediately
        if (initialView === 'rankings' && hasStateData) {
            Modal.switchTab('rankings', slug);
        } else if (initialView === 'county' && hasCountyData) {
            Modal.switchTab('county', slug);
        } else if (initialView === 'rank-history' && hasStateData) {
            Modal.switchTab('rank-history', slug);
        }
    },

    /**
     * Switch the modal to a tab and render its content.
     * Destroys off-screen charts to free memory.
     * @param {string} tab - 'detail' | 'rankings' | 'rank-history' | 'county'
     * @param {string} slug - Metric ID
     */
    switchTab(tab, slug) {
        App._trackEvent('tab_viewed', { slug, tab });

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
        if (tab !== 'rankings' && Modal.rankingsChart) {
            Modal.rankingsChart.destroy();
            Modal.rankingsChart = null;
        }
        if (tab !== 'rank-history' && Modal.rankHistoryChart) {
            Modal.rankHistoryChart.destroy();
            Modal.rankHistoryChart = null;
        }
        if (tab !== 'county' && Modal.countyChart) {
            Modal.countyChart.destroy();
            Modal.countyChart = null;
        }

        if (tab === 'rankings') {
            tabRankings.classList.add('active');
            tabRankings.setAttribute('aria-selected', 'true');
            Modal.showRankings(slug);
            history.replaceState(null, '', '/r/' + slug + '/' + Modal._thPath(slug));

        } else if (tab === 'rank-history') {
            tabRankHistory.classList.add('active');
            tabRankHistory.setAttribute('aria-selected', 'true');
            Modal.showRankHistory(slug);
            history.replaceState(null, '', '/rh/' + slug + '/' + Modal._thPath(slug));
        } else if (tab === 'county') {
            tabCounty.classList.add('active');
            tabCounty.setAttribute('aria-selected', 'true');
            Modal.showCounty(slug);
            history.replaceState(null, '', '/c/' + slug + '/' + Modal._thPath(slug));
        } else {
            tabDetail.classList.add('active');
            tabDetail.setAttribute('aria-selected', 'true');
            document.getElementById('modal-detail-view').style.display = '';
            history.replaceState(null, '', '/t/' + slug + '/' + Modal._thPath(slug));
        }
        // Always reset modal scroll to top on tab switch
        document.querySelector('.modal').scrollTop = 0;
    },

    /**
     * Render the Rankings tab: horizontal bar chart for all 50 states.
     * @param {string} slug - Metric ID
     */
    showRankings(slug) {
        const rankings = App.getStateRankings(slug);
        if (!rankings) return;

        const metricData = App.getActiveMetricData(slug);
        const { stateValues, year, hawaiiRank, total } = rankings;

        document.getElementById('modal-detail-view').style.display = 'none';
        document.getElementById('modal-rankings').style.display = 'block';

        document.getElementById('rankings-subtitle').textContent = '';
        const latestDetailYear = App.getLatestValue(metricData.hawaii, ZERO_IS_VALID.has(slug)).year;
        const yearNote = (year !== latestDetailYear)
            ? ` \u00B7 ${year} (latest year with full state coverage)`
            : ` \u00B7 ${year}`;
        document.getElementById('rankings-rank').innerHTML =
            `Hawai\u02BBi ranks #${hawaiiRank} of ${total} states${yearNote} <span style="display:block;font-size:0.78rem;font-weight:400;color:var(--text-muted);margin-top:0.25rem">#1 = best performing state</span>`;

        // Compute distribution stats (shared between dot strip and rankings chart)
        const sortedVals = stateValues.map(s => s.value).sort((a, b) => a - b);
        const distStats = {
            q1: sortedVals[Math.floor(sortedVals.length * 0.25)],
            median: sortedVals[Math.floor(sortedVals.length * 0.5)],
            q3: sortedVals[Math.floor(sortedVals.length * 0.75)],
            fmt: (v) => ChartUtils.formatValue(v, metricData.unit, false),
        };

        const canvas = document.getElementById('rankings-chart');
        Modal.rankingsChart = ChartUtils.createRankingsChart(
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
            Modal._rankingsScrollHandler = onScroll;
        }
    },


    hideRankings() {
        document.getElementById('modal-rankings').style.display = 'none';

        if (Modal._rankingsScrollHandler) {
            const modal = document.getElementById('modal');
            modal.removeEventListener('scroll', Modal._rankingsScrollHandler);
            Modal._rankingsScrollHandler = null;
        }

        if (Modal.rankingsChart) {
            Modal.rankingsChart.destroy();
            Modal.rankingsChart = null;
        }
    },

    hideRankHistory() {
        document.getElementById('modal-rank-history').style.display = 'none';
        if (Modal.rankHistoryChart) {
            Modal.rankHistoryChart.destroy();
            Modal.rankHistoryChart = null;
        }
    },

    /**
     * Render the Rank History tab: rank-over-time chart with state compare dropdown.
     * @param {string} slug - Metric ID
     */
    showRankHistory(slug) {
        const rankHistory = App.computeRankHistory(slug);
        if (!rankHistory) return;
        const metricData = App.getActiveMetricData(slug);

        document.getElementById('modal-rank-history').style.display = 'block';

        const yearRange = App.parseYearLabel(String(rankHistory.years[0])) + '-' + App.keyEnd(rankHistory.years[rankHistory.years.length - 1]);
        document.getElementById('rank-history-subtitle').textContent =
            `Rank over time \u00B7 ${yearRange}`;
        document.getElementById('rank-history-rank').textContent = '';

        // Consume any pending initial comparison state (set by openModal from URL routing)
        const pendingCompare = Modal._pendingRhCompare || null;
        Modal._pendingRhCompare = null;

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
                history.replaceState(null, '', '/rh/' + slug + '/' + Router.stateToSlug(stateName) + '/' + Modal._thPath(slug));
            } else {
                history.replaceState(null, '', '/rh/' + slug + '/' + Modal._thPath(slug));
            }
        };

        // Create the chart
        const canvas = document.getElementById('rank-history-chart');
        if (Modal.rankHistoryChart) { Modal.rankHistoryChart.destroy(); Modal.rankHistoryChart = null; }

        // Force a synchronous layout reflow so Chart.js reads the correct canvas
        // width (not 0 from a previously-hidden parent element).
        void canvas.offsetWidth;

        const rankGovBoxes = App.getGovernorBoxes(rankHistory.years.map(String));

        Modal.rankHistoryChart = ChartUtils.createRankHistoryChart(
            canvas, rankHistory, metricData, rankGovBoxes,
            onCompareFn,
            pendingCompare
        );
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${metricData.metric} rank history: Hawaiʻi ranking among 50 states over time`);

        // If a comparison was pre-set from URL, sync dropdown + URL
        if (pendingCompare) onCompareFn(pendingCompare);

        // Wire dropdown change
        if (compareSelect) {
            compareSelect.onchange = () => {
                const selected = compareSelect.value;
                if (selected) {
                    if (Modal.rankHistoryChart && Modal.rankHistoryChart._setComparison) {
                        Modal.rankHistoryChart._setComparison(selected);
                    }
                    App._trackEvent('state_compared', { slug, compare_state: selected });
                } else {
                    if (Modal.rankHistoryChart && Modal.rankHistoryChart._clearComparison) {
                        Modal.rankHistoryChart._clearComparison();
                    }
                }
                onCompareFn(selected || null);
            };
        }

        // Wire clear button
        if (compareClear) {
            compareClear.onclick = () => {
                if (Modal.rankHistoryChart && Modal.rankHistoryChart._clearComparison) {
                    Modal.rankHistoryChart._clearComparison();
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
        const countyData = App.getActiveCountyData(slug);
        if (!countyData) return;
        const metricData = App.getActiveMetricData(slug);

        document.getElementById('modal-detail-view').style.display = 'none';
        document.getElementById('modal-rankings').style.display = 'none';
        document.getElementById('modal-county').style.display = 'block';

        const isSmoothed = countyData.smoothCounty === true;
        const countyDirHint = metricData.goodDirection === 'up' ? 'higher is better' : 'lower is better';
        document.getElementById('county-subtitle').textContent =
            `County breakdown${isSmoothed ? ' \u00B7 3-year rolling avg' : ''} \u00B7 ${countyDirHint}`;

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
        const govBoxes = App.getGovernorBoxes(labels);

        const stateRef = countyData.hideStateLine ? null : metricData.hawaii;
        Modal.countyChart = ChartUtils.createCountyChart(
            canvas, chartData, metricData, govBoxes, App.COUNTY_COLORS, stateRef
        );
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${metricData.metric} by Hawaiʻi county: Honolulu, Hawaiʻi, Maui, Kauai`);
    },

    /**
     * Re-render the current modal view after a threshold toggle.
     * Updates: title subtitle, official name, brief, consolidated narrative,
     * and whichever tab (trend/rankings/rank-history/county) is visible.
     */
    _refreshCurrentView(slug, areaName) {
        const metricData = App.getActiveMetricData(slug);
        if (!metricData) return;
        const effective = App.getEffectiveData(slug);

        // Update official name
        const officialEl = document.getElementById('modal-official-name');
        if (officialEl && metricData.officialName) {
            officialEl.textContent = metricData.officialName;
        }

        // Update brief
        const briefEl = document.getElementById('modal-brief');
        const briefText = Modal.computeBrief(slug);
        if (briefText) {
            briefEl.innerHTML = briefText
                .replace('Bottom line:', '<strong>Bottom line:</strong>')
                .replace('Keep in mind:', '<strong>Keep in mind:</strong>');
            briefEl.style.display = '';
        } else {
            briefEl.style.display = 'none';
        }

        // Update consolidated narrative
        const consolidatedEl = document.getElementById('modal-consolidated');
        if (metricData.useConsolidated && consolidatedEl) {
            consolidatedEl.innerHTML = Modal._buildConsolidatedNarrative(metricData);
        }

        // Re-render whichever tab is currently visible
        const detailView = document.getElementById('modal-detail-view');
        const rankingsView = document.getElementById('modal-rankings');
        const rankHistoryView = document.getElementById('modal-rank-history');
        const countyView = document.getElementById('modal-county');

        if (detailView && detailView.style.display !== 'none') {
            // Trend tab: destroy and recreate chart
            if (Modal.detailChart) { Modal.detailChart.destroy(); Modal.detailChart = null; }
            if (effective && effective.hawaii) {
                const hiYears = Object.keys(effective.hawaii).sort();
                const dirHint = metricData.goodDirection === 'up' ? 'higher is better' : 'lower is better';
                const isRange = hiYears.length > 0 && /^\d{4}-\d{4}$/.test(hiYears[0]);
                document.getElementById('trend-subtitle').innerHTML = isRange
                    ? `Hawai\u02BBi vs. other state average \u00B7 <strong>3-yr rolling avg</strong> \u00B7 ${dirHint}`
                    : `Hawai\u02BBi vs. other state average \u00B7 ${dirHint}`;
                const canvas = document.getElementById('modal-chart');
                const govBoxes = App.getGovernorBoxes(hiYears);
                Modal.detailChart = ChartUtils.createDetailChart(canvas, effective, govBoxes);
            }
        } else if (rankingsView && rankingsView.style.display !== 'none') {
            Modal.showRankings(slug);
        } else if (rankHistoryView && rankHistoryView.style.display !== 'none') {
            if (Modal.rankHistoryChart) { Modal.rankHistoryChart.destroy(); Modal.rankHistoryChart = null; }
            Modal.showRankHistory(slug);
        } else if (countyView && countyView.style.display !== 'none') {
            if (Modal.countyChart) { Modal.countyChart.destroy(); Modal.countyChart = null; }
            Modal.showCounty(slug);
        }

        // Update URL with threshold path
        const activeTab = document.querySelector('.modal-tab.active');
        const tabId = activeTab ? activeTab.id : 'tab-detail';
        const prefix = tabId === 'tab-rankings' ? 'r' : tabId === 'tab-county' ? 'c'
            : tabId === 'tab-rank-history' ? 'rh' : 't';
        history.replaceState(null, '', '/' + prefix + '/' + slug + '/' + Modal._thPath(slug));
    },

    hideCounty() {
        document.getElementById('modal-county').style.display = 'none';
        if (Modal.countyChart) {
            Modal.countyChart.destroy();
            Modal.countyChart = null;
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
        const sd = App.getActiveStateData(slug);
        if (sd && sd.data) {
            const rankings = App.getStateRankings(slug);
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
        // Reset threshold toggle state
        Modal._activeThreshold = {};
        App._chartDataCache = {};

        // Analytics: track time spent in modal
        if (Modal._openTime && Modal._openSlug) {
            const dur = Math.round((Date.now() - Modal._openTime) / 1000);
            const activeTab = document.querySelector('.modal-tab.active');
            App._trackEvent('modal_closed', { slug: Modal._openSlug, duration_sec: dur, last_tab: activeTab?.id?.replace('tab-', '') || '' });
            Modal._openTime = null;
        }

        const overlay = document.getElementById('modal-overlay');
        overlay.classList.remove('active');
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';

        const activeCard = document.querySelector('.card.active');
        if (activeCard) activeCard.classList.remove('active');

        // Reset URL to root (preserve bundle param if active)
        history.replaceState(null, '', App._activeBundle ? '/?bundle=' + App._activeBundle.id : '/');

        // Hide bundle nav
        const bundleNav = document.getElementById('bundle-nav');
        if (bundleNav) bundleNav.classList.remove('visible');

        document.getElementById('table-toggle-wrap').style.display = 'none';
        document.getElementById('modal-table-container').style.display = 'none';
        document.querySelector('.modal-chart-container').style.display = '';
        const chartNoteEl = document.getElementById('modal-chart-note');
        if (chartNoteEl) { chartNoteEl.style.display = 'none'; chartNoteEl.textContent = ''; }

        // Clean up scroll hint listener
        if (Modal._rankingsScrollHandler) {
            const modal = document.getElementById('modal');
            modal.removeEventListener('scroll', Modal._rankingsScrollHandler);
            Modal._rankingsScrollHandler = null;
        }

        // Destroy charts
        if (Modal.detailChart) {
            Modal.detailChart.destroy();
            Modal.detailChart = null;
        }
        if (Modal.rankingsChart) {
            Modal.rankingsChart.destroy();
            Modal.rankingsChart = null;
        }
        if (Modal.countyChart) {
            Modal.countyChart.destroy();
            Modal.countyChart = null;
        }
    },

    /**
     * Build consolidated narrative HTML for metrics with useConsolidated: true.
     * Assembles How to read → Why → National standing → County → Drivers → Lessons → Key levers → Data notes.
     * @param {Object} m - Metric data object from DASHBOARD_DATA
     * @returns {string} HTML string
     * @private
     */
    _buildConsolidatedNarrative(m) {
        let h = '';

        // 1. How to read the chart (collapsed toggle, near the chart)
        if (m.howToRead) h += `<details class="cn-section modal-how-toggle">
            <summary>How to read the chart</summary>
            <p class="cn-text">${m.howToRead}</p>
        </details>`;

        // 2. Why it matters
        h += `<div class="cn-section">
            <h3 class="cn-heading">Why it matters</h3>
            <p class="cn-text">${m.whyItMatters}</p>
        </div>`;

        // 3. National standing (rank history summary)
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

        // 7. Key levers
        if (m.policyLevers) h += `<div class="cn-section">
            <h3 class="cn-heading">Key levers</h3>
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
        const effective = App.getEffectiveData(slug);
        if (!effective || !effective.hawaii) return null;
        const m = App.getActiveMetricData(slug);

        const sortedKeys = Object.keys(effective.hawaii)
            .sort((a, b) => App.keyEnd(a) - App.keyEnd(b));
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
        const priorLbl  = `${App.parseYearLabel(prior[0])}\u2013${String(App.keyEnd(prior[prior.length - 1])).slice(-2)}`;
        const recentLbl = `${App.parseYearLabel(recent[0])}\u2013${String(App.keyEnd(recent[recent.length - 1])).slice(-2)}`;

        return `${word}${pctPart} from the ${priorLbl} to ${recentLbl} average`;
    },

    /**
     * Build a paste-ready one-paragraph summary for a metric.
     * Values are computed live so the text stays current as data updates.
     * @param {string} slug - Metric ID
     * @returns {string|null} Plain-text paragraph
     */
    computeBrief(slug) {
        const m = App.getActiveMetricData(slug);
        let tpl = BRIEF_TEMPLATES[slug];
        if (!m || !tpl) return null;
        // Use threshold-specific template if active
        const th = Modal._activeThreshold[slug];
        if (th && tpl.thresholdVariants && tpl.thresholdVariants[th]) {
            tpl = { ...tpl, ...tpl.thresholdVariants[th] };
        }

        const rankings = App.getStateRankings(slug);
        const effective = App.getEffectiveData(slug);
        if (!rankings || !effective || !effective.hawaii) return null;

        const az = ZERO_IS_VALID.has(slug);
        const latestHi  = App.getLatestValue(effective.hawaii, az);
        const latestAvg = App.getLatestValue(effective.otherStateAvg, az);
        if (latestHi.value === null || latestHi.value === undefined) return null;

        const isDecimal = ChartUtils.isDecimalPctMetric(m);
        const fmtValue  = ChartUtils.formatValue(latestHi.value, m.unit, isDecimal);
        const period    = rankings.year;
        const rank      = rankings.hawaiiRank;

        // Fill intro template
        let intro = tpl.intro
            .replace('{{value}}', fmtValue)
            .replace('{{period}}', period);

        // Append resident-scale translation if metric has scale config
        const scaleText = App.computeScaleTranslation(slug, latestHi.value);
        if (scaleText && tpl.scaleTemplate) {
            intro += tpl.scaleTemplate.replace('{{scale}}', scaleText);
        }

        // Above / below / at the Other State Average
        const hiVal  = isDecimal ? latestHi.value * 100  : latestHi.value;
        const avgVal = isDecimal ? latestAvg.value * 100 : latestAvg.value;
        // Intensity: "well above/below" when gap > 20% of the average
        const gapPct = avgVal !== 0 ? Math.abs(hiVal - avgVal) / Math.abs(avgVal) : 0;
        const intensity = gapPct > 0.2 ? 'well ' : '';
        const vsAvg = hiVal > avgVal ? `${intensity}above` : hiVal < avgVal ? `${intensity}below` : 'at';

        const trend = Modal.computeTrendPhrase(slug);

        let brief = `Bottom line: ${intro}, ranking #${rank} nationally.`;
        if (trend) brief += ` It has ${trend},`;
        brief += ` and sits ${vsAvg} the Other State Average.`;
        if (tpl.caveat) brief += ` Keep in mind: ${tpl.caveat}`;

        return brief;
    },
};
