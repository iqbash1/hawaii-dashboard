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

    /** Handle permalink routing: /t/{slug}/, /r/{slug}/, /c/{slug}/, /rh/{slug}/, or legacy #{slug} */
    handleRoute() {
        let slug = '';
        let view = '';
        let variantSegment = '';

        // Path patterns: optional variant suffix (e.g. /severe/, /verylow/, /notgood/, /all/)
        const detailMatch = window.location.pathname.match(/^\/t\/([^/]+)\/([a-z]+\/)?\/?$/);
        const rankMatch = window.location.pathname.match(/^\/r\/([^/]+)\/([a-z]+\/)?\/?$/);
        const countyMatch = window.location.pathname.match(/^\/c\/([^/]+)\/([a-z]+\/)?\/?$/);
        const rankHistoryCompareMatch = window.location.pathname.match(/^\/rh\/([^/]+)\/([^/]+)\/([a-z]+\/)?\/?$/);
        const rankHistoryMatch = window.location.pathname.match(/^\/rh\/([^/]+)\/([a-z]+\/)?\/?$/);
        let compareSlug = '';
        if (detailMatch) {
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
            slug = parts[0];
            view = parts[1] || '';
            if (view === 'rank-history' && parts[2]) compareSlug = parts[2];
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
