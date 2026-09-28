# UpVision Maker — Roadmap

> Objetivo: app desktop gratuito (Windows + macOS) que cobre **tudo** o que o gestor3d.pro faz, exceto planos pagos, afiliados, sorteios e painel admin.
> Base: `docs/gestor3d-estudo.md` (§ = seção do estudo) e `docs/gestor3d-ferramentas.md` (§F = seção do doc de ferramentas).
> Só reaproveitamos **fórmulas e ideias**. Textos, marca e layout são nossos.

**Legenda**
- **Viável:** ✅ sim · 🟡 sim, com ressalvas · ❌ não recomendado
- **Esforço** (1 dev): P = até 1 dia · M = 2–4 dias · G = 1–2 semanas · GG = mais de 2 semanas
- Sem limites de uso: tudo ilimitado, histórico completo, financeiro completo.

---

## Arquitetura (vale para todas as fases)

| Peça | Escolha | Por quê |
|---|---|---|
| Shell | **Tauri 2** (webview do sistema) | Instalador de poucos MB, dados em arquivo no disco |
| UI | Vite + React + TypeScript | Mesma stack de referência, roda tudo no cliente |
| Dados | **SQLite** local (`tauri-plugin-sql`), migrações versionadas (`PRAGMA user_version`) | Robusto, um arquivo só |
| Backup | JSON de 1 clique (salvar/abrir via diálogo) + cópia de segurança automática antes de restaurar | Proteção contra perda de dados |
| Ferramentas pesadas | WASM no cliente, em Web Workers, carregado sob demanda: **vtracer** (MIT) e **manifold-3d** (Apache-2.0) + three.js | Igual à referência, sem servidor |
| Atualização | `tauri-plugin-updater` lendo **GitHub Releases** (`latest.json` assinado) | Grátis |
| Build | GitHub Actions em tag `v*`: Windows `.msi` + `.exe` (NSIS), macOS `.dmg` universal | Grátis para repo público |
| Assinatura de código | **Nenhuma** (paga). Documentar SmartScreen / Gatekeeper | Custo zero |

---

## Fase 0 — Fundação ✅ (feita)
| Item | Viável | Esforço | Riscos |
|---|---|---|---|
| Scaffold Tauri 2 + React + TS, lint, Vitest | ✅ | P | — |
| SQLite local + migrações | ✅ | P | Pool do `tauri-plugin-sql` não garante transação entre chamadas; operações críticas validam antes de gravar |
| Layout com navegação lateral, tema claro | ✅ | P | — |
| Backup/restauração em 1 clique (JSON) | ✅ | P | Restaurar sobrescreve tudo: por isso a cópia automática antes |
| Updater + workflow de release (sem repo ainda) | ✅ | P | Sem assinatura de código: avisos do SmartScreen/Gatekeeper na 1ª abertura. **Perder a chave privada do updater = usuários não recebem mais atualizações** |

## Fase 1 — Precificação ✅ (feita)
| Item | Ref. | Viável | Esforço | Riscos |
|---|---|---|---|---|
| Preferências: kWh, mão de obra R$/h, manutenção %, multiplicadores revenda/consumidor (3/5), taxas por canal (Shopee %+fixa, ML %+fixa, TikTok %+fixa) | §1.2 | ✅ | P | Taxas de marketplace mudam: tudo editável, padrões só como ponto de partida |
| Impressoras (nome, potência W) | §1.3 | ✅ | P | Catálogo de marcas/modelos da referência é mantido por admin; aqui é digitado |
| Filamentos com estoque, mínimo, **reposição com custo médio ponderado** e ajuste | §1.3 | ✅ | P | — |
| Materiais extras com estoque, reposição e ajuste | §1.3 | ✅ | P | — |
| Calculadora (§1.1): vários filamentos, extras, energia, mão de obra, manutenção %, quantidade na mesa, frete somado **depois** do multiplicador, preço por canal com margem líquida, detalhamento | §1.1 | ✅ | M | Arredondar só no fim (testado com o exemplo R$ 15,96 / 47,88 / 79,80) |

## Fase 2 — Ferramentas 3D do dia a dia ✅ (feita em 2026-09-28, v0.2.0)
Motivo: é o que ela já faz hoje pedindo ao Claude (3MF de chaveiros e medalhas) e com SVG (cortador de biscoito). A gestão (antiga Fase 2 em diante) vem depois.
Ordem de entrega: 0 → 1 → 2 primeiro, de ponta a ponta; depois 3 → 8. Todos entregues; 3MF validado no Bambu Studio (CLI: partes, extrusoras e fatiamento).
Extra entregue a partir do feedback: modo **Silhueta** (MediaPipe local), Aplicar explícito com progresso/cancelar, limpeza em mm, detecção de foto e testes de regressão com imagens de referência.

