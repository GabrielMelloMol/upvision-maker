# Gestor 3D: aprofundamento das ferramentas

> Complementa `docs/gestor3d-estudo.md`. Coleta de 2026-09-26.
> **Método:** (1) as 48 páginas públicas + `llms.txt` + `/informacoes-para-ia`; (2) **engenharia reversa dos 278 arquivos JS/WASM públicos** do app (`/assets/*`, baixados recursivamente a partir do `index-*.js`); (3) buscas na web (Instagram, TikTok, YouTube, Reddit, Facebook, Reclame Aqui, GitHub).
> Não criei conta e não paguei nada. As telas logadas não foram vistas: o que vem do código está como **(bundle)** e o que é dedução como **(inferido)**.

---

## 0. Resumo em 10 linhas

1. **Todo o processamento pesado roda no navegador**, em Web Workers, com dois motores WASM: **vtracer 1.0** (visioncortex, MIT, 670 KB) para imagem→vetor e **manifold-3d** (Apache-2.0, 540 KB, com Clipper2 embutido) para booleanas e sólidos 3D. A visualização usa three.js (`SVGLoader`, `ExtrudeGeometry`). O servidor só **conta o uso** (`/api/tool-usages/{svg_conversion|qr_code|three_mf|custom_product}`).
2. **Conversor SVG:** não é mágica, é **pré-processamento certo + vtracer bem configurado**. A imagem é binarizada por luminância (o PNG transparente vira fundo branco), ampliada até 1200 px (até 4×) com suavização de alta qualidade, e depois vai para o vtracer em modo `spline` com filtro de manchas. No fim, **todos os caminhos são fundidos num único `<path>` `evenodd`, com largura em mm**. Resultado: uma forma única, fechada, lisa e já na escala de impressão. Dá para replicar igual (mesma lib, mesma licença MIT) e melhorar.
3. **Conversão colorida (modelos):** quantiza para até 4 cores em espaço Lab. Descarta as cores "de serrilhado" (tons intermediários entre duas cores), remove o fundo por inundação a partir da borda e vetoriza com `watershed + cutout` (regiões sem sobreposição nem frestas). É o ideal para imprimir em várias cores.
4. **Texto** vira forma assim: é desenhado num `<canvas>` com a webfont (Dancing Script, Pacifico, Lobster, Playfair Display, Hanken Grotesk) e **vetorizado pelo próprio vtracer**. Não usam opentype.js.
5. **3MF:** gravador zip próprio, mais metadados do **Bambu Studio/OrcaSlicer** (`Metadata/model_settings.config`, `project_settings.config`, `custom_gcode_per_layer.xml` com **pausa na altura certa para inserir tag NFC**). Na leitura, entende o `paint_color` (pintura por triângulo do Bambu/Orca).
6. **Modelos personalizáveis:** o bundle tem **33 modelos**, um a mais que os 32 da página (o *Chaveiro de nome articulado* ainda não foi divulgado). 9 são só para assinantes. Cada um tem um editor dedicado com dimensões fixas em mm (lista completa na §6).
7. **Buscador de STLs** é só um iframe do `3dsearch.net`. **Catálogo PDF**, **orçamento** e **contrato** são HTML + `@page A4` + `window.print()`. A **"Exportação em massa"** gera um `.xlsx` no formato de upload em massa da Shopee.
8. **O que falam:** quase tudo é conteúdo de parceiros/influenciadores (principalmente o **@makerzando**, Felipe Silva). Não achei reclamações (Reclame Aqui sem registro) nem discussão orgânica no Reddit. A afirmação "SVG melhor que o Convertio" é coerente com a técnica: o Convertio é um conversor genérico.
9. **Concorrentes com ideias boas:** MakerWorld Parametric Model Maker (geração em massa de nomes, imagem→chaveiro), Spoolman (estoque de rolos), print-farm-manager (código aberto), openscad-wasm (paramétricos).
10. **Distribuição recomendada:** **PWA estático no Cloudflare Pages** (grátis, banda ilimitada, cabeçalhos configuráveis). Tudo roda no cliente, como no Gestor 3D. Desktop via Tauri só se surgir necessidade real (assinatura de código custa dinheiro ou gera alertas de segurança).

---

## 1. Arquitetura comum das ferramentas (bundle)

| Peça | Evidência no bundle | Papel |
|---|---|---|
| **vtracer 1.0 (Rust→WASM)** | `vtracer_wasm_bg-*.wasm` (670 KB), export `vectorize_rgba`, opções `clustering: bw \| watershed`, `hierarchical: cutout`, `palette`, `maxColors`, `simplify`, `optimize` | Imagem→SVG no conversor, nos modelos e no texto |
| **manifold-3d (WASM)** | `manifold-*.wasm` (540 KB): `_manifoldUnionN`, `_manifoldDifferenceN`, "There is an undefined error in Clipper2" | União, diferença e interseção de sólidos; offset 2D (Clipper2) |
| **three.js** | `three-runtime-*.js` (~620 KB em 3 partes), `SVGLoader`, `ExtrudeGeometry` | Prévia 3D, SVG→formas, extrusão |
| **Workers** | `vectorize`, `vectorizeBatch`, `rasterArtwork`, `independentColorRegions`, `artworkRepair`, `svgKeychainGeometry`, `modeling`, `cut`, `io`, `export`, `printPreparation`, `viewportPreparation`, `printer3D` | Nada trava a tela. Todos têm timeout (ex.: 2 min) e cancelamento via `AbortController` |
| **Gravador 3MF próprio** | assinatura ZIP `0x04034b50` escrita à mão, `Metadata/model_settings.config`, `project_settings.config`, `custom_gcode_per_layer.xml`, `paint_color` | Saída pensada para Bambu Studio/OrcaSlicer, com pausa para NFC |
| **Sanitização de SVG** | "Declarações ENTITY não são aceitas no SVG", "Formas preenchidas de até 1 MB", regex restrito para `d=` e `transform=translate()` | Segurança (XXE/XSS) e robustez |
| **QR** | pacote `qrcode` (node-qrcode, build de navegador), `errorCorrectionLevel: 'M'` | QR vetorial |
| **Sem threads** | nenhum cabeçalho `COEP`; WASM roda em uma thread por worker | Hospedagem estática simples funciona |
| **Contador de uso** | `useToolUsage('svg_conversion' \| 'qr_code' \| 'three_mf' \| 'custom_product')` → `/api/tool-usages/:key`, chamado **só depois** do sucesso ou no download | É a única coisa que o servidor recebe |

