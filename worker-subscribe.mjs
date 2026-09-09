// Email subscriptions for the Hawaiʻi Dashboard: double opt-in.
//
//   POST /api/subscribe   first_name + email (+ Turnstile token) -> confirmation email
//   GET  /api/confirm?t=  signed link from that email -> contact saved in Resend
//
// Subscribers live in Resend (segment RESEND_SEGMENT_ID); the site keeps no
// database, and nothing is stored until the reader clicks the confirmation
// link. The link carries an HMAC-signed, 48-hour token, so the flow is
// stateless. Bot defence is Turnstile plus a honeypot field here and a WAF
// rate-limit rule on the zone (5 POSTs per 10s per IP).
//
// Secrets (wrangler secret put): RESEND_API_KEY, RESEND_SEGMENT_ID,
// TURNSTILE_SECRET_KEY, SUBSCRIBE_SIGNING_KEY. Local dev reads .dev.vars.
//
// Imported by worker.js; unit-tested directly by tests/subscribe.test.js.

const FROM = 'Hawaiʻi Dashboard <hello@hawaiidashboard.org>';
const REPLY_TO = 'iqbal@guild.im';
const POSTAL = 'GUILD Consulting, Manoa Innovation Center, 2800 Woodlawn Drive, Suite 101, Honolulu, HI 96822';
const TOKEN_TTL_SEC = 48 * 60 * 60;
const RESEND_API = 'https://api.resend.com';
const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// ---- validation -------------------------------------------------------------

export function cleanName(value) {
    const name = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (!name || name.length > 40) return '';
    if (/[<>]|https?:|www\./i.test(name) || !/\p{L}/u.test(name)) return '';
    return name;
}

export function cleanEmail(value) {
    const email = String(value == null ? '' : value).trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return '';
    return email;
}

// ---- signed confirmation token ---------------------------------------------

const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

function hmacKey(secret, usage) {
    return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export async function signToken(payload, secret) {
    const body = b64url(enc.encode(JSON.stringify(payload)));
    const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(body));
    return `${body}.${b64url(new Uint8Array(sig))}`;
}

/** The payload object, or null when the token is malformed or not signed with `secret`. */
export async function verifyToken(token, secret) {
    try {
        const [body, sig] = String(token).split('.');
        if (!body || !sig) return null;
        const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), unb64url(sig), enc.encode(body));
        return ok ? JSON.parse(new TextDecoder().decode(unb64url(body))) : null;
    } catch {
        return null;
    }
}

// ---- helpers ---------------------------------------------------------------

const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...NO_STORE } });
const redirect = (origin, path, status = 302) => new Response(null, { status, headers: { Location: origin + path, ...NO_STORE } });
const nowSec = () => Math.floor(Date.now() / 1000);
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function resend(env, method, path, body) {
    try {
        const res = await fetch(RESEND_API + path, {
            method,
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        });
        return { ok: res.ok, status: res.status };
    } catch {
        return { ok: false, status: 0 };
    }
}

async function turnstileOk(token, request, env) {
    if (!token) return false;
    try {
        const res = await fetch(TURNSTILE_VERIFY, {
            method: 'POST',
            body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: request.headers.get('CF-Connecting-IP') || '' }),
        });
        return (await res.json()).success === true;
    } catch {
        return false;
    }
}

export function confirmationEmail(firstName, confirmUrl) {
    const name = escapeHtml(firstName);
    const href = escapeHtml(confirmUrl);
    const promise = "Confirm your email to get the day's true-or-false question every morning around 6 AM, and each new Off the Charts post as it publishes.";
    const fine = "The link works for 48 hours. If you didn't ask for this, ignore this email and nothing will be sent.";
    return {
        subject: 'Confirm your Hawaiʻi Dashboard subscription',
        text: `Aloha ${firstName},\n\nOne tap and you're in. ${promise}\n\nConfirm: ${confirmUrl}\n\n${fine}\n\nHawaiʻi Dashboard, hawaiidashboard.org\n${POSTAL}`,
        html: `<div style="font-family:Inter,-apple-system,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#333;line-height:1.5">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0C7081;font-weight:600;margin:0 0 14px">Hawaiʻi Dashboard</p>
  <h1 style="font-size:22px;font-weight:600;margin:0 0 16px">One tap and you're in.</h1>
  <p>Aloha ${name},</p>
  <p>${promise}</p>
  <p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#0C7081;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">Confirm my email</a></p>
  <p style="font-size:14px;color:#555">${fine}</p>
  <p style="font-size:12px;color:#777;margin-top:28px">Hawaiʻi Dashboard, <a href="https://hawaiidashboard.org" style="color:#0C7081">hawaiidashboard.org</a><br>${POSTAL}</p>
</div>`,
    };
}

