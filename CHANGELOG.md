# Novidades

Cada versão aparece para a usuária na tela "O que há de novo" depois da atualização.
Formato: `## <versão> — <data>` e itens `- …` em linguagem simples.

## Próxima versão (vira "## 0.6.1 — data" ou "## 0.7.0 — data" ao publicar; até lá o app não mostra)
- **Gramas do Cura pela densidade certa**: o Cura só informa metros; agora as gramas usam a densidade do material do filamento escolhido (PETG, ABS, TPU…) e o diâmetro do fio, e a linha mostra qual densidade foi usada.
- **Avisos de valor estranho** na calculadora: preço do kg, gramas, horas, potência, taxa de falha ou comissão fora do normal (quase sempre erro de digitação, como 1000 g no lugar de 100 g). O cálculo continua, e "Está certo" some com o aviso.
- **Número do orçamento por ano**: ORC-2026-001, ORC-2026-002… com o prefixo que você escolher em Dados da empresa. Aparece na lista, no PDF e no nome do arquivo; os orçamentos antigos foram numerados pela data.

## 0.6.0 — 2026-09-29
- **Medalhas bem mais personalizáveis**: formatos novos, textos em arco, número de colocação, bordas e fundos com textura, imagem que você posiciona, verso com pinos de encaixe, modelos prontos (corrida, formatura, campeonato…) e medalhas em lote a partir de uma lista.
- **8 modelos prontos novos**: placa QR (Wi-Fi, WhatsApp, Instagram, avaliação no Google, link), placa com vários QRs, desenho em pé, tag de pet, placa de profissão, cartão de visita com QR e NFC, chaveiro espelho e floco de neve com nome.
- **Clipe de saco corrigido**: agora é uma pinça em U que prende de verdade (hastes flexíveis e dente de trava) e já abre com um coração de exemplo, sem precisar enviar desenho.
- **56 fontes** para chaveiros, modelos prontos e Pedir à IA (cursivas, grossas, divertidas, infantis, elegantes, retrô e serifadas), todas funcionando sem internet. O **seletor de fonte** mostra o nome que você digitou em cada uma, com busca, categorias e **favoritas** (estrela).
- **Importar fonte** do computador (.ttf ou .otf): fica salva no app e aparece em "Minhas".
- **Aviso de impressão**: o app avisa quando a fonte fica com traço mais fino que 0,4 mm no tamanho escolhido, ou quando uma cursiva não une as letras.
- **Calculadora rápida**: abre com só filamento, gramas, tempo, impressora e peças. "Ver detalhes" leva os mesmos valores para a calculadora completa, e o app lembra o último cálculo.
- **Preço para lojista (revenda)** e **venda direta (consumidor final)**: nomes mais claros, com explicação e exemplo em R$ ao lado ("Qual preço usar?"). O multiplicador também mostra o markup e a margem de verdade.
- **Mudança no preço sugerido**: a mão de obra agora é somada **depois** do multiplicador. Antes, com ×5, uma hora de trabalho de R$ 30 virava R$ 150 no preço. Quem preferir o jeito antigo liga em Preferências.
- **Taxa de falha** (padrão 5%): o que se perde nas impressões que dão errado entra no preço das que dão certo.
- **Custo da impressora**: cadastre quanto pagou e a vida útil, e a calculadora cobra a máquina por hora (uma A1 de R$ 3.000 dá R$ 0,60/h). Ela substitui a "manutenção %", que continua valendo só para impressora sem preço.
- **Impostos sobre a venda** e **custos fixos por hora** (aluguel, internet, assinaturas dos Custos operacionais) no preço, se quiser.
- **Medir com tomada inteligente**: anote o Total (kWh) do app da tomada no começo e no fim de uma impressão e o app calcula a potência média. Também dá para digitar os kWh de uma impressão.
- **Calculadora → orçamento**: "Adicionar ao orçamento" junta vários cálculos (peças únicas que não viram produto) num orçamento em rascunho, com o preço do canal escolhido. O custo e o tempo de máquina vão junto, então o financeiro do pedido bate com a calculadora.
- **Lucro por hora de máquina**: a tabela de canais mostra quanto a impressora ganha por hora em cada canal. Com uma **meta de R$/h** nas Preferências, aparece um selo (na meta, abaixo, menos da metade) e o preço que chega na meta.
- **"Vou vender por"** no modo Rápido: digite um preço e veja o lucro, a margem, o lucro por hora e se dá prejuízo, no canal que escolher. No modo Completo o campo virou "Testar um preço (seu ou do concorrente)".
- **Taxas por faixa de preço** nos canais (Preferências → Faixas de preço): taxa fixa que só vale abaixo de um valor, teto da comissão e frete por sua conta a partir de um preço. A calculadora acha o menor preço certo para cada faixa e avisa quando o frete entra.
- **Preço por quantidade**: para pedidos de 10, 25, 50 ou 100 unidades (lembrancinhas), a calculadora divide o preparo do pedido (atender, fatiar, trocar filamento) pela quantidade, mostra o desconto que dá para dar e avisa quando a margem fica baixa. "Usar no orçamento" já leva a linha com a quantidade.
- **Anúncios pagos** (modo Completo): por canal, até que ROAS o anúncio se paga, quanto do preço ele pode levar e o preço que mantém a sua margem pagando o anúncio. Dá para informar o ROAS esperado ou o custo por clique × cliques até uma venda.
- **Custo extra por venda** em cada canal (embalagem reforçada, etiqueta, brinde de marketplace): entra só no preço daquele canal.
- **Canais prontos** para adicionar com um clique (Mercado Livre premium, Amazon, Elo7, Shein, Instagram/WhatsApp com maquininha) e a **data em que você conferiu as taxas** de cada canal; depois de 90 dias a calculadora lembra de conferir.
- **Taxa de falha por material e por produto**: TPU, ABS e peças difíceis podem ter a própria taxa (Preferências e cadastro do produto). A calculadora usa a maior entre os filamentos da mesa e mostra de onde veio: "Falhas 12 % (TPU)".
- **Catálogo de impressoras bem maior**: 167 modelos de 27 marcas (UltiMaker, Snapmaker, Artillery, Raise3D, GTMax3D, Sethi3D e outras), com volume de impressão e se é aberta ou fechada. Dá para escolher do catálogo também na Calculadora e no Produto: a impressora é cadastrada na hora. A busca acha "a1", "k1c" ou "ender3".
- **Embalagem padrão** já aparece na calculadora, e o resultado mostra o custo por grama e por hora de impressão.

