# UpVision Maker

App desktop gratuito (Windows e macOS) para quem vende impressão 3D: precificação, estoque de filamentos, pedidos, financeiro e ferramentas de arquivo. Dados ficam só no computador (SQLite), com backup em 1 clique.

Roadmap completo: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Desenvolvimento

Requisitos: Node 22+, Rust estável, e no Windows o WebView2 (já vem no Windows 10/11).

```bash
npm install
npm run tauri dev     # abre o app
npm test              # testes (Vitest)
npm run lint          # ESLint
npm run typecheck     # TypeScript
npm run e2e           # testes de ponta a ponta (Playwright, no navegador, com o Tauri simulado)
npm run build         # tipos + build do front
(cd src-tauri && cargo test && cargo clippy -- -D warnings)   # parte em Rust
npx knip              # código, exports e dependências sem uso (config em knip.json)
```

Antes de cada commit rode tudo acima (testes, lint, tipos, build, E2E do que mudou, cargo). O E2E sobe o Vite numa porta livre a cada execução (`E2E_PORT` fixa uma porta e reaproveita um servidor já aberto nela), então duas pastas podem rodar ao mesmo tempo. APIs externas (Anthropic, sites) são simuladas nos testes: nada vai para a rede.

Os dados de desenvolvimento ficam em `~/Library/Application Support/com.upvision.maker/upvision.db` (Mac) ou `%APPDATA%\com.upvision.maker\upvision.db` (Windows).

## Arquitetura

| Pasta | O que tem |
|---|---|
| `src/pages/` | Telas de gestão: calculadora (`calculator/`), produtos, pedidos, orçamentos, clientes, financeiro, preferências. |
| `src/tools/` | Ferramentas 3D e de arquivo: chaveiro, medalha, litofania, cortador, Imagem → SVG, QR, Pedir à IA (`askai/`) e os Modelos prontos (`models/`). |
| `src/tools/models/` | Modelos prontos: `catalog/` (um arquivo por categoria com as definições), `defs.ts` (registro único `MODELS`), `fields.ts` (tipos e construtores de campos), mapas por id (`variants.ts`, `batch.ts`, `emoji.ts`), camadas livres e gizmo. |
| `src/geometry/` | Geometria com manifold-3d (WASM): texto, extrusão, 3MF/STL, cortes. `geometry/models/` tem um gerador por modelo pronto, puro e testado. |
| `src/domain/` | Regras sem interface: cálculo de preço, taxas de canais, estoque, pedidos. |
| `src/db/` | SQLite local: migrações, repositórios e backup. |
| `src/ai/` | Pedir à IA: chamada ao Claude (SDK oficial, streaming, cache, contagem de tokens), imagens de referência e o OpenSCAD em WASM. |
| `src/vectorize/` | Imagem → SVG num worker (vtracer). |
| `src/ui/` e `src/styles/` | Componentes base e estilos (`tokens.css`; `features.css` é global, uma classe base por arquivo). |
| `src-tauri/` | Parte em Rust: janela, backup, projeto do Bambu Studio, diagnóstico. |
| `tests/e2e/` | Playwright: um arquivo por fluxo. |

## Como adicionar um modelo pronto

1. **Gerador** em `src/geometry/models/<modelo>.ts`: tipo dos parâmetros, `DEFAULT_…` e `build…(ctx, p): ModelOutput`. Use `ctx.text` para textos, `ctx.art` para o desenho enviado e os ajudantes de `common.ts` (`slab`, `backing`, `placeIn`…). Dado obrigatório faltando: lance `MissingInput` (a prévia fica vazia com a mensagem). Devolva `models` (uma parte por cor), `warnings`, `pauses` (pausas no 3MF) e, se houver textos/QR que a pessoa possa mover, `elements`.
2. **Teste** em `src/geometry/models/<modelo>.test.ts` com medidas de verdade (tamanho, volume, peças sem sobrepor, nada abaixo da mesa). Teste pesado leva `{ timeout: 30_000 }`.
3. **Definição** no arquivo da categoria em `src/tools/models/catalog/` (`plates`, `keychains`, `party`, `home…`, `kitchen`): `id` único, `category`, `label`, `blurb`, ícone do lucide, `defaults` e `sections` com os campos (`text`, `num`, `color`, `bool`, `choice`, `font`). A posição no arquivo é a posição na galeria.
4. **Opcional**: variações e coleções em `variants.ts`, campos do lote em `batch.ts`, seletor de emoji em `emoji.ts` (sempre por `id`).
5. **E2E** em `tests/e2e/<modelo>.e2e.ts`: abrir pela busca, gerar a prévia e salvar o 3MF.
6. Tipos genéricos de produto: nada de copiar nomes, desenhos ou visual de terceiros nem personagens licenciados.

