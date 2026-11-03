// Cloudflare Cron Trigger that starts the "Daily question email" workflow.
//
// GitHub's own schedule for that workflow (01:00 HST) ran 3 to 10 hours late
// through October 2026, so most broadcasts missed their 06:00 HST send. The
// Cloudflare cron fires on time and asks GitHub to run the workflow now via
// workflow_dispatch; the logic stays in scripts/send-qotd-email.js.
//
// Two crons in wrangler.jsonc (11:00 and 13:00 UTC = 01:00 and 03:00 HST):
// the second covers a failed first dispatch. Extra runs are harmless: the
// workflow names the broadcast qotd-<date> and skips when it already exists,
// and its concurrency group runs them one at a time.
//
// Secret (wrangler secret put): GITHUB_DISPATCH_TOKEN, a fine-grained token
// for iqbash1/hawaii-dashboard with Actions: read and write, nothing else.

const DISPATCH_URL = 'https://api.github.com/repos/iqbash1/hawaii-dashboard/actions/workflows/qotd-daily-email.yml/dispatches';

export async function dispatchQotdWorkflow(env) {
    if (!env.GITHUB_DISPATCH_TOKEN) throw new Error('GITHUB_DISPATCH_TOKEN is not set');
    const res = await fetch(DISPATCH_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'hawaiidashboard.org-cron',
            'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: 'main' }),
    });
    // 204 No Content on success. Throwing marks the cron event failed in the
    // Cloudflare dashboard, which is where a broken token shows up first.
    if (res.status !== 204) throw new Error(`workflow dispatch -> HTTP ${res.status} ${await res.text()}`);
}