## 0.5.0 — 2026-09-28
- **13 modelos novos** em Modelos prontos: medalha e troféus no formato do seu desenho, troféu elegante com 2 linhas na base, chaveiro de anilha de academia, nome articulado (as letras balançam, já sai montado), chaveiro abridor de garrafa ou de lata, clicker com tecla de teclado, MOLLE tag, plaquinha de colorir, totem e porta-joia com tag NFC, porta-chave de parede e luminária.
- Nas peças que encaixam (dobradiça, tampa, tecla, fenda), a **folga** é um campo: se ficar justo ou solto, ajuste e imprima de novo.
- **Modelos prontos por categoria** (Chaveiros, Placas, Festa e esporte, Casa, Cozinha) e com **busca**. Quando falta algo, como a chave Pix ou o desenho, o app avisa sem mostrar erro.
- **Etiqueta QR por rolo**: imprima etiquetas (folha A4 ou etiquetadora) ou uma plaquinha 3D com QR para cada filamento. Aponte a câmera (ou um leitor USB) para a etiqueta e dê **baixa das gramas usadas** ou marque **rolo acabou**.
- **Litofania**: foto vira relevo que aparece contra a luz, plana, curva ou em caixa de luz. A prévia "Contra a luz" mostra como vai ficar antes de imprimir.
- **Quadro por camadas** (estilo HueForge): foto colorida com 2 a 4 filamentos em camadas, com a lista de trocas de filamento. Sem AMS, a impressora pausa em cada troca; com AMS, sai uma parte por cor e o fatiador troca sozinho.
- Correção: ao ligar "Uma parte por cor (AMS)", o botão de salvar podia gravar o arquivo antigo, com pausas. Agora ele espera o arquivo novo ficar pronto.

