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
    _rankingsScrollHandler: null,
    /**
     * Shared comparator state across Trend and Rank-history tabs. When null,
     * Trend falls back to the median and Rank history shows only
     * Hawaiʻi's rank line. When set to a state name, both tabs overlay that
     * state's series.
     */
    _compareState: null,
    /** Active tab id (detail | rankings | rank-history | county). */
    _activeTab: 'detail',
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

    /**
     * Build the canonical URL path for a tab + current shared state. Used by
     * switchTab and _onCompareChange so state picks persist in the URL and
     * the share button reflects the exact view the user is looking at.
     * Order: /<prefix>/<slug>/<state>?/<threshold>?/  (state only on tabs
     * that support the shared comparator).
     */
    _buildTabUrl(tab, slug) {
        const prefixes = { detail: '/t', rankings: '/r', 'rank-history': '/rh', county: '/c' };
        const prefix = prefixes[tab] || '/t';
        const stateTabs = new Set(['detail', 'rank-history']);
        const state = Modal._compareState;
        const stateSegment = (state && stateTabs.has(tab) && typeof Router !== 'undefined')
            ? Router.stateToSlug(state) + '/'
            : '';
        return `${prefix}/${slug}/${stateSegment}${Modal._thPath(slug)}`;
    },

    /** Bold "Bottom line:" and "Keep in mind:" markers in a brief string. */
    _formatBriefText(text) {
        return text
            .replace('Bottom line:', '<strong>Bottom line:</strong>')
            .replace('Keep in mind:', '<strong>Keep in mind:</strong>');
    },

    /**
     * Return just the first sentence of a brief, used on Rank and
     * Rank-history tabs where the full multi-sentence brief repeats
     * content already shown on the Trend tab. The first sentence names
     * the tier and rank, which is what those tabs are about.
     */
    _briefFirstSentence(text) {
        const m = text.match(/^[^.!?]+[.!?]/);
        return m ? m[0] : text;
    },

    /**
     * Render the bottom-line brief into the given element, picking the
     * full text on the Trend tab and the first sentence elsewhere.
     * Used by openModal, switchTab, and _refreshActiveMetric so the
     * brief stays in sync with the visible tab.
     */
    _renderBrief(el, slug) {
        const briefText = Modal.computeBrief(slug);
        if (!briefText) {
            el.style.display = 'none';
            return;
        }
        const isDetail = (Modal._activeTab === 'detail' || !Modal._activeTab);
        const text = isDetail ? briefText : Modal._briefFirstSentence(briefText);
        el.innerHTML = Modal._formatBriefText(text);
        el.style.display = '';
    },

    // ----------------------------------------------------------------
    // Shared compare-with dropdown (Trend + Rank history tabs)
    // ----------------------------------------------------------------

    /**
     * Collect all state names available in this metric's STATE_DATA, excluding
     * Hawaiʻi variants. Returns a sorted array of human-readable state names.
     */
    _getAvailableStates(slug) {
        if (typeof STATE_DATA === 'undefined' || !STATE_DATA[slug]) return [];
        const sd = App.getActiveStateData(slug);
        if (!sd || !sd.data) return [];
        const data = sd.data;
        const firstKey = Object.keys(data)[0];
        if (!firstKey) return [];
        const isFipsKeyed = data[firstKey] && typeof data[firstKey].name === 'string';
        const states = new Set();
        if (isFipsKeyed) {
            Object.values(data).forEach(e => { if (e && e.name) states.add(e.name); });
        } else {
            Object.values(data).forEach(bucket => {
                if (!bucket) return;
                Object.keys(bucket).forEach(name => states.add(name));
            });
        }
        return [...states].filter(s => !ChartUtils.isHawaii(s)).sort();
    },

    /** Fill the compare-select dropdown with all states for this metric. */
    _populateCompareSelect(slug) {
        const select = document.getElementById('compare-select');
        if (!select) return;
        const states = Modal._getAvailableStates(slug);
        const defaultLabel = Modal._compareDefaultLabel(Modal._activeTab);
        select.innerHTML = '';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = defaultLabel;
        select.appendChild(defaultOpt);
        states.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            select.appendChild(opt);
        });
        select.value = Modal._compareState || '';
    },

    /** Label for the "no state selected" option, varies by active tab. */
    _compareDefaultLabel(tab) {
        return tab === 'rank-history' ? '(none)' : 'US';
    },

    /** Show/hide the compare bar and update its default-option label for this tab. */
    _updateCompareBar(tab) {
        const bar = document.getElementById('compare-bar');
        if (!bar) return;
        const shouldShow = (tab === 'detail' || tab === 'rank-history');
        bar.style.display = shouldShow ? '' : 'none';
        if (!shouldShow) return;
        // Refresh the placeholder label and keep the current state selected
        const select = document.getElementById('compare-select');
        if (!select) return;
        const defaultOpt = select.querySelector('option[value=""]');
        if (defaultOpt) defaultOpt.textContent = Modal._compareDefaultLabel(tab);
    },

    /** Build the comparator argument for createDetailChart, or undefined for the default. */
    _buildCompareArg(slug) {
        const state = Modal._compareState;
        if (!state) return undefined;
        const sd = App.getActiveStateData(slug);
        if (!sd || !sd.data) return undefined;
        const timeSeries = Compute.getStateTimeSeries(sd.data, state);
        if (!timeSeries || Object.keys(timeSeries).length === 0) return undefined;
        return { label: state, timeSeries };
    },

    /**
     * Destroy + recreate the Trend chart using the current _compareState. Also
     * refreshes the trend subtitle so "Hawaiʻi vs. X" reflects the comparator.
     */
    _rerenderDetailChart(slug) {
        const metricData = App.getActiveMetricData(slug);
        if (!metricData || !metricData.hawaii) return;
        const canvas = document.getElementById('modal-chart');
        if (!canvas) return;
        if (Modal.detailChart) { Modal.detailChart.destroy(); Modal.detailChart = null; }
        const hiYears = Object.keys(metricData.hawaii).sort();
        const govBoxes = App.getGovernorBoxes(hiYears);
        const comparator = Modal._buildCompareArg(slug);
        Modal._updateTrendSubtitle(metricData, comparator);
        try {
            Modal.detailChart = ChartUtils.createDetailChart(
                canvas, metricData, govBoxes, ZERO_IS_VALID.has(slug), comparator
            );
        } catch (e) {
            canvas.parentElement.classList.add('chart-error');
            canvas.style.display = 'none';
        }
    },

    /** Set the Trend chart subtitle to "Hawaiʻi vs. <comparator> · direction hint". */
    _updateTrendSubtitle(metricData, comparator) {
        const subtitleEl = document.getElementById('trend-subtitle');
        if (!subtitleEl) return;
        const hiYears = Object.keys(metricData.hawaii).sort();
        const dirHint = metricData.goodDirection === 'up' ? 'higher values are better' : 'lower values are better';
        const isRange = hiYears.length > 0 && /^\d{4}-\d{4}$/.test(hiYears[0]);
        const compLabel = (comparator && comparator.label) ? comparator.label : 'US';
        subtitleEl.innerHTML = isRange
            ? `Hawai\u02BBi vs. ${compLabel} \u00B7 <strong>3-yr rolling avg</strong> \u00B7 ${dirHint}`
            : `Hawai\u02BBi vs. ${compLabel} \u00B7 ${dirHint}`;
    },

    /**
     * React to the user changing the shared dropdown. Re-renders the chart
     * that is currently visible; the other chart picks up the new state the
     * next time its tab is opened. Pushes the selection into the URL so the
     * share button and back/forward both work.
     */
    _onCompareChange(slug, stateName) {
        Modal._compareState = stateName || null;
        if (Modal._activeTab === 'detail') {
            Modal._rerenderDetailChart(slug);
        } else if (Modal._activeTab === 'rank-history' && Modal.rankHistoryChart) {
            if (stateName && Modal.rankHistoryChart._setComparison) {
                Modal.rankHistoryChart._setComparison(stateName);
            } else if (Modal.rankHistoryChart._clearComparison) {
                Modal.rankHistoryChart._clearComparison();
            }
        }
        history.replaceState(null, '', Modal._buildTabUrl(Modal._activeTab, slug));
        if (stateName) {
            App._trackEvent('state_compared', { slug, compare_state: stateName, tab: Modal._activeTab });
        }
    },

    /** Wire the compare-select element to change events. Called once per modal open. */
    _wireCompareSelect(slug) {
        const select = document.getElementById('compare-select');
        if (!select) return;
        Modal._populateCompareSelect(slug);
        select.onchange = () => Modal._onCompareChange(slug, select.value);
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
     * @param {string} [initialCompare] - State name to seed the shared compare-with dropdown (Trend + Rank history tabs)
     */
    openModal(slug, areaName, initialView, initialCompare) {
        const overlay = document.getElementById('modal-overlay');
        const metricData = App.getActiveMetricData(slug);
        if (!metricData) return;

        // Analytics: report which metric was opened
        Modal._openTime = Date.now();
        Modal._openSlug = slug;
        App._trackEvent('modal_open', { slug, name: metricData.metric, area: metricData.area || areaName });

        // Reset shared comparator state. If a compare state is pre-set by URL
        // routing, initialCompare already encodes it; both tabs will pick it up.
        Modal._compareState = initialCompare || null;
        Modal._activeTab = 'detail';

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
        const dirHint = metricData.goodDirection === 'up' ? 'higher values are better' : 'lower values are better';
        document.getElementById('trend-subtitle').innerHTML = isRangeKeyMetric
            ? `Hawai\u02BBi vs. US \u00B7 <strong>3-yr rolling avg</strong> \u00B7 ${dirHint}`
            : `Hawai\u02BBi vs. US \u00B7 ${dirHint}`;
        // Render the dynamic "Bottom line" brief. _renderBrief picks the
        // full text on Trend and the first sentence on Rank tabs.
        Modal._renderBrief(document.getElementById('modal-brief'), slug);

        // Consolidated narrative \u2014 every metric uses this path. The data
        // fields whyItMatters / howToRead / potentialDrivers / policyLevers
        // / dataNote are folded into _buildConsolidatedNarrative below.
        const consolidatedEl = document.getElementById('modal-consolidated');
        consolidatedEl.innerHTML = Modal._buildConsolidatedNarrative(metricData, slug);
        consolidatedEl.style.display = '';
        Modal._wireOtcLink(consolidatedEl);

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

        // Threshold toggle (dropdown for metrics with thresholdVariants + config)
        const toggleWrap = document.getElementById('threshold-toggle-wrap');
        const baseMetric = DASHBOARD_DATA[slug];
        const thConfig = typeof THRESHOLD_CONFIG !== 'undefined' && THRESHOLD_CONFIG[slug];
        if (toggleWrap) {
            if (baseMetric && baseMetric.thresholdVariants && thConfig) {
                toggleWrap.style.display = '';
                toggleWrap.setAttribute('aria-label', thConfig.ariaLabel);
                const activeTh = Modal._activeThreshold[slug] || thConfig.defaultKey;
                const activeBtn = thConfig.buttons.find(b => b.key === activeTh) || thConfig.buttons[0];

                // Build trigger + menu. Trigger shows active choice; menu lists all options.
                toggleWrap.innerHTML =
                    ' \u00B7 ' +
                    '<button class="dropdown-trigger threshold-trigger" type="button" ' +
                        'aria-haspopup="listbox" aria-expanded="false" ' +
                        'title="' + activeBtn.title + '">' +
                        '<span class="threshold-trigger-label">' + activeBtn.label + '</span>' +
                        '<svg class="threshold-trigger-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">' +
                            '<path d="M1 3 L5 7 L9 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
                        '</svg>' +
                    '</button>' +
                    '<ul class="threshold-menu" role="listbox" hidden>' +
                        thConfig.buttons.map(btn =>
                            '<li class="threshold-option' + (btn.key === activeTh ? ' active' : '') + '" ' +
                                'role="option" aria-selected="' + (btn.key === activeTh) + '" ' +
                                'data-threshold="' + btn.key + '" title="' + btn.title + '">' +
                                btn.label +
                            '</li>'
                        ).join('') +
                    '</ul>';

                const trigger = toggleWrap.querySelector('.threshold-trigger');
                const menu = toggleWrap.querySelector('.threshold-menu');

                const closeMenu = () => {
                    menu.hidden = true;
                    trigger.setAttribute('aria-expanded', 'false');
                    document.removeEventListener('click', onDocClick);
                };
                const openMenu = () => {
                    menu.hidden = false;
                    trigger.setAttribute('aria-expanded', 'true');
                    setTimeout(() => document.addEventListener('click', onDocClick), 0);
                };
                const onDocClick = (e) => {
                    if (!toggleWrap.contains(e.target)) closeMenu();
                };

                trigger.onclick = (e) => {
                    e.stopPropagation();
                    menu.hidden ? openMenu() : closeMenu();
                };

                menu.querySelectorAll('.threshold-option').forEach(opt => {
                    opt.onclick = (e) => {
                        e.stopPropagation();
                        const th = opt.dataset.threshold;
                        if (th === thConfig.defaultKey) {
                            delete Modal._activeThreshold[slug];
                        } else {
                            Modal._activeThreshold[slug] = th;
                        }
                        App._chartDataCache = {};

                        // Update trigger label + title, and active state across options
                        const selected = thConfig.buttons.find(b => b.key === th);
                        if (selected) {
                            trigger.querySelector('.threshold-trigger-label').textContent = selected.label;
                            trigger.setAttribute('title', selected.title);
                        }
                        menu.querySelectorAll('.threshold-option').forEach(o => {
                            const isActive = o.dataset.threshold === th;
                            o.classList.toggle('active', isActive);
                            o.setAttribute('aria-selected', String(isActive));
                        });

                        closeMenu();
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
        // Share: delegated to window.ShareMenu (js/share-menu.js) so the
        // chart-modal share gets the same unified experience as Off the
        // Charts posts and QOTD. Mobile keeps the OS share sheet; desktop
        // gets the in-page popover (LinkedIn / Email / X / Bluesky / Copy
        // link). All channels report metric_shared with method.
        const getActiveTab = () => {
            const el = document.querySelector('.modal-tab.active');
            return el ? el.id.replace('tab-', '') : 'detail';
        };
        const getShareUrl = () => {
            return 'https://hawaiidashboard.org' + Modal._buildTabUrl(getActiveTab(), slug);
        };
        const trackShare = (method) => {
            App._trackEvent('metric_shared', { slug, tab: getActiveTab(), method });
        };
        document.getElementById('modal-share-btn').onclick = (e) => {
            e.preventDefault();
            const btn = document.getElementById('modal-share-btn');
            const url = getShareUrl();
            const name = metricData.metric || slug;
            if (window.ShareMenu) {
                window.ShareMenu.open(btn, {
                    url: url,
                    title: `Hawaiʻi Dashboard: ${name}`,
                    lede: name,
                    track: trackShare,
                });
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                // Fallback if share-menu.js failed to load.
                navigator.clipboard.writeText(`Hawaiʻi Dashboard: ${name}\n\n${url}`)
                    .then(() => trackShare('clipboard'), () => trackShare('fallback'));
            }
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

        // Detail (Trend) tab is valid for every metric \u2014 always wire its
        // onclick. The previous logic only wired it inside the hasStateData
        // branch, so metrics without state-level data but with county data
        // (e.g. labor_force_participation, violent_crime_rate) had a visible
        // but unresponsive Trend tab once the County branch un-hid the tab
        // bar.
        tabDetail.style.display = '';
        tabDetail.onclick = () => Modal.switchTab('detail', slug);

        if (hasStateData) {
            tabBar.style.display = '';
            // Compute rank for tab label
            const rankings = App.getStateRankings(slug);
            const rankLabel = rankings && rankings.hawaiiRank > 0
                ? `<span class="tab-rank">#${rankings.hawaiiRank}</span>`
                : '';
            tabRankings.innerHTML = `<span>Rank ${rankLabel}</span><span class="tab-sub">How Hawai\u02BBi compares now</span>`;
            tabRankings.style.display = '';
            tabRankings.onclick = () => Modal.switchTab('rankings', slug);

            const tabRankHistory = document.getElementById('tab-rank-history');
            tabRankHistory.style.display = '';
            tabRankHistory.onclick = () => Modal.switchTab('rank-history', slug);
        } else {
            tabBar.style.display = 'none';
            // Hide the rank-related tabs explicitly so they cannot leak
            // into view when the County branch below re-shows the tab bar.
            tabRankings.style.display = 'none';
            tabRankings.onclick = null;
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

        // Shared compare-with dropdown: populate with this metric's states,
        // wire change handler, and show the bar (Trend is the default tab).
        Modal._wireCompareSelect(slug);
        Modal._updateCompareBar('detail');

        // Chart uses effective data (trimmed to rankings year)
        const canvas = document.getElementById('modal-chart');
        const skeleton = document.getElementById('modal-chart-skeleton');
        if (skeleton) skeleton.style.display = 'none';
        canvas.style.display = '';

        const labels = Object.keys(effective.hawaii);
        const govBoxes = App.getGovernorBoxes(labels);
        const comparator = Modal._buildCompareArg(slug);
        Modal._updateTrendSubtitle(effective, comparator);

        try {
            Modal.detailChart = ChartUtils.createDetailChart(canvas, effective, govBoxes, ZERO_IS_VALID.has(slug), comparator);
        } catch (e) {
            canvas.parentElement.classList.add('chart-error');
            canvas.style.display = 'none';
        }
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${effective.metric} trend: Hawaiʻi vs ${comparator ? comparator.label : 'US'}`);

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

        // Update URL for permalink. Preserve bundle param if active (mutually
        // exclusive with threshold/state path segments in the current design);
        // otherwise delegate to the shared _buildTabUrl so state + threshold
        // segments stay in sync with the shared comparator.
        const url = App._activeBundle
            ? '/t/' + slug + '/?bundle=' + App._activeBundle.id
            : Modal._buildTabUrl('detail', slug);
        history.replaceState(null, '', url);

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
        Modal._activeTab = tab;
        Modal._updateCompareBar(tab);
        // Re-render the brief, full text on Trend, first sentence on
        // Rank/Rank-history/County. Same single-source content; only the
        // truncation level changes per tab.
        Modal._renderBrief(document.getElementById('modal-brief'), slug);

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
        } else if (tab === 'rank-history') {
            tabRankHistory.classList.add('active');
            tabRankHistory.setAttribute('aria-selected', 'true');
            Modal.showRankHistory(slug);
        } else if (tab === 'county') {
            tabCounty.classList.add('active');
            tabCounty.setAttribute('aria-selected', 'true');
            Modal.showCounty(slug);
        } else {
            tabDetail.classList.add('active');
            tabDetail.setAttribute('aria-selected', 'true');
            document.getElementById('modal-detail-view').style.display = '';
            // Rebuild Trend chart so it honours any _compareState change that
            // happened on another tab (e.g. user picked California on Rank
            // history, then switched back to Trend).
            Modal._rerenderDetailChart(slug);
        }
        // URL reflects the active tab + current shared state + threshold
        history.replaceState(null, '', Modal._buildTabUrl(tab, slug));
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

        const rankingsDirHint = metricData.goodDirection === 'up' ? 'higher values are better' : 'lower values are better';
        document.getElementById('rankings-subtitle').textContent = rankingsDirHint;
        const latestDetailYear = App.getLatestValue(metricData.hawaii, ZERO_IS_VALID.has(slug)).year;
        const yearNote = (year !== latestDetailYear)
            ? ` \u00B7 ${year} (latest year with full state coverage)`
            : ` \u00B7 ${year}`;
        document.getElementById('rankings-rank').innerHTML =
            `Hawai\u02BBi ranks #${hawaiiRank} of ${total} states${yearNote} <span style="display:block;font-size:0.78rem;font-weight:400;color:var(--text-muted);margin-top:0.25rem">#1 = best performing state</span>`;

        // Median + formatter for the rankings chart's reference line.
        // (Q1/Q3 are no longer needed since the rankings chart replaced the
        // quartile zones with Top/Middle/Bottom tier-band row backgrounds.)
        const vals = stateValues.map((s) => s.value);
        const distStats = {
            median: Compute.quantile(vals, 0.5),
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
            // The chart now often fits the viewport outright, and then no
            // scroll event ever fires, so run the same check once on open or
            // the hint would ask for a scroll that isn't possible. The canvas
            // height is set inline just above, so layout is already settled.
            onScroll();
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
            `Rank history \u00B7 ${yearRange} \u00B7 #1 = best`;
        document.getElementById('rank-history-rank').textContent = '';

        // Initial comparison state: the shared Modal._compareState (seeded by
        // URL routing in openModal, or kept across tab switches by
        // _onCompareChange).
        const pendingCompare = Modal._compareState || null;

        // Keep the shared dropdown in sync with whatever state is active now.
        const compareSelect = document.getElementById('compare-select');
        if (compareSelect) compareSelect.value = pendingCompare || '';

        // Callback used by the chart when the user clicks a state on the canvas.
        // Syncs the shared dropdown + URL + Modal._compareState.
        const onCompareFn = (stateName) => {
            if (compareSelect) compareSelect.value = stateName || '';
            Modal._compareState = stateName || null;
            history.replaceState(null, '', Modal._buildTabUrl('rank-history', slug));
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
     * Render the County tab: multi-line chart for Honolulu, Hawaiʻi, Maui, and Kauaʻi.
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
        const countyDirHint = metricData.goodDirection === 'up' ? 'higher values are better' : 'lower values are better';
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

        // 3-year centered rolling average: same kernel applied to county AND
        // state series so the lines on the county chart smooth identically.
        // Without this, raw state would spike where the smoothed counties
        // don't, making the state line appear to leave the county band.
        const smooth3 = (raw) => {
            if (!raw) return raw;
            const years = Object.keys(raw).sort();
            const out = {};
            for (let i = 0; i < years.length; i++) {
                const bin = [];
                for (let j = Math.max(0, i - 1); j <= Math.min(years.length - 1, i + 1); j++) {
                    if (raw[years[j]] != null) bin.push(raw[years[j]]);
                }
                out[years[i]] = bin.length ? +(bin.reduce((a, b) => a + b, 0) / bin.length).toFixed(4) : null;
            }
            return out;
        };

        // Apply the same smoothing to county and state data when flagged.
        let chartData = countyData;
        let stateRef = countyData.hideStateLine ? null : metricData.hawaii;
        if (isSmoothed) {
            const smoothed = { ...countyData, data: {} };
            for (const county of countyData.counties) {
                smoothed.data[county] = smooth3(countyData.data[county]);
            }
            chartData = smoothed;
            if (stateRef) stateRef = smooth3(stateRef);
        }

        const canvas = document.getElementById('county-chart');
        const labels = Object.keys(Object.values(chartData.data)[0]).sort();
        const govBoxes = App.getGovernorBoxes(labels);
        Modal.countyChart = ChartUtils.createCountyChart(
            canvas, chartData, metricData, govBoxes, App.COUNTY_COLORS, stateRef
        );
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${metricData.metric} by Hawaiʻi county: Honolulu, Hawaiʻi, Maui, Kauaʻi`);
    },

    /**
     * Re-render the current modal view after a threshold toggle.
     * Updates: title subtitle, official name, brief, consolidated narrative,
     * and whichever tab (trend/rankings/rank-history/county) is visible.
     */
    _refreshCurrentView(slug, areaName) {
        const metricData = App.getActiveMetricData(slug);
        if (!metricData) return;

        // Update official name
        const officialEl = document.getElementById('modal-official-name');
        if (officialEl && metricData.officialName) {
            officialEl.textContent = metricData.officialName;
        }

        // Update brief (full on Trend, first sentence on Rank tabs).
        Modal._renderBrief(document.getElementById('modal-brief'), slug);

        // Update consolidated narrative
        const consolidatedEl = document.getElementById('modal-consolidated');
        if (consolidatedEl) {
            consolidatedEl.innerHTML = Modal._buildConsolidatedNarrative(metricData, slug);
            Modal._wireOtcLink(consolidatedEl);
        }

        // Re-render whichever tab is currently visible
        const detailView = document.getElementById('modal-detail-view');
        const rankingsView = document.getElementById('modal-rankings');
        const rankHistoryView = document.getElementById('modal-rank-history');
        const countyView = document.getElementById('modal-county');

        if (detailView && detailView.style.display !== 'none') {
            // Trend tab: destroy and recreate chart honouring any active comparator
            Modal._rerenderDetailChart(slug);
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
                const dirLabel = effective.goodDirection === 'up' ? 'higher values are better' : 'lower values are better';
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
            + '<tr><th>Year</th><th>Hawai\u02BBi</th><th>50-state median</th></tr></thead><tbody>';
        for (const year of years) {
            const hi = effective.hawaii[year];
            const avg = effective.medianSeries[year];
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
    /**
     * Render a heading + paragraph section. When `asDetails` is true, renders
     * as a collapsible <details> with <summary> instead of <h3>. Returns ''
     * when content is empty (except for unconditional sections which skip
     * the truthy check at the callsite).
     */
    /**
     * Attach the analytics handler to the narrative's Off the Charts link
     * (if present). Called after each innerHTML rebuild of the narrative.
     */
    _wireOtcLink(containerEl) {
        const a = containerEl && containerEl.querySelector('.cn-otc-link a');
        if (!a) return;
        a.addEventListener('click', () => {
            if (typeof App !== 'undefined' && App._trackEvent) {
                App._trackEvent('otc_teaser_clicked', { slug: a.dataset.otcSlug, surface: 'modal' });
            }
        });
    },

    _section(heading, content, asDetails, extraClass) {
        if (!content) return '';
        const cls = `cn-section${extraClass ? ' ' + extraClass : ''}`;
        if (asDetails) {
            return `<details class="${cls}"><summary>${heading}</summary><p class="cn-text">${content}</p></details>`;
        }
        return `<div class="${cls}"><h3 class="cn-heading">${heading}</h3><p class="cn-text">${content}</p></div>`;
    },

    _buildConsolidatedNarrative(m, slug) {
        const narr = m.rankHistoryNarrative;
        const linkedItem = (x, cls) => {
            const src = x.source ? `<a href="${x.source.url}" target="_blank" rel="noopener" class="cn-source">\u2192 ${x.source.label}</a>` : '';
            return `<div class="cn-item"><div class="cn-state ${cls}">${x.state}</div><p class="cn-text">${x.text}</p>${src}</div>`;
        };

        // Layout:
        //   - "How to read the chart" sits as a minimal <details> at the top.
        //   - "Why it matters" and "National standing" render inline (always
        //     visible) \u2014 they answer the two questions every reader has about
        //     a chart they just saw: "is this important?" and "where does HI
        //     fall?". Cheap to read, no reason to hide.
        //   - Everything else (County breakdown, Potential drivers, Lessons,
        //     Key levers, Data note) groups under "Deeper analysis", which
        //     renders open by default: the disclosure stays available to
        //     collapse the depth away, but the content is not hidden behind
        //     an opt-in click.
        let outer = Modal._section('How to read the chart', m.howToRead, true, 'modal-how-toggle');
        outer += Modal._section('Why it matters',    m.whyItMatters);
        outer += Modal._section('Status', narr && narr.summary);

        // One-line pointer to the Off the Charts story behind this metric,
        // when one exists (generated js/otc-posts.js). Deliberately a single
        // link line, not a section, to keep the narrative uncluttered.
        const otcPost = (typeof otcPostForMetric !== 'undefined' && slug) ? otcPostForMetric(slug) : null;
        if (otcPost) {
            outer += `<p class="cn-otc-link"><span class="cn-otc-eyebrow">Off the Charts</span> <a href="/off-the-charts/${otcPost.slug}/" data-otc-slug="${otcPost.slug}">${otcPost.title} →</a></p>`;
        }

        let deep = '';
        deep += Modal._section('County breakdown',     m.countyNarrative);
        deep += Modal._section('Potential drivers',    m.potentialDrivers);

        // Lessons from other states; compound section (benchmarks + caution + explore)
        if (narr && (narr.benchmarks?.length || narr.caution || narr.explore?.length)) {
            deep += `<div class="cn-section"><h3 class="cn-heading">Lessons from other states</h3>`;
            (narr.benchmarks || []).forEach(b => { deep += linkedItem(b, 'cn-state--learn'); });
            if (narr.caution) deep += linkedItem(narr.caution, 'cn-state--caution');
            if (narr.explore && narr.explore.length) {
                deep += `<div class="cn-item">`;
                narr.explore.forEach(pt => { deep += `<p class="cn-text">${pt}</p>`; });
                deep += `</div>`;
            }
            deep += `</div>`;
        }

        deep += Modal._section('Key levers', m.policyLevers);
        if (m.dataNote) {
            deep += `<div class="cn-section cn-data-note"><p class="cn-text">\u26A0 ${m.dataNote}</p></div>`;
        }

        if (!deep) return outer;

        // Native <details>/<summary> for the deeper-analysis disclosure \u2014
        // matches the "How to read the chart" pattern above so both
        // expandable controls in the modal share one minimal style. No
        // custom JS toggle needed; the browser handles open/close.
        outer += `
            <details class="cn-section modal-how-toggle modal-deeper-toggle" open>
                <summary>Deeper analysis</summary>
                ${deep}
            </details>
        `;
        return outer;
    },

    // ── Copy-brief helpers ─────────────────────────────────────────────

    /**
     * Compute a neutral trend phrase comparing two 3-year windows.
     * Uses the same window logic as the card change-phrase indicator.
     *
     * 2020 and 2021 are excluded from the pool because the COVID collapse and
     * snapback distort normal-times comparisons (unemployment spiked to 11.6%,
     * labor-force participation dropped, business formation swung). The
     * precise windows (and the exclusion convention) are documented in the
     * about/index.html methodology note rather than the lead sentence.
     * @param {string} slug - Metric ID
     * @returns {string|null} e.g. "improved 8.2% over the last five years"
     */
    computeTrendPhrase(slug) {
        const effective = App.getEffectiveData(slug);
        if (!effective || !effective.hawaii) return null;
        const m = App.getActiveMetricData(slug);

        const TREND_EXCLUDE_YEARS = new Set(['2020', '2021']);
        const isPandemicYear = (k) => !String(k).includes('-') && TREND_EXCLUDE_YEARS.has(String(k));
        const allKeys = Object.keys(effective.hawaii);
        const excluded = allKeys.some(isPandemicYear);

        const sortedKeys = allKeys
            .filter(k => !isPandemicYear(k))
            .sort((a, b) => App.keyEnd(a) - App.keyEnd(b));
        if (sortedKeys.length < 4) return null;

        // When the pandemic years were filtered out, pin each window to the
        // pre-pandemic / post-pandemic side. When no exclusion happened, use
        // the original adjacent-window logic (last 3 vs prior 3).
        const recent = excluded
            ? sortedKeys.filter(k => App.keyEnd(k) > 2021).slice(-3)
            : sortedKeys.slice(-3);
        const prior = excluded
            ? sortedKeys.filter(k => App.keyEnd(k) < 2020).slice(-3)
            : sortedKeys.slice(-6, -3);
        if (prior.length < 2 || recent.length < 1) return null;

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
        // When the pandemic years were filtered out, flag the methodology in
        // the phrase itself so a pasted brief carries the caveat. Documented
        // in about/index.html > How We Compare.
        const covidNote = excluded ? ' (2020–21 excluded)' : '';

        return `${word}${pctPart} over the last five years${covidNote}`;
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
        const latestAvg = App.getLatestValue(effective.medianSeries, az);
        if (latestHi.value === null || latestHi.value === undefined) return null;

        const isDecimal = ChartUtils.isDecimalPctMetric(m);
        const fmtValue  = ChartUtils.formatValue(latestHi.value, m.unit, isDecimal);
        const period    = rankings.year;
        const rank      = rankings.hawaiiRank;
        const tierLabel = Utils.rankTierLabel(rank, rankings.total);

        // Fill intro template
        let intro = tpl.intro
            .replace('{{value}}', fmtValue)
            .replace('{{period}}', period);

        // Append resident-scale translation if metric has scale config
        const scaleText = App.computeScaleTranslation(slug, latestHi.value);
        if (scaleText && tpl.scaleTemplate) {
            intro += tpl.scaleTemplate.replace('{{scale}}', scaleText);
        }

        // Better / worse / same vs the median, framed in
        // direction-aware terms so the reader never has to decode whether
        // "above" or "below" is the good side for this metric.
        const hiVal  = isDecimal ? latestHi.value * 100  : latestHi.value;
        const avgVal = isDecimal ? latestAvg.value * 100 : latestAvg.value;
        const vsAvg = Compute.comparisonPhrase(hiVal, avgVal, m.goodDirection);

        const trend = Modal.computeTrendPhrase(slug);

        // Tier-first framing: the categorical verdict leads, the metric
        // value follows. A grant writer or board reader scans the tier
        // before the number; the number is the supporting evidence.
        let brief = `Bottom line: Hawaiʻi is in the ${tierLabel} nationally (#${rank} of ${rankings.total}). ${intro}.`;
        if (trend) brief += ` It has ${trend},`;
        brief += ` and is ${vsAvg} the US median.`;
        if (tpl.caveat) brief += ` Keep in mind: ${tpl.caveat}`;

        return brief;
    },
};