---

## 2. Conversor imagem→SVG (foco especial)

### 2.1 O que o usuário vê
- Entrada: PNG, JPG, WebP, BMP, GIF (1º quadro) ou AVIF. Limite de 25 MB e 80 Mpx. Arrastar e soltar.
- **"Otimização automática: curvas, cantos, suavização e limpeza já configurados para impressão 3D"** (texto da UI).
- Só **3 controles**:
  1. **Quantidade preenchida**: limiar de 20 a 245, padrão 160.
  2. **"O fundo está escuro"**: inverte a seleção.
  3. **Largura física em mm**: 1 a 1000, padrão 80. A altura segue a proporção.
- Prévia lado a lado ("Original" × "SVG vetorizado", em fundo quadriculado ou azul-técnico), com métricas: nº de caminhos, % da área, tamanho do arquivo e tempo.
- Avisos automáticos: caminhos não fechados; mais de 5.000 caminhos ("pode ficar pesado no modelador"); mais de 96% preenchido ("confira o limite e a inversão").
- Link para tutorial em vídeo (`youtu.be/UyMFlzLSmS8`).

### 2.2 Pipeline exato (chunks `SvgConverter-*.js`, `vectorize.worker-*.js`, `workerClient-*.js`)

```
1. Decodifica com createImageBitmap(file, {imageOrientation:'from-image'})   // respeita EXIF
2. Reamostragem no canvas (imageSmoothingQuality='high'):
     s = min( clamp(1200/lado_maior, 1, 4),   // AMPLIA imagens pequenas até 4× para ~1200 px
              4096/lado_maior,                // teto de 4096 px
              sqrt(6e6/(w*h)) )               // teto de 6 Mpx
3. No worker, para cada pixel:
     alfa < 16            → fundo (branco)
     lum = 0.2126R + 0.7152G + 0.0722B       // BT.709
     lum = (lum·a + 255·(255−a))/255          // compõe sobre branco (PNG transparente)
4. Blur de caixa separável opcional (raio 0 a 2; padrão 0)
5. Binariza: selecionado = invert ? lum ≥ T : lum < T     (T padrão 160)
6. vtracer.vectorize_rgba(pixels, w, h, {
       clustering:'bw', mode:'spline', binaryThreshold:128,
       filterSpeckle:2, cornerThreshold:60, lengthThreshold:4,
       maxIterations:10, spliceThreshold:45, pathPrecision:4 })
7. Pós-processamento:
     - aceita só <path> com d= em regex seguro [MmLlHhVvCcSsQqTtAaZz0-9eE+.,-\s]
     - agrupa por transform (só translate) e FUNDE todos os d= num único <path>
     - <svg width="{L}mm" height="{L·h/w}mm" viewBox="0 0 w h">
       <g fill="#000" fill-rule="evenodd" stroke="none"> ... </g>
```

### 2.3 Por que sai melhor que o Convertio

| Fator | Gestor 3D | Convertio (conversor genérico) |
|---|---|---|
| Objetivo | **Forma para extrudar** (1 cor, sólida) | Arquivo SVG "parecido" com a imagem |
| Binarização | Sim, por luminância com alfa sobre branco; o usuário ajusta o limiar | Não expõe limiar; tende a traçar tons e antisserrilhado como formas **(inferido)** |
| Ampliação antes de traçar | **Sim, até 4× para ~1200 px**: logos pequenos (ex.: 300 px) ganham curvas lisas em vez de "escadinha" | Traça na resolução original **(inferido)** |
| Traçador | vtracer 1.0 `spline` (ajuste de Bézier com detecção de canto a 60°) | Artigo SVGMaker 2026: *"troca mecânica de formato… excesso de nós, cores pobres, estrutura achatada"* |
| Limpeza | `filterSpeckle: 2` descarta manchas; aviso para mais de 5k caminhos | — |
| Estrutura de saída | **1 `<path>` com `evenodd`**: furos (miolo do "O", "A") ficam corretos na extrusão | Muitas formas empilhadas/sobrepostas, às vezes com o fundo junto |
| Unidade | **Largura em mm** gravada no SVG: importa no Bambu/Fusion já no tamanho | Em px; é preciso escalar à mão |
| Privacidade/velocidade | Local em WASM, ~centenas de ms | Upload para servidor e fila |

