# Local runtime dependencies

- `three/three-r128.min.js`: the unchanged Three.js r128 build previously loaded from cdnjs; MIT license in `three/LICENSE`. No engine upgrade.
- `matter/matter-0.20.0.min.js`: Matter.js 0.20.0, used only by the opening screen for ball stacking and grabbing. Unmodified build from [the upstream tag](https://github.com/liabru/matter-js/blob/0.20.0/build/matter.min.js); MIT license in `matter/LICENSE`. Gameplay keeps its existing physics. Size: 83,476 bytes. SHA-256: `72d30be0f579eb02ce1e0b6f9d359a4f392e6837e5a26ba8be5dbee7f88e24ae`.
- `fonts/fonts.css` and content-addressed WOFF2 files: the same Google Fonts families, requested weights, unicode ranges, and `font-display: swap` behavior. Fonts are downloaded unchanged, not subsetted or renamed internally. Duplicate URLs share a local file. Grandstander and Baloo Bhaijaan 2 use the accompanying SIL Open Font License files.
- `manifest.json` records each original URL, byte length, and SHA-256 checksum. These third-party files retain their own licenses; the repository's game license does not replace them.

Keep this directory with `index.html` when deploying, including under a subpath such as `/Dahrooj/`. Keep `.nojekyll` for GitHub Pages. No CDN, Google Fonts service, npm install, or build step is needed by players. Firebase 10.12.2 remains remote and optional for the visit counter only.

