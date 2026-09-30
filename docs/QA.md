# QA — UpVision Maker (0.2.0)

Relatório de exploração e testes. Data: 2026-09-28.

## Mapa do app

| Área | Telas | Arquivos |
|---|---|---|
| Shell | Sidebar (grupos Ferramentas / Gestão / Preferências), banner de atualização, backup/restauração, Sugerir ferramenta, O que há de novo | `src/App.tsx`, `src/pages.tsx` |
| Ferramentas | Imagem → SVG, Cortador de biscoito, Chaveiros, Medalhas, Extrusão 3D, Pedir à IA | `src/tools/*` + `src/geometry`, `src/vectorize`, `src/ai` |
| Gestão | Calculadora, Filamentos, Materiais extras, Impressoras | `src/pages/*` (CRUD genérico em `src/ui/CrudPage.tsx`) |
| Preferências | Custos, multiplicadores, canais de venda, chave da IA | `src/pages/Preferences.tsx`, `AiSettingsCard.tsx` |

Fluxos principais: imagem → SVG → (handoff) cortador/extrusão → 3MF/STL; cadastro → calculadora; backup JSON validado com cópia de segurança antes de restaurar.
Arquitetura: React sem roteador (estado `pageId`), SQLite via `@tauri-apps/plugin-sql` com migrações lazy, geometria em manifold-3d (WASM), vetorização em worker (vtracer WASM), segmentação MediaPipe, OpenSCAD WASM em worker.

## Verificações

| Comando | Resultado |
|---|---|
| `npm test` | 24 arquivos, 113 testes ✔ |
| `npm run lint` / `typecheck` | limpos ✔ |
| `npm run build` | ✔ — aviso: bundle principal 1,66 MB (todas as ferramentas carregadas na abertura) |
| `cargo check` / `cargo clippy` | limpos ✔ |
| `npm run e2e` (novo) | 16 testes ✔ (+ 4 de screenshots com `SHOTS=`) |

### Cobertura (`npm run coverage`)

- Arquivos com teste (lógica): **94 % statements / 96 % linhas / 84 % branches**.
- `src` inteiro, incluindo UI: **43 % statements / 42 % linhas** depois do redesign (era 47 %/46 %: entrou mais código de tela) — as telas `.tsx`, `db/index.ts`, `backupActions.ts`, `ai/claude.ts` e `ai/render.ts` não têm teste unitário. Os E2E cobrem essas telas de ponta a ponta.
- Lacunas de lógica: `geometry/svgImport.ts` (74 % linhas, ramos de `transform`/elementos básicos), `vectorize/pipeline.ts` (78 %, cancelamento e modo silhueta sem máscara), `geometry/medal.ts` (89 %, formato escudo).

## E2E (Playwright + mock do IPC do Tauri)

`tests/e2e/tauri.ts` instala `window.__TAURI_INTERNALS__` (mesmo contrato do `mockIPC`) e responde no Node: SQL num SQLite em memória (`node:sqlite`), diálogos controláveis e arquivos salvos numa `Map` que o teste inspeciona (3MF é zip, STL tem nº de triângulos coerente). Roda num Vite próprio numa porta livre escolhida a cada execução (worktrees em paralelo não se misturam); `E2E_PORT=1430 npm run e2e` fixa a porta e reaproveita um Vite já aberto nela. Não toca no `tauri dev` da 1420.

| Spec | Cobre |
|---|---|
| `gestao.e2e.ts` | navegação por todas as páginas; Preferências (salvar, persistir, inválido); Impressoras (CRUD + validação); Filamentos (estoque baixo, reposição 100 g×R$100 + 900 g×R$120 → R$ 118,00/kg); Materiais; Calculadora (padrões da v0.6, falha 5%: R$ 15,74 / 47,21 / 78,68; os testes de canais em `v04-gestao.e2e.ts` usam as preferências antigas, manutenção 5% sem falha: R$ 15,96 / 47,88 / 79,80); Backup (salvar, restaurar com cópia de segurança, arquivo inválido) |
| `ferramentas.e2e.ts` | Imagem→SVG com logo e desenho (salva SVG em mm); foto → sugestão do modo Silhueta → poucos contornos; handoff SVG → Cortador → 3MF + STL; SVG direto no cortador; cancelar o "Salvar como" |
| `screens.e2e.ts` | `SHOTS=antes\|depois npm run e2e -- screens` grava todas as telas em 1280×800 e 1440×900, claro e escuro, em `docs/screenshots/` |

