# Auditoria 2026-10 — bugs no código

Só análise: nenhum código foi alterado e nenhuma issue foi criada. Base: `origin/main` em `69e1258` (v0.10.3 + Gaveta modular, #169). Linhas citadas são desse commit.

## Resumo

| Gravidade | Qtde |
|---|---|
| Crítico | 2 |
| Alto | 13 |
| Médio | 24 |
| Baixo | 28 |
| **Total** | **67** |

**Os 5 piores**
1. **C1** — Restaurar/importar não é atômico e nada impede sync, backup ao fechar ou fechar a janela no meio: um estado pela metade vira "a verdade" nos dois computadores.
2. **C2** — Sync entre versões diferentes do app (Mac atualizado, Windows não): o computador antigo sobrescreve a pasta e o novo importa, zerando `print_logs`, `tool_projects` e fotos de projeto/impressão.
3. **A1** — Migração sem transação: fechar o app durante a 1ª abertura de uma versão nova deixa o banco num estado em que ele nunca mais abre ("table photos already exists").
4. **A5** — Gramas "1.200" viram 1,2 g na Calculadora e no Produto (preço ~150× menor e baixa de estoque errada).
5. **A13** — O Worker de sugestões está configurado para criar issues no repositório **público** do app, com o texto da usuária, trecho do log e id da instalação.

## Como foi feito

- Leitura do código em seis frentes em paralelo: banco/backup, sincronização/atualização, cálculos, segurança, Mac × Windows/vazamentos e erros engolidos. Os achados críticos e altos foram conferidos no código uma segunda vez.
- Cálculos provados com scripts descartáveis fora do repo. O restore v15–v19 e a migração interrompida foram reproduzidos com `node:sqlite`.
- `npm test` numa worktree com `npm ci` próprio: **264 arquivos / 1635 testes passando, 2 pulados**.
  - Com o `node_modules` da pasta compartilhada, 7 arquivos falham ao carregar. Faltam `@tauri-apps/plugin-notification`, `libheif-js`, `exifr` e `@mediapipe`, ou seja, a pasta compartilhada está com `npm install` atrasado em relação ao main. Não é bug do app.
  - 1 teste de tempo (`services.test.tsx`, useData) falhou só sob carga e passou isolado.
- `cargo test` (32 ok) e `cargo clippy -D warnings`: limpos.
- `knip`: nada que seja bug.
  - "Arquivos não usados" são falsos positivos: `src/phone/main.tsx` entra por `phone.html`; as fontes `@fontsource/*` são lidas por caminho nos testes; `happy-dom` é ativado por comentário.
  - Há 90 exports e 129 tipos exportados sem uso: código morto, não bug.
- Os E2E rodam no navegador com o Tauri simulado, então **não pegam** escopo de fs, configuração de janela nem arrastar e soltar nativo (achados A11, A12 e M19).

---

## Crítico

### C1. Restaurar/importar pela metade é publicado na nuvem e sobrescreve o backup do dia — ✅ CORRIGIDO (Lupa)
- **Onde:**
  - `src/db/backup.ts:62-75` — DELETE + INSERT tabela por tabela, sem transação; o comentário `ponytail:` admite isso.
  - `src/sync/SyncBanner.tsx:37-39` — `setInterval` sem trava contra execução dupla; erro só no log.
  - `src/sync/sync.ts:188-199`.
  - `src/backup/useAutoBackup.ts:9,40-48` — fecha após 4 s.
  - `src-tauri/src/backup.rs:73-77` — um backup por dia.
  - `src/backupActions.ts:26-30`.
- **Como reproduzir:**
  1. Ligue a sync em dois computadores.
  2. No A, o tick decide "importar" um arquivo grande (com fotos).
  3. Durante a importação, faça uma destas coisas:
     - feche a janela;
     - clique em Atualizar;
     - deixe passar 60 s até o tick seguinte rodar junto;
     - faça um INSERT falhar (disco cheio, "database is locked").
  4. O que acontece em seguida:
     - O `syncOnClose` ou o tick seguinte exporta o banco parcial e compara com `c.last`, que ainda é o antigo. Isso vira "conflito": os dados bons da pasta viram cópia e o parcial é gravado como `upvision-sync.json`.
     - O backup de fechamento exporta o parcial e substitui o backup bom do mesmo dia.
     - O B importa o parcial.
  - Restaurar manualmente e falhar no meio dá o mesmo efeito: o toast diz "Não foi possível restaurar", mas metade das tabelas já foi apagada e a mensagem não diz onde está a cópia "antes-de-restaurar".
- **Correção sugerida:**
  - Mover o restore para um comando Rust numa transação única, no mesmo padrão de `stock.rs::apply` (`pool.begin()`).
  - Até lá: uma marca global "restaurando" (em memória e em `secrets`) que pause sync, backup automático e fechamento. Se a marca existir na abertura, avisar e oferecer a cópia de antes.
  - No erro, mostrar o caminho de `safetyCopy`.

### C2. Computadores em versões diferentes: o antigo apaga tabelas e o trabalho do novo — ✅ CORRIGIDO (Claude Code, commit fix C2/A1)
- **Onde:**
  - `src/db/backup.ts:47-49` — só recusa backup *mais novo*.
  - `src/db/backup.ts:16` — tabela ausente vira `[]`.
  - `src/db/backup.ts:65-67` — `DELETE` em todas.
  - `src/sync/sync.ts:188-199` — o conflito não olha `schemaVersion`.
  - `src/sync/SyncBanner.tsx:37` — a recusa de versão vai só para o log.
- **Como reproduzir:**
  1. O Mac atualiza (schema 21, com `print_logs` e `photos`), trabalha e fecha.
  2. O PC, numa versão ≤ v20, abre: a importação falha em silêncio a cada minuto.
  3. Alguém edita no PC → conflito → o PC grava na pasta os dados no schema antigo.
  4. O Mac abre, importa ("Dados atualizados…") e fica com `print_logs`, `tool_projects` e as fotos de projeto/impressão vazias. As colunas novas voltam com o padrão.
- **Correção sugerida:**
  - Se `remote.schemaVersion > SCHEMA_VERSION`, suspender a sync (nem exportar nem resolver conflito) e mostrar a faixa "Atualize o app neste computador".
  - Se `remote.schemaVersion < SCHEMA_VERSION`, não importar sem confirmação.
  - No restore, nunca dar `DELETE` numa tabela que não existia na versão do backup.

## Alto

### A1. Migração interrompida deixa o app sem abrir — ✅ CORRIGIDO (Claude Code, commit fix C2/A1)
- **Onde:** `src/db/migrations.ts:122-127`, o laço sem transação. Comandos que não podem ser repetidos: `:113` (`CREATE TABLE photos` sem `IF NOT EXISTS`), `:105-109` e `:67-69` (`ALTER TABLE ADD COLUMN`).
- **Como reproduzir:** atualize e feche (ou derrube) o app durante a v21, que copia todas as fotos e é lenta com muitas fotos. Na próxima abertura, `getDb()` (`src/db/index.ts:11`) rejeita com "table photos already exists" e nenhuma tela carrega. Reproduzido aplicando até a v20 + o 1º comando da v21.
- **Correção sugerida:** cada versão numa transação (comando Rust com `pool.begin()`, ou o `add_migrations` do tauri-plugin-sql), com `user_version` dentro dela.

### A2. Restaurar backup v15–v19 com projetos falha na última tabela — ✅ CORRIGIDO (Lupa)
- **Onde:** `src/db/toolStateRepo.ts:22-23` (`favorite`/`tags` são `.optional()` sem default); `src/db/backup.ts:71` (`row[c] ?? null`); `src/db/migrations.ts:105-106` (`NOT NULL`).
- **Como reproduzir:** restaure um backup com `schemaVersion` 15–19 e pelo menos 1 linha em `tool_projects`. O resultado é "NOT NULL constraint failed: tool_projects.favorite": todas as outras tabelas já foram trocadas, `tool_projects` fica vazia e o `QUOTE_NUMBER_BACKFILL` não roda. Com a sync ligada, o próximo tick publica esse estado (C1).
- **Correção sugerida:** `favorite: ….default(0)` e `tags: ….default("[]")`, mais um teste de restore com backup v15–v19.

### A3. Preferências ou empresa inválidas no banco viram o padrão sem aviso, e salvar grava o padrão por cima — ✅ CORRIGIDO (Lupa)
- **Onde:**
  - `src/db/repo.ts:82-85` (`loadSettings` → `DEFAULT_SETTINGS`) e `src/db/customersRepo.ts:28-31` (`loadCompany` → `DEFAULT_COMPANY`).
  - Quem relê e salva: `Preferences.tsx:91`, `preferences/SlicerCard.tsx:31`, `AmsCard.tsx:37`, `BedPrinterCard.tsx:40`, `onboarding/Onboarding.tsx:63`, `Company.tsx:54`.
- **Como reproduzir:** deixe no banco um JSON que o schema atual rejeita. Isso acontece de três jeitos:
  - vem de uma versão mais nova pela sync, porque mudar o JSON de settings não sobe `SCHEMA_VERSION`;
  - vem de um backup, onde `settings.data` é só uma string (`tables.ts:17`);
  - uma regra ficou mais rígida (Pix/CNPJ, `customers.ts:70-78`).
  O que acontece: a Calculadora passa a usar kWh, taxas e canais padrão. Escolher o fatiador em Ajustes grava o padrão por cima de tudo: canais, histórico de kWh, logo, Pix.
- **Correção sugerida:** aproveitar campo a campo (`.catch()` por campo no schema) e marcar `invalid` para a tela avisar. Nunca regravar o padrão sem confirmação.

### A4. Produto com composição ilegível: custo zero, estoque não baixa, e salvar apaga — ✅ CORRIGIDO (Forja)
- **Onde:** `src/db/productsRepo.ts:13-24` — o `catch` faz só `console.error` e segue com a composição vazia; o mesmo vale para as variações.
- **Como reproduzir:** deixe `products.composition` com um JSON que o schema `Composition` atual rejeita (backup antigo, schema mudou). O produto aparece com custo e preço baixos, pedidos e produção não baixam filamento, e abrir e salvar grava `{"filaments":[]…}` por cima do original.
- **Correção sugerida:** expor `compositionError`, avisar no produto e bloquear pedido, produção e salvamento até corrigir. No mínimo, preservar o JSON cru.

### A5. Gramas com ponto de milhar viram decimais (Calculadora e Produto) — ✅ CORRIGIDO (Forja)
- **Onde:**
  - `src/domain/format.ts:2-5` — `parseDecimal` só troca a vírgula.
  - `src/pages/Calculator.tsx:67` (`num = parseDecimal(s) || 0`, usado em `:127` e `:145`).
  - `src/pages/products/ProductEditor.tsx:33` e `:107`.
- **Como reproduzir:** filamento a R$ 120/kg, 10 h, gramas "1.200":
  - obtido: 1,2 g → filamento R$ 0,14, consumidor R$ 5,26;
  - esperado: 1200 g → R$ 144,00, consumidor R$ 762,39;
  - "1.200,5" vira NaN e depois 0 g, sem aviso;
  - no Produto, a baixa de estoque passa a tirar 1,2 g por mesa.
- **Correção sugerida:** ler gramas com `parseMass` (`src/ui/parse.ts`) e mostrar erro no campo em vez de usar `|| 0`. O `sanityWarnings` também poderia avisar quando o valor é baixo demais.

### A6. Estoque pronto de produto com variações volta ao valor antigo ao salvar — ✅ CORRIGIDO (Forja)
- **Onde:** `src/pages/products/ProductEditor.tsx:94` (`stock` = soma de `variants[].stock`). Quem baixa só `products.stock`: `src-tauri/src/stock.rs:63` e `src/pages/products/ProduceSheet.tsx:49`. O estoque velho também vai para o marketplace em `src/domain/marketplace/listing.ts:46`.
- **Como reproduzir:** Azul 5 + Verde 5 = 10. Um pedido de 3 é confirmado e `stock` fica em 7. Abrir o produto, mudar a descrição e salvar grava 10, e a planilha da Shopee publica 5 + 5 (risco de vender o que não há).
- **Correção sugerida:** baixar e produzir por variação, ou não sobrescrever `stock` quando há variações e mostrar a diferença para redistribuir.

### A7. Editar um pedido antigo muda o custo histórico no Financeiro — ✅ CORRIGIDO (Forja)
- **Onde:** `src/pages/orders/OrderEditor.tsx:110` e `:118` (recalcula `costOf(p)` com os preços de hoje); gravação em `src/db/ordersRepo.ts:56-61`.
- **Como reproduzir:**
  1. Um pedido entregue em março tem `unitCost` R$ 10.
  2. Em outubro o filamento sobe e o custo do mesmo produto passa a R$ 14.
  3. Abra o pedido de março, corrija só as observações e salve.
  - Obtido: grava `unitCost` 14, e o lucro de março muda no Financeiro e no CSV.
  - Esperado: manter R$ 10.
- **Correção sugerida:** num pedido existente, manter `unitCost` e `printMinutes` do item salvo; recalcular só quando o produto ou a linha forem trocados.

### A8. Cópias de conflito da nuvem e trabalho offline são descartados — ✅ CORRIGIDO (Lupa)
- **Onde:** `src/sync/sync.ts:59-61` e `:188-191`; os nomes fixos em `src-tauri/src/sync.rs:10-16`; aviso em `SyncBanner.tsx:29`.
- **Como reproduzir:**
  1. O notebook A fica sem internet e segue usando o app; a trava de A envelhece na nuvem.
  2. O B assume a trava e exporta.
  3. A internet de A volta. O OneDrive guarda a versão de B como `upvision-sync.json` e renomeia a de A para `upvision-sync-NOTE-A.json` (o Google Drive usa `(1)`).
  4. No tick seguinte, A vê "local igual ao último, remoto mudou" e importa. A sessão offline some.
- **Correção sugerida:** procurar `upvision-sync*.json` com outros nomes e tratar como conflito; pedir confirmação antes de importar por cima de mudanças não exportadas.

### A9. Ligar a sync no 2º computador antes de a nuvem baixar exporta a base vazia — ✅ CORRIGIDO (Lupa)
- **Onde:** `src/sync/SyncSettingsCard.tsx:26-28` e `:40`; `src/sync/sync.ts:55` e `:184-186`.
- **Como reproduzir:**
  1. No PC novo, escolha a pasta do OneDrive antes de ela terminar de baixar e ligue a sync.
  2. `readRemote` devolve null, a decisão vira "exportar" e a base vazia vai para `upvision-sync.json`.
  3. Se a nuvem ficar com essa versão, o computador principal importa a base vazia.
- **Correção sugerida:** na primeira ligação com a base local vazia e sem arquivo na pasta, não exportar e avisar. Recusar ou perguntar ao importar uma base vazia ou muito menor que a local.

### A10. Falhas de sincronização ficam invisíveis — ✅ CORRIGIDO (Lupa)
- **Onde:** `src/sync/SyncBanner.tsx:37` (`logError(..., "warn")`); a mensagem pronta em `src/sync/sync.ts:141` nunca chega à tela; `src/diagnostics/log.ts:40-41`.
- **Como reproduzir:** corrompa `upvision-sync.json`, tire a permissão da pasta ou abra um computador com versão mais nova (C2). O app segue normal, sem faixa, e os computadores vão se afastando (o que leva a A8 e M1).
- **Correção sugerida:** contar as falhas seguidas; na 2ª (ou de imediato em arquivo corrompido, permissão ou versão), mostrar uma faixa no SyncBanner com o texto do erro.

### A11. Arrastar e soltar não funciona no app instalado do Windows (provavelmente também no Mac)
- **Onde:** `src-tauri/tauri.conf.json:13-23`, `tauri.windows.conf.json:4-15` e `tauri.macos.conf.json:5-17`, sem `"dragDropEnabled": false`. Quem depende disso:
  - `src/ui/Dropzone.tsx:34` (16 telas);
  - `src/ui/PhotoGallery.tsx:71,83`;
  - `src/tools/AskAI.tsx:243`;
  - o quadro de pedidos em `src/pages/Orders.tsx:56-57,117`.
- **Como reproduzir:** no Windows instalado, arraste um PNG para "Imagem → SVG", ou um cartão de pedido para outra coluna: nada acontece. O próprio tauri-utils (`config.rs:1976`) avisa que é preciso desligar o drag-drop nativo para usar o do HTML5. No Mac, o wry (`wkwebview/drag_drop.rs:45`) também consome o evento; conferir no app instalado.
- **Correção sugerida:** `"dragDropEnabled": false` na janela, **nos dois arquivos de plataforma** (ver M19). O app não usa `onDragDropEvent`.

### A12. As fotos ao lado da planilha de marketplace são barradas pelo escopo do fs
- **Onde:** `src/pages/products/listingPhotos.ts:24-26` (do #162; o autor é o próprio Lupa), chamado em `ExportSheet.tsx:65`; `src-tauri/capabilities/default.json:24` (só `fs:scope-appdata-recursive`).
- **Como reproduzir:** exporte para a Shopee um produto com foto, salvando em Documentos. A planilha sai e depois aparece "forbidden path": o `save()` libera só o arquivo escolhido (tauri-plugin-dialog `commands.rs:211`), não a pasta. O E2E passou porque o mock do fs não aplica escopo.
- **Correção sugerida:** escolher a pasta com `open({ directory: true })` (como as mesas por cor), ou gravar as fotos por um comando Rust com nomes validados (como `backup.rs`).

### A13. O Worker de sugestões cria issues no repositório público
- **Onde:** `services/feedback-worker/wrangler.toml:15` (`GITHUB_REPO = "GabrielMelloMol/upvision-maker"`, logo abaixo do comentário "Repositório PRIVADO"); `services/feedback-worker/src/handler.ts:116-119`. O repo é PUBLIC (conferido com `gh repo view`), e precisa ser, porque o updater lê as Releases dele.
- **Como reproduzir:** publique o Worker com `GITHUB_TOKEN` usando esse `wrangler.toml` e mande uma sugestão ou um diagnóstico pelo app. O resultado é uma issue pública com o texto livre da usuária, um trecho do log e o id da instalação. Ainda não aconteceu: hoje não existe nenhuma issue desse tipo. Há também um risco de injeção de prompt: os agentes leem as issues desse repo.
- **Correção sugerida:** deixar `GITHUB_REPO = ""` ou apontar para um repo privado de suporte (como o README do Worker já manda), com o token fine-grained só para esse repo.

## Médio

### M1. Um conflito tira a sessão inteira do outro computador — ✅ CORRIGIDO (Lupa)
- **Onde:** `src/sync/sync.ts:60` e `:193-200`; `src/sync/SyncBanner.tsx:19`, `:60-62`.
- **Como reproduzir:** o B vê "Em uso no computador A" e escolhe "Continuar sem sincronizar". Quando a sync volta, quem detecta o conflito fica com os próprios dados e o trabalho do outro vai inteiro para uma cópia. O outro importa depois, sem aviso.
- **Correção sugerida:** avisar também quem perdeu; idealmente juntar por linha (`updatedAt` + id), ou bloquear a edição enquanto outro computador tiver a trava.

### M2. O limite de 4 s ao fechar corta a sync final, que roda depois do backup — ✅ CORRIGIDO (Lupa)
- **Onde:** `src/backup/useAutoBackup.ts:9`, `:41-48`.
- **Como reproduzir:** feche o app com uma base com fotos numa pasta do OneDrive. Backup mais sync passam de 4 s, a janela fecha sem exportar e com a trava viva: o outro computador vê "em uso" por até 5 min.
- **Correção sugerida:** sincronizar antes do backup e mostrar "Sincronizando…" até terminar, em vez de cortar no tempo.

### M3. Cmd+Q no Mac e a atualização no Windows pulam o backup e a sync de fechamento — ✅ CORRIGIDO (Lupa)
- **Onde:** `src-tauri/src/lib.rs:57` (não trata `RunEvent::ExitRequested`); `src/backup/useAutoBackup.ts:40`; `src/about/useUpdates.ts:99-100` com `installMode: "passive"`.
- **Como reproduzir:** feche com Cmd+Q, ou instale uma atualização no Windows, onde o instalador encerra o processo. `onCloseRequested` só dispara ao fechar a janela. Confirmar o caso do Cmd+Q num Mac.
- **Correção sugerida:** tratar `ExitRequested` no Rust (`prevent_exit`, avisar o front, sair depois) e chamar `syncOnClose` dentro do `install()`, antes do `downloadAndInstall`.

### M4. Relógios diferentes entre os computadores desfazem a trava — ✅ CORRIGIDO (Lupa)
- **Onde:** `src/sync/sync.ts:48-52` e `:120-129` (compara o relógio local com o `heartbeat` gravado pelo outro).
- **Como reproduzir:** com o relógio de B 6 min atrasado, B vê como velha uma trava que A acabou de gravar. No sentido inverso, quem está adiantado toma a trava do outro.
- **Correção sugerida:** considerar a trava viva enquanto o `heartbeat` continuar mudando entre leituras deste computador, sem comparar relógios.

### M5. A trava da pasta não é exclusiva — ✅ CORRIGIDO (Lupa)
- **Onde:** `src/sync/sync.ts:171-173` (lê e depois grava, sem confirmar).
- **Como reproduzir:** abra os dois computadores com segundos de diferença, antes de a nuvem replicar o `.lock`. Os dois exportam e a nuvem cria um arquivo de conflito (A8).
- **Correção sugerida:** gravar a trava, esperar, reler e desempatar por `device` antes de exportar qualquer coisa.

### M6. ✅ Atualizar reinicia o app e perde formulários abertos sem perguntar
- **Onde:** `src/about/useUpdates.ts:87-96`; `trackSave` só existe em `src/tools/useToolState.ts:124`.
- **Como reproduzir:** com um orçamento, cadastro, Calculadora, Empresa ou pedido com campos não salvos, clique em Atualizar. O app reinicia e o texto digitado some, apesar da mensagem "o que você fez fica guardado". Exports em andamento (`ExportButtons`) também não marcam `aria-busy`.
- **Correção sugerida:** registrar "formulário sujo" (`trackSave` ou `data-dirty`), consultar isso no `install()` e perguntar antes de reiniciar.

### M7. Um pedido editado pode ficar sem itens — ✅ CORRIGIDO (Forja)
- **Onde:** `src/db/ordersRepo.ts:56-62` (UPDATE, depois DELETE dos itens, depois INSERT um a um; `create` em `:44-54` faz igual). O comentário em `:42-43` admite.
- **Como reproduzir:** salve um pedido com muitos itens e feche ou derrube o app logo em seguida. O pedido fica com 0 itens ou só parte deles.
- **Correção sugerida:** comando Rust transacional, como `apply_stock`.

### M8. Excluir um filamento ou produto já baixado num pedido trava o estorno — ✅ CORRIGIDO (Forja)
- **Onde:** `src-tauri/src/stock.rs:64-66` (`Err` se `rows_affected == 0`); `src/db/ordersRepo.ts:84-86`; `src/db/productsRepo.ts:44-47`; `src/ui/CrudPage.tsx:220` (exclui sem conferir pedidos).
- **Como reproduzir:** dê baixa de um pedido, exclua o filamento usado e cancele o pedido. Aparece "Item de estoque não encontrado (filaments #N)", e o pedido não muda mais de status nem pode ser excluído.
- **Correção sugerida:** no estorno, pular itens inexistentes e anotar no histórico, ou impedir a exclusão de itens presentes num `appliedPlan` ativo.

### M9. "0.856" vira R$ 856 — ✅ CORRIGIDO (Forja)
- **Onde:** `src/ui/parse.ts:33` (a regra de milhar aceita "0" como primeiro grupo; usada por `parseMoney`).
- **Como reproduzir:**
  - `parseMoney("0.856")` dá 856 (esperado 0,856); "0.500" dá 500.
  - O preço do kWh costuma ter 3 casas, então colar "0.856" deixa a energia 1000× mais cara.
- **Correção sugerida:** `/^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/`.

### M10. O contrato de consignação zera ou divide por mil os valores em R$ — ✅ CORRIGIDO (Forja)
- **Onde:** `src/pages/quotes/ContractSheet.tsx:47` e `:126` (`parseDecimal(...) || 0` num campo de dinheiro).
- **Como reproduzir:** no Repasse, "R$ 15,90" ou "1.234,56" saem como R$ 0,00 no PDF, e "1.500" sai como R$ 1,50.
- **Correção sugerida:** `MoneyField` + `parseMoney`, bloqueando a geração quando o valor for inválido.

### M11. Repor um estoque negativo perde o déficit, e o estorno depois infla o estoque — ✅ CORRIGIDO (Forja)
- **Onde:** `src/db/repo.ts:39` (`Math.max(row.s, 0) + addQty`).
- **Como reproduzir:**
  1. Filamento com 0 g; um pedido consome 200 g e o estoque fica em −200.
  2. Repor 1000 g leva o estoque a 1000.
  3. Cancelar o pedido estorna +200 e o estoque fica em 1200 g. O esperado é 1000.
- **Correção sugerida:** somar `row.s + addQty`; o limite em zero só cabe dentro da média ponderada do custo.

### M12. No celular, uma baixa de "1.250 g" vira 1,25 g — ✅ CORRIGIDO (Forja)
- **Onde:** `src/phone/PhoneApp.tsx:171` (`Number(amount.replace(",", "."))`).
- **Como reproduzir:** digite "1.250" em "Quanto usou (g)": o app envia 1.25.
- **Correção sugerida:** `parseMass(amount, spoolG)`.

### M13. O backup automático pode falhar todo dia e só avisar no 7º — ✅ CORRIGIDO (Lupa)
- **Onde:** `src/backup/useAutoBackup.ts:25` (abertura) e `:48` (fechamento), os dois só com `console.warn`.
- **Como reproduzir:** aponte o backup para um drive desmontado ou sem permissão. Nenhum aviso aparece até o lembrete de 7 dias (`REMIND_DAYS`).
- **Correção sugerida:** quando o backup da abertura falhar, mostrar a faixa ou um toast na hora, com o erro.

### M14. ✅ Ferramentas: "seu trabalho ficou guardado" sem ter gravado
- **Onde:** `src/tools/useToolState.ts:11`, `:119-121` (falha só com `console.warn`), `:125-129` (o cleanup cancela o save pendente), `:135` (toast), `:218-220` (`exported()` falha em silêncio); o fechamento (`useAutoBackup.ts:41-46`) não chama `flushPendingSaves`.
- **Como reproduzir:** no Chaveiro, digite e troque de tela, ou feche a janela, em menos de 0,8 s. O toast diz que o trabalho ficou guardado, mas a última edição não está lá.
- **Correção sugerida:** no cleanup, executar o `save()` pendente em vez de descartar; mostrar o toast só depois do sucesso; chamar `flushPendingSaves()` ao fechar.

### M15. Erro do banco aparece como "Nada cadastrado" — ✅ CORRIGIDO (Forja)
- **Onde:** `src/ui/useData.ts:20-21` (o erro vira toast passageiro e os dados ficam vazios). Agravante: `src/db/ordersRepo.ts:35`, onde um único `appliedPlan` ilegível derruba a lista inteira. Telas afetadas: `Orders.tsx:104`, `Quotes.tsx:115`, `Customers.tsx:57`, `CrudPage.tsx:355`, Dashboard e Financeiro (R$ 0).
- **Como reproduzir:** com o banco travado ou um pedido com `appliedPlan` corrompido, abra Pedidos. Aparece "Nenhum pedido ainda" com o botão "Criar o primeiro pedido", e o Financeiro mostra lucro 0.
- **Correção sugerida:** devolver `error` no `useData` e mostrar "Não foi possível ler — Tentar de novo"; fazer o parse por linha em `ordersRepo.list`.

### M16. Um orçamento inválido some da lista sem aviso — ✅ CORRIGIDO (Forja)
- **Onde:** `src/db/quotesRepo.ts:11-14` (o `flatMap` descarta a linha com `console.error`).
- **Como reproduzir:** deixe um orçamento cujo `data` não passa no `QuoteInput` atual. Ele desaparece e a numeração parece pular.
- **Correção sugerida:** manter a linha com uma marca "não pôde ser lido" e avisar.

### M17. Custo 0 gravado no pedido e R$ 0,00 no catálogo quando o cálculo falha — ✅ CORRIGIDO (Forja)
- **Onde:** `src/pages/orders/OrderEditor.tsx:101-106` (`costOf` → 0, gravado em `unitCost`); `src/pages/quotes/CatalogSheet.tsx:29-35` (`manualPrice ?? 0`).
- **Como reproduzir:** um kit circular, ou um produto cujo cálculo lança erro e que não tem preço manual. O pedido é gravado com custo 0 (lucro = receita) e o PDF do catálogo sai com R$ 0,00 para o cliente.
- **Correção sugerida:** bloquear a gravação ou a exportação, ou pedir confirmação, listando os produtos sem custo ou preço calculável.

### M18. Produto novo duplica quando uma foto falha — ✅ CORRIGIDO (Forja)
- **Onde:** `src/pages/products/ProductEditor.tsx:141-150` (insert do produto, depois as fotos, sem transação e sem guardar o id).
- **Como reproduzir:** crie um produto com fotos pendentes e faça `photos.add` falhar (foto enorme, banco travado). O formulário mostra o erro e continua como "novo"; Salvar de novo cria um 2º produto igual.
- **Correção sugerida:** depois do insert, passar o editor para modo edição com o id novo, ou fechar e avisar quantas fotos não entraram.

### M19. A config de plataforma apaga `visible:false` e `zoomHotkeysEnabled`
- **Onde:** `src-tauri/tauri.conf.json:16` e `:22`, sobrescritos por `tauri.windows.conf.json:4-15` e `tauri.macos.conf.json:5-17`. O `json_patch::merge` (RFC 7396, tauri-utils `config/parse.rs:185`) troca arrays inteiros.
- **Como reproduzir:** no app instalado, Ctrl/⌘ + e − não mudam o zoom (`src/ui/zoom.ts:1` promete que mudam). No Windows, a janela aparece vazia antes da abertura, que é o que a #150 queria evitar.
- **Correção sugerida:** repetir `visible`, `zoomHotkeysEnabled` e `dragDropEnabled` (A11) nos dois arquivos de plataforma, ou tirar deles a lista `windows`.

### M20. ✅ A câmera fica ligada se "Tirar foto" fechar antes da permissão
- **Onde:** `src/ui/PhotoGallery.tsx:153-163` (o cleanup roda com `stream` ainda null).
- **Como reproduzir:** abra Tirar foto e feche enquanto a câmera ainda está abrindo. A luz da webcam fica acesa até fechar o app.
- **Correção sugerida:** a marca `alive`, como em `QrScanner.tsx:58-60`.

### M21. O 3MF vai e volta pelo IPC como array JSON de números
- **Onde:** `src/slicer/openInSlicer.ts:69` e `src/geometry/bambuProject.ts:17` (`Array.from(bytes)`); `src-tauri/src/slicer.rs:110` e `bambu.rs:194` (`Vec<u8>` volta como `number[]`).
- **Como reproduzir:** Litofania com foto grande → "Abrir no Bambu Studio". A memória salta centenas de MB e a tela congela (cerca de 8 a 12× o tamanho do arquivo, na ida e na volta).
- **Correção sugerida:** corpo cru (`invoke(cmd, bytes, { headers })` com `tauri::ipc::Request`) e devolver `tauri::ipc::Response`.

### M22. O celular esbarra no Firewall do Windows sem orientação — ✅ CORRIGIDO (Lupa)
- **Onde:** `src-tauri/src/lan.rs:296` (`0.0.0.0:0`); não há menção a firewall em `src/` nem em `docs/`.
- **Como reproduzir:** no Windows, numa rede "Pública" (o padrão para Wi-Fi novo), ligue o acesso do celular. Se o aviso do Defender for cancelado, o celular não conecta e o app não diz por quê.
- **Correção sugerida:** orientar no cartão "Celular na rede de casa" (permitir no aviso, marcar a rede como Privada) e na documentação de instalação.

### M23. O token do Worker vai dentro do app e o limite por instalação é contornável
- **Onde:** `src/feedback/SuggestDialog.tsx:15` (`VITE_FEEDBACK_TOKEN` no bundle, também servido em `/assets` do servidor do celular, `lan.rs:220`); `services/feedback-worker/src/handler.ts:143` (limite por `installId`, que é escolhido pelo cliente) e `:83-87` (contador não atômico).
- **Como reproduzir:** extraia o token do instalador e faça POSTs trocando o `installId`: o limite de 5 por hora não pega, sobram só os 30 por dia por IP. Isso permite spam de e-mails e issues.
- **Correção sugerida:** limite global por dia (`global:<dia>`) e, se precisar, Turnstile ou Rate Limiting da Cloudflare; não limitar por `installId`.

### M24. Celular na rede: HTTP sem TLS e sessão que não expira — ✅ CORRIGIDO (Lupa)
- **Onde:** `src-tauri/src/lan.rs:296` (bind `0.0.0.0`), `:254` (cookie sem `Max-Age`), `:41` e `:231` (sessões sem validade), `:288` (`http://`).
- **Como reproduzir:** numa rede compartilhada (convidados, hotel), quem escuta o tráfego vê o código no `/api/pair`, o cookie `upv` e o `/api/summary` (clientes, pedidos, estoque), e reaproveita a sessão até o app fechar. `is_local` não protege, porque todos ali têm IP privado.
- **Correção sugerida:** validade de sessão (por exemplo 12 h), aviso "use só no Wi-Fi de casa" e desligamento automático após X horas. TLS na rede local não compensa.

## Baixo

### B1. A importação no meio da sessão apaga o formulário aberto
- **Onde:** `src/App.tsx:133,146`; `src/sync/SyncBanner.tsx:28-30`.
- **Como reproduzir:** preencha um orçamento enquanto o 1º tick importa, ou clique em "Assumir". O `remount` troca a `key` do `<main>` e o formulário some.
- **Correção sugerida:** `flushPendingSaves` e perguntar antes de importar se houver formulário sujo.

### B2. A cópia "antes-de-restaurar" é invisível e se acumula — ✅ CORRIGIDO (Lupa)
- **Onde:** `src/backupActions.ts:26-29` (grava em `appData/backups/`, sempre com fotos); `src-tauri/src/backup.rs:47-62` (a lista só vê `upvision-auto-` e `upvision-conflito-`).
- **Como reproduzir:** restaure ou receba uma importação da sync. A cópia não aparece em "Backups guardados", e cada importação acrescenta um arquivo com fotos que nada apaga.
- **Correção sugerida:** um prefixo que `list_in` reconheça, mais um limite de quantidade.

### B3. Com "manter 1", um dia ruim apaga o único backup bom; o rename é feito sem fsync — ✅ CORRIGIDO (Lupa)
- **Onde:** `src-tauri/src/backup.rs:41-45` (`write_atomic` sem `sync_all`) e `:73-80`; `src/backup/auto.ts:41` (aceita `keep` = 1).
- **Como reproduzir:** com manter = 1, apague dados por engano (ou fique com um restore parcial) e feche o app: o backup bom some. Numa queda de energia, o arquivo novo pode ficar vazio depois que o antigo do mesmo dia já foi apagado.
- **Correção sugerida:** mínimo de 2, ou sempre manter o backup do dia anterior; `sync_all` antes do rename.

### B4. O backup leve deixa fotos que passam para outros produtos — ✅ CORRIGIDO (Lupa)
- **Onde:** `src/db/backup.ts:66` (pula `photos`); ids reaproveitados (`INTEGER PRIMARY KEY` sem AUTOINCREMENT).
- **Como reproduzir:** com os produtos 1–10 com fotos, restaure um backup leve com os produtos 1–8. O próximo produto novo recebe o id 9 e herda as fotos de outro. Ids 1–8 que no backup são outros produtos herdam fotos erradas também.
- **Correção sugerida:** no restore leve, apagar as fotos cujo dono não existe no backup, ou avisar.

### B5. ✅ Fotos de projeto ficam órfãs ao excluir o projeto pela ferramenta
- **Onde:** `src/tools/useToolState.ts:228-230` (`removeProject` sem `photos.removeOwner`, ao contrário de `MyProjects.tsx:96`); `src/db/toolStateRepo.ts:86` (a poda de `LIBRARY_MAX` também não limpa).
- **Como reproduzir:** exclua o projeto mais recente pela lista da ferramenta e salve um novo. Ele reusa o id e mostra as fotos antigas.
- **Correção sugerida:** limpar as fotos dentro de `toolProjects.remove` e da poda.

### B6. Salvar o backup manual por cima de um arquivo existente não é atômico — ✅ CORRIGIDO (Lupa)
- **Onde:** `src/backupActions.ts:17` (`writeTextFile` direto no destino).
- **Como reproduzir:** grave por cima do backup anterior num pendrive e fique sem espaço no meio. O backup antigo se perde e o novo fica cortado.
- **Correção sugerida:** gravar por comando Rust com `write_atomic`.

### B7. Baixa manual e "Rolo acabou" podem perder uma baixa simultânea — ✅ CORRIGIDO (Forja)
- **Onde:** `src/db/repo.ts:57-60` (`consume`), `:69-72` (`finishSpool`) e `:36-39` (`restock`), que leem, calculam e gravam em JS.
- **Como reproduzir:** o celular pede −50 g (lê 1000) e, nesse intervalo, um pedido grava 900 pelo Rust. `consume` grava 950 em vez de 850.
- **Correção sugerida:** `UPDATE … SET stockG = ROUND(stockG - ?, 2)` ou passar pelo `apply_stock`.

### B8. Total ≠ Subtotal − Descontos + Frete com quantidade fracionada — ✅ CORRIGIDO (Forja)
- **Onde:** `src/domain/orders.ts:60-62`; exibido em `src/pdf/quote.ts:49-52` e `OrderEditor.tsx:265-268`.
- **Como reproduzir:** 2 linhas de 1,5 × R$ 10,33 dão subtotal 30,99, desconto −0,01 (não exibido) e total 31,00, e o Pix cobra 31,00.
- **Correção sugerida:** subtotal como a soma de `round2(qty*unitPrice)` por linha, ou `unitPrice` com 2 casas na validação.

### B9. Pix abaixo de meio centavo gera o campo 54 "0.00" — ✅ CORRIGIDO (Forja)
- **Onde:** `src/domain/pix.ts:110` e `:118`.
- **Como reproduzir:** valor 0,004 passa no `> 0` e gera um QR que os bancos recusam.
- **Correção sugerida:** validar `Math.round(amount*100) >= 1`.

### B10. Outros `parseX(...) || 0` que viram 0 sem aviso — ✅ CORRIGIDO (Forja)
- **Onde:**
  - `OrderEditor.tsx:116,129` (desconto "10%", frete "15 reais");
  - `Customers.tsx:122` (desconto do cliente);
  - `ProduceSheet.tsx:17` ("1.000" unidades vira 1);
  - `KwhBillSheet.tsx:24` ("1.234" kWh vira 1,234, mas pelo menos aparece no aviso de valor fora do comum).
- **Correção sugerida:** o parser certo para cada campo (`parseMoney`/`parseMass`/inteiro pt-BR) e erro no campo em vez de 0.

### B11. Erro do banco invisível no cadastro rápido de filamento
- **Onde:** `src/pages/calculator/NewFilamentSheet.tsx:38-40` (o formulário não mostra `errors._` nem `errors.brand`).
- **Como reproduzir:** com o banco travado, clique em "Cadastrar e usar": nada acontece.
- **Correção sugerida:** mostrar `errors._`.

### B12. ✅ 3MF com configuração ilegível perde a purga multicor sem aviso
- **Onde:** `src/domain/slicer/threemf.ts:58-64` (`readSettings` devolve `{}`).
- **Como reproduzir:** importe um 3MF multicor com `project_settings.config` corrompido. Gramas e custo saem sem a purga, e a lista de avisos fica vazia.
- **Correção sugerida:** acrescentar um item em `warnings`.

### B13. "Projeto do Bambu" usa a impressora padrão em silêncio quando o BambuStudio.conf não é lido
- **Onde:** `src-tauri/src/bambu.rs:69-72` (`.ok()` + `unwrap_or(Value::Null)` → `DEFAULT_MACHINE`).
- **Como reproduzir:** com o conf ilegível, o projeto sai com o perfil A1 e o toast ainda diz "com a impressora e os filamentos".
- **Correção sugerida:** informar ao front que usou o padrão e ajustar o toast.

### B14. `unwrap()` nos mutexes do servidor do celular — ✅ CORRIGIDO (Lupa)
- **Onde:** `src-tauri/src/lan.rs:205, 231, 242, 276, 279, 287, 295, 298, 312, 325, 333, 343`.
- **Como reproduzir:** basta um panic com o lock tomado. O mutex fica envenenado e todo pedido seguinte também entra em pânico: o celular para de funcionar sem mensagem.
- **Correção sugerida:** `lock().unwrap_or_else(|e| e.into_inner())`.

### B15. F5 ou Ctrl+R recarregam o app inteiro no Windows
- **Onde:** `src/ui/shortcuts.ts:17-47`.
- **Como reproduzir:** F5 dentro de uma ferramenta: o app reinicia e perde o desfazer e o que não foi salvo.
- **Correção sugerida:** `preventDefault` em F5, Ctrl+R e Ctrl+Shift+R em build de produção.

### B16. O nome do catálogo em PDF não é limpo
- **Onde:** `src/pages/quotes/CatalogSheet.tsx:39` (só troca espaços).
- **Como reproduzir:** título "Natal 24/25": o diálogo sugere "25.pdf". No Windows, "Natal: kits?" é recusado pelo diálogo.
- **Correção sugerida:** `slug(title)`, como as outras telas.

### B17. A prévia 3D não libera a GPU ao sair
- **Onde:** `src/ui/viewerScene.ts:215-223` (sem descarte das malhas e sem `forceContextLoss`).
- **Como reproduzir:** troque muitas vezes entre ferramentas com prévia 3D. Aparece "Too many active WebGL contexts" e a prévia some.
- **Correção sugerida:** `setModels([])` mais `renderer.forceContextLoss()` antes do `dispose()`, como `renderThumb.ts:122-134`.

### B18. Imagem → SVG não revoga o último blob URL ao sair da tela
- **Onde:** `src/tools/ImageToSvg.tsx:87`, `:99-103` e `:116-122`.
- **Como reproduzir:** abrir uma imagem e sair da tela, várias vezes. Cada visita deixa um Blob vivo até o app fechar.
- **Correção sugerida:** `useEffect(() => () => revoke(rasterRef.current?.raster.url), [])`.

### B19. "Pedir à IA" não cancela ao sair da tela
- **Onde:** `src/tools/AskAI.tsx:41,90,101,131,141`.
- **Como reproduzir:** envie um pedido e troque de tela. A chamada paga continua, a resposta se perde e o worker do OpenSCAD roda até 90 s.
- **Correção sugerida:** `useEffect(() => () => cancelRef.current(), [])`.

### B20. Os arquivos de sincronização dividem o mesmo `.tmp` na pasta da nuvem — ✅ CORRIGIDO (Lupa)
- **Onde:** `src-tauri/src/backup.rs:42` (`with_extension("tmp")`), usado em `sync.rs:28`.
- **Como reproduzir:** não reproduzido. `upvision-sync.json` e `.lock` usam ambos `upvision-sync.tmp`; o OneDrive pode criar cópias "(1).tmp" ou fazer o `rename` falhar com "Acesso negado" enquanto segura o arquivo.
- **Correção sugerida:** nome temporário único (`<nome>.<pid>.<nanos>.tmp`) e uma nova tentativa do `rename` no Windows.

### B21. Atalhos com ⌘ fixo no texto e sem Ctrl+Y no Windows
- **Onde:** `src/ui/PhotoGallery.tsx:118`, `src/tools/models/LayersPanel.tsx:73,76`, `src/tools/DrawerOrganizer.tsx:137`; `src/tools/useToolState.ts:144`.
- **Correção sugerida:** `modKey()` no texto e aceitar Ctrl+Y fora do Mac.

### B22. Miniaturas em WebP provavelmente saem em PNG no Mac
- **Onde:** `src/ui/viewerScene.ts:213`, `src/thumbs/renderThumb.ts:121`.
- **Por que:** o WebKit não codifica WebP em `toDataURL` e cai para PNG em silêncio: miniaturas e backups ficam maiores. Não confirmado.
- **Correção sugerida:** conferir o prefixo do data URL e usar JPEG quando não for WebP.

### B23. Nomes reservados do Windows no "Abrir no fatiador" — ✅ CORRIGIDO (Lupa)
- **Onde:** `src-tauri/src/slicer.rs:97-101` (`safe_name` não barra CON, PRN, AUX, NUL, COM1…).
- **Como reproduzir:** um SVG chamado `con.svg` → Abrir no fatiador. No Windows o arquivo não é criado direito.
- **Correção sugerida:** acrescentar um sufixo quando o radical for um nome reservado.

### B24. `/api/pair` aceita GET, e uma página qualquer pode travar o pareamento — ✅ CORRIGIDO (Lupa)
- **Onde:** `src-tauri/src/lan.rs:226` (o cabeçalho `X-UpVision` é exigido só em POST), `:229` e `:240-244`.
- **Como reproduzir:** 5 GETs (por exemplo um `<img src>` numa página aberta na rede) contam como 5 tentativas erradas e travam o pareamento até alguém gerar um código novo. É só negação de serviço, sem vazamento.
- **Correção sugerida:** aceitar `/api/pair` só com `method == "POST"`.

### B25. Conexões lentas ocupam todas as vagas do servidor do celular — ✅ CORRIGIDO (Lupa)
- **Onde:** `src-tauri/src/lan.rs:236` (lê o corpo do pareamento antes do login), `:26` (`MAX_INFLIGHT` 32), `:303`.
- **Como reproduzir:** abra mais de 32 POSTs para `/api/pair` e mande o corpo byte a byte. Os celulares de verdade recebem 503, porque não há timeout de leitura.
- **Correção sugerida:** timeout de leitura de alguns segundos.

### B26. A chave da Anthropic fica em texto puro no SQLite
- **Onde:** `src/ai/aiSettings.ts:5-19`, `src/db/repo.ts:94-103`, `src/db/migrations.ts:24` (`secrets`).
- **Como reproduzir:** abra `upvision.db` com um leitor de SQLite. A chave **não** vai para o backup nem para a sync e é mascarada no log, mas qualquer programa rodando como o mesmo usuário a lê.
- **Correção sugerida:** Keychain/Credential Manager (crate `keyring` num comando Rust).

### B27. Zip bomb ao importar 3MF ou planilha
- **Onde:** `src/domain/slicer/threemf.ts:12`, `src/domain/marketplace/xlsx.ts:51`, `src/geometry/threemfRead.ts:104` (400 MB por arquivo, sem teto total).
- **Como reproduzir:** um .3mf ou .xlsx que descompacta para vários GB derruba a janela por falta de memória. Não há path traversal: nada é extraído para o disco.
- **Correção sugerida:** somar `originalSize` no `filter` e recusar acima de ~200 MB.

### B28. Endurecimentos menores
- **Onde e o quê:**
  - `src-tauri/tauri.conf.json:26`: `connect-src https://*.workers.dev` libera qualquer Worker. Usar o host exato.
  - `src-tauri/src/backup.rs:93-98`: os comandos de backup e sync aceitam qualquer pasta, fora do escopo do fs. Os nomes de arquivo são fixos ou validados, então só pesa se o webview já estiver comprometido.
  - `src/phone/api.ts:76`: o 500 devolve `e.message` interno ao celular. Trocar por uma mensagem genérica.
  - `.github/workflows/release.yml:35`: `tauri-apps/tauri-action@v0` presa por tag num passo que recebe a chave de assinatura. Fixar por SHA.

---

## Verificado e OK (resumo)

- **Backup:**
  - Todas as tabelas e colunas do schema entram no backup; só `secrets` fica fora, de propósito.
  - `parseBackup` valida o arquivo inteiro antes de escrever.
  - A cópia "antes-de-restaurar" é gravada antes do 1º DELETE.
  - Backup automático, sync e conflito usam tmp + rename.
  - Nomes de arquivo validados no Rust, sem path traversal.
- **Banco:**
  - Baixa e estorno de estoque (`stock.rs`) são transacionais, com trava contra baixa dupla.
  - Excluir pedido é transacional.
  - Conversão de orçamento idempotente.
- **Sincronização:**
  - A decisão é por hash de conteúdo, não por data.
  - Arquivo da pasta truncado ou corrompido não é importado.
  - Fica desligada na pasta padrão.
  - Fotos sempre incluídas.
  - O fechamento cortado entre `sync_write` e `remember` não perde nada.
- **Cálculos:**
  - `channelPrice` conferido com 3000 canais aleatórios contra busca exaustiva, 0 divergências; margem + taxa ≥ 100% devolve null.
  - `calculate` neutraliza NaN e valores negativos; falha limitada a 90%.
  - `roundPrice`, `quantityTable`, `adsFor`, `financeSummary`, séries mensais e custos recorrentes (dia 31) coerentes.
  - `planConsumption`: kits recursivos protegidos contra ciclo.
  - `weightedAverage` e `pixPayload`/CRC corretos.
  - `parseMoney` certo para "R$ 1.234,56", "12,5" e negativos.
- **Segurança:**
  - Servidor do celular desligado por padrão.
  - Pareamento: 6 dígitos de `getrandom`, comparação em tempo constante, uso único, 10 min de validade, trava após 5 erros.
  - Sessão: token de 256 bits, cookie HttpOnly/SameSite=Strict.
  - Host conferido (DNS rebinding); CSRF barrado por cabeçalho próprio com OPTIONS negado.
  - Corpo limitado a 16 KB; arquivos estáticos sem traversal.
  - Entradas do celular validadas com zod (gramas positivas, até 10.000).
  - CSP sem `unsafe-eval`; `innerHTML` só com SVG estático ou do QR; `openUrl` só com URLs montadas pelo app.
  - fs limitado a `$APPDATA`; sem shell e sem plugin http.
  - Updater com chave minisign e sem downgrade.
- **Plataforma:**
  - `cfg(target_os)` presente onde precisa.
  - Caminhos do Bambu/Orca/Prusa no Windows corretos.
  - Carimbos de data sem `:`; `slug` só ASCII.
  - `\r\n` tratado em G-code/.scad/changelog; CSV com BOM.
  - Fontes do PDF e da geometria embutidas.
- **Memória:**
  - Os workers do vtracer, do OpenSCAD e do MediaPipe são encerrados ou soltos.
  - Os 84 geradores de manifold usam `scoped`/`delete()`.
  - Os `listen()` do Tauri têm `unlisten`.
  - Timers limpos; caches globais limitados.
  - `drawerScene` e `renderThumb` descartam tudo.
