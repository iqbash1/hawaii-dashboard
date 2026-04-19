// ============================================================
// Hawaii Dashboard - Routing Module
//
// URL parsing and permalink routing. Handles path-based routes
// (/t/, /r/, /rh/, /c/) and legacy hash routes.
// Depends on: App (for AREA_ORDER, openModal), STATE_ABBREVS,
//             DASHBOARD_DATA, THRESHOLD_CONFIG, Modal.
// ============================================================

const Router = {

    /** Convert a state name to its 2-letter code for URLs (e.g. "California" -> "ca") */
    stateToSlug(name) {
        const code = STATE_ABBREVS[name];
        return code ? code.toLowerCase() : name.slice(0, 2).toLowerCase();
    },

    /** Reverse lookup: find the full state name from a 2-letter URL code (e.g. "ca" -> "California") */
    slugToState(slug) {
        const upper = slug.toUpperCase();
        for (const [name, code] of Object.entries(STATE_ABBREVS)) {
            if (code === upper && name !== 'Hawaii') return name;
        }
        return null;
    },

    /** Handle permalink routing: /t/{slug}/, /r/{slug}/, /c/{slug}/, /rh/{slug}/, /q/{id}/, or legacy #{slug} */
    handleRoute() {
        // Shared QOTD landing: /q/{id}/ pages are static meta-refresh redirects
        // to /?from_q={id}. Treat the query param as a tracking signal only —
        // the teaser on the home page already shows today's question.
        const fromQ = new URLSearchParams(window.location.search).get('from_q');
        if (fromQ && typeof QOTD !== 'undefined') {
            QOTD.trackSharedUrlLanding(fromQ);
            // Strip the param so refreshes don't re-fire the event.
            const clean = window.location.pathname + window.location.hash;
            history.replaceState(null, '', clean || '/');
        }

        // Direct /q/{id}/ visits (e.g. if Cloudflare ever misses the redirect):
        // swap to home and preserve tracking.
        const qMatch = window.location.pathname.match(/^\/q\/([^/]+)\/?$/);
        if (qMatch) {
            const qId = qMatch[1];
            if (typeof QOTD !== 'undefined') QOTD.trackSharedUrlLanding(qId);
            history.replaceState(null, '', '/');
            return;
        }

        let slug = '';
        let view = '';
        let variantSegment = '';

        // Path patterns: optional variant suffix (e.g. /severe/, /verylow/, /notgood/, /all/)
        // /t/ and /rh/ also accept an optional state segment for the shared comparator.
        const detailCompareMatch = window.location.pathname.match(/^\/t\/([^/]+)\/([^/]+)\/([a-z]+\/)?\/?$/);
        const detailMatch = window.location.pathname.match(/^\/t\/([^/]+)\/([a-z]+\/)?\/?$/);
        const rankMatch = window.location.pathname.match(/^\/r\/([^/]+)\/([a-z]+\/)?\/?$/);
        const countyMatch = window.location.pathname.match(/^\/c\/([^/]+)\/([a-z]+\/)?\/?$/);
        const rankHistoryCompareMatch = window.location.pathname.match(/^\/rh\/([^/]+)\/([^/]+)\/([a-z]+\/)?\/?$/);
        const rankHistoryMatch = window.location.pathname.match(/^\/rh\/([^/]+)\/([a-z]+\/)?\/?$/);
        let compareSlug = '';
        // /t/<slug>/<state>/<threshold>?/ only matches when segment-2 resolves to a known
        // state; otherwise fall through to the simple /t/<slug>/<threshold>?/ pattern.
        if (detailCompareMatch && Router.slugToState(detailCompareMatch[2])) {
            slug = detailCompareMatch[1];
            compareSlug = detailCompareMatch[2];
            variantSegment = (detailCompareMatch[3] || '').replace(/\/$/, '');
        } else if (detailMatch) {
            slug = detailMatch[1];
            variantSegment = (detailMatch[2] || '').replace(/\/$/, '');
        } else if (rankMatch) {
            slug = rankMatch[1];
            view = 'rankings';
            variantSegment = (rankMatch[2] || '').replace(/\/$/, '');
        } else if (countyMatch) {
            slug = countyMatch[1];
            view = 'county';
            variantSegment = (countyMatch[2] || '').replace(/\/$/, '');
        } else if (rankHistoryCompareMatch) {
            slug = rankHistoryCompareMatch[1];
            view = 'rank-history';
            compareSlug = rankHistoryCompareMatch[2];
            variantSegment = (rankHistoryCompareMatch[3] || '').replace(/\/$/, '');
        } else if (rankHistoryMatch) {
            slug = rankHistoryMatch[1];
            view = 'rank-history';
            variantSegment = (rankHistoryMatch[2] || '').replace(/\/$/, '');
        }

        // Fall back to legacy hash route
        if (!slug) {
            const hash = window.location.hash.slice(1);
            if (!hash) return;
            const parts = hash.split('/');
            // Legacy QOTD hash route: #q/{slug|id} — just strip and let the
            // teaser render today's question.
            if (parts[0] === 'q' && parts[1]) {
                if (typeof QOTD !== 'undefined') QOTD.trackSharedUrlLanding(parts[1]);
                history.replaceState(null, '', '/');
                return;
            }
            slug = parts[0];
            view = parts[1] || '';
            // Compare state can appear after rank-history or detail (trend) views
            if ((view === 'rank-history' || view === 'detail') && parts[2]) compareSlug = parts[2];
            // Threshold from ?_th= query param (used by variant OG redirect pages)
            const thQuery = new URLSearchParams(window.location.search).get('_th');
            if (thQuery) variantSegment = thQuery;
        }

        if (slug && !DASHBOARD_DATA[slug]) {
            history.replaceState(null, '', '/');
            return;
        }
        if (!slug) return;

        let areaName = '';
        for (const areaGroup of App.AREA_ORDER) {
            if (areaGroup.metrics.includes(slug)) {
                areaName = areaGroup.area;
                break;
            }
        }

        // Resolve variant path segment to threshold key via THRESHOLD_CONFIG
        if (variantSegment && DASHBOARD_DATA[slug]?.thresholdVariants) {
            const config = typeof THRESHOLD_CONFIG !== 'undefined' && THRESHOLD_CONFIG[slug];
            if (config && config.urlSegment === variantSegment) {
                Modal._activeThreshold[slug] = config.variantKey;
            }
        }

        const initialView = ['rankings', 'county', 'rank-history'].includes(view) ? view : undefined;
        const initialCompare = compareSlug ? Router.slugToState(compareSlug) : undefined;
        Modal.openModal(slug, areaName, initialView, initialCompare);
    },
};