## Publicar uma versão

1. Crie o repositório `GabrielMelloMol/upvision-maker` no GitHub (o endpoint do updater em `src-tauri/tauri.conf.json` aponta para ele).
2. Em *Settings → Secrets → Actions*, crie:
   - `TAURI_SIGNING_PRIVATE_KEY`: conteúdo de `~/.tauri/upvision-maker.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: vazio (a chave foi gerada sem senha)
   - `FEEDBACK_URL`, `FEEDBACK_TOKEN` e `FEEDBACK_WHATSAPP` (opcionais): para onde vai o "Sugerir ferramenta". Veja o passo a passo em [`services/feedback-worker/README.md`](services/feedback-worker/README.md). Sem eles, o app oferece só "Copiar texto" (e WhatsApp, se o número estiver definido). Para testar localmente, crie `.env.local` com as mesmas variáveis prefixadas com `VITE_` (arquivo ignorado pelo git).
3. Suba a versão em `package.json`, `src-tauri/tauri.conf.json` e `src-tauri/Cargo.toml`, faça commit e `git tag v0.2.0 && git push --tags`.
4. O workflow `release` gera um *draft* com `.msi`, `.exe`, `.dmg` universal e `latest.json`. Revise e publique: os apps instalados se atualizam sozinhos.

**Guarde uma cópia da chave privada (`~/.tauri/upvision-maker.key`) num cofre de senhas.** Sem ela não dá para publicar atualizações para quem já instalou.

## Instalar sem assinatura de código

O app não tem certificado pago, então o sistema avisa na primeira vez:

- **Windows:** ao abrir o `.exe`/`.msi`, o SmartScreen mostra "O Windows protegeu o computador". Clique em **Mais informações → Executar assim mesmo**.
- **macOS:** abra o `.dmg` e arraste para Aplicativos. Na primeira abertura, clique com o botão direito no app → **Abrir** → **Abrir**. Se aparecer "está danificado", rode no Terminal:
  `xattr -dr com.apple.quarantine "/Applications/UpVision Maker.app"`

## Celular e dois computadores (grátis, sem servidor)

- **Dois computadores:** em Preferências, escolha para o backup automático uma pasta do OneDrive/Google Drive/Dropbox e ligue **Dois computadores** nos dois. Um computador de cada vez: o outro mostra "Em uso no computador…".
- **Celular:** em Preferências → **Celular na rede de casa**, ligue e leia o QR com a câmera do celular (mesmo Wi-Fi). Na primeira vez, o **Windows** pergunta se o app pode usar a rede: marque **Redes privadas** e clique em **Permitir acesso**. O **macOS** pergunta se aceita conexões de entrada: **Permitir**. O acesso desliga sozinho ao fechar o app.

## Pedir à IA (opcional, pago por uso)

A ferramenta usa a API da Anthropic com a **chave da própria usuária** (Preferências → Inteligência artificial). A chave fica só no banco local, fora do backup. O modelo padrão é o Claude Sonnet 5; cada pedido mostra tokens e custo estimado, e o custo do próximo pedido (com as imagens de referência, se houver) é contado antes de enviar. O código OpenSCAD gerado roda localmente (OpenSCAD em WASM, dentro de um worker).

## Licenças de terceiros

| Componente | Uso | Licença |
|---|---|---|
| vtracer (via `vectortracer`) | Imagem → SVG | MIT |
| manifold-3d | Geometria 3D | Apache-2.0 |
| MediaPipe Tasks Vision + modelos Selfie Segmenter / DeepLab v3 | Modo Silhueta | Apache-2.0 |
| OpenSCAD (via `openscad-wasm-prebuilt`) | Pedir à IA | GPL-2.0-or-later — roda como programa separado num worker; fonte: https://github.com/openscad/openscad |
| Hanken Grotesk, Fredoka, Pacifico, Lobster, Dancing Script, Playfair Display (Fontsource) | Texto dos modelos | SIL OFL 1.1 |
| three.js, React, opentype.js, fflate, Anthropic SDK | Interface e utilidades | MIT |
