# upvision-maker — regras para a IA

App de Mac/Windows (Tauri 2 + React/Vite/TypeScript + Rust em `src-tauri/`) para quem vende impressão 3D. Regras da empresa (marca, plano de vender o app) ficam em `../CLAUDE.md` — valem aqui.

## Rodar e testar
- `npm run dev` (só a interface) · `npm run tauri dev` (app completo) · `npm run build`
- **Gate de todo commit** (conferir o código de saída de cada um, nunca `| grep` no meio): `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run e2e`, e em `src-tauri/`: `cargo test` e `cargo clippy -- -D warnings`.

## Regras
- **Os dados do usuário ficam no computador dele** (é a promessa do app). Nada de telemetria, conta ou envio para servidor sem decisão do Gabriel registrada em issue.
- **Pasta compartilhada:** vários terminais do Maestri trabalham neste repositório. Na pasta principal nunca `git checkout/restore/stash` nem formatar arquivo que não é seu; cada terminal trabalha na própria cópia (`~/.cache/<terminal>/...`, a partir do `origin/main`) e usa `git -C <sua cópia>`.
- **Issues:** toda tarefa ou ideia vira issue na hora, com etiqueta e milestone; commit cita `(#N)`; ao terminar, comentar o resultado na issue. Só avisar/fechar depois de conferir que o commit está no `origin/main` (`git merge-base --is-ancestor`).
- **CHANGELOG:** a linha de cada mudança vai sob "## Próxima versão (ainda não lançada)", no topo. Conferir depois de cada rebase.
- **Testar no app instalado**, não só no modo dev. Gravação/teste que mexe no mouse: avisar o terminal "Claude Code" e esperar; gravar só a janela do app, nunca a tela inteira (pega coisas pessoais do Gabriel).
- **Lançar versão** só depois de o Gabriel aprovar o vídeo/print. Passos: subir a versão em package.json, package-lock.json, src-tauri/Cargo.toml, Cargo.lock e tauri.conf.json → trocar "Próxima versão" por `## X.Y.Z — data` → tag `vX.Y.Z` + push → o workflow gera o rascunho → `gh release edit vX.Y.Z --draft=false --latest`.
- O atualizador do app lê `releases/latest/download/latest.json` deste repositório: **não renomear o repositório nem deixá-lo privado** antes do plano da issue #255.
- Disco: apagar `target/`, `dist/` e cópias de trabalho depois que o PR/commit entrou.
