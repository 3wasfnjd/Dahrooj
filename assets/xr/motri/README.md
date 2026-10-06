# Motri assets in Dahrooj

From [Motri](https://github.com/3wasfnjd/Motri), itself built on [Folio 2025](https://github.com/brunosimon/folio-2025) by **Bruno Simon**, MIT license (see `LICENSE`).

- `oakTreesVisual.glb`, `birchTreesVisual.glb`, `cherryTreesVisual.glb`: Motri's tree models (`static/*Trees/*TreesVisual.glb`) with the Draco compression removed by glTF-Transform. Geometry, palette texture and node layout are unchanged.
- `foliageSDF.png`: Motri's leaf shape (`static/foliage/foliageSDF.png`), unchanged.
- `slabs.png`: Motri's stone floor slabs (`static/floor/slabs.png`), unchanged; coloured and blended as in `Floor.js`.
- `poleLight.glb`, `lantern.glb`, `bench.glb`, `explosiveCrate.glb`: one of each from Motri's `poleLights`, `lanterns`, `benches` and `explosiveCrates` models, taken out of the instanced groups by glTF-Transform (colliders dropped, Draco removed). Geometry and palette unchanged.
- `bowlingPin.glb`: Motri's bowling pin (`refPinPhysicalDynamic` in `static/areas/areas.glb`), on its own, Draco removed. Pin layout from `BowlingArea.js` (`refPinPositions`).

`../nature.js` ports Motri's grass, foliage, trees, bushes, wind, rain, snow, day cycles, seasons, weather, lighting and fog, the stone floor, pole lights with fireflies, lanterns, benches, explosive crates and fireballs from Three.js r183 TSL to r128 GLSL, with Motri's values. The bowling stage in `../../../index.html` uses Motri's pin and pin layout. Sounds are not copied (Motri's own sounds carry third-party licences); the game makes its own.