**Conclusão:** a qualidade vem de (a) restringir o problema a "silhueta de 1 cor", (b) ampliar antes de traçar, (c) usar um traçador moderno de Bézier e (d) entregar a estrutura que o modelador 3D espera (`evenodd` + mm). É tudo reproduzível.

### 2.4 Modo colorido (usado nos modelos; worker `rasterArtwork`, "conversão experimental")
Opções: `colorCount` 1 a 4, `removeBackground`, `engine: legacy | region-graph | adaptive`. A imagem é limitada a 1200 px.
1. **Classifica a imagem** (`adaptive`): conta cores únicas em 15 bits e a densidade de bordas (ΔE > 0,09). O resultado é `photographic` (≥320 cores e bordas ≥18%), `illustration`, `flat-logo` ou `detailed-logo`. Cada perfil escolhe uma estratégia: `shared-boundary`, `shared-boundary-fine`, `independent-components` ou `posterized`. Emite avisos como *"A imagem possui aparência fotográfica; sombras e degradês serão simplificados"*.
2. **Remove o fundo:** pega a cor dominante da borda (se cobrir ≥35% do perímetro), faz inundação a partir das bordas com tolerância ΔE 0,055 e torna esses pixels transparentes. Só aceita se remover entre 2% e 96% da imagem.
3. **Paleta:** sementes por "ponto mais distante" ponderado em Lab (até 8), 12 iterações de k-means. **Descarta cores de antisserrilhado**: uma cor que está no segmento entre duas cores fortes (projeção entre 0,04 e 0,96, distância < 14) é considerada borda borrada. Depois funde até N cores.
4. **Rotulagem:** distância em Lab com croma ×4, mais 2 passes de suavização por vizinhança (tipo MRF) nos pixels de baixa confiança. Ilhas menores que max(32, min(1200, 0,15% da área)) são absorvidas pela vizinha.
5. **vtracer** com `clustering:'watershed'`, `hierarchical:'cutout'` (mosaico sem frestas), `palette` fixa (a dos passos acima), `simplify` de 0,1 a 0,7 e `optimize: 1`. Resultado: **regiões que se encaixam sem sobreposição**, prontas para virar volumes de filamento.

### 2.5 Como replicar igual ou melhor

| Lib | Licença | Tam. | Prós | Contras | Uso sugerido |
|---|---|---|---|---|---|
| **vtracer 1.0** (`crates/vtracer` + wasm-bindgen; npm `@visioncortex/vtracer` é build Node) | **MIT** | ~0,7 MB | É o que o Gestor usa; cor + bw; `cutout` sem frestas; paleta fixa (OKLab); `simplify`; **limiar adaptativo Bradley–Roth** (fotos com luz irregular) | O pacote npm é para Node; para o navegador é preciso compilar o wrapper com `wasm-pack` (há a pasta `webapp` no repositório) **(inferido)** | **Motor principal** |
| potrace (`esm-potrace-wasm`, `potrace-wasm`) | **GPL-2** | ~0,1 MB | Curvas lindíssimas em preto e branco; referência do Inkscape "Trace Bitmap" | GPL (obriga a abrir o código); só preto e branco; cor exige multipasses | Alternativa em preto e branco, se o código for aberto |
| imagetracerjs | Domínio público | ~40 KB JS | JS puro, sem build, cor | Mais lento e ruidoso; curvas piores | Fallback leve |
| opencv.js | Apache-2 | ~8–10 MB | Limiar adaptativo, morfologia (abrir/fechar), remoção de ruído, transformada de distância | Pesado; não ajusta Bézier | **Só pré-processamento**, carregado sob demanda |
| Vectorizer.ai / SVGMaker (IA) | Pago/API | — | Melhor em fotos | Custo; upload | Não usar |

**Receita recomendada** (= Gestor 3D + melhorias baratas):
1. Copiar o pipeline da §2.2: EXIF → ampliar até 1200 px → luminância com alfa → limiar → vtracer `bw/spline` → fundir em 1 path `evenodd` → mm.
2. **Melhorias:**
   - botão "Auto" com **limiar de Otsu** ou `--adaptive` do vtracer 1.0 para fotos de logo em embalagem;
   - **remoção de fundo por inundação a partir da borda** (como o modo colorido deles), também no modo 1 cor;
   - **abrir/fechar morfológico de 1 px** para eliminar furinhos e pontas;
   - **checagem de fabricabilidade:** com a largura em mm, calcular a espessura mínima do traço (transformada de distância) e **avisar/realçar trechos < 0,4 mm** (bico padrão) e ilhas soltas menores que 1 mm²;
   - `simplify` 0,5 a 1,5 px para arquivos menores;
   - **exportar direto em 3MF/STL extrudado** (altura em mm, base opcional), pulando o modelador. Isso é o que os makers realmente querem;
   - modo colorido "N filamentos" = `cutout` + `palette` com as cores dos filamentos cadastrados.
3. Testes de regressão com 10–15 logos de referência (PNG pequeno, JPG com artefato, fundo escuro, foto de embalagem), comparando nº de caminhos, % preenchido e aparência.

---

## 3. Gerador de QR Code / Pix

