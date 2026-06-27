# Bundled fonts

These TrueType faces are bundled so the Open Graph image generators render
**identically on a developer's Mac and on the Linux CI runner** that
regenerates and commits the share cards.

## Why this exists

The OG generators (`scripts/generate-og-*.py`) used to resolve fonts only
from macOS system paths (`/System/Library/Fonts/...`). On `ubuntu-latest`
(where `.github/workflows/refresh-data.yml` regenerates the cards) none of
those paths exist, so PIL silently fell back to `ImageFont.load_default()` —
a tiny bitmap font. Every committed card shipped with unreadable bitmap text
and a broken ʻokina. Bundling a real TTF and resolving it **first** makes the
output deterministic regardless of OS.

## Font

**Liberation Sans** (Regular + Bold), version 2.1.5.

- Metric-compatible with Arial (which was already the macOS fallback), so the
  rendered cards are visually close to the previous intended (SF Pro / Arial)
  look.
- Covers U+02BB MODIFIER LETTER TURNED COMMA, the ʻokina used throughout
  "Hawaiʻi".
- Licensed under the SIL Open Font License v1.1 (see `OFL.txt`), which
  permits redistribution inside this repo.

Copyright (c) 2012 Red Hat, Inc.; digitized data copyright (c) 2010 Google
Corporation. Source: the Liberation 2.1.5 release.

All five generators resolve fonts through `scripts/og_font.py`; update the
paths there, not in the individual scripts.