| # | Item | Ref. | Viável | Esforço | Riscos |
|---|---|---|---|---|---|
| 0 | Design system (azul #2563EB + laranja #F97316 da marca, Outfit/Work Sans, ícones Lucide), navegação Ferramentas / Gestão / Preferências, início com cards, **prévia 3D reutilizável** (three.js), estados de carregamento/erro | — | ✅ | P | — |
| 1 | Imagem → SVG 1 cor: pipeline §F2.2 (EXIF, ampliar até 1200 px, luminância com alfa, limiar, vtracer `spline`, 1 `<path>` evenodd em mm) + **Otsu automático**, **remoção de fundo por inundação**, **aviso de traço < 0,4 mm** | §F2 | ✅ | M | Pacote `vectortracer` (MIT, núcleo visioncortex) usado no lugar de compilar o vtracer 1.0; sem modo colorido por ora |
| 2 | Cortador de biscoito a partir do contorno: lâmina ~0,8 mm, altura ajustável, borda de apoio, **carimbo opcional** com o desenho interno; STL e 3MF | §F6 #32 | ✅ | M | Desenhos com partes soltas: o contorno usa a união; espelhamento para a massa sair na orientação certa |
| 3 | Extrusão genérica SVG → STL/3MF (altura, base opcional, 2 cores) | §F2.5 | ✅ | P | SVG com auto-interseção: resolvido pela união do manifold |
| 4 | Chaveiros: texto com fontes (texto → forma), logo, argola/furo, **2 cores como volumes** no 3MF (Bambu Studio/OrcaSlicer), **lote a partir de lista de nomes** | §F6 #17, #20 | ✅ | M | Metadados de cor do Bambu mudam entre versões: validar abrindo no Bambu Studio |
| 5 | Medalhas: formato, texto, imagem central, furo para fita, cores por volume | §F6 #12 | ✅ | M | — |
| 6 | **Pedir à IA**: chave Anthropic local (paga por uso, botão Testar), descrição → Claude gera OpenSCAD → openscad-wasm → prévia → ajustes em conversa → 3MF; tokens e custo por pedido | — | 🟡 | M | Custo por uso na conta dela; OpenSCAD gerado pode não compilar (repetir com o erro); openscad-wasm pesa ~10 MB (carregar sob demanda) |
| 7 | Botão **Sugerir ferramenta** (mailto para `VITE_FEEDBACK_EMAIL` definido no build; fallback issue no GitHub) | — | ✅ | P | mailto não anexa arquivo: a imagem é anexada à mão |
| 8 | Tela **O que há de novo** após cada atualização (`CHANGELOG.md`) | — | ✅ | P | — |

## Fase 3 — Cadastros de venda
| Item | Ref. | Viável | Esforço | Riscos |
|---|---|---|---|---|
| Produtos: composição (filamentos, extras, tempo, impressora, mão de obra), preço por canal ou manual, "Salvar produto" a partir da calculadora, recálculo quando insumo muda | §1.4 | ✅ | M | Decidir se preço salvo é congelado ou recalculado (proposta: custo sempre recalculado, preço manual opcional congela) |
| Fotos do produto (até 8 + capa) | §1.4 | ✅ | P | Guardar em pasta do app, não no SQLite; incluir no backup (vira ZIP) |
| Kits (produto de produtos) | §1.4 | ✅ | P | Evitar ciclos (kit dentro de si mesmo) |
| Produtos produzidos (estoque de acabados, produção manual, prévia de consumo) | §1.4 | ✅ | M | Produzir dá baixa em insumos; venda com estoque acabado não baixa insumos de novo |
| Valor de repasse sugerido (consignação) | §1.7 | ✅ | P | — |
| Clientes (PF/PJ, contato, CEP com autopreenchimento, desconto padrão, ativo/inativo) | §1.3 | ✅ | P | CEP via ViaCEP/BrasilAPI precisa de internet; campo manual como fallback |
| Dados da empresa + logo (cabeçalho de documentos) | §1.3 | ✅ | P | — |

## Fase 4 — Vendas
| Item | Ref. | Viável | Esforço | Riscos |
|---|---|---|---|---|
| Pedidos: cliente, itens, desconto por item, canal, prazo, forma de pagamento, observações, status (pendente → produção → concluído → entregue / cancelado) + histórico | §1.5 | ✅ | M | — |
| **Baixa de estoque ao confirmar, estorno ao cancelar/excluir, sem baixa dupla** (flag `stock_applied` + operação única em Rust/SQL) | §1.5 | ✅ | M | Precisa ser atômico: fazer num comando Rust com transação, não em várias chamadas do JS |
| Receita reconhecida pela data de entrega | §1.5 | ✅ | P | — |
| Orçamentos: itens do catálogo ou avulsos, desconto, frete, condições, validade, logo, **QR Pix**, prévia A4 → PDF (`window.print`) | §1.6 | ✅ | M | Impressão da webview: testar Windows (WebView2) e macOS (WKWebView) |
| Converter orçamento em pedido (uma vez só) | §1.6 | ✅ | P | — |
| Contrato de consignação (mesmo motor A4, aviso jurídico) | §1.7 | ✅ | P | Texto jurídico próprio; revisar com advogado se for usar a sério |

## Fase 5 — Resultado
| Item | Ref. | Viável | Esforço | Riscos |
|---|---|---|---|---|
| Custos operacionais (categoria, valor, frequência único/semanal/mensal/anual, impressora opcional) | §1.3 | ✅ | P | Rateio de custos por mês a definir |
| Impressoras: parcelas/quitada, manutenção, **lucro por impressora** | §1.3 | ✅ | M | — |
| Financeiro: receitas, CMV, despesas, lucro, **R$/hora de impressão**, filtros, gráfico de linha, indicadores por produto/canal/impressora, exportar CSV | §1.8 | ✅ | M | — |
| Dashboard: pedidos por status, prazos da semana, filamentos acabando, receita do mês | §1.9 | ✅ | P | — |
| Insights: vendidos por dia/semana/mês, estoque recomendado, saúde do estoque (>0,5 / ≥0,2 / crítico), mais vendido | §F7 | ✅ | P | — |
| Catálogo PDF (12 produtos por A4, foto, nome, preço, logo) | §F7 | ✅ | P | — |
| Exportação em massa Shopee (`.xlsx` no formato de upload) | §F7 | 🟡 | M | Formato da planilha muda sem aviso; campos fiscais (NCM, CFOP…) exigem cuidado. Fazer só se ela vender na Shopee |

## Fase 6 — Ferramentas 2D (o que sobrar após a Fase 2)
| Item | Ref. | Viável | Esforço | Riscos |
|---|---|---|---|---|
| Gerador QR (Pix estático BR Code com CRC16, link, Wi-Fi, e-mail, telefone) → SVG; validação de CPF/CNPJ (inclusive alfanumérico) | §F3 | ✅ | P | Testar payload Pix em 2–3 apps de banco |
| Conversor imagem→SVG 1 cor (pipeline §F2.2: EXIF, ampliar até 1200 px, luminância com alfa, limiar, vtracer `bw/spline`, 1 `<path>` evenodd em mm) | §F2 | ✅ | M | vtracer precisa de build WASM próprio (`wasm-pack`); WKWebView do Mac é mais lento |
| Texto → forma (canvas + webfonts + vtracer) | §F5 | ✅ | P | Licença das fontes (usar Google Fonts OFL, embutidas) |
| SVG colorido 2–4 cores (Lab, k-means, remove fundo, descarta antisserrilhado, `watershed + cutout`) | §F2.4 | ✅ | G | Ajuste fino de heurísticas; precisa de banco de imagens de teste |
| Buscador de STLs (abrir 3dsearch.net / iframe) | §F7 | ✅ | P | Site de terceiros pode bloquear iframe → abrir no navegador |

## Fase 7 — Ferramentas 3D base (o que sobrar após a Fase 2)
| Item | Ref. | Viável | Esforço | Riscos |
|---|---|---|---|---|
| Extrusão SVG → **STL** e **3MF** (altura, base opcional, prévia three.js) | §F2.5 | ✅ | M | Malhas de SVG com auto-interseção: passar por manifold para limpar |
| Gravador 3MF compatível Bambu Studio/OrcaSlicer (volumes por cor, `model_settings.config`, pausa na altura p/ NFC) | §F1 | 🟡 | M | Formato de metadados do Bambu é pouco documentado e muda entre versões |
| QR Pix em 3MF (2 cores, módulos em relevo, aviso de tamanho mínimo) | §F3 | ✅ | P | — |

## Fase 8 — Modelos paramétricos (33)
Estratégia: gerador TypeScript + manifold-3d por modelo, reaproveitando os núcleos de SVG/texto/3MF. Partes mecânicas fixas (abridor, clicker, MOLLE) modeladas por nós do zero — **não copiar os 3MF-base da referência**.

| Onda | Modelos | Viável | Esforço | Riscos |
|---|---|---|---|---|
| 7a — texto/logo em placa | Chaveiro de Nome, Chaveiro de Logo, Topo de Lápis, Topo de Bolo, Placa adaptável, Placa de sinalização, Marca-página, Decoração de Palavras, Placa de PIX | ✅ | M cada (1º G) | Tolerâncias de encaixe dependem da impressora: expor folga como parâmetro |
| 7b — culinária | Carimbos para Brigadeiro, Carimbo e Cortador de Biscoito, Ejetor de brigadeiro, Clipe de saco | ✅ | M cada | Offset de contorno (Clipper2 via manifold) em artes finas |
| 7c — brindes/esporte | Medalha básica, Medalha adaptável, Troféu básico/elegante/adaptável, Chaveiro Peso de Academia, Molle tag, Clipe de papel, Plaquinha de colorir | ✅ | M cada | — |
| 7d — mecânicos/NFC | Chaveiro Tag NFC, Anilha porta-joia NFC, Totem NFC, Chaveiro giratório, Abridor de garrafa, Abridor de lata, Clicker (switch), Chaveiro de nome articulado, Porta caneta, Porta chave, Luminária adaptável | 🟡 | G cada | Peças funcionais exigem impressão de teste e iteração física; pausa NFC depende do 3MF Bambu |
| Editor comum | Prévia 2D/3D, pintar partes, relevo por região (0,6–4 mm), nivelada/relevo, apagar partes | ✅ | G | É a maior parte do esforço; fazer junto com 7a |

## Fase 9 — Separador 3MF
| Item | Ref. | Viável | Esforço | Riscos |
|---|---|---|---|---|
| Ler 3MF com `paint_color`, separar por cor, corte planar com pino/cavidade, 4 estratégias de tampa, exportar multi-objeto | §F4 | 🟡 | GG | Formato de pintura do Bambu pouco documentado; malhas não-manifold; Bambu/Orca já cortam com conectores. **Fazer por último** |

## Fora de escopo / não recomendado
| Item | Viável | Riscos |
|---|---|---|
| Extensão de pesquisa de mercado (Shopee/ML/TikTok) | ❌ | **Scraping frágil**: quebra a cada mudança de layout, pode violar termos de uso dos marketplaces, manutenção constante. Alternativa: campo manual "preço do concorrente" na calculadora |
| Integração direta com APIs de marketplace | ❌ (por ora) | Exige app registrado, OAuth e servidor para callbacks; contraria o "sem servidor" |
| Planos, pagamentos, afiliados, sorteios, admin, tickets | ❌ | Fora do objetivo |

---

## Melhorias sobre a referência (espalhar nas fases)
| Melhoria | Fase | Esforço |
|---|---|---|
| Lembrete de backup semanal + backups automáticos rotativos na pasta do app | 2 | P |
| Campo "preço do concorrente" na calculadora (substitui a extensão) | 2 | P |
| Etiqueta QR por rolo de filamento (estilo Spoolman) + baixa de gramas | 4 | P |
| Pix com valor fixo e txid opcional | 5 | P |
| Conversor SVG: botão **Auto** (Otsu / limiar adaptativo), remoção de fundo por inundação, abrir/fechar morfológico de 1 px, `simplify` | 5 | M |
| **Checagem de fabricabilidade**: traço < 0,4 mm e ilhas < 1 mm² destacados | 5 | M |
| Modo colorido com as **cores dos filamentos cadastrados** | 5 | P |
| **Geração em lote** (lista de nomes → 1 3MF com N chaveiros) | 7 | M |
| Litofania (foto → relevo) e "quadro por camadas" simples (estilo HueForge) | 7+ | M/G |
| Fila de impressão por impressora | 4+ | M |
| Testes de regressão do conversor com 10–15 imagens de referência | 5 | P |

## Riscos transversais
- **Chave do updater:** guardada fora do repo (`~/.tauri/upvision-maker.key`). Perdeu = não dá para publicar atualizações para quem já instalou. Fazer cópia em cofre de senhas.
- **Sem assinatura de código:** Windows mostra SmartScreen ("Mais informações → Executar assim mesmo"); macOS bloqueia app não notarizado (clique direito → Abrir, ou `xattr -dr com.apple.quarantine`). Ver `README.md`.
- **Dados locais:** um computador = uma base. Sincronização entre máquinas fica para depois (opção: exportar/importar backup).
- **Webview diferente por SO:** WebView2 (Windows) × WKWebView (macOS): testar impressão A4 e WASM nos dois.