## 0.4.0 — 2026-09-28
- **Backup automático**: o app guarda uma cópia por dia sozinho (ao abrir e ao fechar), mantém os últimos dias e deixa escolher a pasta, até no OneDrive ou Google Drive. Se passar uma semana sem backup, ele lembra.
- **Sobre o app**: a versão aparece no rodapé do menu. A tela Sobre mostra quantas versões você está atrás, o que está perdendo e tem o botão **Atualizar agora**.
- **Algo deu errado?**: o app guarda um registro de erros (sem dados pessoais) que dá para enviar ou salvar para o suporte.
- **Catálogo de impressoras**: escolha a marca e o modelo (Bambu Lab, Prusa, Creality, Elegoo, Anycubic, Sovol, Flashforge, Qidi, Voron) e a potência média já vem preenchida, com a fonte do dado. Também no primeiro uso.
- **Catálogo de filamentos**: marcas comuns no Brasil com material e peso do rolo. Botão **Duplicar** para cadastrar outra cor da mesma marca.
- **Cadastrar este filamento**: ao importar o arquivo do fatiador, um filamento que você ainda não tem já vem com material e cor preenchidos; só falta o preço.
- **Preço do kWh pela conta de luz**: digite o total e o consumo da conta e o app calcula, com a bandeira tarifária e o histórico dos meses.
- **Preço por canal lado a lado**: lucro de verdade em cada canal depois das taxas, o canal que mais rende, preços arredondados (,90 / ,99 / inteiro), preço do concorrente e alerta de prejuízo ou de margem abaixo do mínimo.
- **Imagem → SVG colorido** (2 a 4 cores), usando as cores dos seus filamentos. Chaveiros, medalhas e extrusão saem com uma parte por cor.
- **8 modelos novos**: chaveiro de logo, placa adaptável, topo de lápis, placa de sinalização, decoração de palavras, ejetor de brigadeiro, clipe de saco e cortador com carimbo.
- **Chaveiro NFC no Bambu Studio**: o botão "Projeto do Bambu Studio" já gera o arquivo com a pausa para colocar a tag.

## 0.3.0 — 2026-09-28
- **Importar do fatiador**: abra o .3mf ou .gcode do Bambu Studio, OrcaSlicer, PrusaSlicer ou Cura e a Calculadora já puxa tempo, gramas e cores.
- **Produtos**: salve da Calculadora, com fotos, kits e estoque de peças prontas. O preço se atualiza quando o filamento muda.
- **Clientes** e **Dados da empresa** (logo, contatos e chave Pix), com busca de endereço pelo CEP.
- **Pedidos** em quadro ou lista, com histórico. Ao produzir, o estoque de filamento e materiais baixa sozinho; se cancelar, volta.
- **Orçamentos em PDF** com logo, frete, desconto, validade e QR Pix do valor exato. Aprovado, vira pedido com um clique. Também gera contrato de consignação e catálogo de produtos em PDF.
- **Financeiro**: receita, custos, lucro e R$ por hora de impressão, com gráficos, filtros e exportação para planilha. **Custos operacionais** para aluguel, parcelas e assinaturas.
- **Painel** com prazos, pedidos atrasados, estoque acabando e o resultado do mês.
- **Modelos prontos**: placa Pix, topo de bolo, carimbo de brigadeiro/biscoito, marca-página, porta-caneta, chaveiro giratório, chaveiro NFC (com pausa para colocar a tag) e troféu. Todos com prévia 3D e 3MF em cores.
- **QR Code e Pix**: QR de Pix com valor, link, Wi-Fi ou texto, em SVG ou peça 3D de 2 cores.
- Formulários mais fáceis: valores em R$, tempo como "1h30", e avisos claros quando falta algo.

## 0.2.0 — 2026-09-28
- Novo visual, com as ferramentas na tela inicial.
- **Imagem → SVG**: transforma logo ou desenho em SVG de 1 cor, já em milímetros. Você ajusta e clica em Aplicar.
- **Modo Silhueta**: recorta o contorno de uma pessoa ou pet de uma foto, pronto para cortador. Funciona sem internet.
- **Cortador de biscoito**: lâmina de 0,8 mm, borda de apoio e carimbo opcional com o desenho de dentro.
- **Chaveiros**: nome com fontes bonitas, logo, argola e 2 cores. Faz vários nomes de uma vez.
- **Medalhas**: redonda, hexágono, estrela ou escudo, com texto, imagem e alça para fita.
- **Extrusão 3D**: qualquer SVG vira peça, com base opcional em outra cor.
- **Pedir à IA** (opcional, pago por uso): descreva a peça e o Claude modela.
- Arquivos 3MF já separam as cores para o Bambu Studio e o OrcaSlicer.
- Botão **Sugerir ferramenta** no menu.

## 0.1.0 — 2026-09-26
- Calculadora de preço, filamentos, materiais, impressoras e preferências.
- Backup e restauração em 1 clique.
