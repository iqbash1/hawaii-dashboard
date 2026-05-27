// Off the Charts: Share button.
//
// Three-tier share flow:
//   1. navigator.share(), native share sheet on iOS / Android / supporting
//      desktops. Hands the OS the post title + lede + url so any installed
//      app (Messages, Mail, Slack, LinkedIn, X, AirDrop, ...) can receive it.
//   2. navigator.clipboard.writeText(), copy a pre-composed "title \n\n lede
//      \n\n url" payload to clipboard so the link arrives with context on
//      platforms that don't auto-unfurl (SMS, Slack DMs).
//   3. document.execCommand('copy'), last-resort fallback for old browsers.
//
// Fires GA4 event `share_clicked` with { surface: 'otc', slug, method }
// where method is 'native' | 'clipboard' | 'fallback'. AbortError from a
// dismissed share sheet is treated as a non-event.

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

    function buildCopyText(title, lede, url) {
        var parts = [];
        if (title) parts.push(title);
        if (lede) parts.push(lede);
        parts.push(url);
        return parts.join('\n\n');
    }

    function execFallback(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* ignored */ }
        document.body.removeChild(ta);
    }

    function flashLabel(btn, message, addCopiedClass) {
        var label = btn.querySelector('span');
        var original = label ? label.textContent : null;
        if (addCopiedClass) btn.classList.add('copied');
        if (label) label.textContent = message;
        setTimeout(function () {
            if (addCopiedClass) btn.classList.remove('copied');
            if (label && original !== null) label.textContent = original;
        }, 2000);
    }

    function copyAndFlash(btn, slug, title, lede, url) {
        var text = buildCopyText(title, lede, url);
        var doCopy;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            doCopy = navigator.clipboard.writeText(text).then(function () {
                trackShare(slug, 'clipboard');
            }, function () {
                execFallback(text);
                trackShare(slug, 'fallback');
            });
        } else {
            execFallback(text);
            trackShare(slug, 'fallback');
            doCopy = Promise.resolve();
        }
        doCopy.finally(function () { flashLabel(btn, 'Copied!', true); });
    }

    function bind(btn) {
        btn.addEventListener('click', function () {
            var url = btn.getAttribute('data-share-url') || window.location.href;
            var slug = getPostSlug(url);
            var title = getPostTitle();
            var lede = getPostLede();

            // Native share sheet (mobile + supporting desktops)
            if (typeof navigator.share === 'function') {
                navigator.share({
                    title: title,
                    text: lede,
                    url: url,
                }).then(function () {
                    trackShare(slug, 'native');
                }).catch(function (err) {
                    // AbortError = user dismissed the sheet. Treat as a
                    // non-event (no tracking, no fallback), a curious tap
                    // should not look like a share.
                    if (err && err.name === 'AbortError') return;
                    // Any other failure: fall back to clipboard.
                    copyAndFlash(btn, slug, title, lede, url);
                });
                return;
            }

            // Clipboard fallback
            copyAndFlash(btn, slug, title, lede, url);
        });
    }

    var buttons = document.querySelectorAll('.share-btn[data-share-url]');
    for (var i = 0; i < buttons.length; i++) {
        bind(buttons[i]);
    }
})();
