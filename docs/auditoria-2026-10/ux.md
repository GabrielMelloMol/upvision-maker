# Auditoria de UX — outubro de 2026

Feita pelo Quartzo (design e QA) em 03/10/2026, no `origin/main` em `69e1258`, que é o mesmo código do app instalado no Mac (v0.10.3, com a Gaveta modular). Só análise: nada de código mudou e nenhuma issue foi aberta.

A pergunta foi: uma vendedora de impressão 3D que acabou de instalar o app consegue **precificar, cadastrar um pedido, gerar o arquivo e entregar** sem travar? E o que, no caminho, confunde, some ou não funciona?

## Como foi feito

- **Todas as telas** (56): Início, Criar, as 17 ferramentas, os 24 modelos prontos que a galeria de Criar mostra, Calculadora, Pedidos, Orçamentos, Clientes, Produtos, Filamentos, Materiais, Impressoras, Painel, Financeiro, Custos, Preferências, Dados da empresa e o Organizador pela foto com a Gaveta modular.
- **Quatro estados por tela:** primeiro uso (tudo vazio); preenchida com dados de exemplo no claro; a mesma no escuro; e janela estreita (1000 × 700, o mínimo do app é 900).
- **Quatro jornadas de iniciante:** primeiro uso, precificar, pedido do zero até "Entregue", e gerar o arquivo de um chaveiro. Contei os cliques e registrei onde ela trava.
- **Acessibilidade:** axe (WCAG 2.2 AA) em todas as telas, nos dois temas; a lista de problemas "conhecidos" do teste visual do projeto (contraste, alvos, texto cortado, foco); e a ordem do Tab.
- **Onde rodou:** as telas e as jornadas rodaram no navegador de teste (Playwright/Chromium), com o mesmo código do app instalado. A janela, a abertura e os painéis nativos só existem no app instalado e estão na seção [App instalado](#app-instalado). Todos os prints usam dados de exemplo; nenhum tem dados do Gabriel.

**Gravidade:**
- **Crítica:** impede uma tarefa principal ou perde o trabalho dela.
- **Alta:** atrapalha muito ou é erro visível em uso comum.
- **Média:** confunde ou força passos a mais, mas tem saída.
- **Baixa:** acabamento.

## Resumo

| Gravidade | Achados |
|---|---|
| Crítica | 1 |
| Alta | 5 |
| Média | 15 |
| Baixa | 9 |
| **Total** | **30** |

**Os 5 piores:**
1. **[C1] Calculadora → "Salvar como produto" perde o cálculo.** Precificando sem filamento cadastrado (o caminho mais natural para quem começa), o produto sai com custo R$ 0,00 e preço R$ 0,00. O único aviso é um toast.
2. **[A1] A boas-vindas trava no passo 2.** Quem não sabe a potência da impressora só vê "Obrigatório" e "Digite um número". A saída é "Pular", ao lado de "Agora não" e do X: três saídas que ninguém sabe diferenciar.
3. **[A2] Preferências tem dois jeitos de salvar na mesma tela.** Custos, preço e canais só valem depois de "Salvar preferências", um botão no meio da página. Aparência, Backup, IA e AMS gravam na hora. É fácil sair achando que salvou.
4. **[A3] Na janela estreita, o quadro de Pedidos corta a coluna "Entregue"**: nomes pela metade e valores escondidos.
5. **[A4] Lucro e prejuízo do Painel e do Financeiro no escuro** ficam com contraste de 2,97:1, abaixo do mínimo de 4,5:1, justamente nos números que ela mais olha.

**Tarefas principais:**

| Tarefa | Consegue? | Cliques | O que atrapalha |
|---|---|---|---|
| Precificar | Sim, mas | ~4 campos | Jargão (markup, margem, "Cadastrado"); salvar como produto sem filamento cadastrado perde o cálculo (C1) |
| Cadastrar pedido | Sim | 3 | Item digitado à mão funciona bem; sem produto cadastrado não há custo nem baixa de estoque, e só a dica do vazio avisa |
| Gerar arquivo | Sim | 1 (Salvar 3MF) | O "Como vai imprimir" quebra em 3 linhas e usa "AMS" (M4, M1) |
| Entregar | Sim | 3 (Iniciar → Concluir → Entregue) | Não dá para marcar se o cliente pagou nem avisar que ficou pronto (A5) |

## Achados

### Crítica

**✅ C1 · Calculadora → Produtos · "Salvar como produto" perde o cálculo quando o filamento não está cadastrado**
- Print: [preenchida](ux/03-calc-preenchida.jpg) · [folha do produto](ux/02-calc-folha-produto.jpg) · [produto salvo](ux/01-calc-produto-r0.jpg)
- **O que acontece:** na Calculadora (modo Rápido) o select "Cadastrado" vem em "Digitar preço". Ela digita R$ 120/kg, 12 g e 1h30 e vê custo de R$ 1,52 e venda direta de R$ 7,58. Ao clicar "Salvar como produto", a folha abre com "Filamentos (mesa inteira): Nada cadastrado ainda" e custo R$ 0,00. Salvando, o produto entra na lista com **custo R$ 0,00 e preço R$ 0,00**. O único aviso é o toast "1 linha(s) sem item cadastrado ficaram de fora do produto", e o tempo e a impressora também não vão junto.
- **Por que é crítico:** é o caminho que a tela de Produtos manda seguir ("Dica: na Calculadora, use Salvar como produto"). Os pedidos e o Financeiro com esse produto ficam com custo e lucro errados sem ela perceber.
- **Sugestão:** ao salvar sem filamento cadastrado, levar o preço por kg e as gramas digitadas, criando o filamento na hora com um nome tipo "PLA (da calculadora)" e confirmando. Ou levar pelo menos o custo calculado como "custo manual" do produto. Se nenhuma dessas der, bloquear com uma pergunta clara ("Cadastrar este filamento agora?") em vez do toast. O preço escolhido (R$ 7,58) também deveria ir para o produto.

### Alta

**✅ A1 · Boas-vindas (primeiro uso) · o passo 2 trava quem não sabe a potência; três saídas ambíguas**
- Print: [passo 2](ux/04-boasvindas-passo2.jpg)
- **O que acontece:** o passo 2 de 3 ("Sua impressora") exige nome e potência. Com os campos vazios, "Continuar" só pinta os dois de vermelho ("Obrigatório", "Digite um número"), e repeti 6 vezes. Para seguir, é preciso entender que "Pular" pula o passo, "Agora não" fecha a apresentação e o X também fecha.
- **Sugestão:** deixar "Continuar" passar com os campos vazios, usando a potência do catálogo e avisando "dá para cadastrar depois em Impressoras". Ou pôr "Não sei" ao lado do catálogo, abrindo a busca por modelo. Deixar só duas saídas: "Continuar" e "Fazer depois".

**✅ A2 · Preferências · dois modos de salvar na mesma tela**
- Print: [botão no meio](ux/24-preferencias-salvar.jpg)
- **O que acontece:** custos da produção, preço de venda, falhas, impostos e canais só gravam com "Salvar preferências", que fica no meio da página, depois dos canais. Logo abaixo, Aparência, Backup, Sincronização, IA, Mesa, Meu AMS e Fatiador gravam na hora. Dados da empresa tem o botão no topo. São três modelos de salvar nas telas de Ajustes.
- **Sugestão:** gravar tudo na hora, com "Salvo" discreto ao lado do campo, como já faz Aparência. Se precisar de botão, deixá-lo fixo no rodapé da tela e avisar ao sair com alteração não salva. (Não testei se esse aviso de saída já existe.)

**✅ A3 · Pedidos (Quadro) · na janela estreita a coluna "Entregue" fica cortada**
- Print: [1000 px](ux/05-pedidos-estreita.jpg)
- **O que acontece:** em 1000 px com a barra lateral aberta, as 4 colunas não cabem. "Entregue" aparece pela metade, com o nome cortado ("Doces da E") e o valor escondido ("R$"), sem nenhum sinal de que há mais à direita.
- **Sugestão:** colunas com largura mínima e rolagem horizontal visível, com sombra na borda. Ou, abaixo de ~1100 px, empilhar as colunas ou abrir a vista "Lista". A barra recolhida (⌘⌥S) já resolve, mas ela não sabe disso.

**✅ A4 · Painel e Financeiro (escuro) · contraste baixo nos números de lucro e prejuízo**
- Print: [Painel](ux/06-painel-escuro.jpg) · [Financeiro](ux/07-financeiro-escuro.jpg)
- **O que acontece:** o vermelho `#d03b3b` sobre `#2a2a2e` dá 2,97:1, tanto no valor grande ("-R$ 520,00", 30 px, precisa de 3:1) quanto na variação pequena (12 px, precisa de 4,5:1). O verde `#0ca30c` sobre branco, no claro, dá 3,35:1. Isso já está na lista de "conhecidos" do teste visual, ou seja, foi aceito como dívida.
- **Sugestão:** tokens de "bom" e "ruim" próprios para texto, mais claros no escuro (um vermelho em torno de `#ff6b6b`) e mais escuros no claro (um verde em torno de `#0a7d0a`). Manter também o ▲▼ (já existe) para não depender só da cor.

**A5 · Pedidos · falta "pago / falta receber" e o aviso ao cliente**
- **O que acontece:** o pedido guarda a forma de pagamento (Pix, dinheiro…), mas não **se** o cliente pagou. O detalhe do pedido entregue só tem "Editar" e "Excluir pedido". Não há "Avisar que está pronto" (mensagem pronta para o WhatsApp) nem recibo. Para "entregar e receber", ela precisa controlar fora do app.
- **Sugestão:** um selo "Pago / A receber" no cartão (com sinal, se houver) e o filtro "A receber" no Painel. No Concluído, um botão "Mensagem de pronto" que copia um texto com o nome, o total e a chave Pix da empresa.

### Média

**✅ M1 · Várias telas · jargão sem explicação no lugar**
- Print: [Criar](ux/18-criar-ams.jpg) · [Calculadora](ux/19-calc-vazia.jpg) · [Chaveiro](ux/09-chaveiro-como-imprimir.jpg)
- **Onde aparece:**
  - "Funciona sem AMS" (Criar); "pronto para o AMS" (Chaveiros); "Multicor (AMS)" (Como vai imprimir).
  - "markup 200 % · margem 66,7 % antes das taxas" (Calculadora); "Cadastrado" sobre um select cuja opção é "Digitar preço".
  - "TD (mm) — Transmission distance: do HueForge" no formulário básico de Filamentos.
  - "depreciação", "PEI", "manutenção %" (Impressoras e Preferências); "insumos" (Produtos); "MOLLE" (Tag de pet).
  - "API da Anthropic", com passos em inglês (Pedir à IA e Preferências).
- **Sugestão:**
  - Trocar por palavras do dia a dia: "impressora com troca automática de cor (AMS)", "lucro sobre o custo" em vez de markup, "Filamento" em vez de "Cadastrado".
  - Levar TD e HueForge para "Opções avançadas".
  - Pôr um ⓘ com uma frase onde o termo técnico tiver que ficar.

**✅ M2 · Extrusão 3D, OpenSCAD e Etiquetas de rolo · rótulo "Outros formatos:" sem nada depois**
- Print: [OpenSCAD](ux/11-scad-outros-formatos.jpg)
- **O que acontece:** sem peça carregada, o bloco de exportar mostra "Outros formatos:" e mais nada. Com peça, aparece "Salvar STL".
- **Sugestão:** esconder a linha enquanto não houver peça, ou mostrar "Salvar STL" desabilitado.

**✅ M3 · Vazios que mandam para outra tela sem o link**
- Print: [Etiquetas de rolo](ux/10-etiquetas-vazio.jpg) · [Pixel art](ux/17-pixel-vazio.jpg)
- **Onde aparece:**
  - Etiquetas de rolo: "Nenhum filamento cadastrado… Cadastre os rolos em Filamentos", só texto.
  - Pixel art: "Cadastre filamentos para usar as suas cores".
  - Pedidos vazio: "Cadastre produtos antes…".
- **Sugestão:** pôr o botão "Cadastrar filamento" / "Ir para Produtos" no próprio vazio. Orçamentos já faz assim com o link "Dados da empresa".

**✅ M4 · Seletores com rótulos que quebram em 2 a 4 linhas**
- Print: [Chaveiro](ux/09-chaveiro-como-imprimir.jpg) · [modelo](ux/08-modelo-vazio.jpg)
- **Onde aparece:** "Como vai imprimir" (Multicor (AMS) | Trocando o filamento | Uma mesa por cor | 1 cor) vira uma caixa de 4 linhas; "Quebra-cabeça" no Pixel art; variantes de modelo como "No contorno do desenho" e "Redonda e formatos".
- **Sugestão:** rótulos de uma ou duas palavras ("AMS", "Pausas", "Por cor", "1 cor") com a explicação na dica embaixo, como já foi feito com "Teste" no Organizador. Ou trocar para um select quando houver mais de 3 opções longas.
- **Feito:** os seletores (`.seg`) não quebram mais o texto (largura pelo conteúdo, e quebra de botão inteiro se não couber) e "Como vai imprimir" virou Multicor | Com pausas | Mesa por cor | 1 cor. **Também feito (#181):** as legendas das variantes de modelo embaixo das miniaturas ficaram com até 14 letras ("No contorno", "Redonda", "Nome em lote"), numa linha só; um teste garante o limite.

**✅ M5 · Modelos prontos que dependem de desenho abrem vazios**
- Print: [Medalha adaptável](ux/08-modelo-vazio.jpg)
- **O que acontece:** a miniatura mostra a peça pronta, mas Medalha adaptável, Chaveiro de logo e Cortador + carimbo abrem com o 3D em "Envie um desenho (SVG ou imagem) para ver o modelo", e o campo de enviar fica abaixo da dobra. Parece que não funcionou.
- **Sugestão:** abrir com uma arte de exemplo (a mesma da miniatura) e o aviso "Troque pela sua arte"; o envio fica logo abaixo do nome do modelo.

**M6 · Estoque · dois padrões de cadastro**
- Print: [Materiais extras](ux/14-materiais-vazio.jpg)
- **O que acontece:** Filamentos, Materiais extras e Impressoras mostram o formulário "Adicionar" aberto no alto e, embaixo, o vazio com um segundo botão ("Cadastrar material"). Clientes, Produtos, Pedidos e Custos usam um botão no título que abre uma folha.
- **Sugestão:** um padrão só. O do botão no título com folha é o mais comum no app e deixa a lista à vista; o vazio leva o mesmo botão.

**✅ M7 · Tabelas · cada lista com ações por linha diferentes**
- Print: [Filamentos](ux/15-filamentos-acoes.jpg)
- **O que acontece:** Filamentos tem 4 links de texto em 2×2 (Repor, Duplicar, Editar, Excluir), e "Excluir" na mesma cor das outras ações. Clientes e Custos usam lápis e lixeira. Produtos usa "Produzir" + lápis + lixeira.
- **Sugestão:** ação principal da tela como botão de texto (Repor, Produzir), editar e excluir como ícones (lixeira cinza que fica vermelha no hover, padrão de `td button.danger`) e o resto num menu "⋯".
- **Feito:** Filamentos, Materiais extras e Impressoras (a tela `CrudPage`) passaram a usar lápis e lixeira, como Clientes, Custos e Produtos, com nome acessível por linha ("Editar PLA", "Excluir PLA"); Repor e Duplicar seguem como texto, numa linha só. **Não feito:** o menu "⋯" para o resto.

**✅ M8 · Preferências · dicas cortadas que terminam em ":"**
- Print: [dicas](ux/25-preferencias-dicas.jpg)
- **O que acontece:** a dica longa mostra a 1ª frase e o resto no ⓘ, mas aqui a 1ª frase termina em dois pontos ("Para quem compra de você para revender: ⓘ"). Parece texto quebrado.
- **Sugestão:** reescrever essas dicas para a 1ª frase fechar sozinha. Ou o corte da 1ª frase não parar em ":".

**M9 · Preferências · uma tela com 61 campos (~1.150 palavras)**
- **O que acontece:** custos, preço, falhas e impostos, 3 canais com 4 campos cada, aparência, backup, sincronização, celular, IA, mesa, AMS e fatiador, tudo numa página de ~4.100 px.
- **Sugestão:** "Essencial" aberto (kWh, hora de trabalho, multiplicadores, margem mínima) e o resto em seções recolhidas ou em telas próprias de Ajustes (Canais, Seus dados, Ferramentas), como já existem "Fazer backup" e "Restaurar backup".

**✅ M10 · Pedidos (Quadro) · a coluna "Entregue" cresce sem fim**
- Print: [Quadro](ux/16-pedidos-quadro.jpg)
- **O que acontece:** todos os pedidos entregues de sempre ficam na 4ª coluna. Só nela os nomes aparecem em azul (link), enquanto nas outras ficam em preto. O selo "atrasado · 20/09" quebra em 2 linhas no cartão. Um pedido já "Concluído" (pronto, esperando entrega) também aparece como atrasado.
- **Sugestão:** "Entregue" mostrar só os últimos 7 ou 30 dias, com "ver todos" indo para a Lista. Nome com a mesma cor em todas as colunas. Selo numa linha só ("atrasado 20/09"). Em Concluído, o selo ser "entregar até…" em vez de atrasado.

**✅ M11 · Financeiro vazio · gráfico sem dados**
- Print: [Financeiro vazio](ux/13-financeiro-vazio.jpg)
- **O que acontece:** sem pedidos, aparece um gráfico com eixos de 0 a 1 e nenhuma barra, e "Exportar planilha" fica como botão principal.
- **Sugestão:** um vazio explicado ("Os números aparecem quando o primeiro pedido for marcado como entregue") com o botão "Ir para Pedidos"; exportar só com dados.

**✅ M12 · Litofania · texto do vazio com contraste 2,84:1**
- Print: [Litofania](ux/12-litofania-contraste.jpg)
- **O que acontece:** "Envie uma foto para ver o relevo." aparece em cinza `#5c5c63` sobre preto. Já está nos "conhecidos".
- **Sugestão:** usar um cinza claro sobre o fundo escuro do quadro "Contra a luz".

**✅ M13 · QR Code (escuro) · medidas do 3D com contraste 2,87:1**
- **O que acontece:** o texto `.hud` sobre o 3D. Já está nos "conhecidos" e falha no teste visual do main.
- **Sugestão:** o fundo do HUD mais escuro (ou o vidro de sempre) no tema escuro.

**✅ M14 · Produtos e Preferências · alvos menores que 24 px**
- **O que acontece:** os checkboxes da tabela de Produtos têm 18 × 18 px e as chaves (switch) de Preferências têm 38 × 22. Também estão nos "conhecidos".
- **Sugestão:** área de clique de 24 px ou mais (padding ou `::before` invisível), sem mudar o desenho.

**✅ M15 · Organizador de gaveta · controle interativo dentro de outro (axe: nested-interactive)**
- **O que acontece:** a prévia `.viewer` tem papel interativo e contém elementos focáveis. Leitor de tela e teclado se perdem aí.
- **Sugestão:** tirar o papel de botão do contêiner da prévia e deixar a interação só nos elementos de dentro.

### Baixa

**✅ B1 · Imagem → SVG · "Extrudar em 3D" quebra em 2 linhas** no rodapé de ações. [print](ux/22-svg-vazio.jpg). Rótulo menor ("Fazer 3D") ou botões empilhados.

**✅ B2 · Modelos prontos · o nome da miniatura é diferente do título do modelo**: "Brinquedos" abre "Quebra-cabeça", "Medalha" abre "Medalha adaptável", "Gridfinity" abre "Gridfinity: caixinha". A Medalha ainda existe como modelo **e** como ferramenta (a variante "Redonda e formatos" leva para a outra tela). [print](ux/23-modelos-galeria.jpg). O mesmo nome nos dois lugares; deixar claro quando uma variante abre outra ferramenta.

**✅ B3 · Modelos prontos · ao escolher um modelo, os campos ficam abaixo da galeria** (metade de baixo da tela) e o título continua "Modelos prontos". Rolar até o modelo escolhido, ou recolher a galeria depois da escolha.

**✅ B4 · Subtítulos que descrevem o sistema, não a tarefa**: Pedidos ("O estoque baixa ao produzir e volta ao cancelar."), Calculadora ("O resto … vem das Preferências"), Produtos ("custo de hoje dos insumos"). Trocar pelo que ela faz ali ("Acompanhe cada pedido do pedido à entrega").

**✅ B5 · Início · "Comece por aqui" continua aparecendo com dados** até clicar no X. Esconder sozinho depois que os 3 passos forem feitos (ou marcar cada um como feito).

**✅ B6 · Painel · "Mais vendidos" corta o nome ("Topo …") com espaço sobrando**, e "Receita do mês R$ 0,00 ▼100% vs. período anterior" no início do mês assusta. [print](ux/21-painel-claro.jpg). Coluna do nome flexível; comparar com o mesmo dia do mês anterior ou esconder a variação nos primeiros dias.

**✅ B7 · Financeiro · "R$ por hora de impressão — / 0 h de máquina (faturamento, não lucro)"**: confuso quando não há tempo cadastrado. Esconder o cartão sem horas ou explicar "Cadastre o tempo de impressão dos produtos para ver este número".

**✅ B8 · Preferências · checkbox pequeno no meio de chaves** ("Incluir custos fixos no preço", "Multiplicar também a mão de obra (jeito antigo)") e um texto de histórico de versão na tela ("Desde a v0.6 a mão de obra…"). Usar a mesma chave das outras opções; tirar o histórico (ele já está em "O que há de novo").

**✅ B9 · Produtos · a legenda "manual" sob o preço** não diz o que significa. "preço digitado" / "preço calculado" com ⓘ.

## Acessibilidade

- **axe (WCAG 2.2 AA):** poucas violações automáticas, todas acima: contraste (A4, M12, M13) e nested-interactive (M15). Nenhuma falta de nome acessível, rótulo ou papel.
- **Lista de "conhecidos" do teste visual:** 17 itens. Contraste: Painel, Financeiro, Litofania. Alvos menores que 24 px: Produtos, Preferências. Legendas `.sr-only` da Medalha, que são falso positivo (escondidas de propósito).
- **Teclado:** a ordem do Tab dentro das telas segue a leitura (Calculadora: do modo Rápido/Completo até "Ver detalhes" em 18 Tabs, sem pular nada). Não há atalho "Pular para o conteúdo": cada tela começa pela barra lateral. Num app de desktop isso pesa pouco; ⌘K já serve de atalho.
- **Foco:** os cantos do Organizador pela foto, o mapa da gaveta e os seletores têm foco visível. O teste visual não aponta foco faltando.
- **Movimento:** "Reduzir movimento" é respeitado (abertura, barra lateral, dicas).

## O que está bom (para não mexer)

- **Pedido do zero até "Entregue" em 6 cliques** (mais o preenchimento), sem travar. O histórico registra cada passo e a baixa de estoque.
- **Chaveiro:** do nome ao 3MF em 1 clique, com "Arquivo salvo em …" e as dicas de impressão (camada, paredes, preenchimento).
- **Vazios com ação:** a maioria tem ícone, frase e botão (Pedidos, Orçamentos, Clientes, Produtos, Custos, Meus projetos).
- **Reaproveitamento:** o QR Pix já vem com a chave, o nome e a cidade dos Dados da empresa, e Orçamentos avisa quando faltam esses dados.
- **Organizador pela foto:** "Como fotografar", contorno numerado em cima da foto, mapa da gaveta com "Frente" e plurais certos, iguais no claro e no escuro.
- **Escuro:** consistente em todas as telas, fora os contrastes acima.

## App instalado

O app em /Applications é o build `c7d055f` (v0.10.3 + o C1), instalado em 05/10 para a conferência abaixo. As correções feitas depois (A1 a A4, M2 a M15, B1, B8 e as da Forja) estão no código, mas **não foram instaladas**.

**Conferido no app instalado, com mouse, em 05/10 (Mac livre e avisado):**
- arrastar uma imagem do Finder para Imagem → SVG carrega a imagem (A11 da auditoria de código): **funciona**;
- ⌘+, ⌘− e ⌘0 mudam e restauram o zoom (M19 da auditoria de código): **funcionam**;
- a abertura toca toda vez (~3,5 s) e termina em íris, a barra lateral divide o espaço e abre só pelo botão ou pelo atalho, e a página "Design (interno)" fica fora do build de produção.

**Não conferido** (o Gabriel não liberou mais o Mac para teste com mouse; nada foi criado nem alterado no banco do app instalado, que tem 0 pedidos e 0 produtos):
- arrastar um cartão de Pedidos para outra coluna e ver o status mudar;
- a janela não aparecer vazia antes da abertura;
- o formato da data em "Prazo de entrega" (no Chromium do teste aparece `mm/dd/yyyy`; no WKWebView deve seguir o idioma do Mac);
- os painéis nativos de abrir e salvar e a navegação só por teclado no app instalado.

## Fechamento da rodada de correções (07/10)

Três itens ficaram sem ✅ de propósito: A5, M6 e M9 (recurso novo ou redesenho; lista abaixo).

**Corrigidos com teste (27 de 30):** C1, A1, A2, A3, A4, M2, M3, M4, M5, M7, M8, M12, M13, M14, M15, B1, B8 (Quartzo); M1 (Forja na Calculadora e em Produtos, Lupa no resto), M10, M11, B2, B3, B4, B5, B6, B7, B9 (Forja). Cada correção está num commit pequeno, com teste de unidade, E2E ou visual, e a lista de "conhecidos" do teste visual perdeu os itens de contraste e de alvo pequeno. Proteções novas: `tests/e2e/acessibilidade-axe.e2e.ts` (axe em todas as telas), `src/styles/statusColors.test.ts`, `src/styles/targets.test.ts` e `tests/e2e/seletores-uma-linha.e2e.ts`.

**Parciais:**
- **M4 ✅:** os seletores não quebram mais o texto e as legendas das variantes de modelo ficaram numa linha só (#181).
- **M7:** editar e excluir viraram ícones em Filamentos, Materiais e Impressoras; o menu "⋯" para o resto não foi feito.

**Para virar issue (recurso novo ou redesenho; não entraram nesta rodada):**
1. **A5 · Pedido pago / a receber e aviso de pronto ao cliente:** campo de pagamento no pedido, selo no cartão, filtro "A receber" no Painel e mensagem pronta para o WhatsApp.
2. **M6 · Um padrão de cadastro no Estoque:** hoje Filamentos, Materiais e Impressoras abrem o formulário aberto quando a lista está vazia, enquanto Clientes, Produtos, Pedidos e Custos usam botão no título com folha. Unificar mexe no `CrudPage` e em vários fluxos e testes.
3. **M9 · Preferências em seções ou telas** ("Essencial" aberto e o resto recolhido; hoje são 61 campos numa página de ~4.100 px).
4. **M7 (resto) · Menu "⋯" nas linhas das tabelas** para as ações secundárias.
5. ✅ **M4 (resto) · Legendas das variantes de modelo** mais curtas (feito na #181).

## Descartados (conferidos e não são problema)

- Histórico do pedido com hora em UTC: só acontece na simulação dos testes (`datetime('now')`); o Rust de verdade grava `datetime('now','localtime')`.
- "Design (interno)" na barra: só aparece em desenvolvimento.
- QR Pix pedindo a chave de novo: ele já preenche com os Dados da empresa.

## Prints

Todos estão em `docs/auditoria-2026-10/ux/`, com dados de exemplo (cliente "Ana Souza", "Doces da Bia", empresa "Ateliê da Ana"), 1280 × 800, exceto onde o nome do arquivo diz "estreita".
