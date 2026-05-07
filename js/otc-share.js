// Off the Charts — Share button.
// Uses the Web Share API where available (mobile + modern desktop),
// falls back to clipboard copy with a toast for older browsers.
(function () {
    'use strict';

    function showToast(message) {
        var toast = document.createElement('div');
        toast.className = 'otc-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        // Trigger reflow so the transition runs
        // eslint-disable-next-line no-unused-expressions
        toast.offsetHeight;
        toast.classList.add('otc-toast-visible');
        setTimeout(function () {
            toast.classList.remove('otc-toast-visible');
            setTimeout(function () { toast.remove(); }, 300);
        }, 2000);
    }

    function bind(btn) {
        btn.addEventListener('click', function () {
            var url = btn.getAttribute('data-share-url') || window.location.href;
            var title = btn.getAttribute('data-share-title') || document.title;

            if (navigator.share) {
                navigator.share({ title: title, url: url }).catch(function () {
                    // User cancelled or share failed — silent
                });
                return;
            }

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(function () {
                    showToast('Link copied');
                }).catch(function () {
                    window.prompt('Copy this link:', url);
                });
                return;
            }

            window.prompt('Copy this link:', url);
        });
    }

    var buttons = document.querySelectorAll('.otc-share-btn');
    for (var i = 0; i < buttons.length; i++) {
        bind(buttons[i]);
    }
})();
