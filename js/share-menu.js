// Unified share menu for the Hawaiʻi Dashboard.
//
// One consistent experience across all 3 share surfaces:
//   1. Off the Charts posts  (slug: 'otc')
//   2. Chart modal           (slug: 'modal')
//   3. QOTD pop-up           (slug: 'qotd')
//
// Behavior:
//   - Touch-primary devices (hover:none, pointer:coarse) get the OS share sheet
//     via navigator.share(). That's the iPhone / Android pattern with Messages,
//     Mail, Slack, LinkedIn, X, AirDrop and so on.
//   - Desktop / hover-capable devices get an explicit in-page popover with five
//     targets: LinkedIn, Email, X, Bluesky, Copy link. Each target fires a
//     trackable GA4 event so we can see which channel actually drives shares.
//
// Each per-surface JS file (otc-share.js, qotd.js, modal.js) calls
// window.ShareMenu.open(btnEl, options) from its existing click handler.

(function () {
    'use strict';

    // ---------------------------------------------------------------------
    // Mobile / desktop split
    // ---------------------------------------------------------------------

    function isTouchPrimary() {
        if (!window.matchMedia) return false;
        return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    }

    function hasNativeShare() {
        return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    }

    // ---------------------------------------------------------------------
    // Intent URLs
    // ---------------------------------------------------------------------

    function linkedInUrl(url) {
        return 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(url);
    }
    function xUrl(text, url) {
        return 'https://x.com/intent/post?text=' + encodeURIComponent(text) +
            '&url=' + encodeURIComponent(url);
    }
    function blueskyUrl(text, url) {
        // Bluesky auto-extracts links inside the text field.
        var combined = text + ' ' + url;
        return 'https://bsky.app/intent/compose?text=' + encodeURIComponent(combined);
    }
    function mailtoUrl(subject, body) {
        return 'mailto:?subject=' + encodeURIComponent(subject) +
            '&body=' + encodeURIComponent(body);
    }

    // ---------------------------------------------------------------------
    // Clipboard
    // ---------------------------------------------------------------------

    function buildClipboardText(title, lede, url) {
        var parts = [];
        if (title) parts.push(title);
        if (lede) parts.push(lede);
        parts.push(url);
        return parts.join('\n\n');
    }

    function execFallback(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* ignore */ }
        document.body.removeChild(ta);
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(
                function () { return 'clipboard'; },
                function () { execFallback(text); return 'fallback'; }
            );
        }
        execFallback(text);
        return Promise.resolve('fallback');
    }

    // ---------------------------------------------------------------------
    // Button label flash ("Copied!" feedback)
    // ---------------------------------------------------------------------

    function flashButton(btn, message) {
        var label = btn.querySelector('span') || btn.querySelector('.share-label');
        var original = label ? label.textContent : null;
        btn.classList.add('copied');
        if (label) label.textContent = message;
        setTimeout(function () {
            btn.classList.remove('copied');
            if (label && original !== null) label.textContent = original;
        }, 2000);
    }

    // ---------------------------------------------------------------------
    // Popover
    // ---------------------------------------------------------------------

    var currentMenu = null;
    var currentBtn = null;

    // SVG icons. Inline, single-color (currentColor) so hover/focus can recolor.
    var ICONS = {
        linkedin: '<svg class="share-menu-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56zM22.22 0H1.77C.79 0 0 .78 0 1.74v20.52C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.74V1.74C24 .78 23.2 0 22.22 0z"/></svg>',
        email: '<svg class="share-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
        x: '<svg class="share-menu-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
        bluesky: '<svg class="share-menu-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.4 4.5C8.2 6.6 11.2 10.9 12 13.3c.8-2.4 3.8-6.7 6.6-8.8 2-1.5 5.4-2.7 5.4 1.2 0 .8-.5 6.5-.7 7.4-.7 3.2-4 4-7 3.5 5.2.9 6.5 3.9 3.6 6.8-5.4 5.5-7.8-1.4-8.4-3.1-.1-.3-.2-.5-.2-.5l-.2.5c-.6 1.7-3 8.6-8.4 3.1-2.9-2.9-1.6-5.9 3.6-6.8-3 .5-6.3-.3-7-3.5C.5 11.7 0 6.1 0 5.3 0 1.5 3.4 2.7 5.4 4.2v.3z"/></svg>',
        copy: '<svg class="share-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    };

    function closeMenu() {
        if (currentMenu && currentMenu.parentNode) {
            currentMenu.parentNode.removeChild(currentMenu);
        }
        if (currentBtn) {
            currentBtn.setAttribute('aria-expanded', 'false');
        }
        currentMenu = null;
        currentBtn = null;
        document.removeEventListener('click', onOutsideClick, true);
        document.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('resize', closeMenu);
        window.removeEventListener('scroll', closeMenu, true);
    }

    function onOutsideClick(ev) {
        if (!currentMenu) return;
        if (currentMenu.contains(ev.target)) return;
        if (currentBtn && currentBtn.contains(ev.target)) return;
        closeMenu();
    }

    function onKeyDown(ev) {
        if (ev.key === 'Escape' || ev.key === 'Esc') {
            ev.preventDefault();
            closeMenu();
            if (currentBtn) currentBtn.focus();
        } else if (ev.key === 'Tab' && currentMenu) {
            var items = currentMenu.querySelectorAll('button[role="menuitem"]');
            if (!items.length) return;
            var first = items[0];
            var last = items[items.length - 1];
            if (ev.shiftKey && document.activeElement === first) {
                ev.preventDefault();
                last.focus();
            } else if (!ev.shiftKey && document.activeElement === last) {
                ev.preventDefault();
                first.focus();
            }
        }
    }

    function positionMenu(menu, anchor) {
        var rect = anchor.getBoundingClientRect();
        var menuW = menu.offsetWidth;
        var menuH = menu.offsetHeight;
        var pad = 6;
        var top = rect.bottom + window.scrollY + pad;
        var left = rect.left + window.scrollX;

        // Flip up if no room below.
        var roomBelow = window.innerHeight - rect.bottom;
        if (roomBelow < menuH + 16 && rect.top > menuH + 16) {
            top = rect.top + window.scrollY - menuH - pad;
        }

        // Constrain horizontally.
        var rightEdge = left + menuW;
        if (rightEdge > window.innerWidth - 8) {
            left = window.innerWidth - menuW - 8 + window.scrollX;
        }
        if (left < 8) left = 8;

        menu.style.top = top + 'px';
        menu.style.left = left + 'px';
    }

    function makeMenuItem(method, iconSvg, label) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'share-menu-item';
        btn.setAttribute('role', 'menuitem');
        btn.setAttribute('data-method', method);
        btn.innerHTML = iconSvg + '<span class="share-menu-label">' + label + '</span>';
        return btn;
    }

    function openPopover(anchorBtn, options) {
        // Toggle: clicking the same button while menu is open closes it.
        if (currentBtn === anchorBtn) {
            closeMenu();
            return;
        }
        closeMenu();

        var title = options.title || '';
        var lede = options.lede || '';
        var url = options.url || window.location.href;
        var track = typeof options.track === 'function' ? options.track : function () {};

        // Pre-composed text payloads.
        var clipboardText = buildClipboardText(title, lede, url);
        var xText = title; // X auto-fetches the OG card; bare title reads cleanest.
        var blueskyText = title;
        var emailSubject = title || 'Hawaiʻi Dashboard';
        var emailBody = (lede ? lede + '\n\n' : '') + url;

        var menu = document.createElement('div');
        menu.className = 'share-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-orientation', 'vertical');
        menu.style.position = 'absolute';
        menu.style.visibility = 'hidden';

        var items = [
            { method: 'linkedin', icon: ICONS.linkedin, label: 'Share on LinkedIn',
              action: function () { window.open(linkedInUrl(url), '_blank', 'noopener,noreferrer'); } },
            { method: 'email', icon: ICONS.email, label: 'Email',
              action: function () { window.location.href = mailtoUrl(emailSubject, emailBody); } },
            { method: 'x', icon: ICONS.x, label: 'Share on X',
              action: function () { window.open(xUrl(xText, url), '_blank', 'noopener,noreferrer'); } },
            { method: 'bluesky', icon: ICONS.bluesky, label: 'Share on Bluesky',
              action: function () { window.open(blueskyUrl(blueskyText, url), '_blank', 'noopener,noreferrer'); } },
            { method: 'copy', icon: ICONS.copy, label: 'Copy link',
              action: function (itemBtn) {
                  copyText(clipboardText).then(function (status) {
                      var label = itemBtn.querySelector('.share-menu-label');
                      var original = label ? label.textContent : null;
                      itemBtn.classList.add('copied');
                      if (label) label.textContent = 'Copied!';
                      setTimeout(function () {
                          itemBtn.classList.remove('copied');
                          if (label && original !== null) label.textContent = original;
                          closeMenu();
                      }, 900);
                  });
              } },
        ];

        items.forEach(function (it) {
            var itemBtn = makeMenuItem(it.method, it.icon, it.label);
            itemBtn.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                track(it.method);
                if (it.method === 'copy') {
                    it.action(itemBtn);
                } else {
                    it.action();
                    closeMenu();
                }
            });
            menu.appendChild(itemBtn);
        });

        document.body.appendChild(menu);
        currentMenu = menu;
        currentBtn = anchorBtn;
        anchorBtn.setAttribute('aria-expanded', 'true');
        anchorBtn.setAttribute('aria-haspopup', 'menu');

        positionMenu(menu, anchorBtn);
        menu.style.visibility = 'visible';

        // Focus first item so keyboard users can navigate immediately.
        var firstItem = menu.querySelector('button[role="menuitem"]');
        if (firstItem) firstItem.focus();

        // Wire up closers.
        document.addEventListener('click', onOutsideClick, true);
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('resize', closeMenu);
        window.addEventListener('scroll', closeMenu, true);
    }

    // ---------------------------------------------------------------------
    // Native share path
    // ---------------------------------------------------------------------

    function openNative(anchorBtn, options) {
        var title = options.title || '';
        var lede = options.lede || '';
        var url = options.url || window.location.href;
        var track = typeof options.track === 'function' ? options.track : function () {};

        navigator.share({
            title: title,
            text: lede,
            url: url,
        }).then(function () {
            track('native');
        }).catch(function (err) {
            // User dismissed: don't track, but DO copy to clipboard so the
            // click still produced a useful outcome. This is the "do something
            // when the sheet is dismissed" gap that used to look broken.
            if (err && err.name === 'AbortError') {
                copyText(buildClipboardText(title, lede, url)).then(function (status) {
                    track(status === 'fallback' ? 'fallback' : 'clipboard');
                    flashButton(anchorBtn, 'Copied!');
                });
                return;
            }
            // Any other failure: copy to clipboard as fallback.
            copyText(buildClipboardText(title, lede, url)).then(function (status) {
                track(status === 'fallback' ? 'fallback' : 'clipboard');
                flashButton(anchorBtn, 'Copied!');
            });
        });
    }

    // ---------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------

    window.ShareMenu = {
        /**
         * Open the share UI for a button.
         *
         * @param {HTMLElement} btnEl - the .share-btn / .qotd-share-btn element
         * @param {Object} options
         * @param {string} options.url      - canonical URL to share
         * @param {string} options.title    - title (no site suffix)
         * @param {string} [options.lede]   - 1-line summary for clipboard + X
         * @param {Function} [options.track] - called with method name on each share path
         * @param {boolean} [options.forceNative]   - always use navigator.share, even on desktop
         * @param {boolean} [options.forceMenu]     - always use the popover, even on mobile
         */
        open: function (btnEl, options) {
            options = options || {};
            var useNative = options.forceNative || (!options.forceMenu && isTouchPrimary() && hasNativeShare());
            if (useNative) {
                openNative(btnEl, options);
            } else {
                openPopover(btnEl, options);
            }
        },
        close: closeMenu,
        isTouchPrimary: isTouchPrimary,
        hasNativeShare: hasNativeShare,
    };
})();
