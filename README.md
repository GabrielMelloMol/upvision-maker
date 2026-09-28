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
```

Os dados de desenvolvimento ficam em `~/Library/Application Support/com.upvision.maker/upvision.db` (Mac) ou `%APPDATA%\com.upvision.maker\upvision.db` (Windows).

## Publicar uma versão

1. Crie o repositório `GabrielMelloMol/upvision-maker` no GitHub (o endpoint do updater em `src-tauri/tauri.conf.json` aponta para ele).
2. Em *Settings → Secrets → Actions*, crie:
   - `TAURI_SIGNING_PRIVATE_KEY`: conteúdo de `~/.tauri/upvision-maker.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: vazio (a chave foi gerada sem senha)
   - `FEEDBACK_EMAIL` (opcional): e-mail que recebe o "Sugerir ferramenta". Sem ele, o botão abre uma issue no GitHub. Para testar localmente, crie `.env.local` com `VITE_FEEDBACK_EMAIL=...` (arquivo ignorado pelo git).
3. Suba a versão em `package.json`, `src-tauri/tauri.conf.json` e `src-tauri/Cargo.toml`, faça commit e `git tag v0.2.0 && git push --tags`.
4. O workflow `release` gera um *draft* com `.msi`, `.exe`, `.dmg` universal e `latest.json`. Revise e publique: os apps instalados se atualizam sozinhos.

**Guarde uma cópia da chave privada (`~/.tauri/upvision-maker.key`) num cofre de senhas.** Sem ela não dá para publicar atualizações para quem já instalou.

## Instalar sem assinatura de código

O app não tem certificado pago, então o sistema avisa na primeira vez:

- **Windows:** ao abrir o `.exe`/`.msi`, o SmartScreen mostra "O Windows protegeu o computador". Clique em **Mais informações → Executar assim mesmo**.
- **macOS:** abra o `.dmg` e arraste para Aplicativos. Na primeira abertura, clique com o botão direito no app → **Abrir** → **Abrir**. Se aparecer "está danificado", rode no Terminal:
  `xattr -dr com.apple.quarantine "/Applications/UpVision Maker.app"`

## Pedir à IA (opcional, pago por uso)

A ferramenta usa a API da Anthropic com a **chave da própria usuária** (Preferências → Inteligência artificial). A chave fica só no banco local, fora do backup. O modelo padrão é o Claude Sonnet 5; cada pedido mostra tokens e custo estimado. O código OpenSCAD gerado roda localmente (OpenSCAD em WASM, dentro de um worker).

## Licenças de terceiros

| Componente | Uso | Licença |
|---|---|---|
| vtracer (via `vectortracer`) | Imagem → SVG | MIT |
| manifold-3d | Geometria 3D | Apache-2.0 |
| MediaPipe Tasks Vision + modelos Selfie Segmenter / DeepLab v3 | Modo Silhueta | Apache-2.0 |
| OpenSCAD (via `openscad-wasm-prebuilt`) | Pedir à IA | GPL-2.0-or-later — roda como programa separado num worker; fonte: https://github.com/openscad/openscad |
| Hanken Grotesk, Fredoka, Pacifico, Lobster, Dancing Script, Playfair Display (Fontsource) | Texto dos modelos | SIL OFL 1.1 |
| three.js, React, opentype.js, fflate, Anthropic SDK | Interface e utilidades | MIT |