- **Tipos:** Pix, link, Wi-Fi, e-mail, telefone. Saída **SVG vetorial**, correção de erro **M**, pacote `qrcode`.
- **Pix (bundle `qrCode-*.js`):** montagem própria do BR Code (EMV TLV: `br.gov.bcb.pix`, campo 63 CRC16 `6304…`), **estático e sem valor** (o pagador digita). Valida a chave: **CPF e CNPJ por dígito verificador** (inclusive o CNPJ alfanumérico `[A-Z0-9]{12}\d{2}`), e-mail com no máximo 77 caracteres, telefone `+DDI…` com 10 a 15 dígitos, chave aleatória. Nome e cidade normalizados (sem acento, `[A-Za-z0-9 $%*+\-./:]`), campos com no máximo 99 caracteres.
- É reaproveitado dentro da **Placa de PIX**, do **Totem NFC** (`PixSignQrPopover`), em Orçamentos e na Assinatura.
- **Limite:** Grátis 5/mês · Básico 10 · Pro 20 · Premium ilimitado (conta `qr_code_generation` após gerar).
- **Replicar:** trivial. `qrcode` (MIT) + ~60 linhas de payload Pix com CRC16-CCITT. **Melhorar:** Pix com valor fixo e txid opcional, **exportar 3MF com módulos em relevo** (2 cores) e aviso de tamanho mínimo (módulo ≥ 1,2 mm **inferido**).

---

## 4. Separador / Cortador 3MF (`/cortador-3mf`, chunk `ThreeMFCutter` 46 KB + workers `cut`, `io`, `export`, `independentColorRegions`, `artworkRepair`)

- **Entrada:** 3MF do Bambu Studio/OrcaSlicer. Lê volumes e **pintura por triângulo (`paint_color`)**. STL não é aceito.
- **Ações (rótulos da UI):**
  - clicar em uma região colorida;
  - "Pintar partes", "Selecionar todas", "Limpar pintura";
  - **"Expandir por curva"** (cresce a seleção seguindo a curvatura);
  - "Separar região selecionada", "Separar somente pelas cores", "Parte isolada / Parte restante";
  - **"Cortar área pintada"** com as opções "Entre a cor e o restante" e "Entre as partes pintadas";
  - **"Cortar modelo pelo plano"** (Parte A / Parte B).
- **Encaixe:** "Sem encaixe" ou pino e cavidade em **prisma retangular** ou **prisma triangular** (outros formatos **inferido**), "Lado do pino", "Tamanho relativo", **"Profundidade automática"**, "Posição personalizada".
- **Fechamento da malha cortada** (4 estratégias expostas):
  - "Fechamento pelo centroide" (para formas convexas);
  - "Preenchimento por winding" (preserva recortes côncavos);
  - "Prioriza triângulos equilibrados" (recomendado);
  - "Reduz o comprimento das arestas internas".
  - Há também a opção **"Película mínima"**.
- **Segurança geométrica:** recusa malhas não-manifold ou abertas que não possam ser consertadas (worker `artworkRepair`). "Manter posição original" ou afastar as peças e apoiá-las em Z=0.
- **Limite:** Grátis 1/mês · Básico 2 · Pro 4 · Premium ilimitado (`three_mf_download`).
- **Replicar:** **difícil** (semanas). Precisa de um parser de 3MF com `paint_color` (formato do Bambu, pouco documentado), segmentação de malha, booleanas com manifold-3d e triangulação de tampa. **Recomendação: fase 3 ou nunca.** O Bambu Studio e o OrcaSlicer já fazem corte com conectores nativamente.

---

## 5. Texto → geometria (chunk `textToSvg-*.js`)
Canvas de 1400×320 px (600 px se tiver 2 linhas), fonte a 210 px (reduz até 54 px para caber), `document.fonts.load()` antes de desenhar. Faz o recorte automático da área útil e vetoriza pelo mesmo worker do vtracer. Fontes: **Hanken Grotesk Variable 800** (padrão), **Dancing Script**, **Pacifico**, **Lobster**, **Playfair Display** (rótulos "Cursiva leve" e "Cursiva marcante").
**Por que assim?** Evita opentype.js e problemas de contorno e sobreposição de glifos cursivos: a união das letras sai de graça pela rasterização. **Replicar:** igual. Ou usar opentype.js + `Manifold.union` se quisermos precisão vetorial pura.

---

## 6. Modelos personalizáveis: os 33, um a um

**Comum a todos** (bundle `CustomProductEditor`, `SvgKeychainEditor`, `CustomizerExpandedView`):
- Modos de prévia **2D direta** (editar sobre a vista frontal) e 3D.
- Prévia colorida; **"Pintar partes"** e cor por região ("Clique nas partes da arte para editar as cores", "Cores padrão restauradas").
- "Relevo por partes" com altura por região (**0,6 a 4 mm**, passo 0,1 a 0,5).
- Arte **"Nivelada"** (embutida, rente à base) ou **"Em relevo"**. "Posição horizontal/vertical", "Restaurar posição". Pincel de apagar partes da arte (`brushRadiusMm` 1–3, `ErasureControls`).
- Envio de **SVG ou imagem** ("Enviar imagem (SVG, PNG, JPG e etc)"). Imagem passa pelo modo colorido da §2.4 com **"Quantidade de cores"** e escolha **"Motor base"** ou **"Motor experimental"**. Opção "simplicidade ou paleta do SVG".
- Saída **3MF** com volumes por cor e, quando aplicável, **pausa de impressão** em `pauseAtHeightMm`.
- **Limite:** Grátis 1 geração por modelo/mês · Básico 5 · Pro 10 · Premium ilimitado (`custom_product_download`). 🔒 = exclusivo para assinantes.

