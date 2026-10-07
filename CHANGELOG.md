# Novidades

Cada versão aparece para a usuária na tela "O que há de novo" depois da atualização.
Formato: `## <versão> — <data>` e itens `- …` em linguagem simples.

## Próxima versão (ainda não lançada)
- **Estoque pronto de produto com cores não volta ao valor antigo**: se você vendeu 3 de um produto com 10 em estoque (Azul 5 + Verde 5) e depois abre o produto só para mudar a descrição, o estoque continua 7, em vez de voltar para 10. A planilha do marketplace também não anuncia mais o que já foi vendido, e o produto avisa quando as cores somam mais que o estoque.
- **Pedido antigo mantém o custo da época**: abrir um pedido de março e corrigir só uma observação não muda mais o custo nem o lucro daquele mês no Financeiro (antes o custo era refeito com o preço do filamento de hoje).
- **Nada de custo R$ 0,00 sem aviso**: o pedido não é salvo com custo zero quando o custo de um produto não dá para calcular (por exemplo, kit dentro de si mesmo), e o catálogo em PDF avisa quais produtos estão sem preço em vez de imprimir R$ 0,00 para o cliente.
- **Backup antigo com projetos salvos volta a restaurar**: backups feitos antes da biblioteca "Meus projetos" falhavam no fim da restauração; agora os projetos voltam sem favorito e sem etiquetas.
- **Preferências e dados da empresa com um campo antigo inválido**: só esse campo volta ao padrão; os canais, o histórico de kWh, o logo e o Pix são mantidos e o próximo "Salvar" não apaga mais tudo.
- **Dois computadores: arquivo de conflito da nuvem não se perde**: quando o OneDrive ou o Google Drive cria uma segunda versão dos dados (porque um computador ficou sem internet), o app guarda essa versão em Restaurar backup e avisa, em vez de importar por cima. Os arquivos de backup e de sincronização agora são gravados com mais cuidado (sem se misturarem na pasta da nuvem e sem ficarem vazios numa queda de energia), e o app sempre guarda pelo menos 2 backups.
- **Dois computadores mais seguros**: um computador recém-instalado (vazio) não envia mais uma base vazia por cima dos dados e traz os da pasta; uma pasta que ficou vazia não apaga os dados daqui; a trava de uso não se confunde mais com relógios diferentes entre os computadores e, se os dois abrirem ao mesmo tempo, um cede; e depois de um conflito o app diz onde ficou o que foi guardado.
- **Erro de sincronização aparece na tela**: se a pasta da nuvem estiver sem permissão, fora do ar ou com o arquivo de dados corrompido, o app mostra uma faixa com o motivo (na hora para arquivo corrompido, depois de 2 tentativas nos outros casos), em vez de parecer que está tudo sincronizado.
- **Fechar o app com segurança**: ao sair pelo Cmd+Q (Mac) ou ao instalar uma atualização, o app agora também envia os dados para o outro computador e faz o backup (antes só acontecia ao fechar a janela). A sincronização vai primeiro e ganha mais tempo, para o outro computador não ficar vendo "em uso". Se o backup automático falhar, uma faixa mostra o motivo logo na próxima abertura, sem esperar 7 dias.
- **Restaurar backup leve (sem fotos)**: fotos de produtos, projetos ou impressões que o backup não tem deixam de ficar para trás e grudar no próximo cadastro.

