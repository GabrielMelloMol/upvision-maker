# Arquivos de fatiador (importar na Calculadora)

| Arquivo | Origem |
|---|---|
| `bambu-a1-2cores-fatiado.3mf` | **Real**: Bambu Studio 2.8.2 CLI, A1 0.4, 2× PLA Basic (azul/branco), 3 chaveiros (Ana, Bia, Caio). Só os XML/JSON de metadados (sem miniaturas e sem o G-code interno). |
| `bambu-a1-2cores.gcode` | **Real**: G-code do mesmo fatiamento; cabeçalho + bloco de configuração + últimas 30 linhas. |
| `projeto-nao-fatiado.3mf` | Real: 3MF gerado pelo UpVision Maker (sem fatiar). |
| `prusa-mk4-2cores.gcode` | Sintético, no formato de comentários do PrusaSlicer 2.8 (estatísticas no fim do arquivo). |
| `cura-1cor.gcode` | Sintético, no formato de cabeçalho do Cura 5 (`;TIME:`, `;Filament used: …m`). |
| `prusa-coreone.bgcode` | Sintético, G-code binário v1 da Prusa (libbgcode): blocos de metadados INI, um deles com deflate, e CRC32. |
