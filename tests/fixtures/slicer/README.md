# Arquivos de fatiador (importar na Calculadora)

| Arquivo | Origem |
|---|---|
| `bambu-a1-2cores-fatiado.3mf` | **Real**: Bambu Studio 2.8.2 CLI, A1 0.4, 2× PLA Basic (azul/branco), 3 chaveiros (Ana, Bia, Caio). Só os XML/JSON de metadados (sem miniaturas e sem o G-code interno). |
| `bambu-a1-2cores.gcode` | **Real**: G-code do mesmo fatiamento; cabeçalho + bloco de configuração + últimas 30 linhas. |
| `projeto-nao-fatiado.3mf` | Real: 3MF gerado pelo UpVision Maker (sem fatiar). |
| `prusa-mk4-2cores.gcode` | Sintético, no formato de comentários do PrusaSlicer 2.8 (estatísticas no fim do arquivo). |
| `cura-1cor.gcode` | Sintético, no formato de cabeçalho do Cura 5 (`;TIME:`, `;Filament used: …m`). |
| `prusa-coreone.bgcode` | Sintético, G-code binário v1 da Prusa (libbgcode): blocos de metadados INI, um deles com deflate, e CRC32. |
| `creality-print-k1.gcode` | **Real**, só os comentários (sem movimentos e sem miniatura): Creality Print 5.1.6, K1, PLA. De `vitordmarchiori/Flapping-Wing-UAV-Prototype` (GitHub), `Washer_1.gcode`. |
| `anycubic-slicer-next-kobra3.gcode` | **Real**, só os comentários: Anycubic Slicer Next 1.3.2, Kobra 3, cubo de calibração. De `HoffmanEngineering/Slic3rPostProcessingUploader` (GitHub, dados de teste). |
| `elegoo-slicer-centauri.gcode` | **Real**, só os comentários: Elegoo Slicer 1.1.8.2, Centauri Carbon, teste de 1ª camada. De `elegooofficial/CentauriCarbon2` (GitHub). |
| `simplify3d-mk3s.gcode` | **Real**, só os comentários: Simplify3D 4.1.2, perfil Zaribo MK3 (PLA). De `Caribou3d/CaribouCartesian` (GitHub), `low_cube-wide.gcode`. |