## 0.10.4 — 2026-10-05
- **Dois computadores em versões diferentes não apagam mais dados**: se um estiver com o app desatualizado, nada é trocado entre eles e aparece um aviso dizendo qual computador precisa atualizar. Antes, o computador antigo podia apagar a ficha de impressão, os projetos e as fotos do mais novo.
- **Restaurar um backup antigo** não apaga mais o que foi criado depois dele (ficha de impressão, projetos, fotos).
- **Fechar o app durante uma atualização** não o impede mais de abrir: cada etapa da atualização dos dados é feita por inteiro ou não é feita.
- **Arrastar e soltar volta a funcionar no app instalado**: arrastar uma imagem para as ferramentas, fotos para a galeria e cartões entre as colunas de Pedidos. O zoom com Ctrl/⌘ + e − também volta, e a janela não aparece mais vazia antes da abertura.
- **Fotos junto da planilha de marketplace**: ao exportar, você escolhe a pasta e a planilha e as fotos dos produtos vão juntas para ela; antes as fotos davam erro de permissão.
- **Organizador pela foto: gaveta modular**: na saída Gaveta, escolha Caixinhas e cada ferramenta ganha a sua caixinha Gridfinity (o menor número de casas que cabe ela), todas da mesma altura para trocar de lugar e com a borda de empilhar; a base sai pela medida da gaveta, em pedaços que cabem na mesa. Um mapa mostra onde fica cada caixinha (dá para arrastar) e o espaço livre, e cada mesa sai num 3MF com os nomes, com peso e tempo de cada peça. Várias fotos somam ferramentas numa lista só, com o mesmo número na foto, na lista e no mapa; dá para renomear e remover.
- **Bandejas do tamanho das ferramentas**: na saída Gaveta (Bandejas), a bandeja tem só o tamanho que as ferramentas ocupam, e não mais a mesa inteira. Um par de óculos não vira mais uma bandeja de 248 × 248 mm; a tela compara as gramas e o tempo com a bandeja cheia.
- **Números como se escreve no Brasil, em todos os campos**: "1.200" é mil e duzentos (antes a Calculadora e o Produto liam 1,2 g e o preço saía até 150 vezes menor), "1.200,5" funciona, e "0,856" ou "0.856" no preço do kWh continua 0,856 (antes virava 856). Quando um número dá para ler de dois jeitos, o campo mostra como entendeu; quantidade que não dá para ler aparece em vermelho em vez de virar zero.
- **Produto com dados antigos que não se consegue ler**: em vez de aparecer com custo zero e não baixar o estoque, ele avisa, não entra no preço nem nos pedidos, e não deixa salvar por cima do que está gravado.
- **Calculadora → produto sem perder a conta**: se você digitou o preço do filamento (ou a potência da impressora) sem cadastrar, "Salvar como produto" pergunta se pode cadastrá-los e o produto guarda o custo calculado; o valor de "Vou vender por" vira o preço do produto. Antes ele saía com R$ 0,00.
- **Restaurar backup é tudo ou nada**: se a restauração (ou a sincronização entre computadores) falhar no meio ou o app fechar, os dados continuam exatamente como estavam, em vez de ficarem pela metade. A sincronização também espera uma restauração terminar antes de enviar qualquer coisa para a pasta.

## 0.10.3 — 2026-10-03
- **Foto do iPhone direto no Organizador**: aceita HEIC (o formato padrão do iPhone, como chega pelo AirDrop), no Mac e no Windows, usando os dados da câmera para corrigir a altura.
- **Folha achada até em mesa clara**: o app procura as bordas e o formato da A4/Carta. Para qualquer mesa, imprima a **folha de medição** (botão na tela), com marcadores nos cantos e régua de 100 mm. Quando o app fica em dúvida, os cantos piscam em laranja e uma lupa ajuda a arrastar.
- **Organizador mais esperto**: avisa quando a altura está em 0, sugere a profundidade certa pela altura (botão Usar), e reflexo de luz na peça não vira mais furo nem pino.
- **Calculadora com suportes e torre de limpeza**: ao importar o arquivo fatiado do Bambu Studio ou do OrcaSlicer, mostra quanto foi para os suportes (com a dica de suporte em árvore) e explica a purga de cada troca de cor do AMS, com a porcentagem do filamento.
- **Sugerir ferramenta envia direto**: a sugestão vai pelo próprio app, com print opcional, sem precisar copiar e mandar por mensagem.
- **3MF já abre dentro da mesa**: o arquivo salvo sai com a peça no centro da mesa da impressora escolhida, no Bambu Studio e no OrcaSlicer, sem precisar arrumar. No Organizador pela foto, a gaveta e a peça de teste apareciam no canto da prévia, metade fora da mesa.
- **Organizador pela foto** (em Ferramentas): cada ferramenta ganha um encaixe exato com a folga que você escolher (nenhuma, pequena, média, grande ou em mm), num bloco, numa caixa Gridfinity ou em bandejas arrumadas sozinhas para a sua gaveta, com recorte para o dedo. A peça de teste (só o contorno, 2 mm) confere o encaixe em minutos. Fotografe as ferramentas numa folha A4 ou Carta: a folha vira a régua e cada contorno sai em mm.
- **Projeto do Bambu Studio com 2 ou mais cores**: o projeto saía com a tabela de purga de 4 filamentos e o fatiador do Bambu Studio podia recusar ("Failed slicing the model"). Agora a tabela acompanha o número de cores e cada parte sai no filamento dela.

