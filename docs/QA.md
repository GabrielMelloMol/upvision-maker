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

`tests/e2e/tauri.ts` instala `window.__TAURI_INTERNALS__` (mesmo contrato do `mockIPC`) e responde no Node: SQL num SQLite em memória (`node:sqlite`), diálogos controláveis e arquivos salvos numa `Map` que o teste inspeciona (3MF é zip, STL tem nº de triângulos coerente). Roda num Vite próprio na porta 1430, sem tocar no `tauri dev` da 1420.

| Spec | Cobre |
|---|---|
| `gestao.e2e.ts` | navegação por todas as páginas; Preferências (salvar, persistir, inválido); Impressoras (CRUD + validação); Filamentos (estoque baixo, reposição 100 g×R$100 + 900 g×R$120 → R$ 118,00/kg); Materiais; Calculadora (R$ 15,96 / 47,88 / 79,80); Backup (salvar, restaurar com cópia de segurança, arquivo inválido) |
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
