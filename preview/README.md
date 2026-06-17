# `preview/` — design-decision archive (intentionally retained)

**Do not remove this directory in rot / dead-code / "deep clean" passes.** Being
unreferenced is *by design*: these are `noindex,nofollow` reference artifacts, not
shipped pages. They are deliberately kept as history and have already survived prior
cleanups (last curated in commit `f572ae29`, "deep-clean rot after the May 17
design-system pass").

## What this is

Side-by-side mockups from the May 2026 minimalism audit. Each page renders the live UI
next to the option(s) considered, tagged **SHIPPED · &lt;option that won&gt;**, with a
"what changed" rationale — the record of *why* each shipped UI decision was made.
[`index.html`](index.html) is the catalog.

## Why it's safe to keep (and not "rot")

- Every page carries `<meta name="robots" content="noindex,nofollow">`.
- **Not** copied into `dist/` by `build.sh`; never served in production (~90 KB, repo-only).
- Uses the site's own `css/styles.css`, so production restyles flow through automatically;
  these never touch production CSS/JS.
- Numbers frozen inside a mockup (e.g. "26 metrics") are point-in-time snapshots from
  decision day, **not** live claims — don't "fix" or flag them.

## If you add a mockup

Follow the conventions above and add a row to `index.html`. Post-ship iteration happens
in `js/` and `css/`, not here.
