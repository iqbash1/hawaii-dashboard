// ============================================================
// Hawaii Dashboard - Routing Module
//
// URL parsing and permalink routing. Handles path-based routes
// (/t/, /r/, /rh/, /c/) and legacy hash routes.
// Depends on: App (for AREA_ORDER, openModal), STATE_ABBREVS,
//             DASHBOARD_DATA.
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

        const detailMatch = window.location.pathname.match(/^\/t\/([^/]+)\/?$/);
        const rankMatch = window.location.pathname.match(/^\/r\/([^/]+)\/?$/);
        const countyMatch = window.location.pathname.match(/^\/c\/([^/]+)\/?$/);
        const rankHistoryCompareMatch = window.location.pathname.match(/^\/rh\/([^/]+)\/([^/]+)\/?$/);
        const rankHistoryMatch = window.location.pathname.match(/^\/rh\/([^/]+)\/?$/);
        let compareSlug = '';
        if (detailMatch) {
            slug = detailMatch[1];
        } else if (rankMatch) {
            slug = rankMatch[1];
            view = 'rankings';
        } else if (countyMatch) {
            slug = countyMatch[1];
            view = 'county';
        } else if (rankHistoryCompareMatch) {
            slug = rankHistoryCompareMatch[1];
            view = 'rank-history';
            compareSlug = rankHistoryCompareMatch[2];
        } else if (rankHistoryMatch) {
            slug = rankHistoryMatch[1];
            view = 'rank-history';
        }

        // Fall back to legacy hash route
        if (!slug) {
            const hash = window.location.hash.slice(1);
            if (!hash) return;
            const parts = hash.split('/');
            slug = parts[0];
            view = parts[1] || '';
            if (view === 'rank-history' && parts[2]) compareSlug = parts[2];
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

        const initialView = ['rankings', 'county', 'rank-history'].includes(view) ? view : undefined;
        const initialCompare = compareSlug ? Router.slugToState(compareSlug) : undefined;
        App.openModal(slug, areaName, initialView, initialCompare);
    },
};
