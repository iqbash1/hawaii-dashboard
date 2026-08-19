// ============================================================
// Hawaiʻi Dashboard - Question of the Day controller
//
// Depends on: QOTD_QUESTIONS (js/questions.js), App (js/app.js)
//
// Handles:
//   - Daily rotation (which question shows today)
//   - Per-browser answered/dismissed state (localStorage)
//   - Teaser rendering (unanswered claim + buttons, answered full proof view)
//   - Share URL generation (neutral /q/{id}/ format)
//   - Analytics events
// ============================================================

// Launch day. Question q001 shows on this calendar day (HST), q002 on day+1, etc.
// After the bank exhausts, rotation wraps. Deterministic so every visitor sees
// the same question on the same calendar day regardless of device.
const QOTD_DAY_ZERO = '2026-04-18';

// localStorage namespace
const QOTD_STORAGE_PREFIX = 'qotd';

const QOTD = {

    /**
     * Zero-based day index since QOTD_DAY_ZERO, using Hawaii-local calendar days.
     * Hawaii is UTC-10; a "day" is defined by HST midnight-to-midnight.
     * @returns {number}
     */
    dayIndex() {
        const HST_OFFSET_MS = 10 * 60 * 60 * 1000;
        const nowHst = new Date(Date.now() - HST_OFFSET_MS);
        const todayHst = new Date(Date.UTC(nowHst.getUTCFullYear(), nowHst.getUTCMonth(), nowHst.getUTCDate()));
        const zeroHst = new Date(QOTD_DAY_ZERO + 'T00:00:00Z');
        const diffMs = todayHst.getTime() - zeroHst.getTime();
        return Math.floor(diffMs / 86400000);
    },

    /**
     * Today's question based on dayIndex() modulo bank size.
     * @returns {object|null}
     */
    today() {
        const idx = this.dayIndex();
        if (idx < 0) return null;
        if (!QOTD_QUESTIONS.length) return null;
        return QOTD_QUESTIONS[idx % QOTD_QUESTIONS.length];
    },

    /**
     * Look up a question by its id (q001, q002, …). Returns null if not found.
     */
    getById(id) {
        return QOTD_QUESTIONS.find(q => q.id === id) || null;
    },

    /**
     * Storage key for an answer. Scoped by BOTH day index and question id so
     * a question that recurs after the 54-question bank wraps (dayIndex >= 54)
     * gets a fresh claim + True/False buttons instead of replaying the proof
     * view a returning visitor saw in the first cycle. Mirrors how dismissed
     * state is keyed per day index.
     * @private
     */
    _answerKey(id) {
        return `${QOTD_STORAGE_PREFIX}.answer.${this.dayIndex()}.${id}`;
    },

    /** Answer-state is keyed by day index + question id (see _answerKey). */
    hasAnswered(id) {
        return !!this.getAnswer(id);
    },

    getAnswer(id) {
        try {
            const raw = localStorage.getItem(this._answerKey(id));
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    recordAnswer(id, picked, correct) {
        try {
            localStorage.setItem(
                this._answerKey(id),
                JSON.stringify({ picked, correct, ts: Date.now() })
            );
        } catch (e) {
            // localStorage may be disabled; fail silently
        }
    },

    /** Has the user dismissed today's teaser? Keyed by day index so tomorrow re-shows. */
    isDismissedToday() {
        try {
            return localStorage.getItem(`${QOTD_STORAGE_PREFIX}.dismissed.${this.dayIndex()}`) === '1';
        } catch (e) {
            return false;
        }
    },

    dismissToday() {
        try {
            localStorage.setItem(`${QOTD_STORAGE_PREFIX}.dismissed.${this.dayIndex()}`, '1');
        } catch (e) { /* disabled */ }
    },

    /**
     * Share URL for a question. Uses the neutral id form so the URL does not
     * hint at the claim's direction or answer.
     */
    shareUrl(id) {
        return `${window.location.origin}/q/${id}/`;
    },

    SHARE_TEXT: 'Think you know Hawaiʻi? Try this one.',

    SHARE_ICON_SVG: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',

    CLOSE_ICON_SVG: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',

    /**
     * Map a dashboard chart URL to its pre-generated OG card PNG. Used as
     * the fallback proof visual when the live chart can't render (e.g.
     * /five-year-change/ which is a page-level chart, not a single canvas).
     */
    chartOgImage(chartUrl) {
        const m = chartUrl.match(/^\/(r|c|t)\/([^/]+)/);
        if (!m) return '/assets/og-image.png';
        const view = m[1];
        const slug = m[2];
        const suffix = view === 'r' ? '_rankings' : view === 'c' ? '_county' : '';
        return `/assets/og/${slug}${suffix}.png`;
    },

    /**
     * Submit the user's answer. Records, fires analytics, re-renders the
     * teaser to the inline proof view (no modal auto-open).
     */
    submitAnswer(id, picked) {
        const q = this.getById(id);
        if (!q) return;
        const correct = picked === q.correct;
        this.recordAnswer(id, picked, correct);
        if (typeof App !== 'undefined' && App._trackEvent) {
            App._trackEvent('qotd_answered', {
                id,
                picked,
                correct: q.correct,
                result: correct ? 'correct' : 'incorrect',
            });
        }
        this.renderTeaser();
    },

    /**
     * Track-only handler for /q/{id}/ redirects that land on home. Called
     * from routing.js when the URL includes ?from_q={id}.
     */
    trackSharedUrlLanding(id) {
        if (!this.getById(id)) return;
        if (typeof App !== 'undefined' && App._trackEvent) {
            App._trackEvent('qotd_shared_url_landed', {
                id,
                referrer: (typeof document !== 'undefined' && document.referrer) || '(none)',
            });
        }
    },

    /**
     * Render the live Chart.js canvas that matches the question's chartUrl.
     * Falls back to the pre-rendered OG image if the chart can't be built
     * (e.g. missing data, /five-year-change/ page-level chart, etc).
     * @private
     */
    _renderLiveChart(fig, q) {
        if (!fig) return;
        const canvas = fig.querySelector('.qotd-chart-canvas');
        if (!canvas) return;
        try {
            const m = q.chartUrl.match(/^\/(t|r|c)\//);
            if (!m) return this._fallbackOgImage(fig, q);
            const view = m[1];
            const slug = q.metric;
            if (typeof App === 'undefined' || typeof ChartUtils === 'undefined') {
                return this._fallbackOgImage(fig, q);
            }
            if (view === 't') {
                const metricData = App.getActiveMetricData(slug);
                if (!metricData || !metricData.hawaii) return this._fallbackOgImage(fig, q);
                const hiYears = Object.keys(metricData.hawaii).sort();
                const govBoxes = App.getGovernorBoxes(hiYears);
                const allowZero = typeof ZERO_IS_VALID !== 'undefined' && ZERO_IS_VALID.has(slug);
                // Optional state comparator: /t/{metric}/{state-slug}/ swaps the
                // 50-state median for that state's time series, so V7 cross-state
                // claims read as "Hawaiʻi vs California" instead of "vs US median".
                let comparator;
                const compareMatch = q.chartUrl.match(/^\/t\/[^/]+\/([^/]+)\/?$/);
                if (compareMatch && typeof Router !== 'undefined') {
                    const stateName = Router.slugToState(compareMatch[1]);
                    const sd = App.getActiveStateData(slug);
                    if (stateName && sd && sd.data) {
                        const timeSeries = Compute.getStateTimeSeries(sd.data, stateName);
                        if (timeSeries && Object.keys(timeSeries).length > 0) {
                            comparator = { label: stateName, timeSeries };
                        }
                    }
                }
                ChartUtils.createDetailChart(canvas, metricData, govBoxes, allowZero, comparator);
                return;
            }
            if (view === 'r') {
                const rankings = App.getStateRankings(slug);
                const metricData = App.getActiveMetricData(slug);
                if (!rankings || !metricData) return this._fallbackOgImage(fig, q);
                const stateValues = rankings.stateValues;
                const vals = stateValues.map((s) => s.value);
                const distStats = {
                    median: Compute.quantile(vals, 0.5),
                    fmt: (v) => ChartUtils.formatValue(v, metricData.unit, false),
                };
                ChartUtils.createRankingsChart(canvas, stateValues, metricData.goodDirection, metricData.unit, distStats);
                return;
            }
            if (view === 'c') {
                const countyData = App.getActiveCountyData(slug);
                const metricData = App.getActiveMetricData(slug);
                if (!countyData || !metricData) return this._fallbackOgImage(fig, q);
                const hiYears = Object.keys(metricData.hawaii || {}).sort();
                const govBoxes = App.getGovernorBoxes(hiYears);
                const colors = { 'Honolulu': '#2563EB', 'Hawaiʻi': '#C0392B', 'Maui': '#059669', 'Kauaʻi': '#c08a1a' };
                ChartUtils.createCountyChart(canvas, countyData, metricData, govBoxes, colors, metricData);
                return;
            }
            return this._fallbackOgImage(fig, q);
        } catch (e) {
            return this._fallbackOgImage(fig, q);
        }
    },

    /**
     * Drop a static OG card into the figure if the live chart can't render.
     * @private
     */
    _fallbackOgImage(fig, q) {
        if (!fig) return;
        const ogImg = this.chartOgImage(q.chartUrl);
        const html = `<img src="${ogImg}" alt="Chart showing ${this._escape(q.metricLabel)} data" class="qotd-chart-image" />`;
        // Swap only the canvas, not the whole figure: the caption below it
        // describes the metric either way.
        const wrap = fig.querySelector('.qotd-chart-canvas-wrap');
        if (wrap) wrap.outerHTML = html; else fig.innerHTML = html;
    },

    /** chartUrl prefix to the ChartExport tab key it corresponds to. */
    CHART_VIEW_TABS: { t: 'detail', r: 'rankings', c: 'county' },

    /**
     * Reveal and wire the hi-res chart download, but only when a live
     * Chart.js canvas actually rendered. The OG-image fallback replaces
     * the canvas outright, and there is nothing to re-render from.
     * @private
     */
    _wireChartDownload(host, q) {
        const link = host.querySelector('[data-action="download-chart"]');
        if (!link || typeof ChartExport === 'undefined' || typeof Chart === 'undefined') return;
        const canvas = host.querySelector('.qotd-chart-canvas');
        const chart = canvas && Chart.getChart(canvas);
        const m = q.chartUrl.match(/^\/(t|r|c)\//);
        const tab = m && this.CHART_VIEW_TABS[m[1]];
        if (!chart || !tab) return;

        link.hidden = false;
        link.onclick = (e) => {
            e.preventDefault();
            ChartExport.download(q.metric, { tab, chart });
            if (typeof App !== 'undefined' && App._trackEvent) {
                App._trackEvent('chart_exported', { slug: q.metric, tab, source: 'qotd' });
            }
        };
    },

    /**
     * Wire an IntersectionObserver that fires qotd_chart_viewed once when
     * the embedded proof image first becomes visible.
     * @private
     */
    _observeChartView(id) {
        if (typeof IntersectionObserver === 'undefined') return;
        const el = document.querySelector('.qotd-chart-canvas, .qotd-chart-image');
        if (!el) return;
        let fired = false;
        const io = new IntersectionObserver((entries) => {
            for (const e of entries) {
                if (e.isIntersecting && !fired) {
                    fired = true;
                    if (typeof App !== 'undefined' && App._trackEvent) {
                        App._trackEvent('qotd_chart_viewed', { id });
                    }
                    io.disconnect();
                }
            }
        }, { threshold: 0.5 });
        io.observe(el);
    },

    /**
     * Share flow: delegated to window.ShareMenu (js/share-menu.js) so QOTD
     * gets the same unified experience as Off the Charts posts and the chart
     * modal. Mobile keeps the OS share sheet (Messages / Mail / Slack /
     * LinkedIn / AirDrop). Desktop gets the in-page popover with LinkedIn /
     * Email / X / Bluesky / Copy link, all method-tracked.
     */
    _handleShare(id, btnEl) {
        const url = this.shareUrl(id);
        const q = this.getById(id);
        const claim = q ? q.claim : '';
        const teaser = this.SHARE_TEXT;
        // 1-line lede for clipboard payload + X intent.
        const lede = claim ? `${teaser} ${claim}` : teaser;

        const track = (method) => {
            if (typeof App !== 'undefined' && App._trackEvent) {
                App._trackEvent('qotd_share_clicked', { id, method });
            }
        };

        if (window.ShareMenu) {
            window.ShareMenu.open(btnEl, {
                url: url,
                title: 'You know Hawaiʻi?',
                lede: lede,
                track: track,
            });
            return;
        }

        // Fallback if share-menu.js failed to load: just copy to clipboard.
        const composedText = claim
            ? `${teaser}\n\n${claim}\n\n${url}`
            : `${teaser}\n\n${url}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(composedText).then(
                () => track('clipboard'),
                () => track('fallback')
            ).finally(() => this._flashCopied(btnEl));
        } else {
            track('fallback');
            this._flashCopied(btnEl);
        }
    },

    /**
     * Temporarily swap the share button's label to "Copied!" for 2s.
     * @private
     */
    _flashCopied(btn) {
        if (!btn) return;
        const label = btn.querySelector('span');
        const original = label ? label.textContent : null;
        btn.classList.add('copied');
        if (label) label.textContent = 'Copied!';
        setTimeout(() => {
            btn.classList.remove('copied');
            if (label && original !== null) label.textContent = original;
        }, 2000);
    },

    /** Minimal HTML escape for user-visible strings. */
    _escape(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    },

    /**
     * Render the homepage teaser. States:
     *   - no question (before launch) or dismissed-today → hidden
     *   - not answered → claim + True/False + share + close
     *   - answered → full proof (verdict + claim + answer + chart + share + view chart) + close + footer
     */
    renderTeaser() {
        const host = document.getElementById('qotd-teaser');
        if (!host) return;
        const q = this.today();
        if (!q || this.isDismissedToday()) { host.style.display = 'none'; return; }
        host.style.display = 'block';

        const closeBtn = `
            <button class="qotd-teaser-close" type="button" aria-label="Close today's question" data-action="close">
                ${this.CLOSE_ICON_SVG}
            </button>
        `;

        if (this.hasAnswered(q.id)) {
            const ans = this.getAnswer(q.id);
            const verdict = q.correct ? 'True' : 'False';
            const gotItRight = ans.correct;
            const metricData = (typeof App !== 'undefined' && App.getActiveMetricData) ? App.getActiveMetricData(q.metric) : null;
            const whyItMatters = metricData && metricData.whyItMatters ? metricData.whyItMatters : '';
            const whyBlock = whyItMatters
                ? `<p class="qotd-why-it-matters"><span class="qotd-metric-label">Why it matters:</span> ${this._escape(whyItMatters)}</p>`
                : '';
            // What the chart actually measures, plus attribution. The claim
            // and answer give the number; without this the reader still has
            // no way to know what the number is a share of.
            const captionBlock = (metricData && metricData.officialName)
                ? `<figcaption class="qotd-chart-caption">${this._escape(metricData.officialName)}${metricData.source ? ` <span class="qotd-chart-source">Source: ${this._escape(metricData.source)}</span>` : ''}</figcaption>`
                : '';
            // Latest-month note. 13 of the 54 questions sit on metrics with a
            // monthly series, so about one day in four the answer quotes an
            // annual figure that a resident knows is out of date (q051 answers
            // electricity with 2025's 40.6c while May 2026 is 52c). Rendered
            // from metricData at display time, deliberately NOT folded into
            // q.answer: that field is machine-owned by sync-qotd-answers.js and
            // hashed by gates 3 and 9, and a value baked into it would go stale
            // the moment the monthly refreshes.
            const lm = metricData && metricData.latestMonthly;
            const monthlyBlock = (lm && typeof ChartUtils !== 'undefined')
                ? `<p class="qotd-monthly-note"><span class="qotd-monthly-label">Latest month:</span> ${this._escape(ChartUtils.formatValue(lm.value, metricData.unit, false))} (${this._escape(lm.period)}). Newer than the annual figure above.</p>`
                : '';
            // One-line pointer to the Off the Charts story on this metric,
            // when one exists. Sits above the come-back-tomorrow footer so
            // the proof view ends with a next step, not a dead end.
            const otcPost = (typeof otcPostForMetric !== 'undefined') ? otcPostForMetric(q.metric) : null;
            const otcBlock = otcPost
                ? `<p class="qotd-otc-link"><span class="qotd-otc-eyebrow">Off the Charts</span> <a href="/off-the-charts/${otcPost.slug}/" data-otc-slug="${otcPost.slug}">${this._escape(otcPost.title)} →</a></p>`
                : '';
            host.innerHTML = `
                <div class="qotd-teaser-inner qotd-teaser-inner--proof">
                    ${closeBtn}
                    <p class="qotd-teaser-eyebrow">You know Hawaiʻi?</p>
                    <h2 class="qotd-claim">${this._escape(q.claim)}</h2>
                    <div class="qotd-verdict qotd-verdict--${gotItRight ? 'correct' : 'incorrect'}" aria-live="polite">
                        <span class="qotd-verdict-glyph" aria-hidden="true">${gotItRight ? '✓' : '✗'}</span>
                        <span class="qotd-verdict-text">${gotItRight ? 'You got it!' : 'Not quite.'}</span>
                    </div>
                    <p class="qotd-answer-reveal">Answer: <strong>${verdict}</strong></p>
                    <p class="qotd-answer-text"><span class="qotd-metric-label">${this._escape(q.metricLabel)}:</span> ${this._escape(q.answer)}</p>
                    ${monthlyBlock}
                    ${whyBlock}
                    <figure class="qotd-chart" data-qotd-chart>
                        <div class="qotd-chart-canvas-wrap"><canvas class="qotd-chart-canvas" aria-label="Chart showing ${this._escape(q.metricLabel)} data"></canvas></div>
                        ${captionBlock}
                    </figure>
                    <div class="qotd-actions">
                        <button class="qotd-share-btn" type="button" data-action="share" aria-label="Share this question">
                            ${this.SHARE_ICON_SVG}<span>Share</span>
                        </button>
                        <a class="qotd-link" href="${q.chartUrl}" aria-label="View full chart">View full chart →</a>
                        <a class="qotd-link" href="#" data-action="download-chart" aria-label="Download this chart as an image" hidden>Download chart</a>
                    </div>
                    ${otcBlock}
                    <p class="qotd-teaser-footer">Come back tomorrow for a new question.</p>
                </div>
            `;
            this._renderLiveChart(host.querySelector('[data-qotd-chart]'), q);
            this._wireChartDownload(host, q);
            this._observeChartView(q.id);
        } else {
            host.classList.add('qotd-teaser--banner');
            host.innerHTML = `
                <div class="qotd-teaser-inner qotd-teaser-inner--banner">
                    <p class="qotd-teaser-eyebrow">You know Hawaiʻi?</p>
                    <p class="qotd-teaser-claim">${this._escape(q.claim)}</p>
                    <div class="qotd-teaser-buttons" role="group" aria-label="Answer the daily claim">
                        <button class="qotd-btn qotd-btn--inline" type="button" data-answer="true">True</button>
                        <button class="qotd-btn qotd-btn--inline" type="button" data-answer="false">False</button>
                    </div>
                    ${closeBtn}
                </div>
            `;
        }
        // Banner class only applies to the unanswered state. When the user
        // answers, renderTeaser() rebuilds the host innerHTML and we drop the
        // modifier so the proof view gets its full card styling.
        if (this.hasAnswered(q.id)) {
            host.classList.remove('qotd-teaser--banner');
        }

        host.querySelectorAll('[data-answer]').forEach(btn => {
            btn.addEventListener('click', () => {
                const picked = btn.dataset.answer === 'true';
                this.submitAnswer(q.id, picked);
            });
        });
        host.querySelector('[data-action="share"]')?.addEventListener('click', (e) => this._handleShare(q.id, e.currentTarget));
        host.querySelector('[data-action="close"]')?.addEventListener('click', () => this._closeTeaser());
        host.querySelector('.qotd-otc-link a')?.addEventListener('click', (e) => {
            if (typeof App !== 'undefined' && App._trackEvent) {
                App._trackEvent('otc_teaser_clicked', { slug: e.currentTarget.dataset.otcSlug, surface: 'qotd' });
            }
        });

        if (typeof App !== 'undefined' && App._trackEvent) {
            App._trackEvent('qotd_teaser_viewed', { id: q.id, answered: this.hasAnswered(q.id) });
        }
    },

    /**
     * Hide the teaser for the rest of today.
     */
    _closeTeaser() {
        this.dismissToday();
        const host = document.getElementById('qotd-teaser');
        if (host) host.style.display = 'none';
        if (typeof App !== 'undefined' && App._trackEvent) {
            App._trackEvent('qotd_dismissed', { dayIndex: this.dayIndex() });
        }
    },

    /**
     * Record that the user returned to the site on a new day.
     * @private
     */
    _checkReturnVisit() {
        try {
            const key = `${QOTD_STORAGE_PREFIX}.lastVisitDay`;
            const prev = localStorage.getItem(key);
            const today = String(this.dayIndex());
            if (prev !== null && prev !== today) {
                const delta = parseInt(today, 10) - parseInt(prev, 10);
                if (delta > 0 && typeof App !== 'undefined' && App._trackEvent) {
                    App._trackEvent('qotd_return_next_day', { daysSinceLast: delta });
                }
            }
            localStorage.setItem(key, today);
        } catch (e) { /* localStorage disabled */ }
    },

    /**
     * Entry point. Called once from App.init().
     */
    init() {
        this.renderTeaser();
        this._checkReturnVisit();
    },
};

// Dual export: browser global + Node.js module (enables unit testing)
if (typeof module !== 'undefined') module.exports = QOTD;