## 0.10.2 — 2026-10-02
- **Barra lateral divide o espaço com a tela**: abre e fecha só pelo botão no topo ou por ⌘⌥S (Ctrl+Alt+S) — passar o mouse não abre mais nada. Aberta, a tela encolhe e fica ao lado, nunca por baixo do menu; recolhida, mostra só os ícones, com o nome de cada um ao parar o mouse em cima. A barra e a tela andam juntas, sem saltos, e o app lembra como você deixou. Em janela estreita ela começa recolhida, mas o botão abre do mesmo jeito.
- **A abertura aparece toda vez**: a escolha antiga "Curta/Desligada" ficava salva e escondia a animação; agora ela sempre toca (uns 3,5 s) e termina abrindo o app em íris. Com "Reduzir movimento" do sistema, o símbolo fica parado o mesmo tempo e o app entra suave. Um clique ou tecla continua pulando.

## 0.10.1 — 2026-10-01
- **Barra lateral recolhida no padrão do Finder**: deixa livres os botões de fechar/minimizar/maximizar do Mac, o botão de expandir fica sempre à vista e, ao passar o mouse, um painel abre por cima da tela com tudo legível. Recolhida, mostra só os ícones.
- **Ajustes reorganizados como os do macOS**: cada opção numa linha, com o nome à esquerda e o campo alinhado à direita, em grupos (Custos da produção, Preço de venda, Falhas e impostos, Aparência, Inteligência artificial, Meu AMS, Fatiador, Backup, Sincronização e Celular). O mesmo em Dados da empresa e no estoque.

## 0.10.0 — 2026-10-01
- **Abertura nova**: o símbolo se imprime camada por camada em cerca de 3,6 s e o app se abre em **íris** a partir da peça, como a lente de uma câmera. Aparece toda vez que você abre; um clique pula. Em Ajustes → Aparência dá para escolher Completa, Curta ou Desligada.
- **Tour guiado**: na primeira visita ao Início, Criar, Chaveiros, Calculadora, Pedidos e Filamentos, a tela escurece e destaca onde clicar, passo a passo. Dá para rever pelo **?** ou reiniciar as dicas em Ajustes.
- **Claro ou escuro** pelo sol/lua ao lado da versão, no rodapé da barra lateral — e a troca agora acontece por inteiro, sem partes atrasadas. A barra lateral recolhe e expande sem tropeços.
- **Aviso de atualização com o app aberto**: o app procura versão nova a cada hora e quando você volta para a janela, e mostra uma faixa com **Atualizar agora**. Antes de reiniciar, guarda o que você estava fazendo.
- **Abrir no fatiador com 1 clique**: ao lado de Salvar 3MF, abre direto no Bambu Studio, OrcaSlicer ou PrusaSlicer instalado.
- **Meus projetos**: tudo o que você fez em qualquer ferramenta num lugar só, com miniatura, busca, favoritos e "fazer de novo".
- **Fotos reais das peças** no produto, no projeto e na ficha de impressão; aparecem no orçamento em PDF e vão junto da planilha da Shopee e do Mercado Livre.
- **Do pedido ao arquivo pronto**: cada item do pedido ou orçamento guarda a personalização (nomes, textos, cores) e **Preparar impressão** abre o modelo já com o lote montado.
- **Ficha de impressão** em cada produto: impressora, filamentos, camada, preenchimento, tempo e gramas reais, anotações e o histórico do que deu certo — a taxa de falha do produto passa a vir daí.
- **Quebra-cabeça de verdade**: encaixe clássico, bolinha, quadrado, ondulado ou triangular, peças todas diferentes, contorno livre, verso numerado e peça de teste para acertar a folga.
- **Pedir à IA**: com chave sem workspace, o "Testar chave" explica o que fazer, há um campo opcional de workspace e os erros aparecem em português claro, com o pedido guardado para reenviar.
- Correções: dicas longas dos campos mostram só a 1ª frase (o resto no ⓘ); lucro negativo mostra a diferença em R$; o formulário de adicionar no estoque abre pelo botão do título.