| # | Modelo (slug) | Cat. | Entradas do usuário | Parâmetros e dimensões fixas vistas no bundle |
|---|---|---|---|---|
| 1 | 🔒 **Porta caneta adaptável** | Decoração | Texto (até 2 linhas / 32 caracteres) e/ou SVG; tamanho relativo do texto | 4 compartimentos; corpo segue a silhueta; largura 120–230 mm, altura ≥48 mm; paredes de 2,7–3,4 mm; divisória 1,63 mm; relevo da arte 1,2 mm |
| 2 | 🔒 **Luminária adaptável** | Decoração | Texto e/ou SVG; largura da arte ou do texto; margem estrutural e margem luminosa | Painel difusor frontal de 0,8 mm; tampa traseira de 2 mm com lábio de 5 mm e folga de 0,2 mm; **passagem de cabo 15×10 mm**; furo de fechadura para parede (r 4,5/2,25); máx. 240 mm |
| 3 | 🔒 **Porta chave adaptável** | Decoração | SVG ou imagem | Painel de 230 mm (arte até 225 mm, altura até 320 mm), 5 mm de espessura, borda 2,5 mm, **5 suportes** preservados (3MF-base), furos de parafuso de 4,5 mm |
| 4 | **Chaveiro giratório** | Brindes | Arte da frente + arte do verso | Disco r 14 mm; arte de 22 mm; relevo até 3 mm; moldura, pivôs e folgas preservados |
| 5 | **Chaveiro abridor de garrafa** | Brindes | Frente + verso (SVG/imagem) | Arte de 20 mm; corpo e mecanismo do abridor fixos |
| 6 | **Plaquinha de colorir** | Decoração | Até 4 SVGs | Traços em relevo sobre placa (editor `cookie-stamps`) |
| 7 | **Chaveiro Tag NFC** | Brindes | Arte; **3 formatos** de contorno | Cavidade NFC Ø26×1 mm com margem de 1,6 mm; **pausa em 2,76 mm** (3,08 mm em outra variante); áreas seguras de 24,7 a 33,8 mm |
| 8 | **Placa de PIX** | Decoração | Logo SVG; **chave Pix** (tipo + chave); nome do recebedor | Larguras de 52, 60 e 72 mm (logo, QR e nome); base separada com extensão traseira de 25,6 mm; frase fixa "Pagamento com PIX" |
| 9 | 🔒 **Totem NFC** | Decoração | Arte superior (SVG); QR Pix; símbolo | **2 alojamentos NFC** (esq./dir.); **pausa em 12,04 mm**; frase "Nos avalie – Aproxime o celular"; 2 mesas (corpo + base com lingueta) |
| 10 | **Placa de sinalização** | Decoração | SVG (recorte **negativo** no painel elevado) + texto | Texto em relevo de 0,8 mm à direita; arte de 32 mm; altura do texto ajustável |
| 11 | 🔒 **Anilha porta joia com NFC** | Esporte | 2 textos na tampa (áreas superior e inferior) + SVG opcional | Tampa e base separadas; cavidade NFC; **pausa em 2,28 mm**; texto de 4,4 mm; arte de 18 mm |
| 12 | **Medalha básica** | Esporte | SVG ou imagem (multicolor); largura; posição X/Y | Corpo, argola e área circular fixos; relevo até 3 mm |
| 13 | 🔒 **Medalha adaptável** | Esporte | SVG ou imagem; **largura da fita** | Frente única reforçada; fita de 20 mm; corpo 4–10 mm |
| 14 | 🔒 **Troféu elegante** | Esporte | SVG + **2 textos** (linhas superior e inferior da base); tamanho da letra | Arte circular de 62 mm; corpo e base originais |
| 15 | **Troféu básico** | Esporte | SVG ou imagem | Corpo e base em **mesas separadas** |
| 16 | 🔒 **Troféu adaptável** | Esporte | SVG ou imagem; **tipo de base** (original ou compacta) | Corpo 4–10 mm; base compacta de 120×55 mm (raio 7); encaixe original de 61,6×10,7×26,3 mm |
| 17 | **Chaveiro de Nome** | Brindes | Nome; fonte; SVG opcional (largura) | Altura do nome 14–34 mm (padrão 18); base de 2,4 mm; borda de 2,4 mm; relevo de 0,8 mm (até 2 mm); encaixe lateral para argola |
| 18 | **Chaveiro de nome articulado** *(não divulgado)* | Brindes | Nome; fonte | Letras em **corpos independentes com juntas**; altura do nome 14–24 mm; largura até 220 mm; folgas radial de 0,3 mm e axial de 0,4 mm; corpo de 10 mm |
| 19 | **Topo de lápis** | Brindes | Nome; fonte; **diâmetro do encaixe** | Furo Ø7,8 mm (ajustável); texto de 10–20 mm (padrão 12); corpo de 12 mm; relevo de 1,4 mm; largura até 50 mm |
| 20 | **Chaveiro de Logo** | Brindes | SVG ou imagem frente + **verso independente**; largura da base e da borda | Base adaptativa ao contorno; base de 2,4 mm; espessura de 2,4 a 10 mm |
| 21 | 🔒 **Chaveiro clicker adaptável** | Brindes | SVG na tampa | Corpo + tampa; **encaixe para switch mecânico** 15,15 mm (tipo Cherry MX **inferido**); haste em cruz de 4,19×1,2 mm; folga da tampa de 1 mm |
| 22 | **Chaveiro abridor de lata** | Brindes | SVG; **arrastar a abertura** sobre o modelo | Base reforçada de 8–10 mm; abertura de 17×23 mm; rampa de 2,2 mm |
| 23 | **Placa adaptável** | Decoração | SVG ou imagem frente + verso | Contorno adaptativo; relevo por partes |
| 24 | **Molle tag** | Brindes | SVG | Corpo de 118×72×4 mm; área segura de 83×65 mm; 4 encaixes MOLLE laterais |
| 25 | **Marca página adaptável** | Brindes | SVG; acabamento **em relevo ou rente** | Corpo longo fixo |
| 26 | **Clipe de papel adaptável** | Brindes | SVG; 2 acabamentos | Corpo de 34×13,5×1,7 mm; arte de 30 a 55 mm (cabeça até 65 mm) |
| 27 | **Clipe de saco adaptável** | Culinária | SVG | Forquilha funcional de 26,8×14,9×10 mm; arte de 30 a 55 mm |
| 28 | **Topo de Bolo** | Culinária | Frase em **2 linhas**; fonte | Texto de 18–34 mm (padrão 24); base de 3 mm; borda de 2,4 mm; relevo de 0,6–2,5 mm; **2 hastes integradas** |
| 29 | **Chaveiro Peso de Academia** | Esporte | SVG ou imagem (multicolor) na face circular | Corpo fixo; relevo até 3 mm |
| 30 | **Decoração de Palavras** | Decoração | Palavra base + palavra de encaixe (ex.: "AMOR" + "Família") | Palavra base de 50 mm / 10 mm de espessura; palavra de encaixe de 29 mm / 3 mm; **encaixe rebaixado automático**; conexão de 2 mm |
| 31 | **Carimbos para Brigadeiro** | Culinária | **1 a 6 SVGs** | Carimbo r 9 mm / largura 14 mm; relevo de 1–4 mm (padrão 3) |
| 32 | **Carimbo e Cortador de Biscoito** | Culinária | **1 a 4 SVGs** | Tamanho de 35 a 55 mm; alturas de moldura, carimbo, cortador e relevo; espessura da base; parede do cortador por offset do contorno (Clipper2) |
| 33 | **Ejetor de brigadeiro** | Culinária | 1 SVG | Corpo interno + moldura adaptados ao desenho |

