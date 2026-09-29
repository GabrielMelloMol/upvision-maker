# Novidades

Cada versão aparece para a usuária na tela "O que há de novo" depois da atualização.
Formato: `## <versão> — <data>` e itens `- …` em linguagem simples.

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
