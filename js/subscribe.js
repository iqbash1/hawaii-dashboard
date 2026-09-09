// ============================================================
// Hawaiʻi Dashboard - email subscribe dialog + form
//
// One script on every page with the top nav. Any element carrying
// data-subscribe-open (nav pill, header button, QOTD footer link, Off
// the Charts prompt) opens a <dialog> with the signup form, so the
// reader never leaves the page. Its value names the surface for GA4.
//
//   ?subscribed=1        the confirmation link landed: open the "You're in" state (message only; close with ✕, Esc or the backdrop)
//   ?subscribe=expired   the link was too old: open the form with a message
//   ?subscribe=save      Resend failed on confirm: open the form with a message
//
// The form posts JSON to /api/subscribe and renders the outcome in place.
// Turnstile's script is loaded only when the dialog first opens.
//
// /subscribe/ carries the same form inline as the no-JS and deep-link
// fallback; there the buttons focus that form instead of opening the
// dialog, and ?sent=1 / ?expired=1 / ?error=... (from a plain form post)
// are rendered as messages. Browsers without <dialog> just follow the
// /subscribe/ link.
// ============================================================

(function () {
    'use strict';

    var SITEKEY = '0x4AAAAAAEmoYW_wQl5gwezq';
    var TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

    var MESSAGES = {
        sending:   { ok: true,  text: 'Sending…' },
        sent:      { ok: true,  text: 'Check your inbox and tap the confirmation link to finish.' },
        invalid:   { ok: false, text: 'Please enter your first name and a valid email address.' },
        turnstile: { ok: false, text: 'We could not confirm you are human. Please try again.' },
        send:      { ok: false, text: 'Something went wrong on our side. Please try again in a minute.' },
        save:      { ok: false, text: 'We could not save your subscription. Please open the link in your email again in a minute.' },
        expired:   { ok: false, text: 'That confirmation link has expired. Enter your details again and we will send a fresh one.' }
    };

    function track(name, params) {
        if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
    }

    function show(form, key, text) {
        var m = MESSAGES[key] || MESSAGES.send;
        var status = form.querySelector('.subscribe-status');
        status.textContent = text || m.text;
        status.className = 'subscribe-status ' + (m.ok ? 'subscribe-status--ok' : 'subscribe-status--err');
    }

    // ---- Turnstile (loaded on demand, rendered explicitly in the dialog) ----

    var turnstileLoading = null;
    var widgetId = null;

    function loadTurnstile() {
        if (window.turnstile) return Promise.resolve();
        if (!turnstileLoading) {
            turnstileLoading = new Promise(function (resolve) {
                window.__hdTurnstileReady = resolve;
                var s = document.createElement('script');
                s.src = TURNSTILE_SRC + '?render=explicit&onload=__hdTurnstileReady';
                s.async = true;
                document.head.appendChild(s);
            });
        }
        return turnstileLoading;
    }

    function resetTurnstile() {
        if (!window.turnstile) return;
        if (widgetId !== null) window.turnstile.reset(widgetId);
        else window.turnstile.reset();
    }

    // ---- form submit (shared by the dialog form and the /subscribe/ page form) ----

    function bindForm(form, surface) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var button = form.querySelector('button[type="submit"]');
            var tokenField = form.querySelector('[name="cf-turnstile-response"]');
            var email = form.elements.email.value.trim();
            var payload = {
                first_name: form.elements.first_name.value,
                email: email,
                website: form.elements.website.value,
                'cf-turnstile-response': tokenField ? tokenField.value : ''
            };
            button.disabled = true;
            show(form, 'sending');
            fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                .then(function (res) { return res.json().catch(function () { return {}; }); })
                .then(function (out) {
                    if (out.ok) {
                        form.classList.add('subscribe-form--sent');
                        show(form, 'sent', 'We sent a confirmation link to ' + email + '. Tap it to finish.');
                        track('subscribe_submitted', { surface: surface });
                    } else {
                        show(form, out.error);
                        resetTurnstile();
                    }
                })
                .catch(function () { show(form, 'send'); })
                .then(function () { button.disabled = false; });
        });
    }

    // ---- dialog ----

    var dialog = null;
    var opener = null;

    function formHtml() {
        return '<div class="subscribe-fields">' +
            '<label for="subscribe-dialog-first-name">First name</label>' +
            '<input id="subscribe-dialog-first-name" name="first_name" type="text" autocomplete="given-name" maxlength="40" required>' +
            '<label for="subscribe-dialog-email">Email</label>' +
            '<input id="subscribe-dialog-email" name="email" type="email" autocomplete="email" maxlength="254" required>' +
            '<input class="subscribe-hp" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">' +
            '<div class="subscribe-turnstile"></div>' +
            '<button class="subscribe-btn" type="submit">Subscribe</button>' +
            '</div>' +
            '<p class="subscribe-status" role="status" aria-live="polite"></p>';
    }

    function ensureDialog() {
        if (dialog) return dialog;
        dialog = document.createElement('dialog');
        dialog.className = 'subscribe-dialog';
        dialog.setAttribute('aria-labelledby', 'subscribe-dialog-title');
        dialog.innerHTML = '<button class="modal-close subscribe-dialog-close" type="button" aria-label="Close">&#x2715;</button><div class="subscribe-dialog-body"></div>';
        document.body.appendChild(dialog);
        dialog.querySelector('.subscribe-dialog-close').addEventListener('click', closeDialog);
        dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDialog(); });
        dialog.addEventListener('close', function () {
            if (widgetId !== null && window.turnstile) window.turnstile.remove(widgetId);
            widgetId = null;
            if (opener && opener.focus) opener.focus();
            opener = null;
        });
        return dialog;
    }

    function closeDialog() {
        if (dialog && dialog.open) dialog.close();
    }

    var EYEBROW = '<p class="subscribe-eyebrow">Hawaiʻi Dashboard by email</p>';

    function openAsk(message, trigger) {
        var body = ensureDialog().querySelector('.subscribe-dialog-body');
        opener = trigger || null;
        body.innerHTML = EYEBROW +
            '<h2 id="subscribe-dialog-title" class="subscribe-dialog-title">One question every morning.</h2>' +
            '<p class="subscribe-dialog-lede">The day’s true-or-false question about Hawaiʻi around 6 AM, plus each new Off the Charts post. Unsubscribe any time.</p>' +
            '<form class="subscribe-form" action="/api/subscribe" method="post">' + formHtml() + '</form>' +
            '<p class="subscribe-note">We use your address only for these emails and never share it.</p>';
        var form = body.querySelector('form');
        bindForm(form, trigger ? trigger.getAttribute('data-subscribe-open') || 'nav' : 'link');
        if (message) show(form, message);
        if (!dialog.open) dialog.showModal();
        form.elements.first_name.focus();
        loadTurnstile().then(function () {
            var host = form.querySelector('.subscribe-turnstile');
            if (host && window.turnstile && dialog.open && widgetId === null) {
                widgetId = window.turnstile.render(host, { sitekey: SITEKEY, theme: 'light' });
            }
        });
    }

    function openDone() {
        var body = ensureDialog().querySelector('.subscribe-dialog-body');
        body.innerHTML = EYEBROW +
            '<h2 id="subscribe-dialog-title" class="subscribe-dialog-title">You’re in.</h2>' +
            '<p class="subscribe-dialog-lede">Tomorrow’s question lands in your inbox around 6 AM. New Off the Charts posts arrive as they publish.</p>';
        if (!dialog.open) dialog.showModal();
        dialog.querySelector('.modal-close').focus();
    }

    // ---- wiring ----

    var inline = document.querySelector('.subscribe-form');
    var hasDialog = typeof window.HTMLDialogElement === 'function';

    if (inline) {
        bindForm(inline, 'page');
        var pageParams = new URLSearchParams(window.location.search);
        if (pageParams.get('sent')) show(inline, 'sent');
        else if (pageParams.get('expired')) show(inline, 'expired');
        else if (pageParams.get('error')) show(inline, pageParams.get('error'));
    }

    document.addEventListener('click', function (e) {
        var trigger = e.target.closest ? e.target.closest('[data-subscribe-open]') : null;
        if (!trigger) return;
        if (inline) {
            e.preventDefault();
            inline.scrollIntoView({ block: 'center' });
            inline.elements.first_name.focus();
            return;
        }
        if (!hasDialog) return; // follow the link to /subscribe/
        e.preventDefault();
        track('subscribe_opened', { surface: trigger.getAttribute('data-subscribe-open') || 'nav' });
        openAsk(null, trigger);
    });

    // The confirmation link (and its failure modes) land on the home page
    // with a flag; open the dialog in the matching state, then drop the flag
    // so a refresh does not reopen it.
    if (!inline && hasDialog) {
        var params = new URLSearchParams(window.location.search);
        var flag = params.get('subscribed') ? 'done' : params.get('subscribe');
        if (flag) {
            params.delete('subscribed');
            params.delete('subscribe');
            var rest = params.toString();
            history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : '') + window.location.hash);
            if (flag === 'done') { track('subscribe_confirmed'); openDone(); }
            else openAsk(flag === 'expired' ? 'expired' : 'save', null);
        }
    }
})();
