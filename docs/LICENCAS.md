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
| Yale Bright Star Catalogue, 5ª ed. (Hoffleit e Warren, ADC/NASA) → `src/geometry/models/starCatalog.json` (gerado por `scripts/star-catalog.py`) | Mapa estelar: posição e brilho das 1630 estrelas até a magnitude 5 | Dados astronômicos de domínio público — http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz |
| Linhas das constelações do d3-celestial (`data/constellations.lines.json`) → `src/geometry/models/constellationLines.json` (gerado por `scripts/constellation-lines.py`) | Mapa estelar: linhas das 88 constelações. Os dados vêm da página das constelações da IAU, com pequenos ajustes do autor (README do projeto, fonte [3]); o repositório não traz licença separada para os dados, então vale a do projeto | BSD-3-Clause, Copyright (c) 2015, Olaf Frohn — https://github.com/ofrohn/d3-celestial (texto abaixo) |
| Municípios do Brasil do IBGE com coordenadas (`kelvins/municipios-brasileiros`) → `src/data/places/brasil.txt` (gerado por `scripts/build-places.mjs`) | Mapa estelar: busca offline dos 5.570 municípios, com UF e fuso | MIT, Copyright (c) 2016 Kelvin S. do Prado — https://github.com/kelvins/municipios-brasileiros (dados do IBGE) |
| GeoNames, `cities15000` → `src/data/places/mundo.txt` (gerado por `scripts/build-places.mjs`) | Mapa estelar: busca offline das cidades do mundo com mais de 15 mil habitantes | CC-BY 4.0 — © GeoNames, https://www.geonames.org (atribuição mostrada no campo de lugar) |
| `tz-lookup` e seus limites de fuso (timezone-boundary-builder) | Mapa estelar: fuso horário (nome IANA) pela latitude e longitude, offline | Código CC0 1.0; dados de fuso ODbL 1.0 © colaboradores do OpenStreetMap — https://github.com/evansiroky/timezone-boundary-builder |
| Nominatim / OpenStreetMap (serviço online, só a pedido da pessoa) | Mapa estelar: busca de endereço completo | Dados ODbL 1.0 © colaboradores do OpenStreetMap; política de uso: 1 consulta por segundo, sem repetir consultas, atribuição visível (feito em `src/domain/geocode.ts`) |
| three.js, React, opentype.js, fflate, Anthropic SDK | Interface e utilidades | MIT |

## Texto da licença do d3-celestial (linhas das constelações)

Copyright (c) 2015, Olaf Frohn
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
