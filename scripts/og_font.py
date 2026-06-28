#!/usr/bin/env python3
"""Shared font resolver for the Open Graph image generators.

Every OG generator (generate-og-pages.py, generate-og-image.py,
generate-og-change-summary.py, generate-og-off-the-charts.py and
generate-og-off-the-charts-posts.py) resolves fonts through here so a card
renders identically on a developer's Mac and on the Linux CI runner that
regenerates and commits the assets.

The repo-bundled Liberation Sans faces (assets/fonts/) are searched FIRST.
Liberation Sans is metric-compatible with Arial -- which was already the third
entry in the old macOS fallback list -- is licensed under the SIL OFL 1.1
(safe to redistribute, see assets/fonts/OFL.txt) and covers U+02BB, the ʻokina
in "Hawaiʻi". The macOS system fonts are kept only as a local convenience
fallback. They used to be the *only* sources, which is why CI -- where none of
those paths exist -- silently fell through to PIL's tiny bitmap
ImageFont.load_default() and shipped unreadable share cards.

Import it from any generator regardless of the working directory:

    import os, sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from og_font import og_font
"""
import os

from PIL import ImageFont

_FONTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          '..', 'assets', 'fonts')

# Bundled faces first (deterministic across OSes); macOS paths are a
# local-only fallback and are never reached in CI.
_REGULAR = [
    os.path.join(_FONTS_DIR, 'LiberationSans-Regular.ttf'),
    '/System/Library/Fonts/SFNS.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
]
_BOLD = [
    os.path.join(_FONTS_DIR, 'LiberationSans-Bold.ttf'),
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/System/Library/Fonts/SFNS.ttf',
]

_cache = {}


def og_font(size, bold=False):
    """Return a PIL truetype font of ``size`` px.

    Bundled Liberation Sans is tried first so Mac and CI renders are
    identical; the macOS system fonts follow as a local fallback. As a last
    resort PIL's bitmap default is returned so a missing-font environment
    degrades loudly-but-safely rather than raising.
    """
    key = (size, bool(bold))
    if key in _cache:
        return _cache[key]
    for path in (_BOLD if bold else _REGULAR):
        try:
            f = ImageFont.truetype(path, size)
            _cache[key] = f
            return f
        except (IOError, OSError):
            continue
    f = ImageFont.load_default()
    _cache[key] = f
    return f
