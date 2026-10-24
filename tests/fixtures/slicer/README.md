# Arquivos de fatiador (importar na Calculadora)

| Arquivo | Origem |
|---|---|
| `bambu-a1-2cores-fatiado.3mf` | **Real**: Bambu Studio 2.8.2 CLI, A1 0.4, 2× PLA Basic (azul/branco), 3 chaveiros (Ana, Bia, Caio). Só os XML/JSON de metadados (sem miniaturas e sem o G-code interno). |
| `bambu-a1-2cores.gcode` | **Real**: G-code do mesmo fatiamento; cabeçalho + bloco de configuração + últimas 30 linhas. |
| `bambu-a1-suporte-normal.gcode.gz` | **Real**: Bambu Studio 2.8.2 CLI, A1 0.4, PLA Basic, peça em T (40 × 20 mm em balanço a 20 mm) com suporte normal: 7,04 g, dos quais ~3,7 g de suporte (`; FEATURE: Support`). Com suporte em árvore a mesma peça dá 5,60 g (~2,2 g de suporte). G-code inteiro, comprimido. |
| `bambu-a1-4cores-torre-fatiado.3mf` | **Real** (#147): Bambu Studio 2.8.2 CLI, A1 0.4, 4× PLA Basic, 4 cubos de 15 × 15 × 6 mm lado a lado (89 trocas), torre ligada, com o G-code dentro. `used_g` = 6,12 / 11,47 / 9,47 / 8,94 g: a purga (~28 g) e a torre (~4,3 g) estão dentro. |
| `bambu-a1-4cores-fatiado.3mf` | **Real**: o mesmo, sem torre (31,70 g no total). |
| `bambu-a1-2cores-1troca-fatiado.3mf` | **Real**: Bambu Studio 2.8.2, placa azul de 30 mm com quadrado branco em cima (1 troca). Branco: `used_g` 0,75 g, dos quais 0,73 g de purga. |
| `orca-a1-2cores-fatiado.3mf` / `orca-a1-2cores.gcode.gz` | **Real**: OrcaSlicer 2.4.2, mesma peça de 1 troca. Branco: 0,19 g, **sem** a purga (~0,18 g no G-code). No G-code a `flush_volumes_matrix` já vem × `flush_multiplier`. |
| `projeto-nao-fatiado.3mf` | Real: 3MF gerado pelo UpVision Maker (sem fatiar). |
| `prusa-mk4-2cores.gcode` | Sintético, no formato de comentários do PrusaSlicer 2.8 (estatísticas no fim do arquivo). |
| `cura-1cor.gcode` | Sintético, no formato de cabeçalho do Cura 5 (`;TIME:`, `;Filament used: …m`). |
| `prusa-coreone.bgcode` | Sintético, G-code binário v1 da Prusa (libbgcode): blocos de metadados INI, um deles com deflate, e CRC32. |
| `creality-print-k1.gcode` | **Real**, só os comentários (sem movimentos e sem miniatura): Creality Print 5.1.6, K1, PLA. De `vitordmarchiori/Flapping-Wing-UAV-Prototype` (GitHub), `Washer_1.gcode`. |
| `anycubic-slicer-next-kobra3.gcode` | **Real**, só os comentários: Anycubic Slicer Next 1.3.2, Kobra 3, cubo de calibração. De `HoffmanEngineering/Slic3rPostProcessingUploader` (GitHub, dados de teste). |
| `elegoo-slicer-centauri.gcode` | **Real**, só os comentários: Elegoo Slicer 1.1.8.2, Centauri Carbon, teste de 1ª camada. De `elegooofficial/CentauriCarbon2` (GitHub). |
| `simplify3d-mk3s.gcode` | **Real**, só os comentários: Simplify3D 4.1.2, perfil Zaribo MK3 (PLA). De `Caribou3d/CaribouCartesian` (GitHub), `low_cube-wide.gcode`. |
