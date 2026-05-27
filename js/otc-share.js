// Off the Charts: Share button binding.
//
// Wires the standard .share-btn[data-share-url] elements on per-post pages
// into the unified share menu (js/share-menu.js). Mobile gets the OS share
// sheet via navigator.share(); desktop gets the in-page popover with
// LinkedIn / Email / X / Bluesky / Copy link. Fires GA4 event
// `share_clicked` with { surface: 'otc', slug, method } so we can compare
// which channel actually drives shares.

(function () {
    'use strict';

    function getPostTitle() {
        var raw = (document.querySelector('title') || {}).textContent || '';
        return raw.replace(/\s*\|\s*Off the Charts\s*$/, '').trim();
    }

    function getPostLede() {
        var el = document.querySelector('meta[name="description"]');
        return el ? (el.getAttribute('content') || '').trim() : '';
    }

    function getPostSlug(url) {
        try {
            var parts = new URL(url, window.location.href).pathname
                .split('/').filter(Boolean);
            // ['off-the-charts', '{slug}']
            if (parts[0] === 'off-the-charts' && parts[1]) return parts[1];
        } catch (e) { /* ignored */ }
        return 'unknown';
    }

    function trackShare(slug, method) {
        if (typeof window.gtag === 'function') {
            window.gtag('event', 'share_clicked', {
                surface: 'otc',
                slug: slug,
                method: method,
            });
        }
        if (window.clarity) {
            try {
                window.clarity('set', 'shared_slug', slug);
                window.clarity('event', 'share_clicked');
            } catch (e) { /* ignored */ }
        }
    }

    function bind(btn) {
        btn.addEventListener('click', function (ev) {
            ev.preventDefault();
            if (!window.ShareMenu) return; // module not loaded yet
            var url = btn.getAttribute('data-share-url') || window.location.href;
            var slug = getPostSlug(url);
            window.ShareMenu.open(btn, {
                url: url,
                title: getPostTitle(),
                lede: getPostLede(),
                track: function (method) { trackShare(slug, method); },
            });
        });
    }

    var buttons = document.querySelectorAll('.share-btn[data-share-url]');
    for (var i = 0; i < buttons.length; i++) {
        bind(buttons[i]);
    }
})();
