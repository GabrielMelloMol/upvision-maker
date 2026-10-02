# Licenças de terceiros

| Componente | Uso | Licença |
|---|---|---|
| vtracer (via `vectortracer`) | Imagem → SVG | MIT |
| manifold-3d | Geometria 3D | Apache-2.0 |
| MediaPipe Tasks Vision + modelos Selfie Segmenter / DeepLab v3 | Modo Silhueta | Apache-2.0 |
| OpenSCAD (via `openscad-wasm-prebuilt`) | Pedir à IA, OpenSCAD personalizável | GPL-2.0-or-later — roda como programa separado num worker; fonte: https://github.com/openscad/openscad |
| BOSL2 v2.0.762 (`src/assets/openscad/bosl2.zip`, com o LICENSE dentro) | OpenSCAD personalizável: só carrega se o .scad usar `include <BOSL2/…>` | BSD-2-Clause — https://github.com/BelfrySCAD/BOSL2 |
| libheif + libde265 (via `libheif-js` 1.23.2, `libheif.wasm`) | Abrir fotos HEIC/HEIF do iPhone no Organizador pela foto | LGPL-3.0 — biblioteca à parte, carregada só para HEIC e substituível (arquivo `.wasm` separado); fonte: https://github.com/strukturag/libheif e https://github.com/catdad-experiments/libheif-js |
| exifr (versão lite) | Ler a focal do EXIF de fotos HEIC | MIT |
| Hanken Grotesk, Fredoka, Pacifico, Lobster, Dancing Script, Playfair Display (Fontsource) | Texto dos modelos | SIL OFL 1.1 |
| three.js, React, opentype.js, fflate, Anthropic SDK | Interface e utilidades | MIT |
