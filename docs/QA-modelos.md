# QA dos Modelos prontos e ferramentas (#90)

Gerado por `scripts/validate-models` (não edite à mão: os dados ficam em `docs/qa-modelos.json`; cada rodada só troca os casos que rodou).

Para cada modelo: valores **padrão**, todos os campos numéricos no **mínimo** e todos no **máximo**. Cada caso vira um 3MF
(com as pausas e a configuração recomendada da #86) e passa por:

- **geometria:** malha manifold, nada abaixo da mesa, cada objeto encostado na mesa, nenhum corpo solto no ar, cabe em 256 mm,
  parede/traço < 0,4 mm (abertura de 0,2 mm num corte a 10/30/50/70/90% da altura → aviso), extrusora de cada parte = sua cor, até 4 cores (AMS lite);
- **Bambu Studio CLI** — perfil Bambu Lab A1 0.4 + 0.20mm Standard + Bambu PLA Basic, herança resolvida,
  `--arrange 1`: fatiou, gramas > 0, cabe numa placa, pausas `M400 U1` no Z pedido (até 0,21 mm), tempo < 24 h.
  Fatia com **um filamento**: o CLI 02.08 cai (código 139, group_nozzle_info) com 2+ filamentos em perfis resolvidos,
  então a troca de cores é conferida no 3MF, não no G-code.
- **OrcaSlicer:** não instalado nas máquinas da equipe; o 3MF segue o mesmo formato (Metadata/model_settings.config).

"n/a" = o modelo precisa de uma entrada que o teste não dá (ex.: foto). "app:" = aviso que o próprio app mostra na tela.


**Total:** 110 casos · 90 ok · 13 com aviso · 7 com falha · 0 n/a

## Forja

| Modelo | Valores | Resultado | Tempo (min) | PLA (g) | Placas | Pausas (Z) | Motivo |
|---|---|---|---:|---:|---:|---|---|
| Nome articulado (articulatedName) | máximo | ✅ ok | 47 | 23,6 | 1 | – | app: Dobradiça com folga de 0,6 mm: imprima um teste; se as letras grudarem, aumente a folga. |
| Nome articulado (articulatedName) | mínimo | ✅ ok | 12 | 3,9 | 1 | – | app: Dobradiça com folga de 0,15 mm: imprima um teste; se as letras grudarem, aumente a folga. |
| Nome articulado (articulatedName) | padrão | ✅ ok | 18 | 7,0 | 1 | – | app: Dobradiça com folga de 0,3 mm: imprima um teste; se as letras grudarem, aumente a folga. |
| Clicker (clicker) | máximo | ✅ ok | 11 | 4,8 | 1 | – | app: Encaixe feito para chave tipo Cherry MX (e compatíveis). Imprima a chapa e a cruz primeiro: se ficar justo, aumente as folgas.; app: A chave entra por cima na chapa do corpo; a tecla encaixa na haste. |
| Clicker (clicker) | mínimo | ✅ ok | 10 | 4,1 | 1 | – | app: Encaixe feito para chave tipo Cherry MX (e compatíveis). Imprima a chapa e a cruz primeiro: se ficar justo, aumente as folgas.; app: A chave entra por cima na chapa do corpo; a tecla encaixa na haste. |
| Clicker (clicker) | padrão | ✅ ok | 11 | 4,2 | 1 | – | app: Encaixe feito para chave tipo Cherry MX (e compatíveis). Imprima a chapa e a cruz primeiro: se ficar justo, aumente as folgas.; app: A chave entra por cima na chapa do corpo; a tecla encaixa na haste. |
| Chaveiro anilha (gymKeychain) | máximo | ✅ ok | 18 | 13,3 | 1 | – | – |
| Chaveiro anilha (gymKeychain) | mínimo | ✅ ok | 4 | 1,6 | 1 | – | – |
| Chaveiro anilha (gymKeychain) | padrão | ✅ ok | 8 | 4,4 | 1 | – | – |
| Chaveiro de logo (logoKeychain) | máximo | ✅ ok | 40 | 33,1 | 1 | – | – |
| Chaveiro de logo (logoKeychain) | mínimo | ✅ ok | 2 | 0,5 | 1 | – | – |
| Chaveiro de logo (logoKeychain) | padrão | ✅ ok | 8 | 4,2 | 1 | – | – |
| Chaveiro espelho (mirror) | máximo | ✅ ok | 25 | 17,9 | 1 | – | app: Espelho de 60 mm × 4 mm: cole no bolsão com cola para espelho. |
| Chaveiro espelho (mirror) | mínimo | ✅ ok | 4 | 2,0 | 1 | – | app: Espelho de 20 mm × 1 mm: cole no bolsão com cola para espelho. |
| Chaveiro espelho (mirror) | padrão | ✅ ok | 10 | 6,2 | 1 | – | app: Espelho de 40 mm × 2 mm: cole no bolsão com cola para espelho. |
| Chaveiro NFC (nfc) | máximo | ✅ ok | 18 | 14,5 | 1 | 3,40 | app: Pausa em Z = 3,52 mm: a impressora para, você coloca a tag no bolsão e retoma.; app: OrcaSlicer e PrusaSlicer já abrem com a pausa. Para o Bambu Studio, use “Projeto do Bambu Studio (pausa pronta)”. |
| Chaveiro NFC (nfc) | mínimo | ✅ ok | 8 | 2,2 | 1 | 1,40 | app: Pausa em Z = 1,44 mm: a impressora para, você coloca a tag no bolsão e retoma.; app: OrcaSlicer e PrusaSlicer já abrem com a pausa. Para o Bambu Studio, use “Projeto do Bambu Studio (pausa pronta)”. |
| Chaveiro NFC (nfc) | padrão | ✅ ok | 7 | 3,5 | 1 | 2,00 | app: Pausa em Z = 2,00 mm: a impressora para, você coloca a tag no bolsão e retoma.; app: OrcaSlicer e PrusaSlicer já abrem com a pausa. Para o Bambu Studio, use “Projeto do Bambu Studio (pausa pronta)”. |
| Chaveiro abridor (opener) | máximo | ✅ ok | 18 | 16,0 | 1 | – | app: Peça que faz força: imprima com 4+ paredes e 40%+ de preenchimento; PETG aguenta mais que PLA. |
| Chaveiro abridor (opener) | mínimo | ✅ ok | 28 | 8,6 | 1 | – | app: Peça que faz força: imprima com 4+ paredes e 40%+ de preenchimento; PETG aguenta mais que PLA. |
| Chaveiro abridor (opener) | padrão | ✅ ok | 16 | 9,9 | 1 | – | app: Peça que faz força: imprima com 4+ paredes e 40%+ de preenchimento; PETG aguenta mais que PLA. |
| Topo de lápis (pencilTopper) | máximo | ✅ ok | 28 | 15,6 | 1 | – | app: Furo de 12 mm: lápis comum tem ~7,5 mm. Se ficar justo ou folgado, ajuste e imprima de novo. |
| Topo de lápis (pencilTopper) | mínimo | ✅ ok | 7 | 2,4 | 1 | – | app: Furo de 5 mm: lápis comum tem ~7,5 mm. Se ficar justo ou folgado, ajuste e imprima de novo. |
| Topo de lápis (pencilTopper) | padrão | ✅ ok | 12 | 4,9 | 1 | – | app: Furo de 7,8 mm: lápis comum tem ~7,5 mm. Se ficar justo ou folgado, ajuste e imprima de novo. |
| Tag de pet (petTag) | máximo | ✅ ok | 17 | 6,4 | 1 | – | – |
| Tag de pet (petTag) | mínimo | ✅ ok | 3 | 0,6 | 1 | – | app: O nome encosta na borda da tag e foi cortado: arraste de volta ou use "Centralizar tudo". |
| Tag de pet (petTag) | padrão | ✅ ok | 8 | 2,3 | 1 | – | – |
| Chaveiro giratório (spinner) | máximo | ✅ ok | 27 | 17,2 | 1 | – | – |
| Chaveiro giratório (spinner) | mínimo | ✅ ok | 6 | 2,5 | 1 | – | – |
| Chaveiro giratório (spinner) | padrão | ✅ ok | 9 | 4,7 | 1 | – | – |
| Medalha adaptável (adaptiveMedal) | máximo | ✅ ok | 74 | 66,8 | 1 | – | – |
| Medalha adaptável (adaptiveMedal) | mínimo | ✅ ok | 7 | 3,3 | 1 | – | – |
| Medalha adaptável (adaptiveMedal) | padrão | ✅ ok | 17 | 11,1 | 1 | – | – |
| Troféu adaptável (adaptiveTrophy) | máximo | ⚠️ aviso | 182 | 175,6 | 1 | – | o conjunto arrumado ocupa 210,6 × 291,5 mm: passa da mesa de 256 mm |
| Troféu adaptável (adaptiveTrophy) | mínimo | ✅ ok | 41 | 32,8 | 1 | – | – |
| Troféu adaptável (adaptiveTrophy) | padrão | ✅ ok | 68 | 55,3 | 1 | – | – |
| Topo de bolo (cake) | máximo | ❌ falha | – | – | – | – | "Ana" não cabe na mesa de 256 mm (266,0 × 290,6 × 9,0 mm); Bambu Studio: One of the plate is empty or has no object fully inside it. Please check that the 3mf contains no empty plate in Bambu Studio before uploading. (código -50) |
| Topo de bolo (cake) | mínimo | ✅ ok | 11 | 5,4 | 1 | – | – |
| Topo de bolo (cake) | padrão | ✅ ok | 47 | 28,9 | 1 | – | – |
| Floco de neve com nome (snowflake) | máximo | ✅ ok | 59 | 25,8 | 1 | – | – |
| Floco de neve com nome (snowflake) | mínimo | ✅ ok | 6 | 1,6 | 1 | – | – |
| Floco de neve com nome (snowflake) | padrão | ✅ ok | 13 | 4,5 | 1 | – | – |
| Troféu (trophy) | máximo | ⚠️ aviso | 119 | 95,9 | 1 | – | o conjunto arrumado ocupa 352,0 × 179,2 mm: passa da mesa de 256 mm |
| Troféu (trophy) | mínimo | ⚠️ aviso | 19 | 10,2 | 1 | – | "Placa": parede/traço < 0,4 mm em Z 2,6 mm |
| Troféu (trophy) | padrão | ✅ ok | 36 | 24,7 | 1 | – | – |
| Troféu elegante (trophyElegant) | máximo | ⚠️ aviso | 118 | 100,8 | 1 | – | o conjunto arrumado ocupa 295,0 × 158,0 mm: passa da mesa de 256 mm |
| Troféu elegante (trophyElegant) | mínimo | ✅ ok | 20 | 11,4 | 1 | – | – |
| Troféu elegante (trophyElegant) | padrão | ✅ ok | 38 | 25,4 | 1 | – | – |
| Placa adaptável (adaptivePlate) | máximo | ❌ falha | – | – | – | – | "Placa" não cabe na mesa de 256 mm (270,0 × 276,9 × 12,0 mm); Bambu Studio: One of the plate is empty or has no object fully inside it. Please check that the 3mf contains no empty plate in Bambu Studio before uploading. (código -50) |
| Placa adaptável (adaptivePlate) | mínimo | ✅ ok | 2 | 0,5 | 1 | – | – |
| Placa adaptável (adaptivePlate) | padrão | ✅ ok | 41 | 32,4 | 1 | – | – |
| Cartão de visita (businessCard) | máximo | ⚠️ aviso | 19 | 15,1 | 1 | – | "Ana Souza": parede/traço < 0,4 mm em Z 3,8 mm; app: Cada módulo ficou com 1,03 mm: aumente a placa ou encurte o texto (mínimo recomendado 1,2 mm). |
| Cartão de visita (businessCard) | mínimo | ⚠️ aviso | 20 | 7,4 | 1 | – | "Ana Souza": parede/traço < 0,4 mm em Z 1,4 mm; app: Cada módulo ficou com 1,03 mm: aumente a placa ou encurte o texto (mínimo recomendado 1,2 mm). |
| Cartão de visita (businessCard) | padrão | ⚠️ aviso | 15 | 9,6 | 1 | – | "Ana Souza": parede/traço < 0,4 mm em Z 2,0 mm; app: Cada módulo ficou com 1,03 mm: aumente a placa ou encurte o texto (mínimo recomendado 1,2 mm). |
| Plaquinha de colorir (coloring) | máximo | ✅ ok | 161 | 128,6 | 1 | – | – |
| Plaquinha de colorir (coloring) | mínimo | ✅ ok | 5 | 2,6 | 1 | – | – |
| Plaquinha de colorir (coloring) | padrão | ✅ ok | 23 | 16,1 | 1 | – | – |
| MOLLE tag (molle) | máximo | ✅ ok | 38 | 28,7 | 1 | – | – |
| MOLLE tag (molle) | mínimo | ✅ ok | 29 | 20,9 | 1 | – | – |
| MOLLE tag (molle) | padrão | ✅ ok | 32 | 23,3 | 1 | – | – |
| Totem NFC (nfcTotem) | máximo | ⚠️ aviso | 151 | 149,0 | 1 | 3,40 | o conjunto arrumado ocupa 170,0 × 265,0 mm: passa da mesa de 256 mm; app: Pausa em Z = 3,52 mm: coloque a tag NFC (grave o link de avaliação antes) e retome. |
| Totem NFC (nfcTotem) | mínimo | ✅ ok | 63 | 23,5 | 1 | 1,40 | app: Pausa em Z = 1,44 mm: coloque a tag NFC (grave o link de avaliação antes) e retome. |
| Totem NFC (nfcTotem) | padrão | ✅ ok | 56 | 42,7 | 1 | 2,00 | app: Pausa em Z = 2,00 mm: coloque a tag NFC (grave o link de avaliação antes) e retome. |
| Placa Pix (pix) | máximo | ⚠️ aviso | 302 | 204,7 | 1 | – | o conjunto arrumado ocupa 200,0 × 276,0 mm: passa da mesa de 256 mm |
| Placa Pix (pix) | mínimo | ✅ ok | 29 | 17,7 | 1 | – | app: Cada módulo ficou com 1,03 mm: aumente a placa ou encurte o texto (mínimo recomendado 1,2 mm). |
| Placa Pix (pix) | padrão | ✅ ok | 61 | 37,4 | 1 | – | – |
| Placa de profissão (profession) | máximo | ✅ ok | 144 | 142,7 | 1 | 8,20 | app: Três peças: cole o símbolo no rebaixo da placa e encaixe a placa na base.; app: Pausa em Z = 8,32 mm: coloque moedas ou arruelas nos 2 bolsões da base e retome (a base fica pesada e não tomba). |
| Placa de profissão (profession) | mínimo | ✅ ok | 88 | 32,5 | 1 | 8,04 | app: Três peças: cole o símbolo no rebaixo da placa e encaixe a placa na base.; app: Pausa em Z = 8,08 mm: coloque moedas ou arruelas nos 2 bolsões da base e retome (a base fica pesada e não tomba). |
| Placa de profissão (profession) | padrão | ✅ ok | 74 | 56,6 | 1 | 8,20 | app: Três peças: cole o símbolo no rebaixo da placa e encaixe a placa na base.; app: Pausa em Z = 8,20 mm: coloque moedas ou arruelas nos 2 bolsões da base e retome (a base fica pesada e não tomba). |
| Placa com vários QRs (qrList) | máximo | ✅ ok | 202 | 125,9 | 1 | – | – |
| Placa com vários QRs (qrList) | mínimo | ✅ ok | 35 | 22,2 | 1 | – | app: Cada módulo ficou com 0,76 mm: aumente a placa ou encurte o texto (mínimo recomendado 1,2 mm).; app: Cada módulo ficou com 0,86 mm: aumente a placa ou encurte o texto (mínimo recomendado 1,2 mm). |
| Placa com vários QRs (qrList) | padrão | ✅ ok | 75 | 49,3 | 1 | – | – |
| Placa QR (qrPlate) | máximo | ❌ falha | 34 | 23,9 | 1 | – | "Wi-Fi" não cabe na mesa de 256 mm (200,0 × 260,0 × 9,0 mm); o conjunto arrumado ocupa 200,0 × 300,0 mm: passa da mesa de 256 mm |
| Placa QR (qrPlate) | mínimo | ⚠️ aviso | 30 | 18,6 | 1 | – | "Wi-Fi": parede/traço < 0,4 mm em Z 2,2 mm |
| Placa QR (qrPlate) | padrão | ✅ ok | 61 | 39,7 | 1 | – | – |
| Placa de sinalização (sign) | máximo | ❌ falha | – | – | – | – | "Placa" não cabe na mesa de 256 mm (300,0 × 120,0 × 10,0 mm); Bambu Studio: One of the plate is empty or has no object fully inside it. Please check that the 3mf contains no empty plate in Bambu Studio before uploading. (código -50) |
| Placa de sinalização (sign) | mínimo | ✅ ok | 5 | 2,6 | 1 | – | – |
| Placa de sinalização (sign) | padrão | ✅ ok | 30 | 20,2 | 1 | – | – |
| Separar 3MF por cor (ferramenta) | corte com pino | ⚠️ aviso | 12 | 5,6 | 1 | – | o conjunto arrumado ocupa 66,0 × 276,0 mm: passa da mesa de 256 mm |
| Separar 3MF por cor (ferramenta) | máximo | ✅ ok | 13 | 4,2 | 1 | – | – |
| Separar 3MF por cor (ferramenta) | mínimo | ✅ ok | 13 | 4,2 | 1 | – | – |
| Separar 3MF por cor (ferramenta) | padrão | ✅ ok | 13 | 4,2 | 1 | – | – |
| Cortador de biscoito (ferramenta) | máximo | ❌ falha | 133 | 128,1 | 1 | – | "Cortador" não cabe na mesa de 256 mm (286,0 × 292,8 × 40,0 mm); o conjunto arrumado ocupa 542,0 × 292,8 mm: passa da mesa de 256 mm; app: Sem desenho interno para o carimbo marcar: ele sai liso. |
| Cortador de biscoito (ferramenta) | mínimo | ❌ falha | – | – | – | – | Bambu Studio: Failed slicing the model. Please verify the slicing of all plates on Bambu Studio before uploading. (código -100); app: Sem desenho interno para o carimbo marcar: ele sai liso. |
| Cortador de biscoito (ferramenta) | padrão | ✅ ok | 27 | 16,5 | 1 | – | app: Sem desenho interno para o carimbo marcar: ele sai liso. |
| Extrusão de SVG (ferramenta) | máximo | ❌ falha | – | – | – | – | "Extrusão" não cabe na mesa de 256 mm (359,9 × 368,2 × 120,0 mm); Bambu Studio: One of the plate is empty or has no object fully inside it. Please check that the 3mf contains no empty plate in Bambu Studio before uploading. (código -50) |
| Extrusão de SVG (ferramenta) | mínimo | ✅ ok | 1 | 0,1 | 1 | – | – |
| Extrusão de SVG (ferramenta) | padrão | ✅ ok | 9 | 5,7 | 1 | – | – |
| Chaveiro (ferramenta) | 3 camadas | ✅ ok | 6 | 2,0 | 1 | – | – |
| Chaveiro (ferramenta) | etiqueta | ✅ ok | 5 | 2,1 | 1 | – | – |
| Chaveiro (ferramenta) | lote 30 | ✅ ok | 186 | 81,1 | 1 | – | – |
| Chaveiro (ferramenta) | máximo | ✅ ok | 55 | 40,9 | 1 | – | – |
| Chaveiro (ferramenta) | mínimo | ✅ ok | 1 | 0,2 | 1 | – | – |
| Chaveiro (ferramenta) | padrão | ✅ ok | 4 | 1,7 | 1 | – | – |
| Quadro por camadas (ferramenta) | máximo | ✅ ok | 313 | 406,2 | 1 | 5,00 / 7,24 | – |
| Quadro por camadas (ferramenta) | mínimo | ✅ ok | 2 | 0,2 | 1 | 0,36 / 0,52 | – |
| Quadro por camadas (ferramenta) | padrão | ✅ ok | 28 | 13,2 | 1 | 1,52 / 2,24 | – |
| Litofania (ferramenta) | caixa | ✅ ok | 162 | 81,5 | 1 | – | – |
| Litofania (ferramenta) | curva | ✅ ok | 77 | 21,9 | 1 | – | – |
| Litofania (ferramenta) | máximo | ✅ ok | 934 | 381,6 | 1 | – | – |
| Litofania (ferramenta) | mínimo | ✅ ok | 9 | 1,3 | 1 | – | – |
| Litofania (ferramenta) | padrão | ✅ ok | 86 | 24,6 | 1 | – | – |
| Medalha (ferramenta) | máximo | ✅ ok | 103 | 88,4 | 1 | – | – |
| Medalha (ferramenta) | mínimo | ⚠️ aviso | 4 | 1,7 | 1 | – | "CAMPEÃ": parede/traço < 0,4 mm em Z 1,7 mm |
| Medalha (ferramenta) | padrão | ✅ ok | 13 | 8,7 | 1 | – | – |
| QR Code (ferramenta) | máximo | ✅ ok | 218 | 167,3 | 1 | – | – |
| QR Code (ferramenta) | mínimo | ✅ ok | 2 | 0,4 | 1 | – | app: Cada módulo ficou com 0,56 mm: aumente a placa ou encurte o texto (mínimo recomendado 1,2 mm). |
| QR Code (ferramenta) | padrão | ✅ ok | 14 | 6,7 | 1 | – | – |
| Plaquinhas de rolo (ferramenta) | máximo (30) | ⚠️ aviso | 226 | 117,8 | 2 | – | o conjunto arrumado ocupa 206,0 × 316,0 mm: passa da mesa de 256 mm; não coube numa placa: 2 placas |
| Plaquinhas de rolo (ferramenta) | padrão | ✅ ok | 8 | 4,0 | 1 | – | – |
