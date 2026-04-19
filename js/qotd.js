// ============================================================
// Hawaiʻi Dashboard - Question of the Day controller
//
// Depends on: QOTD_QUESTIONS (js/questions.js), App (js/app.js)
//
// Handles:
//   - Daily rotation (which question shows today)
//   - Per-browser answered/dismissed state (localStorage)
//   - Teaser and question-page rendering (see 1b/1c)
//   - Share URL generation
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
        // Convert now to HST by subtracting 10 hours, then floor to midnight.
        const HST_OFFSET_MS = 10 * 60 * 60 * 1000;
        const nowHst = new Date(Date.now() - HST_OFFSET_MS);
        const todayHst = new Date(Date.UTC(nowHst.getUTCFullYear(), nowHst.getUTCMonth(), nowHst.getUTCDate()));
        const zeroHst = new Date(QOTD_DAY_ZERO + 'T00:00:00Z'); // treat stored date as UTC midnight
        const diffMs = todayHst.getTime() - zeroHst.getTime();
        return Math.floor(diffMs / 86400000);
    },

    /**
     * Today's question based on dayIndex() modulo bank size.
     * Returns null if the bank is empty or dayIndex is negative (before launch).
     * @returns {object|null}
     */
    today() {
        const idx = this.dayIndex();
        if (idx < 0) return null;
        if (!QOTD_QUESTIONS.length) return null;
        return QOTD_QUESTIONS[idx % QOTD_QUESTIONS.length];
    },

    /**
     * Look up a question by its slug. Returns null if not found.
     * @param {string} slug
     * @returns {object|null}
     */
    getBySlug(slug) {
        return QOTD_QUESTIONS.find(q => q.slug === slug) || null;
    },

    /**
     * Has the user answered this question already (on this browser)?
     * @param {string} slug
     * @returns {boolean}
     */
    hasAnswered(slug) {
        return !!this.getAnswer(slug);
    },

    /**
     * Retrieve the user's stored answer for a question, or null.
     * @param {string} slug
     * @returns {{picked: boolean, correct: boolean, ts: number}|null}
     */
    getAnswer(slug) {
        try {
            const raw = localStorage.getItem(`${QOTD_STORAGE_PREFIX}.answer.${slug}`);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    /**
     * Persist the user's answer.
     * @param {string} slug
     * @param {boolean} picked - what the user picked
     * @param {boolean} correct - whether picked === question.correct
     */
    recordAnswer(slug, picked, correct) {
        try {
            localStorage.setItem(
                `${QOTD_STORAGE_PREFIX}.answer.${slug}`,
                JSON.stringify({ picked, correct, ts: Date.now() })
            );
        } catch (e) {
            // localStorage may be disabled; fail silently
        }
    },

    /**
     * Share URL for a question (canonical, shareable form).
     * @param {string} slug
     * @returns {string}
     */
    shareUrl(slug) {
        return `${window.location.origin}/q/${slug}/`;
    },

    /**
     * Share text shown in preview / fallback copy-to-clipboard message.
     */
    SHARE_TEXT: 'Think you know Hawaiʻi? Try this one.',

    /**
     * SVG markup for the share button. Mirrors the existing dashboard
     * share button (3 connected circles) so the share affordance looks
     * the same wherever it appears.
     */
    SHARE_ICON_SVG: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',

    /**
     * Map a dashboard chart URL to its pre-generated OG card PNG (used as
     * the proof-chart visual in the answer reveal). Keeps the modal light.
     */
    chartOgImage(chartUrl) {
        const m = chartUrl.match(/^\/(r|rh|c|t)\/([^/]+)/);
        if (!m) return '/assets/og-image.png';
        const view = m[1];
        const slug = m[2];
        const suffix = view === 'r' ? '_rankings' : view === 'c' ? '_county' : view === 'rh' ? '_rank_history' : '';
        return `/assets/og/${slug}${suffix}.png`;
    },

    /**
     * Open the QOTD modal for a given question slug.
     * No-op if the slug does not resolve to a known question.
     */
    openQuestion(slug) {
        const q = this.getBySlug(slug);
        if (!q) return;
        const overlay = document.getElementById('qotd-overlay');
        if (!overlay) return;
        // Remember what had focus so we can restore it on close (a11y).
        this._triggerEl = document.activeElement;
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        this._activeQuestion = q;
        if (this.hasAnswered(slug)) {
            const ans = this.getAnswer(slug);
            this._renderAnswered(q, ans);
        } else {
            this._renderUnanswered(q);
        }
        if (typeof App !== 'undefined' && App._trackEvent) {
            App._trackEvent('qotd_opened', { slug, source: this._openSource || 'direct' });
        }
        this._openSource = null;
        const firstBtn = overlay.querySelector('.qotd-btn, .qotd-close');
        if (firstBtn) firstBtn.focus();
    },

    /**
     * Close the modal and restore page state + prior focus.
     */
    closeModal() {
        const overlay = document.getElementById('qotd-overlay');
        if (!overlay) return;
        overlay.style.display = 'none';
        document.body.style.overflow = '';
        this._activeQuestion = null;
        // Return focus to whatever triggered the open (button on teaser, etc.)
        if (this._triggerEl && typeof this._triggerEl.focus === 'function') {
            try { this._triggerEl.focus(); } catch (e) { /* element may have been removed */ }
        }
        this._triggerEl = null;
    },

    /**
     * Confine keyboard focus inside the modal while it is open.
     * @private
     */
    _trapFocus(e) {
        const overlay = document.getElementById('qotd-overlay');
        if (!overlay || overlay.style.display !== 'flex') return;
        if (e.key !== 'Tab') return;
        const focusable = overlay.querySelectorAll(
            'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    },

    /**
     * Render the unanswered state: claim + True/False buttons.
     * @private
     */
    _renderUnanswered(q) {
        const body = document.getElementById('qotd-body');
        if (!body) return;
        body.innerHTML = `
            <p class="qotd-eyebrow">Do you know Hawaiʻi?</p>
            <h2 class="qotd-claim" id="qotd-claim">${this._escape(q.claim)}</h2>
            <div class="qotd-buttons" role="group" aria-labelledby="qotd-claim">
                <button class="qotd-btn" data-answer="true" aria-label="Answer True">True</button>
                <button class="qotd-btn" data-answer="false" aria-label="Answer False">False</button>
            </div>
            <button class="qotd-share-btn" type="button" aria-label="Share this question">
                ${this.SHARE_ICON_SVG}<span>Share</span>
            </button>
        `;
        body.querySelectorAll('[data-answer]').forEach(btn => {
            btn.addEventListener('click', () => {
                const picked = btn.dataset.answer === 'true';
                this.submitAnswer(q.slug, picked);
            });
        });
        body.querySelector('.qotd-share-btn').addEventListener('click', () => this._handleShare(q.slug));
    },

    /**
     * Record the answer, show the reveal, fire analytics.
     */
    submitAnswer(slug, picked) {
        const q = this.getBySlug(slug);
        if (!q) return;
        const correct = picked === q.correct;
        this.recordAnswer(slug, picked, correct);
        this._renderAnswered(q, { picked, correct, ts: Date.now() });
        if (typeof App !== 'undefined' && App._trackEvent) {
            App._trackEvent('qotd_answered', {
                slug,
                picked,
                correct: q.correct,
                result: correct ? 'correct' : 'incorrect',
            });
        }
    },

    /**
     * Wire an IntersectionObserver that fires qotd_chart_viewed once when
     * the embedded proof image first becomes visible. No-op if the browser
     * doesn't support IO or the image isn't in the DOM yet.
     * @private
     */
    _observeChartView(slug) {
        if (typeof IntersectionObserver === 'undefined') return;
        const img = document.querySelector('.qotd-chart-image');
        if (!img) return;
        let fired = false;
        const io = new IntersectionObserver((entries) => {
            for (const e of entries) {
                if (e.isIntersecting && !fired) {
                    fired = true;
                    if (typeof App !== 'undefined' && App._trackEvent) {
                        App._trackEvent('qotd_chart_viewed', { slug });
                    }
                    io.disconnect();
                }
            }
        }, { threshold: 0.5 });
        io.observe(img);
    },

    /**
     * Render the answered state: claim, verdict, answer text, chart image, share + view-chart CTAs.
     * @private
     */
    _renderAnswered(q, ans) {
        const body = document.getElementById('qotd-body');
        if (!body) return;
        const verdict = q.correct ? 'True' : 'False';
        const gotItRight = ans.correct;
        const ogImg = this.chartOgImage(q.chartUrl);
        body.innerHTML = `
            <p class="qotd-eyebrow">Do you know Hawaiʻi?</p>
            <h2 class="qotd-claim">${this._escape(q.claim)}</h2>
            <div class="qotd-verdict qotd-verdict--${gotItRight ? 'correct' : 'incorrect'}" aria-live="polite">
                <span class="qotd-verdict-glyph" aria-hidden="true">${gotItRight ? '✓' : '✗'}</span>
                <span class="qotd-verdict-text">Answer: <strong>${verdict}</strong>${gotItRight ? ' (You got it!)' : ''}</span>
            </div>
            <p class="qotd-answer-text">${this._escape(q.answer)}</p>
            <figure class="qotd-chart">
                <img src="${ogImg}" alt="Chart showing ${this._escape(q.metricLabel)} data" class="qotd-chart-image" />
                <figcaption class="qotd-chart-caption">Source: Hawaiʻi Dashboard</figcaption>
            </figure>
            <div class="qotd-actions">
                <button class="qotd-share-btn" type="button" aria-label="Share this question">
                    ${this.SHARE_ICON_SVG}<span>Share</span>
                </button>
                <a class="qotd-link" href="${q.chartUrl}" aria-label="View full chart">View full chart →</a>
            </div>
        `;
        body.querySelector('.qotd-share-btn').addEventListener('click', () => this._handleShare(q.slug));
        this._observeChartView(q.slug);
    },

    /**
     * Share flow: native share sheet on mobile, clipboard fallback elsewhere.
     * Share object is the question URL, never the answer or chart URL.
     */
    _handleShare(slug) {
        const url = this.shareUrl(slug);
        const payload = {
            title: 'Do you know Hawaiʻi?',
            text: this.SHARE_TEXT,
            url,
        };
        if (typeof App !== 'undefined' && App._trackEvent) {
            App._trackEvent('qotd_share_clicked', { slug });
        }
        if (navigator.share) {
            navigator.share(payload).catch(() => {}); // user may cancel; ignore
        } else {
            navigator.clipboard.writeText(url).then(() => {
                this._toast('Link copied');
            }).catch(() => {
                this._toast('Could not copy link');
            });
        }
    },

    /**
     * Lightweight toast shown briefly in the modal. Uses existing aria-live on the modal
     * itself so screen readers announce it.
     * @private
     */
    _toast(msg) {
        const body = document.getElementById('qotd-body');
        if (!body) return;
        let el = body.querySelector('.qotd-toast');
        if (!el) {
            el = document.createElement('div');
            el.className = 'qotd-toast';
            el.setAttribute('role', 'status');
            body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add('qotd-toast--show');
        setTimeout(() => el.classList.remove('qotd-toast--show'), 2000);
    },

    /** Minimal HTML escape for user-visible strings. */
    _escape(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    },

    /**
     * Render the homepage teaser. Three states:
     *   - no question (before launch) -> hidden
     *   - not answered today          -> claim + True/False + share
     *   - answered today              -> compact status + view proof + share
     */
    renderTeaser() {
        const host = document.getElementById('qotd-teaser');
        if (!host) return;
        const q = this.today();
        if (!q) { host.style.display = 'none'; return; }
        host.style.display = 'block';
        if (this.hasAnswered(q.slug)) {
            const ans = this.getAnswer(q.slug);
            const result = ans.correct ? 'You got it!' : 'Not quite.';
            host.innerHTML = `
                <div class="qotd-teaser-inner qotd-teaser-inner--answered">
                    <p class="qotd-teaser-eyebrow">Do you know Hawaiʻi?</p>
                    <p class="qotd-teaser-status">
                        <span class="qotd-teaser-check qotd-teaser-check--${ans.correct ? 'correct' : 'incorrect'}" aria-hidden="true">${ans.correct ? '✓' : '✗'}</span>
                        <span class="qotd-teaser-result">${result}</span>
                    </p>
                    <p class="qotd-teaser-supporting">${this._escape(q.answer)}</p>
                    <div class="qotd-teaser-actions">
                        <button class="qotd-teaser-link" type="button" data-action="view">View proof</button>
                        <button class="qotd-share-btn qotd-share-btn--small" type="button" data-action="share" aria-label="Share this question">
                            ${this.SHARE_ICON_SVG}<span>Share</span>
                        </button>
                    </div>
                </div>
            `;
        } else {
            host.innerHTML = `
                <div class="qotd-teaser-inner">
                    <p class="qotd-teaser-eyebrow">Do you know Hawaiʻi?</p>
                    <p class="qotd-teaser-claim">${this._escape(q.claim)}</p>
                    <div class="qotd-teaser-buttons" role="group" aria-label="Answer the daily claim">
                        <button class="qotd-btn qotd-btn--inline" type="button" data-answer="true">True</button>
                        <button class="qotd-btn qotd-btn--inline" type="button" data-answer="false">False</button>
                    </div>
                </div>
            `;
        }
        // Wire actions
        host.querySelectorAll('[data-answer]').forEach(btn => {
            btn.addEventListener('click', () => {
                const picked = btn.dataset.answer === 'true';
                this._openSource = 'teaser';
                this.submitAnswer(q.slug, picked);
                this.openQuestion(q.slug); // open modal showing answered state
                this.renderTeaser(); // collapse teaser to answered state
            });
        });
        host.querySelector('[data-action="view"]')?.addEventListener('click', () => {
            this._openSource = 'teaser';
            this.openQuestion(q.slug);
        });
        host.querySelector('[data-action="share"]')?.addEventListener('click', () => this._handleShare(q.slug));

        if (typeof App !== 'undefined' && App._trackEvent) {
            App._trackEvent('qotd_teaser_viewed', { slug: q.slug, answered: this.hasAnswered(q.slug) });
        }
    },

    /**
     * Record that the user returned to the site on a new day. Fires the
     * qotd_return_next_day event once per new-calendar-day visit.
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
     * Entry point. Called once from App.init() (or directly by router for /q/{slug}/).
     * Wires overlay controls (close, backdrop, Esc, focus trap) and renders the teaser.
     */
    init() {
        const overlay = document.getElementById('qotd-overlay');
        if (overlay) {
            overlay.querySelector('.qotd-close')?.addEventListener('click', () => this.closeModal());
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.closeModal();
            });
            document.addEventListener('keydown', (e) => {
                if (overlay.style.display !== 'flex') return;
                if (e.key === 'Escape') this.closeModal();
                else if (e.key === 'Tab') this._trapFocus(e);
            });
        }
        this.renderTeaser();
        this._checkReturnVisit();
    },
};

// Dual export: browser global + Node.js module (enables unit testing)
if (typeof module !== 'undefined') module.exports = QOTD;