## Bugs

| # | Sev. | Onde | Passos | Status |
|---|---|---|---|---|
| B1 | Média | Formulários de Gestão | Impressoras → nome "X", potência vazia → Adicionar. Aparece "Invalid input: expected number, received NaN" (mensagens do Zod em inglês; também "Too small: expected number to be >0") | Corrigido (`fieldErrors` traduz; teste unitário + E2E) |
| B2 | Média | Sidebar | Janela 1280×800: o rodapé (Fazer/Restaurar backup) fica abaixo da dobra; "Restaurar backup" aparece cortado e só aparece rolando a sidebar | Corrigido (rodapé fixo, lista rola) |
| B3 | Baixa | Imagem→SVG | Carregar imagem, apagar "Largura final" → "A altura acompanha a proporção: NaN mm." + aviso do React (`value` NaN) | Corrigido pelo Lupa (b4ce774) |
| B4 | Baixa | Cortador / Extrusão | Com desenho carregado, deixar um campo fora da faixa → a prévia volta para "Envie um desenho…", como se o arquivo tivesse sumido | Corrigido pelo Lupa (b4ce774) |
| B5 | Baixa | Toast | Dois toasts com o mesmo texto seguidos: o timer do primeiro fecha o segundo antes dos 5 s; um toast novo substitui o anterior sem transição | Corrigido (fila com id, até 3) |
| B6 | Baixa | Dropzone (a11y) | Foco na área de soltar + Espaço: abre o seletor, mas a página rola junto (sem `preventDefault`) | Corrigido |
| B7 | Baixa | Modais (a11y) | Sugerir ferramenta / O que há de novo: Tab sai do modal para a página de trás; ao fechar, o foco não volta ao botão que abriu | Corrigido (`<dialog>` nativo; E2E cobre) |
| B8 | Baixa | Calculadora | Escolher impressora e depois digitar outra potência: o select continua mostrando a impressora | Corrigido (select controlado; vale também para preço digitado de filamento/material) |
| B9 | Info | Build | Bundle inicial 1,66 MB: ferramentas pesadas carregadas na abertura | Corrigido: 349 KB (páginas com `React.lazy`) |
| B10 | Info | Dev | Na 1ª abertura do `vite` com cache frio, o otimizador de deps recarrega a página no meio do uso (só dev) | Documentado |
| B11 | Info | Visual | Sem modo escuro; screenshots "escuro" idênticos aos claros | Corrigido (claro/escuro do sistema) |

## Fase B — redesign estilo Apple

Base: `/ui-ux-pro-max` + regras do Apple HIG da skill (escala tipográfica do macOS, dark não invertido, motion só com propósito, sem controle crítico no rodapé). A sugestão genérica da busca (teal + Plus Jakarta) foi descartada por conflitar com o briefing (azul UpVision + fonte do sistema).

- **Tokens num só lugar**: `src/styles/tokens.css` (cores claro/escuro, tipografia, raios, sombras, motion). CSS em camadas: `base` (elementos), `layout` (janela), `components`, `tools`. As ferramentas do Lupa herdaram o visual sem mudar os arquivos delas.
- **Tipografia**: SF Pro no Mac, Segoe UI Variable no Windows 11 (Segoe UI no 10); nenhuma fonte de interface baixada (saíram Outfit e Work Sans). Large title 30 px nas páginas.
- **Superfícies**: sidebar translúcida com blur, toolbar sticky que ganha vidro e título pequeno ao rolar, cards/tabelas como grupos arredondados com sombra em camadas, cantos contínuos (`corner-shape`) no WebView2.
- **Claro/escuro automático** (`prefers-color-scheme`), também na grade da prévia 3D. Respeita `prefers-contrast` e `prefers-reduced-transparency`.
- **Motion** (só transform/opacity): entrada de página, cards da Início escalonados, press com mola (`linear()`), toasts, sheet, skeleton pulsando, câmera 3D que pousa no modelo e gira devagar 6 s (para ao tocar). `prefers-reduced-motion` desliga tudo, inclusive o voo e o giro da câmera. Motion (framer-motion) não entrou: CSS cobriu tudo sem dependência nova.
- **Componentes base** em `src/ui/`: `Button`, `Card`, `Field`, `Slider`, `NumField`, `Toggle`, `Segmented`, `Sheet` (dialog nativo), `Toast`, `EmptyState`, `Toolbar`, `Sidebar`, `PageSkeleton`, `Dropzone`, `Preview3D`. Catálogo vivo em **Design (interno)**, visível só no modo dev.
- **Estados vazios** com ilustração e ação; **skeleton** enquanto o banco responde e enquanto a página carrega.
- **Onboarding** de primeiro uso em 3 passos (custos → impressora → filamento), pulável, só em instalação nova.