**Como replicar os modelos:** duas estratégias.
- **(A) Mesma do Gestor:** TypeScript + manifold-3d + three.js, com um "gerador" por modelo e 3MF-base para as partes mecânicas fixas. Máxima qualidade, alto custo (cada modelo leva dias).
- **(B) openscad-wasm** (OpenSCAD compilado para WASM, GPL-2, backend Manifold): escrever cada modelo como `.scad` paramétrico (há milhares prontos em licença aberta no Printables e no Thingiverse Customizer) e usar a interface web só como formulário. O SVG entra via `import()`.
- **Recomendação:** começar com **(B)** para 3–5 modelos de maior demanda (chaveiro de nome, chaveiro de logo, placa Pix, topo de bolo, carimbo de brigadeiro). Migrar para (A) só os que precisarem de edição 2D direta.

---

## 7. Demais ferramentas e recursos

| Ferramenta | Como funciona (bundle) | Limite | Replicar? |
|---|---|---|---|
| **Buscador de STLs** (`/buscador-stls`) | Só um **iframe de `https://3dsearch.net/`** (liberado no CSP `frame-src`) | Todos **(inferido)** | Trivial (link ou iframe) |
| **Extensão de mercado** | Extensão Chrome/Edge (`chromewebstore…/mkgpjdcgjghckmdgogbnoonkihpmjdbi`), com login próprio (tokens de acesso e renovação). Lê títulos, preços e "vendidos" das páginas da Shopee, ML e TikTok **no navegador**, aplica as taxas da conta e o custo informado, e mostra "Análise completa do anúncio" e "Comparação de anúncios" | **Só assinantes** e exige senha cadastrada (não funciona com login Google) | Não. Raspagem frágil que quebra quando o site muda; fora do escopo |
| **Catálogo PDF** | HTML gerado no cliente, **12 produtos por página A4**, foto, nome e preço, logo comercial, rodapé "NN / NN", `@page {size:A4; margin:0}` + impressão | Só assinantes | Fácil; P2 |
| **Exportação em massa (Shopee)** | Gera **`Shopee_mass_upload_gestor_3d.xlsx`** com zip e OOXML próprios (NCM/EX TIPI, FCI, origem, variações, peso e dimensões, prazo de postagem, 8 imagens…) | Só assinantes | Médio; só se ela vender na Shopee |
| **Orçamento** | Cliente, itens (catálogo ou avulsos), desconto, frete, condições, prazo, logo (`/api/settings/quote-logo`), prévia A4 + `print()`, **QR Pix no orçamento** (`Quotes` usa `qrcode`), converter em pedido | 10/mês no grátis | Fácil (P1 do MVP) |
| **Contrato de consignação** | Mesmo motor A4; partes, itens do catálogo com valor de repasse sugerido | 10/mês no grátis | Fácil (P2) |
| **Insights de produtos** | Períodos: dia (24 h), semana (7 d), mês (30 d). Saúde do estoque: `atual/recomendado > 0,5` saudável, `≥ 0,2` atenção, abaixo disso crítico. Filamento: "Nível crítico" se ≤ mínimo, "Saúde baixa" se < 50% | **Só Premium** | Fácil |
| **Calculadora** | Ver `gestor3d-estudo.md` §1.1 | Ilimitada | P0 |
| **Sorteios** (`/sorteios`) | Lista de sorteios com foto; o admin cria e sorteia (`/api/admin/giveaways/:id/draw`) | — | Não |
| **Afiliados** | Comissão por fatura paga, saque via Pix | — | Não |

