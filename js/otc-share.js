// Off the Charts — Share button.
// Matches the dashboard's modal-share-btn / qotd-share-btn pattern: copies
// the canonical URL to clipboard, then flashes "Copied!" on the button for
// 2 seconds. Looks for any .share-btn[data-share-url] on the page.
(function () {
    'use strict';

    function execFallback(url) {
        var ta = document.createElement('textarea');
        ta.value = url;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* ignored */ }
        document.body.removeChild(ta);
    }

    function flashCopied(btn) {
        var label = btn.querySelector('span');
        var original = label ? label.textContent : null;
        btn.classList.add('copied');
        if (label) label.textContent = 'Copied!';
        setTimeout(function () {
            btn.classList.remove('copied');
            if (label && original !== null) label.textContent = original;
        }, 2000);
    }

    function bind(btn) {
        btn.addEventListener('click', function () {
            var url = btn.getAttribute('data-share-url') || window.location.href;
            var doCopy;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                doCopy = navigator.clipboard.writeText(url).catch(function () {
                    execFallback(url);
                });
            } else {
                execFallback(url);
                doCopy = Promise.resolve();
            }
            doCopy.finally(function () { flashCopied(btn); });
        });
    }

    var buttons = document.querySelectorAll('.share-btn[data-share-url]');
    for (var i = 0; i < buttons.length; i++) {
        bind(buttons[i]);
    }
})();