Screenshots: `docs/screenshots/antes/` e `docs/screenshots/depois/` (`<tela>-<largura>-<light|dark>.png`, 1280×800 e 1440×900).

Pendências sugeridas: vibrancy nativa da janela (Tauri `windowEffects`: Mica no Windows 11, `sidebar` no macOS) exigiria janela transparente, a testar no Windows real; conferir no WebView2 do Windows (só deu para validar no Chromium do Playwright e no Mac).

---

# QA — v0.3.0

Data: 2026-09-28. Itens do Quartzo (design/QA); os do Lupa (fatiador, produtos, clientes, pedidos, orçamento/PDF, financeiro, modelos) estão no CHANGELOG.

## Verificações

| Comando | Resultado |
|---|---|
| `npm test` | 85 arquivos, **603 testes** ✔ |
| `npm run coverage` | **96,8 % statements · 90,2 % branches · 98,1 % linhas** (era 43,5 % no início da v0.3.0) |
| `npm run e2e` | **47 testes** ✔ (+ 4 de screenshots com `SHOTS=depois`) |
| `npm run lint` / `typecheck` / `build` | limpos ✔ |
| `cargo clippy` / `cargo test` | limpos ✔ · 7 testes (vibrancy, estoque) |

Cobertura: tudo em `src` conta, menos workers e MediaPipe (só rodam no navegador; cobertos pelos E2E), `main.tsx` e o harness de teste. Testes de componente com Testing Library + happy-dom usam `src/test/harness.tsx`: mock do IPC do Tauri com SQLite em memória (migrações reais), diálogos e arquivos salvos inspecionáveis — o mesmo contrato do mock dos E2E.

## Entregas do Quartzo

1. **Vibrancy nativa** — Mica no Windows 11, material "sidebar" no macOS com barra de título sobreposta; Windows 10 (sem Mica) ou `UPVISION_NO_VIBRANCY=1` → janela opaca. Conteúdo sempre sobre fundo sólido; `prefers-reduced-transparency` volta ao opaco. Testado: Rust (`vibrancy.rs`), unitário (`windowStyle.test.ts`), E2E `janela.e2e.ts` (Mica claro/escuro, fallback, semáforos do Mac) e visualmente no app real no Mac (`docs/screenshots/depois/janela-mac-vibrancy-dark.png`). **Não testado em Windows real** (checagem cruzada do Rust para Windows não compila no Mac; o CI de release compila).
2. **Formulários** (checklist de formulários do `/ui-ux-pro-max`: validar ao sair do campo, revalidar ao vivo depois do erro, confirmar o valor entendido, erro com ícone + texto, desfazer em vez de confirmar):
   - Tempo num campo só: `3h20`, `3:20`, `200 min`, `3` (horas) — mão de obra aceita `15` como minutos.
   - R$ com prefixo e formatação ao sair (`1.234,50`); aceita `R$ 15`, `15,9`, `1234.5`.
   - Estoque em gramas, kg ou rolos (`2 rolos` = 2000 g pelo peso do rolo), com confirmação `2.000 g (2 rolos)`.
   - Cor em bolinhas (16 cores comuns + personalizada); tabela mostra a bolinha.
   - Enter salva; cursor já no 1º campo quando a lista está vazia; campos lembrados no próximo cadastro (material, marca, preço).
   - Ctrl/⌘+K busca global (telas, filamentos, materiais, impressoras, produtos, clientes, pedidos) e abre o registro em edição; Ctrl/⌘+N novo cadastro.
   - Excluir some na hora com "Desfazer" (8 s) em vez de "tem certeza?"; só apaga do banco no fim do prazo (mantém os ids que produtos/pedidos referenciam).
   - Aplicado em Filamentos, Materiais, Impressoras, Calculadora, Preferências, onboarding, Produto, Pedido e Custos.