## 0.9.2 — 2026-10-01
- **Abertura nova**: o bico imprime o símbolo camada por camada, passa um reflexo de vidro e ele voa para o canto da barra lateral enquanto o app aparece. Completa na primeira vez do dia; nas outras, bem rápida. Um clique pula.
- **Marca nova** no topo da barra lateral: o mini-ícone do app e "UpVision Maker" em letra do sistema.
- **Claro ou escuro num toque**: botão de sol/lua no rodapé da barra lateral (Automático, Claro, Escuro), também em Ajustes → Aparência e no atalho ⌘⇧L (Ctrl+Shift+L).
- **Miniaturas novas** em todos os Modelos prontos: fundo transparente que combina com o tema, o mesmo ângulo e a peça inteira à vista. Nenhum card fica mais sem imagem.
- **Selo "Com AMS / Sem AMS"** nos cards e o filtro **Funciona sem AMS** na galeria Criar.
- **Tamanho da mesa pela sua impressora** (#119): as ferramentas avisam quando a peça passa da mesa, dividem as peças grandes e arrumam o lote usando o tamanho da impressora cadastrada (A1 mini: 180 mm; Ender 3: 220 mm), e não mais os 256 mm fixos da A1. Com mais de uma impressora, escolha qual vale em Preferências → Impressora das ferramentas. A grade da prévia 3D também mostra a mesa certa.
- **Precisa de AMS?** (#118): ao salvar o 3MF, cada ferramenta e modelo mostra se sai em 1 cor, se dá para imprimir sem AMS trocando o filamento nas pausas ou se precisa de AMS. Novo jeito de imprimir **Uma mesa por cor**: cada cor sai num 3MF próprio, com as peças deitadas na mesa, para imprimir uma cor por vez e montar ou colar (pixel art, shadowbox, marchetaria).

## 0.9.1 — 2026-09-30
- Correção: a versão para Windows não tinha sido gerada na 0.9.0. Esta versão traz todas as novidades da 0.9.0 (abaixo) também para o Windows.

## 0.9.0 — 2026-09-30
- **Organizador de gaveta** (novo, em Criar): digite a largura, a profundidade e a altura da gaveta (uma gaveta 3D mostra onde medir) e o app monta a base na medida, dividida para caber na mesa. Arraste as caixinhas no editor, veja tudo montado em 3D e salve um 3MF por mesa com gramas, tempo e custo. Sem régua? Imprima a régua em papel (com teste de escala) ou a régua rápida em 3D.
- **Organizador de talheres em 2 andares**: talheres na bandeja de cima, que corre nos trilhos (ou sai por cima), e o que se usa menos embaixo.
- **Caixinhas empilháveis** (compatíveis com Gridfinity): divisórias, rampa para os dedos, etiqueta em 2 cores e ímãs.
- **Modelos prontos em famílias**: 24 cards no lugar de 60 itens soltos. Escolha a família (Placa, Chaveiro, Troféu…) e a variação pela miniatura. Seus rascunhos e variações salvos continuam abrindo.
- **Vaso paramétrico** (perfil que você arrasta, torção, estrela ou polígono, modo espiral), **caixa com tampa** (encaixe ou deslizante, com divisórias) e **pixel art** (a imagem vira pixels nas cores dos seus filamentos, com editor, mosaico e quebra-cabeça).
- **Quadro por camadas** com paletas prontas, destaque da pessoa ou do objeto e formatos (redondo, coração…).
- **OpenSCAD personalizável**: abra um arquivo .scad no formato do Customizer e ele vira um formulário. No **Pedir à IA**, "Virar modelo" transforma a peça que deu certo num modelo com campos, e os próximos ajustes não gastam IA.
- **Meu AMS**: cadastre o que está em cada slot e o 3MF já sai com cada cor no slot certo (ou no mais parecido), com aviso quando o modelo tem mais cores que o AMS.
- **Gramas, tempo e R$ ao vivo** em cada ferramenta 3D, com "Levar para a Calculadora".
- **Prévia 3D pelo teclado** (#144): com a prévia em foco (Tab), as setas giram e inclinam a peça, + e − aproximam e 0 volta ao começo. O leitor de tela (Narrador, VoiceOver) diz as medidas e as partes da peça.
- **Texto maior** (#144): em Ajustes → Preferências → **Aparência**, escolha Normal, Grande ou Maior. O app inteiro aumenta sem quebrar as telas, e fica lembrado neste computador. **Ctrl +** e **Ctrl −** (⌘ no Mac) também dão zoom.
- **Vidro (estilo macOS 26)** na barra de cima, nas janelas por cima (como Sobre e a busca) e no seletor de modo: translúcido, com borda de luz e um brilho que acompanha o mouse. No Windows ele também refrata de leve o que está atrás. Fica simples em computador mais fraco e opaco com **Reduzir transparência** ligado no sistema.
- **Visual novo, mais simples** (#139): a barra lateral agora tem só cinco seções (**Início, Criar, Vender, Estoque e Resultados**) e **Ajustes** embaixo. Ao abrir uma seção, as telas dela aparecem logo abaixo. Backup, restauração, novidades e sugestões ficaram em Ajustes.
- **Criar**: todas as ferramentas e os Modelos prontos numa galeria só, com busca (sem ligar para acento) e filtro por tipo. Clicar num modelo abre a ferramenta já nele.
- **Início novo**: atalhos para o que mais se faz, **Continuar** (o que ficou pela metade nas ferramentas) e os **pedidos da semana**.
- **Barra lateral recolhível**: o botão no topo ou **⌘⌥S** (Ctrl+Alt+S no Windows) deixa só os ícones. Passar o mouse mostra tudo por cima, sem empurrar a tela. Em janela estreita ela se recolhe sozinha.
- **Menos enfeite**: um botão principal por ferramenta (**Salvar 3MF**), ajuste fino em **Opções avançadas** e cores mais calmas. Com **Reduzir movimento** ligado no sistema, o app não anima.
- **Logo da UpVision** redesenhada fiel ao site, na barra lateral e em Sobre. Ao abrir, o símbolo **se imprime camada por camada** (a animação completa só na primeira abertura do dia) e sai assim que o app está pronto. No macOS 26, o ícone acompanha o modo claro, o escuro e o tingido.
- **Ajuda com várias imagens** (#84, #140): o botão **?** agora mostra um carrossel com legenda (setas, pontinhos ou ← →). No Organizador de gaveta, ele ensina a medir a largura, a profundidade e a altura livre com a própria gaveta 3D do app, e mostra a grade e a gaveta montada.
- **Ícone novo** (#138): o app agora usa o símbolo da UpVision (a impressora-câmera imprimindo camadas do laranja ao azul) no Dock, no ⌘Tab, na barra de tarefas do Windows e no instalador, redesenhado em vetor. Dentro do app ele aparece na barra lateral, em Sobre e nas boas-vindas, e fica claro no tema escuro.
- Correção: a **Cumbuca no contorno** com fundo arredondado saía com um pedaço da parede solto no ar (e no tamanho máximo o fatiador recusava). Agora a peça sai inteira, apoiada na mesa (#134).
- **Variações por cor** (#82): no produto, em **Variações**, cadastre as cores (Azul, Rosa, Dourado…) com SKU, estoque pronto e, se quiser, preço próprio. Escolha o filamento de cada cor e o custo acompanha o preço daquele rolo. Ao exportar para a Shopee ou o Mercado Livre, cada cor vira uma linha da mesma vitrine. O app avisa quando os preços passam de 4× de diferença, o que a Shopee recusa.
- **Desperdício de impressão multicor** (#147): ao importar o 3MF ou o G-code do Bambu Studio, a calculadora conta as trocas de cor e soma a purga de cada uma (pela tabela de purga do próprio arquivo) nas gramas do filamento, com a linha "Desperdício multicor: X g (R$ Y), Z% do filamento" e dicas para gastar menos. O PrusaSlicer e o Orca já somam a torre de limpeza: aparece só como informação. Sem o arquivo, dá para informar as trocas de cor e as gramas por troca (0,8 g na A1).
- **Pós-processamento** na calculadora (#147): botões para somar o tempo de remover suporte, lixar, primer ou tinta, colar ou montar e colocar ímã ou NFC na mão de obra.

## 0.8.0 — 2026-09-30
- **3MF já com a configuração de impressão**: cada modelo e ferramenta sai com a altura de camada, paredes, preenchimento e posição recomendados para o Bambu Studio e o OrcaSlicer (começando pela A1). A mesma recomendação aparece na tela para quem usa outro fatiador.
- **Não perder trabalho** em todas as ferramentas (Chaveiros, Medalhas, Modelos prontos, QR, Cortador, Extrusão, Imagem → SVG, Litofania e Separar 3MF): o que você está fazendo fica guardado sozinho, com a foto ou o arquivo enviado junto, e, ao voltar, aparece "Continuar de onde parou" ou "Começar do zero". **Desfazer e refazer** (botões ou ⌘Z / ⇧⌘Z) e **Últimos projetos**: os 10 últimos arquivos salvos, com miniatura, para reabrir com um toque. Tudo entra no backup.
- **Ajuda dentro do app**: o botão **?** no topo (ou a tecla ?) mostra, em cada tela, como usar em poucos passos, com dicas de impressão. Várias ferramentas têm **Usar exemplo**, que carrega um desenho, uma foto ou um cálculo de demonstração.
- **Comece por aqui** na tela inicial: criar um chaveiro, calcular um preço e fazer um orçamento.
- **Termos técnicos explicados**: passe o mouse no ⓘ ao lado de campos como relevo, folga, potência e margem. A busca (Ctrl/⌘K) também encontra a ajuda e os termos.
- **Correção**: a prévia do QR Code podia aparecer espremida num quadradinho depois de abrir Dados da empresa. Agora ela sempre ocupa a coluna.
- **Sugestões chegam sem GitHub e sem e-mail**: o "Sugerir ferramenta" envia direto pelo app (com a imagem e, se quiser, o diagnóstico) e mostra "Recebido ✓". Também dá para mandar pelo WhatsApp com o texto pronto ou copiar o texto. O app guarda a lista do que você já enviou.
- **Dois computadores** (#16): em Preferências, logo abaixo do backup automático, dá para manter dois computadores iguais pela mesma pasta do OneDrive, Google Drive ou Dropbox. Ao abrir, o app traz o que o outro salvou; enquanto usa e ao fechar, envia o daqui. Se o app estiver aberto no outro computador, aparece o aviso "Em uso no computador…" com Assumir ou Continuar sem sincronizar. Se os dois mudaram, ficam os dados deste computador e os do outro são guardados como cópia em Backups guardados.
- **Celular na rede de casa** (#16): em Preferências, ligue e leia o QR com a câmera do celular no mesmo Wi-Fi. No celular dá para ver os pedidos com prazo e marcar como prontos, ver o estoque de filamento e dar baixa lendo a etiqueta do rolo pela câmera. Fica desligado até você ligar, só funciona na rede de casa, cada celular entra com um código de 6 dígitos e o acesso desliga ao fechar o app.
- Correção: "Novo orçamento" aberto logo ao entrar na tela às vezes vinha com as condições comerciais e a validade padrão em vez das da empresa.
- **Mais leve** (#88): ao sair de Imagem → SVG, Litofania ou Modelos prontos o app devolve a memória que essas ferramentas usaram (depois da litofania: de ~560 MB para ~250 MB na medição). A apresentação do primeiro uso só carrega quando aparece. Em Sobre → Copiar informações entram o tempo de abertura e a memória, para comparar em computadores diferentes.
- **Gramas, tempo e R$ sem fatiar** (#99): nas ferramentas 3D, acima de Salvar 3MF, aparece uma estimativa de gramas por cor, tempo e custo do filamento, usando o filamento cadastrado de cada cor. Pode errar ±20% (o fatiador prevalece). **Levar para a Calculadora** abre a calculadora completa com as gramas e o tempo preenchidos.

## 0.7.0 — 2026-09-29
- **Posição dos textos nos modelos prontos**: o bloco de textos, o QR e os ícones agora saem centralizados, e você pode arrastar cada um (ou digitar a posição em mm), alinhar em cima, no meio ou embaixo, e usar "Centralizar tudo" ou "Restaurar". No cartão de visita dá para escolher onde fica o QR.
- **Separador de 3MF por cor** (Ferramentas): abra um 3MF pintado no Bambu Studio, OrcaSlicer ou PrusaSlicer e ele separa cada cor em uma peça. Dá para cortar pelo plano com pino de encaixe (solto ou fixo), para imprimir cores separadas e colar ou encaixar depois.
- **20 modelos prontos novos**: letra grande com nome, letreiro em camadas (até 4 linhas, imagem, enfeite e QR ao lado), letra caixa para LED, letras soltas para parede com gabarito, painel de nomes, pingentes de nomes ligáveis, quebra-cabeça com arte, cubo alfabeto, string art, peça com janela (glitter, acetato ou tecido), porta-foto, organizador de mesa e os de cozinha e casa abaixo.
- **Lote em qualquer modelo pronto**: uma cópia por linha (campos separados por ";"), arrumadas sozinhas na mesa, com aviso quando não cabe.
- **Emoji nos textos** dos chaveiros e dos modelos prontos, com seletor de emoji.
- **Chaveiro em etiqueta retangular** com 3 cores e nome em duas linhas; **abridor** com fenda que você posiciona e bolso NFC; **chaveiro NFC** em coração, hexágono e estrela; **tag de pet** em oval, peixe ou no formato do seu desenho; **marca-página** com o nome de pé na lateral.
- **Cavidade para resina** no chaveiro, no NFC e na placa adaptável; **texturas no fundo** (listras, ondas, hexágonos, pontos, xadrez) nas placas e letreiros; **plaquinha de colorir** rebaixada, em 2 peças ou em marchetaria.
- **Taxa de falha por material e por produto** (ex.: TPU mais alta que PLA), com a origem mostrada na linha do resultado.
- **Buscar modelos 3D**: uma tela nova em Ferramentas abre a busca no Printables, MakerWorld, Thingiverse, Cults3D e Thangs (um de cada vez ou todos), lembra as últimas buscas e explica se a licença deixa vender a peça (NC = não comercial). Arraste o 3MF fatiado ou o G-code do modelo baixado e ele vai direto para a Calculadora.
- **Desenhos e textos livres nos Modelos prontos**: coloque seu SVG, uma imagem (vira vetor) ou um texto em cima de qualquer modelo. Na **vista de cima**, arraste para mover (gruda no centro e nas bordas), use a alça do canto para o tamanho e a de cima para girar, ou digite X, Y, largura e giro. Cada camada pode ser relevo (com a cor dela), gravada ou vazada, e dá para esconder, duplicar, mudar a ordem, excluir e desfazer (⌘Z). O app avisa se o desenho sair da peça, ficar fino demais ou encostar num furo.
- **Salvar como variação**: guarde o modelo com seus campos e camadas com um nome e reaplique depois com um toque. Fica no backup.
- **Mais fatiadores** no "Importar do fatiador": Creality Print, Anycubic Slicer Next, Elegoo Slicer e Simplify3D. G-code de outro fatiador também é lido quando traz tempo e peso (ou comprimento) nos comentários, com aviso para conferir.
- **kWh pela média do estado**: sem a conta de luz em mãos, escolha o estado no primeiro uso ou em Preferências e o preço do kWh vem preenchido com uma estimativa (tarifa da ANEEL com ICMS e PIS/COFINS). Com a conta, o valor fica exato.
- **Comparar cenários**: "Comparar com outro cenário" guarda a conta atual como A. Mude material, camada ou peças na mesa e veja A × B lado a lado (custo, preço, lucro por peça e por hora), com a diferença e se ficou melhor ou pior. "Trocar A e B" volta para a outra conta.
- **Últimos cálculos**: a calculadora guarda sozinha os 20 cálculos mais recentes (nome, data, gramas, tempo e preço). "Reabrir" volta todos os valores e "Apagar" tira da lista. Ficam no banco e entram no backup.
- **Por que meu preço é diferente?**: um link no resumo da calculadora explica, com os seus números, as 4 escolhas que mais mudam o preço em relação a outras calculadoras: falhas divididas × somadas, consumo × potência da fonte, markup × margem e mão de obra fora do multiplicador.
- **Para onde vai o preço**: no modo Completo da calculadora, uma barra mostra quanto do preço de cada canal vai para produção, mão de obra, taxas e impostos, frete e lucro, em R$ e %. Bom para mostrar ao cliente, e para ver quanto a Shopee leva.
- **Potência da fonte × consumo**: se a potência da impressora for mais que o dobro do consumo médio dela (ex.: 350 W da etiqueta da A1, que gasta ~95 W imprimindo), a calculadora avisa e o botão "Usar 95 W" corrige a conta e o cadastro.
- **Nome da peça** no topo da calculadora. Ao importar o arquivo do fatiador ele vem preenchido (nome do objeto no 3MF ou do arquivo, sem extensão). Vai junto para o produto e o orçamento.
- **Gramas do Cura pela densidade certa**: o Cura só informa metros; agora as gramas usam a densidade do material do filamento escolhido (PETG, ABS, TPU…) e o diâmetro do fio, e a linha mostra qual densidade foi usada.
- **Avisos de valor estranho** na calculadora: preço do kg, gramas, horas, potência, taxa de falha ou comissão fora do normal (quase sempre erro de digitação, como 1000 g no lugar de 100 g). O cálculo continua, e "Está certo" some com o aviso.
- **Número do orçamento por ano**: ORC-2026-001, ORC-2026-002… com o prefixo que você escolher em Dados da empresa. Aparece na lista, no PDF e no nome do arquivo; os orçamentos antigos foram numerados pela data.
- **Cortador em grade** (Modelos prontos → Cozinha): corta massa e fondant em retângulos iguais de uma vez; você escolhe o tamanho da célula, linhas, colunas, cantos arredondados e abas de pega com nome.
- **Suporte de palitos** e **boleira** (Modelos prontos → Cozinha): base com furos para pirulito e cake pop (leve, maciça ou com lugar para peso) e boleira com borda ondulada e nome na borda, impressa numa peça só, sem suporte.
- **Cumbuca no contorno** (Modelos prontos → Casa): cestinha de lembrancinha no formato de qualquer desenho fechado, com fundo e borda arredondados e o desenho em relevo no fundo em outra cor.
- **Molde para carimbo de EVA** (Modelos prontos → Casa): desenho ou texto rebaixado numa placa (ou em relevo, invertido), com opção de ligar partes soltas e um apoio de polegar que encaixa atrás. Aqueça o EVA, prense no molde e o carimbo sai pronto.
- **Estojo com tampa de rosca** (Modelos prontos → Casa): porta-batom, pente de cílios ou chaveiro. Você dá o diâmetro e a altura de dentro; a rosca tem passo, folga e entradas ajustáveis, a tampa para alinhada com o corpo, e dá para pôr nome, ícone em mosaico e orelha de chaveiro. Imprime sem suporte.
- **Rolo de textura** (Modelos prontos → Cozinha): marca massa, argila e biscoito com um desenho em mosaico (com opção de tijolo) ou envolvente, alto ou baixo relevo, sem emenda. Furo para eixo ou cabos impressos; imprime em pé.
- **Quadro de metas** (Modelos prontos → Casa): placa de mesa com título e uma grade de números em relevo para riscar conforme a meta avança (R$ 50, R$ 100… ou dias em contagem regressiva), arrumada sozinha, com suporte.
- **Exportar produtos para a Shopee e o Mercado Livre**: em Produtos, marque os produtos e salve a planilha de upload em massa com nome, descrição, preço do canal, estoque pronto, SKU, peso e medidas da caixa, NCM, origem e unidade. Com o modelo baixado do Seller Center, o app preenche o próprio modelo; sem ele, sai uma planilha simples para copiar e colar. As fotos continuam sendo enviadas pelo marketplace. O produto ganhou a parte "Anúncio e fiscal (opcional)".
- **Sugestões chegam sem GitHub e sem e-mail**: o "Sugerir ferramenta" envia direto pelo app (com a imagem e, se quiser, o diagnóstico) e mostra "Recebido ✓". Também dá para mandar pelo WhatsApp com o texto pronto ou copiar o texto. O app guarda a lista do que você já enviou.

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
