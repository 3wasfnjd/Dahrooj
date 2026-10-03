# First chapter verification — 2026-10-03

Tested on Chromium 140 / Playwright 1.55.1 using software WebGL in the execution environment. Portrait viewport: 390 × 844 with touch enabled, pixel ratio 1. Landscape: 844 × 390.

## Complete playable route

Passed using keyboard events through the normal input handlers, without moving the player via debug setters or teleporting:

1. Load all 15 glTF models and their retained textures.
2. Cross all three river jumps as jelly and activate the river checkpoint.
3. Attempt to push the crate as jelly; the crate remains stationary.
4. Transform to clay, push the crate onto the plate, and latch the gate open.
5. Transform back to jelly, clear the crate, and activate the gate checkpoint.
6. Transform to bubble, ride the updraft above the cliff, and land on the plateau.
7. Collect all three optional seeds and trigger the completion screen.

Additional checks passed: full restart resets the puzzle and seeds; pause freezes elapsed simulation time; simultaneous native CDP touch points move and jump; touch cancellation releases movement; falling into the river returns to the checkpoint; landscape resizing produces no document overflow. The test reported zero uncaught page errors and zero HTTP responses with missing/failed assets.

The first automation attempt overshot the crate because its controller continued moving while waiting for slow browser frames. The input controller now releases its keys on the frame that reaches each target. No physics bypass was added to the game.

## Visual review

Reviewed the title screen, river crossing, crate puzzle, updraft, completion screen and portrait/landscape controls. Final visual refinements narrow the gate posts, move a tree away from the wind column, and keep bushes away from the character's initial position. The original three Dahrooj styles remain recognizable in both the picker and game sprite.

## Performance scope

The selected asset folder is 2,417,022 bytes including model geometry, optimized textures, manifest and licenses. This excludes the renderer, loader, scripts, HTML/CSS and fonts. Representative views in the complete-route test rendered approximately 56–74 draw calls and 32,000–43,000 triangles; these are scene workload observations, not phone frame-rate claims.

Software WebGL in this environment was slow (roughly 100–160 ms per rendered frame). Consequently this test establishes game logic, browser loading and visual layout, **not acceptable frame rate on a physical phone**. Hardware iPhone/Android frame rate, thermal behavior and real mobile network startup still need a device check. No Safari compatibility or offline service-worker behavior is claimed.

## Reproduce

```sh
cd tools && npm ci && npx playwright install chromium && cd ..
python3 -m http.server 8766
# In another terminal:
node forest/tools/test-level.mjs
```

Optional environment variables: `FOREST_URL`, `CHROMIUM_PATH`, and `FOREST_TEST_OUTPUT`. The default report/screenshot directory is `test-results/forest/` (gitignored). Tests enable `?test=1`, which exposes only a read-only snapshot function.

All source changes are confined to `forest/`; the original root game remains at the base revision. No branch merge is part of this preview.