3. **QR Code e Pix** — Pix estático com valor (BR Code EMV + CRC16; vetor oficial do BCB `…63041D3D`; CPF/CNPJ com dígito verificador), link, Wi-Fi e texto; SVG em mm e 3MF em 2 cores. Utilitários para o Lupa: `pixPayload`, `validPixKey` (`src/domain/pix.ts`), `qrMatrix`/`qrSvg`/`wifiPayload` (`src/domain/qr.ts`), `qrModel` (`src/geometry/qr3d.ts`, usado na Placa Pix). Todo QR gerado nos testes é lido de volta com jsQR.
4. **Design das telas novas** — kanban de pedidos com cor por status e atraso destacado, stat tiles e gráficos do Financeiro com paleta **validada** (`validate_palette`: CVD ΔE ≥ 8 e visão normal ≥ 15, claro e escuro; tokens `--viz-*`), um eixo só, lucro em gráfico divergente separado, "Ver tabela"; Painel e PDF do orçamento revisados.
5. **QA** — E2E do fluxo completo `fluxo-completo.e2e.ts` (fatiador → produto → orçamento com PDF/Pix → pedido → baixa de estoque de 2 × 3,79 g e 2 × 0,55 g → entrega → receita no Financeiro), screenshots claro/escuro em 1280×800 e 1440×900 de todas as telas.

## Bugs da v0.3.0

| # | Sev. | Onde | O que acontecia | Status |
|---|---|---|---|---|
| C1 | Média | Telas novas (CSS) | `features.css` usava tokens que não existem mais (`--radius`, `--primary`, `--shadow`): cantos, sombras e acento quebrados em Produtos/Pedidos/Clientes | Corrigido (Quartzo) |
| C2 | Média | Validação | `fieldErrors` trocava a mensagem do schema pela genérica: "Informe o cliente" virava "Obrigatório.", "Máximo 100%" virava "No máximo 100." | Corrigido (Quartzo) |
| C3 | Média | Dev/E2E | Com cache frio o Vite descobria dependências tarde e recarregava a página no meio do uso (B10), derrubando E2E ao acaso | Corrigido (`optimizeDeps.entries`) |
| C4 | Média | Calculadora | Importar do fatiador antes do cadastro carregar deixava o preço do filamento vazio (1 em 9 rodadas) | Corrigido (Lupa) |
| C5 | Média | Financeiro | "vs. período anterior" usava janela de mesmo nº de dias, não o mês/3 meses anteriores (pulava o dia 1º) | Corrigido (Lupa) |
| C6 | Média | Importar SVG | Linha aberta com traço virava só os pontinhos das juntas | Corrigido (Lupa) |
| C7 | Baixa | Produtos | Miniatura vazia gigante: classe `.empty` do EmptyState colidia com `thumb empty` | Corrigido (Quartzo, `.empty-state`) |
| C8 | Baixa | NumField | Sem limite a mensagem ficava "Use entre  e ."; decimal com ponto | Corrigido (Quartzo) |
| C9 | Baixa | Pedido | Erro de item não dizia qual item | Corrigido (Lupa) |
| C10 | Baixa | Orçamentos / Produto | Excluir orçamento e ações de foto não avisavam falha do banco | Corrigido (Lupa) |
| C11 | Baixa | Custos | Total mensal contava custo que ainda não começou | Corrigido (Lupa) |
| C12 | Baixa | Imagem→SVG | Largura vazia deixava o resultado marcado como desatualizado para sempre | Corrigido (Lupa) |
| C13 | Baixa (a11y) | Medalhas | Botões de formato anunciados como "Formato Formato" | Corrigido (Lupa) |
| C14 | Baixa (a11y) | Campos inteligentes | Dica fazia parte do nome acessível do campo | Corrigido (Quartzo, `aria-describedby`) |
| C15 | Baixa | Visual | Rótulos desalinhavam com dica no campo vizinho; segmento selecionado sumia no escuro | Corrigido (Quartzo) |
| C16 | Info | Testes | `vectorize/regression.test.ts` (limite de 8 s) às vezes estoura só na rodada com cobertura (instrumentação + 85 arquivos em paralelo); isolado < 1 s | Aberto (sugerido ao Lupa pular o tempo sob cobertura) |

Pendências: conferir vibrancy/Mica e o fallback num Windows 10/11 real; o Bambu Studio só lê pausa de 3MF gerado por ele (chaveiro NFC: a tela ensina a pausa manual; o Orca lê).

# Desempenho — v0.8.0 (#88)

