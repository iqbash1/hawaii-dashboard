// ============================================================
// Hawaiʻi Dashboard - Analytics (GA4 + Microsoft Clarity)
//
// Centralizes what used to be a duplicated inline block in every page.
//
// Owner / internal-traffic opt-out
// ---------------------------------
// Visit any page with ?notrack=1 once to mark this browser as internal:
//
//     https://hawaiidashboard.org/?notrack=1
//
// That sets a localStorage flag (hd_notrack=1) that persists across
// sessions on this browser. From then on:
//
//   - Clarity is NOT loaded (no session recording)
//   - GA4 is loaded but every event tags traffic_type=internal so the
//     GA4 Data Filter (admin → Data Settings → Data filters →
//     "Internal traffic") drops them from reports while keeping them
//     visible in DebugView for verification.
//
// To undo on a device, visit /?track=1 once.
//
// The flag is checked via `window.__hdInternal` (true | false) for
// debugging. Works on iOS Safari, Android Chrome, desktop browsers.
// ============================================================

(function () {
    'use strict';

    try {
        const params = new URLSearchParams(location.search);
        if (params.has('notrack')) localStorage.setItem('hd_notrack', '1');
        if (params.has('track')) localStorage.removeItem('hd_notrack');
    } catch (e) {
        // localStorage may throw in Safari Private mode; treat as no-flag.
    }

    let isInternal = false;
    try {
        isInternal = localStorage.getItem('hd_notrack') === '1';
    } catch (e) {
        isInternal = false;
    }
    window.__hdInternal = isInternal;

    // Microsoft Clarity (session recording), skip entirely for internal traffic.
    if (!isInternal) {
        (function (c, l, a, r, i, t, y) {
            c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
            t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
            y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
        })(window, document, 'clarity', 'script', 'w5pye8kkrb');
    }

    // Google Analytics 4, always loaded; internal traffic gets tagged
    // so the GA4 Data Filter excludes it from reports.
    const gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-5MSPMJVFE5';
    document.head.appendChild(gaScript);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', 'G-5MSPMJVFE5', isInternal ? { traffic_type: 'internal' } : {});
})();
