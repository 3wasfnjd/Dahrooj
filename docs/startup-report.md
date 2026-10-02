# Startup independence verification

Baseline: `4001baefa83897212d481d0ad5d7a29b461d6b9d`.

All checks passed in mobile Chromium and WebKit emulation at 390×844: five styles × six modes = 30 combinations per browser, with every third-party request blocked. Verified active mode/style buttons, real WebGL draws, pointer gestures, challenge panel and both font families. Also checked a 320×568 viewport with navigator.onLine=false and the 8-second optional Firebase SDK timeout. Uncaught JavaScript errors / unhandled rejections: zero.

| Initial payload (Chromium) | Before | After |
|---|---:|---:|
| Decoded bytes | 763913 | 763235 |
| Gzip-text + WOFF2 estimate, bytes | 227873 | 228022 |
| Startup responses | 4 | 4 |

The difference is not a promise of faster FPS or less total download: the original engine/font bytes are preserved. The change removes the external startup dependency, not the need to initially reach the game's own host. Firebase is excluded from the startup budget and remains optional.

**Measurement:** Cold browser contexts at /Dahrooj/; original external startup resources replayed from the identical vendored bytes, not live Firebase. Decoded payload bytes and a reproducible gzip estimate (gzip text, leave WOFF2 compressed); excludes HTTP headers, optional Firebase and elapsed network time.

**Limits:** Automated mobile viewport emulation, not a physical iPhone/Android performance measurement. Failed external requests may produce browser network diagnostics; uncaught JavaScript exceptions and unhandled rejections must be zero. Offline tests still serve the first-party page: no offline cache/service worker is claimed.

The gameplay/rendering code preceding the counter and the mode/style/frame handlers were compared byte-for-byte with the requested revision. They are unchanged. Original font weights, unicode ranges, font-display and UI styles remain unchanged. Detailed per-browser/font-path results: [startup-report.json](startup-report.json). Screenshots are in the corresponding GitHub Actions artifact, not shipped with the game.
