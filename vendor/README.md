# Local runtime dependencies

- `three/three-r128.min.js`: the unchanged Three.js r128 build previously loaded from cdnjs; MIT license in `three/LICENSE`. No engine upgrade.
- `fonts/fonts.css` and content-addressed WOFF2 files: the same Google Fonts families, requested weights, unicode ranges, and `font-display: swap` behavior. Fonts are downloaded unchanged, not subsetted or renamed internally. Duplicate URLs share a local file. Grandstander and Baloo Bhaijaan 2 use the accompanying SIL Open Font License files.
- `manifest.json` records each original URL, byte length, and SHA-256 checksum. These third-party files retain their own licenses; the repository's game license does not replace them.

Keep this directory with `index.html` when deploying, including under a subpath such as `/Dahrooj/`. Keep `.nojekyll` for GitHub Pages. No CDN, Google Fonts service, npm install, or build step is needed by players. Firebase 10.12.2 remains remote and optional for the visit counter only.

`python3 tools/vendor-startup.py` verifies the pinned files offline on subsequent runs; it does not silently update them. The source-font CSS in `tools/fixtures/` is solely a before/after test fixture and is not loaded by the game.