`npm run perf` (`playwright.perf.config.ts`, `tests/perf/desempenho.perf.ts`): build de produção no `vite preview`, CPU 4× mais lenta (aproxima um i3), mock do IPC dos E2E. Mede a abertura a frio (até a barra lateral, mediana de 3) e a memória: heap JS depois de coletar o lixo e o RSS dos processos de página do Chromium (onde ficam JS, workers e WASM), parado, em cada ferramenta e ao voltar para o Início. Resultado em `test-results/perf.json`. No Mac (M-series), 29/09/2026:

| | Antes | Depois |
|---|---|---|
| Abertura a frio (CPU 4× mais lenta) | 355 ms | 320 ms |
| Carregamento inicial (JS + CSS) | 580 KB | 541 KB (apresentação de 1º uso e catálogo de impressoras sob demanda) |
| Página parada | 205 MB | 200 MB |
| Depois de Imagem → SVG e voltar ao Início | 278 MB | 241 MB (worker do vtracer encerrado) |
| Depois de Litofania e voltar ao Início | 557 MB | 247 MB (instância do manifold e MediaPipe soltas) |
| Depois de Modelos prontos e voltar ao Início | 596 MB | 284 MB |
| Instalador (v0.7.0) | Windows 15 MB (.exe) / 16 MB (.msi), Mac 31 MB (universal) | — |

- Já eram sob demanda (conferido no build): vtracer, manifold, openscad-wasm, MediaPipe, three.js, fontes e miniaturas da galeria (`loading="lazy"`). O inicial é React (223 KB), zod dos esquemas do banco (96 KB) e o app.
- Novo: `src/ui/heavy.ts`. Cada motor pesado se registra ao carregar e o App solta todos ao trocar de tela; a próxima ferramenta carrega de novo (~0,1 s para o manifold). Fotos já tinham limite de resolução (`MAX_SIDE`/`MAX_PIXELS` no SVG, `MAX_COLS` na litofania) e prévias 3D prontas depois de sair da tela são descartadas.
- Os números do navegador de teste não são os do WebView2: a medição real fica com **Sobre → Copiar informações** (abertura e memória JS) e o Gerenciador de Tarefas. Checklist em `docs/QA-windows.md`.

# Regressão visual automática (#142)

`npm run visual` (`playwright.visual.config.ts`, `tests/visual/`): todas as telas da barra lateral (a lista vem da própria barra, então tela nova entra sozinha), com dados de exemplo e data fixa, em claro e escuro a 1100 e 1440 px e a 1280 px com escala 125% e 150%.

- **Comparação** com as referências aprovadas de cada plataforma (`tests/visual/referencia/<darwin|win32>/`, fora do git: ~40 MB por aprovação ficam nos artefatos do CI e `scripts/visual-refs` baixa a mais recente), com tolerância (0,3% dos pixels). As do macOS do CI batem com as de um Mac local. A prévia 3D fica mascarada (o WebGL muda de uma GPU para outra). O relatório com os diffs fica em `playwright-report/visual/` (no CI: artefato `relatorio-visual-<so>`).
- **Checagens** em cada tela: conteúdo cortado e página rolando para o lado, alvos clicáveis menores que 24 px (WCAG 2.2 AA; entre 24 e 32 px sai como aviso no relatório), foco visível ao usar Tab e contraste AA (axe-core). O que já existia fica em `tests/visual/conhecidos/<plataforma>/*.json`; só problema **novo** falha.
- **CI** (`.github/workflows/visual.yml`): Windows (Edge, o motor do WebView2) e macOS, a cada push em `src/`. Sem referência ou sem lista aprovada numa plataforma, só mostra os problemas no relatório, sem falhar.
- **Aprovar** telas novas ou problemas aceitos: Actions → visual → Run workflow com **atualizar**. A comparação seguinte já usa essa aprovação; para levar as listas de problemas conhecidos ao git, `scripts/visual-refs` e commit de `tests/visual/conhecidos/`. As referências vêm do CI e não da máquina de ninguém, porque as fontes do sistema mudam os pixels. Os artefatos duram 90 dias: depois disso a comparação só roda as checagens até a próxima aprovação.
- Só algumas telas: `VISUAL_PAGES="Painel,Pedidos" npm run visual`; tempo de cada etapa: `VISUAL_TEMPO=1`.

Achados da 1ª rodada (Mac, 1100 claro): botões `ghost`/`link`, `.chips` e `.icon-button` sem anel de foco ao usar Tab (a regra que tira a sombra ganha do `:focus-visible` global); botões `sm` com 28 px de altura (abaixo dos 32 px); a versão no rodapé da barra lateral com contraste abaixo de AA. Ficam na lista de conhecidos até o redesign (#139).
