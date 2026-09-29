# Catálogo de impressoras 3D — potência média imprimindo PLA

Estudo de 2026-09-28 para ampliar `src/domain/catalog/printers.ts` do UpVision Maker.
Resultado: **128 modelos novos**, **27 marcas** nesta lista (sendo 18 marcas que ainda não estavam no catálogo), **7 com dado oficial**.
Código pronto para colar: [`impressoras-novas.ts`](./impressoras-novas.ts).

## Metodologia

**O que é o número.** Potência MÉDIA da tomada durante uma impressão de PLA já aquecida (bico ≈210–220 °C, mesa ≈55–65 °C, ambiente ≈25 °C, aquecedor de câmara desligado). Não é a potência da fonte nem o pico do pré-aquecimento, que costumam ser 2–5× maiores (ex.: Bambu A1 tem 1300 W de pico a 220 V e 95 W de média).

**"Oficial".** Só quando o fabricante publica a média ou o consumo medido em PLA (kWh/h ou "W imprimindo PLA"). Potência nominal ou da fonte **não** conta como oficial. Fabricantes que publicam: Bambu Lab ([wiki](https://wiki.bambulab.com/en/general/power-consumption)), Prusa (FAQ da série MK e páginas da Core One / Core One L) e Snapmaker (wiki do U1). Creality, Elegoo, Anycubic, Sovol, Flashforge, Qidi, UltiMaker, Raise3D etc. publicam só a potência nominal (ex.: Anycubic Kobra X "1450 W", Kobra 2 Neo "400 W"), por isso ficam como estimativa.

**"Estimativa".** O que manda na média em PLA é manter a mesa quente, então o valor sai da classe da máquina, calibrada com os dados oficiais e com medições de usuários (tomada medidora):

| Classe (PLA, câmara sem aquecimento) | Faixa usada | Âncoras |
|---|---|---|
| Sem mesa aquecida | 40–50 W | só hotend, motores e eletrônica |
| Mesa ≤180 mm | 60–90 W | Voron 0 ≈60 W; Bambu A1 mini 80 W oficial |
| Mesa 220–235 mm aberta | 100–120 W | Bambu A1 95 W oficial; Prusa MK4 80 W oficial; Ender-3 110–125 W medidos |
| Mesa 250–270 mm | 110–150 W | Snapmaker U1 118 W oficial; Kobra S1 132 W medidos |
| Mesa 300–330 mm aberta | 150–180 W | Bambu A2L 145 W oficial; Prusa XL 187 W medidos |
| Mesa 350–420 mm | 200–250 W | K2 Plus ≈220 W; Neptune 4 Max |
| Mesa ≥450 mm | 280–450 W | escala pela área da mesa |

Ajustes: **fechada** ≈ igual ou um pouco menos que aberta no PLA (o gabinete segura calor, mas soma luz e ventoinhas: P1S 105 W vs P1P 110 W; H2 200 W pelo porte e pela eletrônica). **IDEX/troca de ferramenta** soma ≈10–20 W por hotend em espera. **Máquina profissional** (UltiMaker, Raise3D) soma eletrônica maior (S5 fica em 24 W só ociosa). **Câmara aquecida sempre ligada** (MakerBot Method) sobe bem mesmo em PLA. Mesa segmentada (Prusa XL, OrangeStorm Giga) gasta bem menos com peça pequena.

**Margem.** Estimativas valem ±25%; medições de usuários variam com ambiente, velocidade, ventoinhas e tamanho da peça. O app já mostra `MEASURE_TIP` (medir 1 h numa tomada medidora); isso vale mais que qualquer tabela.

**Resina.** Não entrou: o tipo `CatalogPrinter` não tem campo de tecnologia e resina consome outra ordem de grandeza (≈30–70 W, só LEDs UV e aquecedor de cuba). Se entrar, precisa de um campo `kind: "fdm" | "resina"` antes.

**Não achado / de fora.** 3D Cloner: nenhuma ficha técnica atual encontrada. Modelos 2026 sem specs confiáveis (Anycubic Kobra 4, Qidi Q2C, Creality Ender-3 V4) ficaram de fora para não inventar número.

## Achados que valem revisar no catálogo atual (fora do escopo, não editei src/)

- `prusa-core-one` está como estimativa 90 W, mas a Prusa publica **90 W PLA / 110 W ABS** na [página do produto](https://www.prusa3d.com/product/prusa-core-one/) → pode virar `official`.
- `flashforge-ad5m` (100 W): um usuário mediu [175 W com PLA 220/55](https://www.reddit.com/r/FlashForge/comments/1drhe8j/power_consumption_info/). Pode ser caso isolado, mas vale conferir.
- `qidi-q1-pro`/`qidi-xplus3`: donos da Plus4 relatam ≈220 W com luz e ventoinhas ligadas; os 130–140 W do catálogo podem estar baixos se a luz da câmara ficar ligada.
- A wiki da Bambu já traz **H2C, X2D e A2L** (incluídos aqui) e confirma os valores atuais.

## Tabela (128 modelos novos)

| Marca | Modelo | W médios PLA | Fonte | Gabinete | Volume (mm) | Fonte / raciocínio |
|---|---|---:|---|---|---|---|
| Bambu Lab | X1 (sem Carbon) | 105 | [oficial](https://wiki.bambulab.com/en/general/power-consumption) | fechada | 256×256×256 | Wiki lista X1/X1C juntos: 105 W PLA. |
| Bambu Lab | A2L | 145 | [oficial](https://wiki.bambulab.com/en/general/power-consumption) | aberta | 330×320×325 | Wiki: 0,145 kWh medidos em 1 h de PLA. |
| Bambu Lab | X2D | 250 | [oficial](https://wiki.bambulab.com/en/general/power-consumption) | fechada | 256×256×260 | Wiki: potência em regime PLA 250 W (25 °C). |
| Bambu Lab | H2C | 200 | [oficial](https://wiki.bambulab.com/en/general/power-consumption) | fechada | 325×320×325 | Wiki: PLA Average Power 200 W. |
| Prusa | Core One L | 90 | [oficial](https://www.prusa3d.com/product/prusa-core-one-l-2/) | fechada | 300×300×330 | Página do produto: 'Average PLA Printing ~90W'. |
| Prusa | MK3.9 / MK3.9S | 80 | [oficial](https://help.prusa3d.com/article/faq-frequently-asked-questions_1932) | aberta | 250×210×220 | FAQ Prusa: série MK ≈80 W em PLA; MK3.9 usa a mesma mesa/eletrônica da MK4. |
| Prusa | MK2.5S / MK3 | 80 | estimativa | aberta | 250×210×210 | Mesma mesa MK52 da MK3S+ (80 W oficial). |
| Prusa | XL (1 cabeça) | 180 | estimativa | fechada | 360×360×360 | Mesa segmentada 360 mm; [XL 1 cabeça, mesa cheia: 187 W](https://forum.prusa3d.com/forum/original-prusa-xl-tool-changer-general-discussion-announcements-and-releases/does-anyone-know-the-max-power-draw-of-a-5-tool-xl/); oficial 235 W só para PETG ([Prusa](https://www.prusa3d.com/product/original-prusa-xl-assembled-single-toolhead-3d-printer/)). Mesa cheia ≈190 W, peças pequenas bem menos. |
| Prusa | XL (2–5 cabeças) | 200 | estimativa | fechada | 360×360×360 | XL 1 cabeça + ≈10 W por cabeça extra em espera; [XL 1 cabeça, mesa cheia: 187 W](https://forum.prusa3d.com/forum/original-prusa-xl-tool-changer-general-discussion-announcements-and-releases/does-anyone-know-the-max-power-draw-of-a-5-tool-xl/); oficial 235 W só para PETG ([Prusa](https://www.prusa3d.com/product/original-prusa-xl-assembled-single-toolhead-3d-printer/)). |
| Creality | Ender-3 S1 / S1 Pro | 115 | estimativa | aberta | 220×220×270 | Mesma classe da Ender-3 (mesa 235 DC); [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| Creality | Ender-3 S1 Plus | 170 | estimativa | aberta | 300×300×300 | Mesa 300 mm DC 24 V; área ≈1,7× a de 235 mm. |
| Creality | Ender-3 V3 Plus | 170 | estimativa | aberta | 300×300×330 | Mesa 300 mm, mesma classe da S1 Plus. |
| Creality | Ender-3 Max / Max Neo | 170 | estimativa | aberta | 300×300×320 | Mesa 300 mm aberta. |
| Creality | Ender-3 V2 Neo / Neo | 110 | estimativa | aberta | 220×220×250 | [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| Creality | Ender-5 S1 | 120 | estimativa | aberta | 220×220×280 | Mesa 235 mm, cubo aberto; [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| Creality | Ender-5 / Ender-5 Pro | 110 | estimativa | aberta | 220×220×300 | Mesa 235 mm; [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| Creality | Ender-5 Plus | 220 | estimativa | aberta | 350×350×400 | Mesa 360 mm; classe 350 mm aberta ≈200–250 W. |
| Creality | CR-10 / CR-10S / V2 / V3 | 160 | estimativa | aberta | 300×300×400 | Mesa 310 mm DC; classe 300 mm aberta. |
| Creality | CR-10 Smart Pro / CR-10 SE | 170 | estimativa | aberta | 300×300×400 | Mesa 300 mm; SE é Klipper rápida (mais ventoinha). |
| Creality | CR-10 Max | 300 | estimativa | aberta | 450×450×470 | Mesa 450 mm AC; classe 450–500 mm. |
| Creality | CR-6 SE | 110 | estimativa | aberta | 235×235×250 | [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| Creality | CR-M4 | 280 | estimativa | aberta | 450×450×470 | Mesa 450 mm; mesma classe da CR-10 Max. |
| Creality | K1 SE | 110 | estimativa | aberta | 220×220×250 | CoreXY aberta com mesa 235 mm. |
| Creality | K2 / K2 Combo | 140 | estimativa | fechada | 260×260×260 | Fechada 260 mm, sem aquecer câmara em PLA; um pouco acima do P1S (105 W) pela eletrônica/ventoinhas. |
| Creality | K2 Pro | 170 | estimativa | fechada | 300×300×300 | Fechada 300 mm; entre K2 e K2 Plus ([K2 Plus ≈220 W (SpoolMath)](https://spoolmath.com/printer/creality-k2-plus/)). |
| Creality | Hi / Hi Combo | 110 | estimativa | aberta | 260×260×300 | Bedslinger 260 mm, classe do A1 (95 W oficial). |
| Creality | SPARKX i7 | 105 | estimativa | aberta | 260×260×255 | Bedslinger compacto multicor; classe A1. |
| Creality | Sermoon V1 / V1 Pro | 80 | estimativa | fechada | 175×175×165 | Mesa pequena fechada. |
| Creality | Sermoon D3 | 150 | estimativa | fechada | 280×260×310 | Fechada ≈280 mm. |
| Elegoo | Neptune 2 / 2S | 100 | estimativa | aberta | 220×220×250 | [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| Elegoo | Neptune 3 / 3 Pro | 100 | estimativa | aberta | 225×225×280 | [Neptune 4 Pro: 70–85 W estável, picos 190–230 W](https://github.com/petervrc/neptune-4-pro---power-usage-tests); mesma mesa 235 mm. |
| Elegoo | Neptune 3 Plus / 4 Plus | 170 | estimativa | aberta | 320×320×400 | Mesa 320 mm aberta. |
| Elegoo | Neptune 3 Max | 230 | estimativa | aberta | 420×420×500 | Mesa 420 mm; mesma classe da Neptune 4 Max (200 W no catálogo). |
| Elegoo | Centauri Carbon 2 | 120 | estimativa | fechada | 256×256×256 | Mesma base da Centauri Carbon; [Centauri Carbon: ≈120 Wh por hora em PLA](https://www.facebook.com/groups/2343515562674370/posts/2614564478902809/). |
| Elegoo | OrangeStorm Giga | 450 | estimativa | aberta | 800×800×1000 | Mesa 800 mm em 4 zonas; só usa toda a mesa em peças grandes — com peça pequena cai para ≈150 W. |
| Anycubic | Kobra X | 120 | estimativa | aberta | 260×260×260 | Bedslinger 260 mm com ACE no cabeçote; classe A1 (95 W) + mesa AC maior. |
| Anycubic | Kobra 3 V2 | 110 | estimativa | aberta | 250×250×260 | Mesma classe do Kobra 3. |
| Anycubic | Kobra 3 Max | 230 | estimativa | aberta | 420×420×500 | Mesa 420 mm; classe Neptune 4 Max. |
| Anycubic | Kobra 2 / 2 Pro | 110 | estimativa | aberta | 220×220×250 | [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| Anycubic | Kobra 2 Plus | 170 | estimativa | aberta | 320×320×400 | Mesa 320 mm. |
| Anycubic | Kobra 2 Max | 230 | estimativa | aberta | 420×420×500 | Mesa 420 mm. |
| Anycubic | Kobra / Kobra Neo | 100 | estimativa | aberta | 220×220×250 | [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| Anycubic | Vyper | 110 | estimativa | aberta | 245×245×260 | [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| Anycubic | i3 Mega / Mega S | 110 | estimativa | aberta | 210×210×205 | [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| Anycubic | Mega X | 170 | estimativa | aberta | 300×300×305 | Mesa 300 mm. |
| Anycubic | Chiron | 250 | estimativa | aberta | 400×400×450 | Mesa 400 mm. |
| Sovol | SV06 ACE | 100 | estimativa | aberta | 220×220×250 | [SV06 ≈100 W imprimindo](https://www.reddit.com/r/Sovol/comments/1b0e7ag/what_are_you_guys_electricity_bill_like/). |
| Sovol | SV06 Plus ACE | 140 | estimativa | aberta | 300×300×340 | Mesa 300 mm; valor do SV06 Plus (130 W) + Klipper/ventoinhas. |
| Sovol | SV07 | 100 | estimativa | aberta | 220×220×250 | Mesma classe do SV06. |
| Sovol | SV07 Plus | 150 | estimativa | aberta | 300×300×350 | Mesa 300 mm. |
| Sovol | SV08 Max | 300 | estimativa | aberta | 500×500×500 | Mesa AC 1300 W de 500 mm; classe 500 mm. |
| Sovol | Zero | 80 | estimativa | aberta | 152×152×152 | Mesa pequena de 150 mm; classe Voron 0 (60 W) + ventoinhas maiores. |
| Sovol | SV04 (IDEX) | 140 | estimativa | aberta | 300×300×400 | Mesa 300 mm + segundo hotend em espera. |
| Sovol | SV01 Pro | 110 | estimativa | aberta | 280×240×300 | Mesa ≈280 mm DC. |
| Flashforge | AD5X | 105 | estimativa | aberta | 220×220×220 | Mesma mesa/cinemática do Adventurer 5M (100 W no catálogo); [Adventurer 5M: 175 W com PLA 220/55 (tomada medidora)](https://www.reddit.com/r/FlashForge/comments/1drhe8j/power_consumption_info/) sugere que pode passar disso. |
| Flashforge | Adventurer 3 | 60 | estimativa | fechada | 150×150×150 | Mesa pequena de 150 mm, fechada. |
| Flashforge | Adventurer 4 | 90 | estimativa | fechada | 220×200×250 | Fechada, mesa 220 mm. |
| Flashforge | Creator 3 Pro (IDEX) | 180 | estimativa | fechada | 300×250×200 | Fechada IDEX, mesa 300 mm + hotend em espera. |
| Flashforge | Creator 4 | 280 | estimativa | fechada | 400×350×500 | Industrial fechada, mesa 400 mm. |
| Flashforge | Guider 3 | 250 | estimativa | fechada | 300×250×340 | Profissional fechada, mesa 300 mm + eletrônica maior. |
| Flashforge | Finder 3 | 45 | estimativa | fechada | 190×195×200 | Sem mesa aquecida (só PLA): hotend + motores. |
| Qidi | Plus4 | 170 | estimativa | fechada | 305×305×280 | [Plus4: ≈220 W com PLA 210/60, luz e ventoinhas ligadas](https://www.facebook.com/groups/512839706277310/posts/1620398195521450/); sem luz/ventoinha de câmara o regime cai; [Qidi: CoreXY fechada 160–280 W com aquecedor de câmara desligado](https://qidi3d.com/blogs/news/3d-printer-electricity-cost-per-hour). |
| Qidi | Plus 5 | 170 | estimativa | fechada | 305×305×280 | Sucessora da Plus4, mesma classe. |
| Qidi | Q2 | 130 | estimativa | fechada | 270×270×256 | Fechada 270 mm; classe Q1 Pro (130 W no catálogo). |
| Qidi | Max4 | 230 | estimativa | fechada | 390×390×340 | Fechada 390 mm; [Qidi: CoreXY fechada 160–280 W com aquecedor de câmara desligado](https://qidi3d.com/blogs/news/3d-printer-electricity-cost-per-hour). |
| Qidi | X-Max 3 | 200 | estimativa | fechada | 325×325×315 | Fechada 325 mm. |
| Qidi | X-Smart 3 | 110 | estimativa | fechada | 175×180×170 | Fechada pequena, mesa 180 mm. |
| Snapmaker | U1 | 118 | [oficial](https://wiki.snapmaker.com/en/FAQ/u1) | aberta | 270×270×270 | Wiki: 117,8 W médios PLA 1 cor (127 W com 4 cores); [U1: 100–120 W medidos por usuário](https://www.reddit.com/r/snapmaker/comments/1tukf5f/u1_power_consumption_65c_vs_3530_bed_temperature/). |
| Snapmaker | J1 / J1s (IDEX) | 140 | estimativa | fechada | 300×200×200 | Fechada IDEX, mesa 300×200; segundo hotend em espera. |
| Snapmaker | Artisan (3-em-1) | 230 | estimativa | fechada | 400×400×400 | Mesa 400 mm (dual-extrusão). |
| Snapmaker | 2.0 A350 / A350T | 200 | estimativa | aberta | 320×350×330 | Mesa 350 mm. |
| Snapmaker | 2.0 A250 / A250T | 150 | estimativa | aberta | 230×250×235 | Mesa 250 mm modular (mais pesada que DC comum). |
| Voron / Klipper | Voron 2.4 / Trident (250 mm) | 150 | estimativa | fechada | 250×250×250 | Mesa AC 250 mm fechada; escala do Voron 350 (200 W no catálogo). |
| Voron / Klipper | Voron 2.4 / Trident (300 mm) | 170 | estimativa | fechada | 300×300×300 | Mesa AC 300 mm fechada. |
| Voron / Klipper | Klipper genérica (mesa 300 mm) | 170 | estimativa | aberta | 300×300 | Classe 300 mm aberta. |
| Voron / Klipper | Klipper genérica (mesa 400 mm) | 250 | estimativa | aberta | 400×400 | Classe 400 mm aberta. |
| RatRig | V-Core 3/4 (300 mm) | 180 | estimativa | aberta | 300×300×300 | Mesa AC 300 mm; normalmente sem gabinete. |
| RatRig | V-Core 3/4 (400 mm) | 250 | estimativa | aberta | 400×400×400 | Mesa AC 400 mm. |
| RatRig | V-Core 3/4 (500 mm) | 330 | estimativa | aberta | 500×500×500 | Mesa AC 500 mm. |
| RatRig | V-Minion | 90 | estimativa | aberta | 180×180×180 | Mesa 180 mm. |
| Artillery | Sidewinder X1 | 170 | estimativa | aberta | 300×300×400 | Mesa AC 300 mm. |
| Artillery | Sidewinder X2 | 170 | estimativa | aberta | 300×300×400 | Mesa AC 300 mm. |
| Artillery | Sidewinder X3 Pro / Plus | 170 | estimativa | aberta | 300×300×400 | Mesa 300 mm. |
| Artillery | Sidewinder X4 Plus | 170 | estimativa | aberta | 300×300×400 | Mesa 300 mm Klipper. |
| Artillery | Sidewinder X4 Pro | 120 | estimativa | aberta | 240×240×260 | Mesa 240 mm. |
| Artillery | Genius / Genius Pro | 110 | estimativa | aberta | 220×220×250 | [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| Artillery | Hornet | 100 | estimativa | aberta | 220×220×250 | [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| Kingroon | KP3S / KP3S Pro | 80 | estimativa | aberta | 180×180×180 | Mesa 180 mm. |
| Kingroon | KLP1 | 100 | estimativa | aberta | 210×210×210 | CoreXY aberta, mesa 210 mm. |
| Two Trees | SK1 | 120 | estimativa | aberta | 256×256×256 | CoreXY Klipper, mesa 256 mm. |
| Two Trees | SP-5 | 150 | estimativa | aberta | 300×300×330 | Mesa 300 mm. |
| Two Trees | Bluer / Sapphire Pro | 100 | estimativa | aberta | 235×235×280 | [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| UltiMaker | S3 | 110 | estimativa | aberta | 230×190×200 | Mesa 230 mm + eletrônica dual-extrusão ([S5: 24 W ocioso, fonte 500 W](https://community.ultimaker.com/topic/43444-regarding-power-consumption-data/)). |
| UltiMaker | S5 | 150 | estimativa | aberta | 330×240×300 | Mesa 330×240, dual-extrusão; [S5: 24 W ocioso, fonte 500 W](https://community.ultimaker.com/topic/43444-regarding-power-consumption-data/). |
| UltiMaker | S7 | 150 | estimativa | aberta | 330×240×300 | Mesma mesa da S5. |
| UltiMaker | 2+ Connect | 100 | estimativa | aberta | 223×220×205 | Mesa 223 mm. |
| UltiMaker | 3 / 3 Extended | 110 | estimativa | aberta | 215×215×200 | Mesa 215 mm, dual. |
| MakerBot | Method / Method X | 200 | estimativa | fechada | 190×190×196 | Câmara aquecida ativa sempre ligada (Method X até 100 °C) — mesmo em PLA gasta mais. |
| MakerBot | Sketch / Sketch Large | 90 | estimativa | fechada | 150×150×150 | Fechada pequena (Large: 220 mm). |
| MakerBot | Replicator+ | 50 | estimativa | fechada | 295×195×165 | Sem mesa aquecida (só PLA). |
| Raise3D | Pro3 / Pro2 | 250 | estimativa | fechada | 300×300×300 | Profissional fechada, dual, mesa 300 mm. |
| Raise3D | Pro3 Plus / Pro2 Plus | 280 | estimativa | fechada | 300×300×605 | Mesma mesa da Pro3, mais altura/eletrônica. |
| Raise3D | E2 (IDEX) | 200 | estimativa | fechada | 330×240×240 | IDEX semi-fechada, mesa 330×240. |
| Tronxy | X5SA / X5SA Pro | 170 | estimativa | aberta | 330×330×400 | Mesa 330 mm. |
| Tronxy | X5SA-400 | 250 | estimativa | aberta | 400×400×400 | Mesa 400 mm. |
| Tronxy | Veho 600 | 400 | estimativa | aberta | 600×600×650 | Mesa AC 600 mm. |
| Geeetech | A10 / A10 Pro | 110 | estimativa | aberta | 220×220×260 | [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| Geeetech | A20 / A20M | 150 | estimativa | aberta | 255×255×255 | Mesa 255 mm. |
| Geeetech | Mizar / Mizar S | 110 | estimativa | aberta | 255×255×260 | Mesa 255 mm DC. |
| Longer | LK4 Pro | 110 | estimativa | aberta | 220×220×250 | [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| Longer | LK5 Pro | 150 | estimativa | aberta | 300×300×400 | Mesa 300 mm DC. |
| Biqu | B1 | 110 | estimativa | aberta | 235×235×270 | [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| Biqu | Hurakan | 110 | estimativa | aberta | 220×220×270 | Klipper, mesa 235 mm. |
| Biqu | BX | 150 | estimativa | aberta | 250×250×250 | Mesa 250 mm. |
| AnkerMake | M5 | 120 | estimativa | aberta | 235×235×250 | Mesa 235 mm rápida. |
| AnkerMake | M5C | 110 | estimativa | aberta | 220×220×250 | Mesa 220 mm. |
| Mingda | Magician X / X2 | 110 | estimativa | aberta | 230×230×260 | [Ender-3 V2 ≈110 W](https://medium.com/@ermanas/power-consumption-of-the-creality-ender-3-v2-eb946d9fbbd3), [Ender-3 ≈120 W](https://3dprinting.stackexchange.com/questions/8616/creality-ender-3-printer-power-consumption). |
| Mingda | Magician Max | 230 | estimativa | aberta | 400×400×400 | Mesa 400 mm. |
| FLSUN | V400 | 170 | estimativa | aberta | Ø300×410 | Delta, mesa redonda 300 mm. |
| FLSUN | Super Racer (SR) | 150 | estimativa | aberta | Ø260×330 | Delta, mesa 260 mm. |
| FLSUN | T1 / T1 Pro / T1 Max | 160 | estimativa | aberta | Ø260×330 | Delta Klipper, mesa 260 mm (Max: 300 mm). |
| GTMax3D | Pro Core A3v3 | 180 | estimativa | aberta | 320×320×340 | Mesa alumínio 320 mm até 135 °C; classe 300–330 mm. |
| GTMax3D | Pro Core M4 | 280 | estimativa | aberta | 410×410×440 | Mesa 410 mm; classe 400 mm. |
| GTMax3D | Pro Core GT4 | 300 | estimativa | fechada | 400×400×400 | Câmara aquecida até 100 °C (desligada em PLA) + mesa 400 mm. |
| Sethi3D | S3 / S3X | 160 | estimativa | aberta | 270×270×320 (S3X 300×300×320) | Mesa estática 270–300 mm até 110 °C. |
| Sethi3D | AiP | 100 | estimativa | aberta | 220×210×200 | Mesa ≈220 mm. |
| Sethi3D | Farm | 110 | estimativa | aberta | 240×240×240 | Mesa 240 mm até 120 °C. |
| Voolt3D | Gi3 | 110 | estimativa | aberta | ≈200×200×200 (não confirmado) | Cartesiana nacional de mesa ≈200 mm; volume não confirmado no site. |

## Fontes principais

- Bambu Lab — Printer and AMS power parameters: https://wiki.bambulab.com/en/general/power-consumption
- Prusa — FAQ (série MK 80 W PLA): https://help.prusa3d.com/article/faq-frequently-asked-questions_1932 · Core One: https://www.prusa3d.com/product/prusa-core-one/ · Core One L: https://www.prusa3d.com/product/prusa-core-one-l-2/ · XL: https://www.prusa3d.com/product/original-prusa-xl-assembled-single-toolhead-3d-printer/
- Snapmaker — U1 FAQ: https://wiki.snapmaker.com/en/FAQ/u1
- Anycubic Wiki (só potência nominal): https://wiki.anycubic.com/en/fdm-3d-printer/anycubic-kobra-x/faq
- Qidi — guia de consumo por arquitetura: https://qidi3d.com/blogs/news/3d-printer-electricity-cost-per-hour
- Medições de usuários: links na coluna de raciocínio.
- Brasil: https://www.gtmax3d.com.br/impressoras-3d-fabricadas-no-brasil · https://www.sethi3d.com.br/
