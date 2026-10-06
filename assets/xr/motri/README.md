# Motri assets in Dahrooj

From [Motri](https://github.com/3wasfnjd/Motri), itself built on [Folio 2025](https://github.com/brunosimon/folio-2025) by **Bruno Simon**, MIT license (see `LICENSE`).

- `oakTreesVisual.glb`, `birchTreesVisual.glb`, `cherryTreesVisual.glb`: Motri's tree models (`static/*Trees/*TreesVisual.glb`) with the Draco compression removed by glTF-Transform. Geometry, palette texture and node layout are unchanged.
- `foliageSDF.png`: Motri's leaf shape (`static/foliage/foliageSDF.png`), unchanged.

`../nature.js` ports Motri's grass, foliage, trees, bushes, wind, rain, snow, day cycles, seasons, weather, lighting and fog from Three.js r183 TSL to r128 GLSL, with Motri's values.
