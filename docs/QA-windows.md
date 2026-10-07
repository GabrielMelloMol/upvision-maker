# QA no Windows (issue #6)

Não temos um Windows físico, então a validação tem duas partes.

## 1. Automática (GitHub Actions → `windows-qa`)

O workflow `.github/workflows/windows-qa.yml` roda em `windows-latest` (Windows Server 2022, WebView2/Edge). Rode por **Actions → windows-qa → Run workflow**; ele também roda sozinho quando o próprio workflow muda.

| Etapa | O que confere | Resultado (run 36466879783, 2026-09-28) |
|---|---|---|
| Unitários e componentes | a suíte inteira do Vitest no Windows (caminhos, fim de linha, fuso) | ✔ |
| Build do instalador | `tauri build --bundles nsis` (sem artefatos do updater) | ✔ `instalador-windows` |
| Fumaça | abre o `.exe` e confere que continua aberto por 20 s (WebView2, CSP, SQLite, migrações) | ✔ |
| E2E no Edge | os E2E do Playwright no Edge instalado (`PW_CHANNEL=msedge`), o mesmo motor do WebView2 | ✔ |
| Screenshots | todas as telas em **1366×768 a 100 %**, **1920×1080 a 125 %** e **1920×1080 a 150 %**, claro e escuro | ✔ `screenshots-windows` (144 imagens) |

**Revisão dos screenshots:**
- Segoe UI renderiza bem e o atalho aparece como `Ctrl` + `K`.
- Não há corte nem sobreposição em nenhuma escala.
- A 150 % a barra lateral rola, e o rodapé (backup, versão) continua fixo e visível.
- Modais e onboarding cabem inteiros em 1280×720 CSS.

Uma seleção está em `docs/screenshots/windows/`; o conjunto completo fica no artefato de cada execução.

**O que o CI não consegue ver:**
- a Mica e a barra de título reais (o runner não tem compositor com efeitos);
- o SmartScreen;
- impressão real;
- o desempenho numa máquina comum;
- a atualização automática de ponta a ponta.

Isso fica na parte 2.

## 2. No computador dela (Windows 10 ou 11)

Marque na issue #6. Em cada item, se algo sair diferente, abra **Sugerir ferramenta → Enviar diagnóstico** (ou tire um print) e cole na issue.

### Instalação
- [ ] Baixar o `UpVision.Maker_x.y.z_x64-setup.exe` da página de Releases e abrir.
- [ ] Aparece "O Windows protegeu o computador" (SmartScreen): **Mais informações → Executar assim mesmo**. A instalação termina sem erro.
- [ ] O app abre pelo menu Iniciar; o rodapé da barra lateral mostra a versão instalada (ex.: `v0.4.0`).

### Visual (Mica e legibilidade)
- [ ] **Windows 11:** a barra lateral tem o fundo "Mica" (leve tom do papel de parede, meio translúcido). O conteúdo à direita é sólido e fácil de ler.
- [ ] **Windows 10:** a barra lateral é cinza sólida (sem transparência) e tudo continua legível.
- [ ] Em **Configurações → Personalização → Cores**, alternar Claro/Escuro: o app troca junto, sem texto apagado.
- [ ] Com **Efeitos de transparência** desligado, a barra lateral fica sólida.
- [ ] Em **Configurações → Tela → Escala** 125 % e 150 %: nada cortado; a barra lateral rola e o rodapé com backup e versão continua visível.

### Imagem → SVG e Silhueta
- [ ] Imagem → SVG com um logo: **Aplicar** termina em poucos segundos e o SVG salva.
- [ ] Uma foto de pessoa no modo **Silhueta**: recorta o contorno em até ~10 s na primeira vez (baixa a IA local) e mais rápido nas seguintes.

### PDFs A4
- [ ] Orçamento → **PDF**: abrir no Edge e imprimir (ou "Microsoft Print to PDF"). Sai em A4, com margens certas, sem cortar a tabela, e o QR do Pix é lido pelo app do banco.
- [ ] O mesmo com o **contrato de consignação** e o **catálogo**.

### Importar do fatiador
- [ ] Fatiar uma peça no **Bambu Studio para Windows**, exportar o `.3mf` fatiado e importar na Calculadora: filamentos, gramas, tempo e peças são preenchidos.
- [ ] (Chaveiro NFC) no Bambu Studio a pausa precisa ser adicionada à mão; a tela explica como.

### Backup e diagnóstico
- [ ] Em **Preferências → Seus dados**, escolher uma pasta do OneDrive ou Google Drive e clicar em **Fazer backup agora**: o arquivo aparece na pasta.
- [ ] Fechar e abrir o app: o backup do dia continua lá (um por dia).
- [ ] **Sugerir ferramenta → Enviar diagnóstico** abre o e-mail com o registro de erros anexado ou colado.

### Celular na rede de casa
- [ ] Em **Preferências → Celular na rede de casa**, ligar a chave: o Windows mostra o aviso do **Firewall**. Marcar **Redes privadas** e permitir; ler o QR no celular conecta.
- [ ] Se o aviso foi fechado ou a rede está como **Pública**: seguir a orientação que aparece no cartão (Permitir um aplicativo pelo Firewall; marcar a rede do Wi-Fi como **Privada**) e o celular conecta.

### Atualização
- [ ] Clicar na versão (rodapé) → **Sobre** → **Verificar atualizações**: mostra "Em dia" ou "Você está N versões atrás".
- [ ] Quando sair a próxima versão: aparece o selo **Atualização disponível**; **Atualizar agora** baixa, instala e reinicia sozinho, e o rodapé mostra a versão nova.

### Desempenho (#88) — anotar os números
- [ ] Com o computador recém-ligado, abrir o app e cronometrar até a barra lateral aparecer. **Meta: menos de 2 s.**
- [ ] **Sobre → Copiar informações**: a última linha traz "Abertura: X s · memória JS: Y MB". Colar aqui.
- [ ] Gerenciador de Tarefas → Processos → **UpVision Maker** (expandir: o app + os processos "WebView2"): somar a coluna Memória com o app parado na tela Início. **Meta: menos de 250 MB.**
- [ ] Usar **Imagem → SVG**, **Litofania** (com uma foto) e **Modelos prontos**, voltar para **Início**, esperar 5 s e somar de novo: a memória deve voltar perto da do app parado.
