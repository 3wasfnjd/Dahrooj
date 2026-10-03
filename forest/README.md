# دحروج: الغابة المسحورة

A separate, playable first chapter for the existing Dahrooj character. The original game at the repository root is unchanged. Built from `main` at `087f978`, without the rejected muscular-character changes.

## Play

Serve the repository root with any static HTTP server, then open `/forest/`.

```sh
python3 -m http.server 8766
# http://localhost:8766/forest/
```

- Move: on-screen left/right, arrow keys, or A / D.
- Jump: on-screen button, Space, W, or Up. A short press makes a shorter jelly jump.
- Transform: the three character buttons or 1 / 2 / 3.
- Jelly jumps across the river and over the crate.
- Clay pushes the wooden crate onto the brass plate; the gate stays open.
- Bubble rises automatically in the marked wind current; the action button increases lift.
- Collect three optional light seeds and reach the glowing chest to finish.
- Escape pauses/resumes. The pause menu has sound and restart controls.

There are checkpoints after the river, gate, and cliff. Falling resets the character to the latest checkpoint without undoing collected seeds or the solved gate. Restart resets the full level. There is no persistent saved game between page loads.

## Art and assets

The original Dahrooj canvas painting functions (jelly, clay, bubble, face, bandaid and thumbprint) are reused in `character.js`, then displayed as a canvas-textured sprite in the 3D scene. Character shape and textures have not been redesigned.

The 15 selected 3D models come from the free **Standard** versions of:

- [Quaternius Stylized Nature Megakit](https://quaternius.itch.io/stylized-nature-megakit): 10 selected from the 68-model Standard pack.
- [Quaternius Fantasy Props Megakit](https://quaternius.itch.io/fantasy-props-megakit): 5 selected from the 94-model Standard pack.

Source licenses are preserved under `assets/licenses/`. Both packs use CC0. `assets/manifest.json` lists all selected models and triangle counts. The selected models and shared optimized textures occupy approximately 2.4 MB uncompressed on disk; this is not the total page transfer size. Three.js, its loader, the character code and local fonts are additional.

`tools/prepare-assets.py` reproduces asset preparation from extracted free downloads:

```sh
python3 forest/tools/prepare-assets.py /path/to/extracted-packs
# Expected subdirectories: nature/glTF/, props/glTF/, and each License_Standard.txt.
```

The script retains geometry, removes normal/ORM texture references, and resizes retained base-color textures to 512px maximum. Alpha textures stay PNG; opaque textures become JPEG. The paid pack shaders are not included. Terrain, mist, wind, light seeds and sound effects are made in code.

Three.js r128 is reused from `../vendor/three/`; the matching GLTFLoader is vendored locally in `vendor/`. The Three.js MIT license remains in `../vendor/three/LICENSE`. All game resources load from the same origin, with no external asset CDN required at runtime.

## Scope and verification

This is one complete first-level prototype: movement, three abilities, crate/plate/gate puzzle, wind ascent, collectible seeds, checkpoints, pause, mute, restart and completion. Physics runs at a fixed 120 Hz step; art refreshes at approximately 30 Hz. Rendering caps pixel ratio, shares mesh resources and hides distant decorations. A `?test=1` URL exposes a read-only `window.forestDebug()` state snapshot for integration tests; it offers no state setters or teleports.

Browser verification and limitations are documented in `verification.md`. Emulated mobile viewports do not replace testing on physical iPhone / Android hardware.

## Credits

**Aboden Games** — Dahrooj character and original game, [github.com/3wasfnjd/Dahrooj](https://github.com/3wasfnjd/Dahrooj). See the root `LICENSE` for attribution requirements.

**Quaternius** — nature and prop models, CC0. **Three.js contributors** — renderer and glTF loader, MIT. No generated images or paid assets are required by this level.
