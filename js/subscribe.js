// ============================================================
// Hawaiʻi Dashboard - email subscribe form
//
// Progressive enhancement for .subscribe-form (the /subscribe/ page).
// Posts JSON to /api/subscribe and renders the outcome in place, so the
// reader never leaves the page. Without JS the form still posts normally
// and the Worker redirects back here with the outcome in the query string
// (?sent=1, ?expired=1, ?error=...), which this script also renders.
// ============================================================

(function () {
    'use strict';

    var form = document.querySelector('.subscribe-form');
    if (!form) return;
    var status = form.querySelector('.subscribe-status');

    var MESSAGES = {
        sending:   { ok: true,  text: 'Sending…' },
        sent:      { ok: true,  text: 'Check your inbox and tap the confirmation link to finish.' },
        invalid:   { ok: false, text: 'Please enter your first name and a valid email address.' },
        turnstile: { ok: false, text: 'We could not confirm you are human. Please try again.' },
        send:      { ok: false, text: 'Something went wrong on our side. Please try again in a minute.' },
        save:      { ok: false, text: 'We could not save your subscription. Please open the link in your email again in a minute.' },
        expired:   { ok: false, text: 'That confirmation link has expired. Enter your details again and we will send a fresh one.' }
    };

    function show(key, text) {
        var m = MESSAGES[key] || MESSAGES.send;
        status.textContent = text || m.text;
        status.className = 'subscribe-status ' + (m.ok ? 'subscribe-status--ok' : 'subscribe-status--err');
    }

    var params = new URLSearchParams(window.location.search);
    if (params.get('sent')) show('sent');
    else if (params.get('expired')) show('expired');
    else if (params.get('error')) show(params.get('error'));

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
        show('sending');
        fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function (res) { return res.json().catch(function () { return {}; }); })
            .then(function (out) {
                if (out.ok) {
                    form.classList.add('subscribe-form--sent');
                    show('sent', 'We sent a confirmation link to ' + email + '. Tap it to finish.');
                } else {
                    show(out.error);
                    if (window.turnstile) window.turnstile.reset();
                }
            })
            .catch(function () { show('send'); })
            .then(function () { button.disabled = false; });
    });
})();