---

## 8. Limites por plano (ferramentas)

| Ferramenta (chave de uso) | Grátis | Básico R$15 | Pro R$30 | Premium R$60 |
|---|---|---|---|---|
| Calculadora | ∞ | ∞ | ∞ | ∞ |
| Conversor SVG (`svg_conversion`) | 5/mês | ∞ | ∞ | ∞ |
| QR Code (`qr_code_generation`) | 5/mês | 10 | 20 | ∞ |
| Separador 3MF (`three_mf_download`) | 1/mês | 2 | 4 | ∞ |
| Modelos (`custom_product_download`) | 1 por modelo/mês | 5 | 10 | ∞ |
| 9 modelos 🔒, catálogo PDF, exportação Shopee | — | ✔ | ✔ | ✔ |
| Extensão de mercado | — | "assinatura elegível" | ✔ **(inferido)** | ✔ |
| Insights de produtos | — | — | — | ✔ |

A cobrança de uso acontece **depois** do sucesso ou no download. Falha não consome.

---

## 9. O que usuários falam

- **Volume orgânico baixo.** Não achei nenhuma thread no Reddit sobre o Gestor 3D. Reclame Aqui e siteconfiavel.com.br não têm registro. O YouTube oficial (@Gestor3DOficial) tinha ~93 inscritos.
- **Divulgação é quase toda de criadores parceiros:**
  - **@makerzando / Felipe Silva** (Instagram, TikTok, YouTube "Makerzando and Gestor 3D", 2,3 mil views). O texto de exemplo do editor de troféu é literalmente "Ex.: Felipe Silva", o que sugere parceria próxima ou autoria **(inferido)**. Títulos: *"Por que o Gestor 3D é o melhor site pra criar chaveiros personalizados"*, *"Da imagem direto pro fatiador sem abrir nenhum software de CAD"*, *"Sem saber modelar! Crie carimbos personalizados"*, *"Como colocar um logo SVG na sua impressão 3D"*, *"Os modelos gerados no Gestor 3D já vêm com configuração de impressão para Bambu Lab A1"*.
  - **@filamentoprocalculo**: *"Se você trabalha com impressão 3D você precisa conhecer esse site… a extensão também faz comparativo dos anúncios."*
  - TikTok "Gestor 3d Pro é bom": *"ferramenta perfeita pra quem quer criar produtos personalizados de forma rápida"*.
- **O que se elogia:** (1) ir da imagem ao 3MF **sem CAD**; (2) conversor SVG "limpo"; (3) arquivos já organizados em cores para Bambu A1/AMS; (4) calculadora grátis.
- **Convertio × Gestor:** não achei a comparação publicada; é relato do Gabriel e dos usuários dele. A análise técnica (§2.3) explica a diferença. Uma comparação independente (SVGMaker 2026) põe o Convertio **entre os piores**: "troca mecânica de formato, excesso de nós, cores pobres".
- **Riscos percebidos (inferido):** dependência da Bambu e do 3MF, cotas baixas no grátis (1 modelo/mês) e extensão exclusiva para assinantes.

---

## 10. Concorrentes e ferramentas grátis para makers: ideias que valem trazer

| Ferramenta | O que faz | Ideia para trazer |
|---|---|---|
| **MakerWorld, MakerLab Parametric Model Maker** (Bambu, grátis) | Chaveiros, placas, topos de bolo; **"image to keychain"**; modelo com **vários nomes separados por vírgula que popula a mesa inteira** | **Geração em lote** (lista de nomes → 1 3MF com N chaveiros). Ótimo para festas e brindes |
| **Thingiverse Customizer / Printables** (OpenSCAD) | Milhares de `.scad` paramétricos abertos | Base de modelos para a estratégia (B) da §6 |
| **HueForge** (pago) | Imagem→relevo multicolor por camadas (troca de filamento por altura) | Pode ser uma ferramenta futura, "quadro HueForge simples" |
| **Gerador de litofania** (vários grátis) | Foto→relevo por espessura | Fácil com canvas → heightmap → malha |
| **Spoolman** (código aberto) | Estoque de rolos com QR por rolo, peso restante, integra com Klipper/OctoPrint | **Etiqueta QR por rolo** (impressa) + baixa de gramas |
| **print-farm-manager** (Joel Telling, código aberto, 2026) / FDM Monster | Fazenda de impressoras: fila, custos, energia | Referência de fila de impressão por impressora |
| **3D Prime / 3D Lab / Forja3D / Calculadora 3D / Precifica 3D** (BR) | Calculadoras grátis, algumas com orçamento em PDF | Nossa calculadora precisa ser pelo menos igual (PDF de orçamento incluso) |
| **meugestor3d.com.br / 3D Business** (BR) | ERPs concorrentes pagos | Validam a demanda por pedidos + financeiro |
| **svg2stl.com / Vextrude / threejsresources** | SVG→STL extrudado no navegador | **Exportar direto em STL/3MF extrudado** no nosso conversor |
| **3dsearch.net** | Meta-busca de STL | Link "Buscar modelos" (o Gestor só usa iframe) |

---

## 11. Distribuição com custo zero