// ---- handlers --------------------------------------------------------------

export async function handleSubscribe(request, env) {
    const origin = new URL(request.url).origin;
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST', ...NO_STORE } });

    // js/subscribe.js posts JSON and renders the outcome in place; the bare
    // form (no JS) posts urlencoded and is sent back to /subscribe/ with the
    // outcome in the query string.
    const wantsJson = (request.headers.get('Content-Type') || '').includes('application/json');
    let fields = {};
    try {
        fields = wantsJson ? await request.json() : Object.fromEntries((await request.formData()).entries());
    } catch { /* unreadable body: treated as invalid below */ }
    if (!fields || typeof fields !== 'object') fields = {};
    const done = () => (wantsJson ? json({ ok: true }) : redirect(origin, '/subscribe/?sent=1', 303));
    const fail = (status, error) => (wantsJson ? json({ ok: false, error }, status) : redirect(origin, `/subscribe/?error=${error}`, 303));

    const firstName = cleanName(fields.first_name);
    const email = cleanEmail(fields.email);
    if (!firstName || !email) return fail(400, 'invalid');
    if (fields.website) return done(); // honeypot: hidden from humans, filled by bots; say nothing, send nothing
    if (!(await turnstileOk(fields['cf-turnstile-response'], request, env))) return fail(403, 'turnstile');

    const token = await signToken({ e: email, n: firstName, t: nowSec() }, env.SUBSCRIBE_SIGNING_KEY);
    const mail = confirmationEmail(firstName, `${origin}/api/confirm?t=${token}`);
    const sent = await resend(env, 'POST', '/emails', { from: FROM, to: [email], reply_to: REPLY_TO, ...mail });
    return sent.ok ? done() : fail(502, 'send');
}

// The link opens a fresh tab, so the outcome is shown by the home page:
// js/subscribe.js reads the flag and opens the subscribe dialog in the
// matching state ("You're in", expired, or save failed).
export async function handleConfirm(request, env) {
    const url = new URL(request.url);
    const data = await verifyToken(url.searchParams.get('t'), env.SUBSCRIBE_SIGNING_KEY);
    if (!data || typeof data.t !== 'number' || nowSec() - data.t > TOKEN_TTL_SEC) return redirect(url.origin, '/?subscribe=expired');
    const saved = await saveSubscriber(env, data.e, data.n);
    return redirect(url.origin, saved ? '/?subscribed=1' : '/?subscribe=save');
}

// Put the contact in the readers segment, whether it is new or already known
// (an earlier subscription, an unsubscribe, a second click on the link).
// Resend's POST /contacts answers 201 for an existing address too, but then
// changes nothing: no field update, no segment attached (verified 2026-09-09,
// the first live confirmation landed in no segment at all). So every save
// runs all three calls; each is idempotent.
async function saveSubscriber(env, email, firstName) {
    const id = encodeURIComponent(email);
    const created = await resend(env, 'POST', '/contacts', { email, first_name: firstName, unsubscribed: false });
    if (!created.ok) return false;
    const updated = await resend(env, 'PATCH', `/contacts/${id}`, { first_name: firstName, unsubscribed: false });
    const attached = await resend(env, 'POST', `/contacts/${id}/segments/${env.RESEND_SEGMENT_ID}`);
    return updated.ok && attached.ok;
}