As ferramentas pesadas (vtracer ~0,7 MB e manifold ~0,5 MB de WASM, three.js ~0,6 MB) **já rodam no cliente** no Gestor 3D, sem threads e sem cabeçalho COEP. Então não precisamos de servidor.

| Critério | **PWA estático** (Cloudflare Pages) | PWA no GitHub Pages | PWA na Vercel Hobby | **Desktop Tauri** | Desktop Electron | Híbrido (PWA + Tauri depois) |
|---|---|---|---|---|---|---|
| Custo | R$0 (banda ilimitada no plano grátis) | R$0 (site ≤1 GB, ~100 GB/mês "soft") | R$0, **uso não comercial** | R$0 para gerar; **assinatura de código**: Apple US$99/ano, Windows com certificado pago ou alerta do SmartScreen | Idem | R$0 na fase 1 |
| Instalação | Link + "Adicionar à tela inicial"; atualiza sozinho | Idem | Idem | Baixar instalador (3–10 MB) | Instalador de 80–150 MB | Link primeiro |
| Celular | ✅ (Android e iOS) | ✅ | ✅ | ❌ (Tauri mobile ainda imaturo **inferido**) | ❌ | ✅ |
| WASM / Workers | ✅ | ✅ | ✅ | ✅ (webview do sistema; o WebKit do Safari no Mac é mais lento) | ✅ (Chromium) | ✅ |
| Cabeçalhos (CSP, COOP/COEP para threads futuras) | ✅ arquivo `_headers` | ❌ sem cabeçalhos customizados (paliativo: `coi-serviceworker`) | ✅ `vercel.json` | n/a | n/a | ✅ |
| Dados | IndexedDB + `navigator.storage.persist()` + backup ZIP/JSON; File System Access no Chrome | Idem | Idem | Arquivos no disco (SQLite), mais robusto | Idem | Idem; migra depois |
| Risco de perder dados | Médio: limpeza do navegador. No iOS, PWA **instalado** na tela inicial é poupado da limpeza de 7 dias do Safari **(verificar)** | Idem | Idem | Baixo | Baixo | Médio → baixo |
| Manutenção | `git push` = deploy | Idem | Idem | Builds por SO, atualizador, assinatura | Pior | Baixa na fase 1 |

**Recomendação: PWA estático (Vite + React + TS) no Cloudflare Pages**, com:
- WASM e workers carregados sob demanda por ferramenta (a primeira tela carrega em menos de 300 KB);
- service worker (Workbox / `vite-plugin-pwa`) para funcionar **offline**;
- dados em IndexedDB (Dexie) com `storage.persist()` + **backup ZIP de 1 clique** (e lembrete semanal);
- `_headers` com CSP estrita (como a do Gestor) e, se um dia usarmos WASM multithread, COOP/COEP;
- domínio próprio opcional (o `*.pages.dev` é grátis).

Tauri só vira opção se ela pedir "arquivo no computador" ou trabalho 100% offline pesado, e aí o mesmo código React embrulha. Electron: não.

---

## 12. Plano de replicação das ferramentas (prioridade)

| Prior. | Item | Base técnica | Esforço |
|---|---|---|---|
| **P0** | Conversor imagem→SVG (1 cor) igual ao Gestor + remoção de fundo + checagem de traço < 0,4 mm | vtracer 1.0 WASM + pipeline da §2.2 | 2–3 dias |
| **P0** | Exportar SVG **extrudado em STL/3MF** (altura, base opcional) | three.js `SVGLoader` + `ExtrudeGeometry` ou manifold `CrossSection.extrude`; 3MF = zip (fflate) + XML | 2 dias |
| **P1** | QR Code / Pix vetorial (+ exportar em 3MF com 2 cores) | `qrcode` + payload EMV/CRC16 | 1 dia |
| **P1** | Modo colorido (2–4 cores → volumes) | vtracer `cutout` + `palette` + k-means em Lab (§2.4) | 3–4 dias |
| **P1** | 3–5 modelos paramétricos (nome, logo, placa Pix, topo de bolo, carimbo de brigadeiro) + **geração em lote de nomes** | openscad-wasm ou manifold-3d | 1–2 dias por modelo |
| **P2** | Catálogo PDF, orçamento/contrato com QR Pix | HTML + `@page A4` + `print()` | 1–2 dias |
| **P2** | Etiqueta QR por rolo de filamento (estilo Spoolman) | QR + cadastro de filamentos | 1 dia |
| **Fora** | Separador 3MF por pintura, extensão de marketplace, exportação Shopee | — | — |

### Anexo: fontes
- Bundles: `SvgConverter-CeBHwWkW.js`, `vectorize.worker-BFSbTfcz.js`, `workerClient-DgLw1A6o.js`, `rasterArtwork.worker-CUzMjJxU.js`, `catalog-CuoLDDJZ.js`, `qrCode-BGE2WXD0.js`, `textToSvg-DP4zWGW4.js`, `ThreeMFCutter-0yz7Jnea.js`, `Products-B-uuqSl0.js`, `stockHealth-DmatOQc-.js`, editores `*Editor-*.js` e `*Geometry-*.js`, `vtracer_wasm_bg-DKZlEtiA.wasm`, `manifold-BE4c7gO-.wasm`.
- Web: github.com/visioncortex/vtracer (README 1.0, MIT); svgmaker.io "Best Free SVG Converters 2026"; buscas no Instagram/TikTok (@makerzando, @filamentoprocalculo); MakerWorld MakerLab; the3dprintingnerd.com (print-farm-manager); Reclame Aqui / siteconfiavel.
