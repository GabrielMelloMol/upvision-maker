import type { GuideHelp } from "../fields";

/*
 * "Como usar" de cada família dos Modelos prontos (#209): quando usar, quando não, dicas e perguntas. O que muda de modelo
 * para modelo (faixas, padrões, dica de cada campo) sai dos próprios campos; a configuração de impressão de cada modelo
 * (paredes, preenchimento, notas) já aparece em "Dicas de impressão" ao lado do botão de salvar.
 */
const COLORS_FAQ = {
  q: "Como imprimo em duas cores?",
  a: "Com AMS, use \"Multicor\". Sem AMS, escolha \"Com pausas\" (o 3MF já leva a troca de filamento na camada certa) ou \"Mesa por cor\" para imprimir uma cor de cada vez.",
};
const BED_FAQ = {
  q: "A peça passou da mesa da minha impressora. E agora?",
  a: "O app avisa quando passa. Diminua a medida maior, ou escolha a impressora certa em Ajustes para a conta usar a sua mesa.",
};

export const FAMILY_HELP: Record<string, GuideHelp> = {
  starMap: {
    use: ["Presente de aniversário, casamento ou Dia das Mães: o céu da noite de uma data e de um lugar.", "Quando a pessoa quer um quadro para pendurar ou iluminar por trás."],
    avoid: ["Quando a data ou o lugar ainda não estão certos: confira antes de imprimir, o céu muda com a hora e a cidade."],
    tips: ["Camada fina (0,12 a 0,16 mm) deixa as estrelas nítidas.", "Para iluminar com LED, deixe as estrelas vazadas e use filamento claro na placa."],
    faq: [{ q: "Posso escolher qualquer cidade?", a: "Sim. Busque o lugar pelo nome; o app usa a latitude, a longitude e o fuso dele." }, COLORS_FAQ],
  },
  musicCard: {
    use: ["Lembrança com a música preferida da pessoa: o código leva direto à música no celular.", "Cartão de presente, de casamento ou de aniversário."],
    avoid: ["Se a pessoa não tem internet no celular na hora: o código abre a música pela internet."],
    tips: ["Os textos e botões são relevo fino: imprima de frente para cima, com camada de 0,12 a 0,16 mm.", "Teste o código com a câmera do celular antes de dar de presente."],
    faq: [{ q: "O código QR funciona com qualquer música?", a: "Com o link ou o código do Spotify da música; cole no campo do código e confira a prévia." }, COLORS_FAQ],
  },
  counterPlate: {
    use: ["Balcão de loja, feira ou consultório: a pessoa lê o QR e paga, entra no Wi-Fi ou abre o seu perfil.", "Para a placa Pix, a chave e o nome saem direto dos dados da empresa."],
    avoid: ["QR com muito texto: quanto maior o conteúdo, mais difícil de ler. Prefira um link curto."],
    tips: ["Teste o QR com o celular antes de entregar. Contraste forte (preto sobre branco) lê melhor.", "A placa fica inclinada e firme no balcão; imprima o suporte junto."],
    faq: [{ q: "A chave Pix está certa?", a: "O app monta o código do Pix pela norma do Banco Central; confira a chave e o nome do recebedor e teste com um valor pequeno." }, COLORS_FAQ],
  },
  plate: {
    use: ["Placa de porta, de sala, de mesa ou de profissão, com texto em até duas cores.", "Quando a peça precisa ficar exatamente no contorno de um desenho."],
    avoid: ["Texto muito fino: traços abaixo de 0,8 mm podem não sair com bico de 0,4."],
    tips: ["Letras maiores e em negrito imprimem melhor.", "Para fixar na parede, use fita dupla face ou imprima furos para parafuso."],
    faq: [COLORS_FAQ, BED_FAQ],
  },
  businessCard: {
    use: ["Cartão de visita diferente, com o contato e um QR para o site ou o WhatsApp.", "Brinde para clientes."],
    avoid: ["Muito texto num cartão pequeno: priorize nome, profissão e um contato."],
    tips: ["Imprima de frente para cima, 2 paredes e 100% de preenchimento deixam o cartão rígido e fino.", "Teste o QR antes de imprimir um lote."],
    faq: [{ q: "Dá para imprimir vários de uma vez?", a: "Sim: ligue o lote e escreva uma linha por pessoa; o app arruma todos na mesma mesa." }, COLORS_FAQ],
  },
  idTag: {
    use: ["Plaquinha de coleira (nome e telefone) ou tag MOLLE para mochila e colete.", "Chaveiro de identificação."],
    avoid: ["Deixar só o nome do pet: ponha um telefone, é ele que traz o pet de volta."],
    tips: ["PETG resiste melhor ao sol e ao uso do que PLA.", "Letras em relevo gastam; gravar o texto protege."],
    faq: [COLORS_FAQ],
  },
  keychain: {
    use: ["Chaveiro com nome, logo ou desenho: lembrança, brinde de empresa ou venda.", "Quando precisa de função: abridor, espelho, suporte de celular, giratório."],
    avoid: ["Furos muito perto da borda: a argola pode quebrar. Deixe pelo menos 3 mm de material em volta."],
    tips: ["PETG aguenta mais o uso diário do que PLA.", "Para vender em quantidade, use o lote (uma linha por nome)."],
    faq: [COLORS_FAQ, { q: "Como faço vários nomes de uma vez?", a: "Ligue \"Lote\" e escreva um nome por linha: o app gera todos na mesma mesa." }],
  },
  names: {
    use: ["Nome articulado que se mexe, pingentes de nomes ou topo de lápis: brinde para criança e para festa."],
    avoid: ["Nomes muito longos: ficam grandes e passam da mesa."],
    tips: ["O nome articulado sai já montado: sem brim e sem suporte. Depois de esfriar, gire as letras para soltar.", "Camada de 0,2 mm e velocidade moderada deixam as articulações lisas."],
    faq: [COLORS_FAQ, BED_FAQ],
  },
  trophy: {
    use: ["Troféu, taça ou medalha de campeonato, formatura ou brincadeira de turma.", "Personalizado com nome, ano e posição."],
    avoid: ["Peças grandes sem base larga: podem tombar. Aumente a base antes de imprimir."],
    tips: ["Dourado, prata e bronze com filamento metálico ou AMS ficam bonitos.", "A base pesa mais com 20 a 25% de preenchimento."],
    faq: [COLORS_FAQ, BED_FAQ],
  },
  medal: {
    use: ["Medalha de premiação, formatura ou brinde, no contorno do seu desenho ou redonda."],
    avoid: ["Fita muito larga para o furo: confira a largura antes de imprimir."],
    tips: ["Medalhas finas imprimem de frente para cima e ficam mais nítidas com camada de 0,12 a 0,16 mm.", "Para vender, use o lote com um nome por linha."],
    faq: [COLORS_FAQ],
  },
  souvenirs: {
    use: ["Lembrancinhas de festa: ímã de geladeira, estampa de camisa, cumbuca no contorno de um desenho."],
    avoid: ["Ímã sem testar: confira o tamanho do ímã que você tem antes de imprimir um lote."],
    tips: ["O ímã entra numa pausa de impressão: coloque todos com a mesma face para cima.", "Estampa de camisa em TPU fino, devagar e sem retração."],
    faq: [COLORS_FAQ, { q: "Como coloco o ímã?", a: "O app programa uma pausa na altura certa. Quando a impressora parar, encaixe os ímãs, todos com a mesma face para cima, e retome." }],
  },
  cake: {
    use: ["Topo de bolo com nome e idade, ou frase de casamento e chá de bebê."],
    avoid: ["Contato direto com bolo recheado: use um palito de espetar e proteja a parte que encosta com papel manteiga."],
    tips: ["PLA não é indicado para alimento, a peça deve só espetar no bolo por cima de um papel.", "Letras largas e grossas ficam mais firmes."],
    faq: [COLORS_FAQ],
  },
  christmas: {
    use: ["Enfeite de Natal com nome: floco de neve ou peça giratória para pendurar."],
    avoid: ["Fios muito finos na ponta do floco: quebram na árvore. Aumente a espessura se for usar com crianças."],
    tips: ["A peça giratória sai já montada, sem suporte; teste o giro antes de pendurar."],
    faq: [COLORS_FAQ],
  },
  letters: {
    use: ["Letreiro, letras de parede, letra grande ou LED: decoração de quarto, loja e festa."],
    avoid: ["Letras muito altas numa só peça: passam da mesa. Use a divisão em partes."],
    tips: ["Letras com LED precisam de filamento claro na frente para a luz passar.", "Fixe na parede com fita dupla face de espuma."],
    faq: [BED_FAQ, COLORS_FAQ],
  },
  frame: {
    use: ["Moldura para foto, quadro com janela (shaker) ou moldura grande dividida em peças."],
    avoid: ["Vidro pesado: a moldura impressa aguenta papel e foto, não vidro grosso."],
    tips: ["As peças da moldura grande encaixam na ordem dos números, sem cola.", "Se ficar justo, passe uma lixa fina."],
    faq: [BED_FAQ],
  },
  lamp: {
    use: ["Luminária e abajur que mostram um desenho ou uma foto em relevo quando acesos."],
    avoid: ["Lâmpada quente: use só LED frio perto do plástico."],
    tips: ["Filamento branco ou natural na cúpula deixa a luz passar.", "A base mais pesada (mais preenchimento) deixa o abajur firme."],
    faq: [{ q: "Posso usar lâmpada comum?", a: "Não. Use LED (que quase não esquenta) para o plástico não deformar." }],
  },
  wallArt: {
    use: ["Quadro decorativo: desenho em pé, string art, metas, shadowbox, azulejo ou placa vazada."],
    avoid: ["Peças enormes de uma vez: divida em partes que encaixam."],
    tips: ["Camadas finas fazem o relevo ficar nítido.", "Troque o filamento entre as peças para um efeito de camadas."],
    faq: [COLORS_FAQ, BED_FAQ],
  },
  containers: {
    use: ["Caixas e potes para guardar peças pequenas: porta-caneta, organizador de mesa, caixa com tampa, estojo de rosca."],
    avoid: ["Guardar líquidos: as caixas impressas não são estanques."],
    tips: ["PETG é mais duro de quebrar do que PLA.", "Parede de 2,4 mm (6 perímetros) é firme sem gastar muito."],
    faq: [COLORS_FAQ],
  },
  gridfinity: {
    use: ["Organização de gaveta e bancada que se encaixa: caixinhas, base e régua no padrão Gridfinity de 42 mm.", "Quando você quer trocar de lugar as caixinhas depois."],
    avoid: ["Medir a gaveta de olho: use a ferramenta Na gaveta, que calcula as casas e as margens."],
    tips: ["Imprima primeiro uma peça de teste de encaixe antes da base inteira.", "A base cabe em várias mesas: o app divide em pedaços que se emendam."],
    faq: [{ q: "O que é Gridfinity?", a: "Um sistema aberto de caixinhas e bases com 42 mm por casa e pés que se encaixam. As suas caixinhas servem em qualquer base Gridfinity." }, { q: "A caixinha ficou justa ou frouxa na base.", a: "Imprima o teste de encaixe e ajuste a folga de 0,05 em 0,05 mm." }],
  },
  vase: {
    use: ["Vaso paramétrico em modo espiral (parede única, rápido) ou com parede normal."],
    avoid: ["Colocar terra e água direto no vaso em modo espiral: use um vasinho de plástico dentro."],
    tips: ["Modo vaso: bico de 0,4 e parede única; para ficar mais firme, use linha de 0,6 no fatiador.", "Filamento transparente ou translúcido dá efeito de vidro."],
    faq: [{ q: "O vaso pinga?", a: "O modo espiral não é estanque. Use um copinho dentro ou vede por dentro com resina." }],
  },
  toys: {
    use: ["Brinquedos e jogos: quebra-cabeça, cubo com alfabeto, dados de RPG, para colorir e cartões de montar."],
    avoid: ["Brinquedo para criança bem pequena: as peças pequenas podem engasgar; confira a idade indicada."],
    tips: ["Lixe de leve as bordas e use cores vivas.", "Os dados de RPG pedem camada fina e um furo de teste."],
    faq: [COLORS_FAQ],
  },
  assembleKits: {
    use: ["Kits de montar sem cola: carro, caminhão, trator, avião, helicóptero, foguete, bicho e baú."],
    avoid: ["Imprimir sem testar a folga: a fenda varia de impressora para impressora."],
    tips: ["Se as peças ficarem justas, aumente a folga de 0,05 em 0,05 mm; se frouxas, diminua.", "Os pontos de corte são finos de propósito: destaque dobrando de leve."],
    faq: [{ q: "As peças não encaixam.", a: "Ajuste a folga e imprima de novo só o cartão. Confira também se a primeira camada não alargou a peça (\"pé de elefante\")." }],
  },
  coaster: {
    use: ["Porta-copos com nome, desenho ou data: lembrança de casamento e brinde."],
    avoid: ["Bebida muito quente direto: o plástico comum amolece com o calor; escolha um material que aguente mais."],
    tips: ["Mais de uma cor deixa o desenho em destaque.", "Cortiça ou feltro colados por baixo protegem a mesa."],
    faq: [COLORS_FAQ],
  },
  phoneStand: {
    use: ["Suporte de celular ou tablet para mesa de trabalho, cozinha e cabeceira, fixo ou dobrável."],
    avoid: ["Tablet pesado em suporte fino: aumente a base e as paredes."],
    tips: ["O suporte dobrável sai aberto e deitado; dobre e abra cada dobradiça para soltar.", "4 paredes deixam o apoio firme."],
    faq: [{ q: "A dobradiça ficou presa.", a: "Dobre e abra algumas vezes; se não solta, imprima de novo com folga maior." }],
  },
  bookmark: {
    use: ["Marca-página com nome ou desenho: brinde de livraria, presente de leitor."],
    avoid: ["Peça muito fina em PLA: dobra com o tempo. Use 0,8 mm ou mais."],
    tips: ["O laço da fita não deve ficar perto da borda."],
    faq: [COLORS_FAQ],
  },
  keycap: {
    use: ["Tecla personalizada de teclado mecânico, com legenda em outra cor."],
    avoid: ["Imprimir sem testar a haste: a folga da cruz varia entre impressoras."],
    tips: ["Imprima uma tecla de teste e ajuste a folga de 0,1 em 0,1 mm.", "Troque o filamento nas primeiras camadas para a legenda."],
    faq: [{ q: "A tecla não entra no switch.", a: "Aumente a folga da cruz em 0,1 mm e imprima de novo." }],
  },
  keyHolder: {
    use: ["Porta-chave de parede com nome da casa ou da loja."],
    avoid: ["Parede de gesso sem bucha: use bucha e parafuso."],
    tips: ["4 paredes e 25% de preenchimento seguram o peso das chaves."],
    faq: [{ q: "Como fixo na parede?", a: "Com parafuso e bucha pelos furos do suporte, ou fita dupla face de alta fixação para parede lisa." }],
  },
  utilities: {
    use: ["Pecinhas de utilidade: espaçador, marcador de horta, pente de cabos, botão e adaptador de mangueira."],
    avoid: ["Peça que sustenta peso ou pressão sem testar: imprima uma de teste primeiro."],
    tips: ["Meça a peça original com paquímetro e use a medida em milímetros.", "Mais paredes dão mais força que mais preenchimento."],
    faq: [{ q: "Não tenho paquímetro.", a: "Use a régua de 25 cm do Gridfinity ou a ferramenta de medidas do app para conferir o encaixe com uma peça de teste." }],
  },
  sweetsTable: {
    use: ["Boleira e suporte de palitos para mesa de doces de festa."],
    avoid: ["Contato direto com alimento sem proteção: use papel ou forminha."],
    tips: ["PETG é mais resistente à lavagem; lave sem água quente."],
    faq: [COLORS_FAQ],
  },
  stamps: {
    use: ["Carimbo de EVA, molde de carimbo, rolo de textura e carimbos de biscoito."],
    avoid: ["Texto espelhado errado: confira a prévia antes de imprimir; o carimbo precisa sair invertido."],
    tips: [
      "Superfície lisa e altura de relevo de 1 a 2 mm funcionam bem.",
      "Forma para massinha de EVA: passe spray antiaderente, encha apertando nos cantos e alise rente à borda com uma espátula.",
      "Lave com água e sabão neutro.",
    ],
    faq: [
      { q: "O desenho saiu ao contrário no papel.", a: "O carimbo deve ser impresso espelhado: use o modo que inverte o desenho." },
      { q: "Quanto tempo a massinha leva para secar na forma?", a: "De 1 a 2 dias, conforme a espessura e o tempo. Desenforme só quando a massinha estiver firme; depois cole as costas com cola de EVA ou cola quente." },
      { q: "Placa para prensar ou forma para massinha?", a: "A placa marca uma folha de EVA aquecida e prensada. A forma é uma cavidade: a massinha de EVA seca dentro dela e já sai como carimbo, com o desenho em relevo." },
    ],
  },
  cutters: {
    use: ["Cortador de biscoito ou massa com carimbo, em grade, ou ejetor de brigadeiro."],
    avoid: ["Lâmina fina demais: com bico de 0,4, não passe de duas paredes de 0,4 e ligue \"Detectar paredes finas\"."],
    tips: ["Imprima em PETG ou PLA e lave à mão.", "Use farinha na massa para o cortador não colar.", "Ejetor com fundo por escala até um ponto: escolha um desenho redondo e simples, sem pontas, e imprima o êmbolo com camada fina."],
    faq: [{ q: "A lâmina não saiu.", a: "No fatiador ligue \"Detectar paredes finas\"; o app mostra o aviso na prévia." }],
  },
  bagClip: {
    use: ["Clipe de saco para fechar pacotes de café, arroz e biscoito."],
    avoid: ["Imprimir em pé: as hastes quebram. Imprima deitado, como sai no arquivo."],
    tips: ["4 paredes e 30% de preenchimento. PETG flexiona mais sem quebrar."],
    faq: [{ q: "O clipe quebrou ao abrir.", a: "Use PETG e imprima deitado; abra devagar na primeira vez." }],
  },
  pegboard: {
    use: ["Painel de parede para pendurar ferramentas, com os ganchos que encaixam nos furos.", "Bancada, oficina, ateliê ou quarto de costura."],
    avoid: ["Peso grande no mesmo gancho: ferramenta pesada pede gancho duplo ou haste curta, perto do painel."],
    tips: ["Escolha o mesmo passo (25 ou 20 mm) e o mesmo diâmetro de furo no painel e nos ganchos.", "Os espaçadores atrás dão o vão para o pino do gancho passar: deixe uns 12 mm.", "Painel maior que a mesa sai em ladrilhos cortados entre os furos: parafuse todos na parede, encostados."],
    faq: [{ q: "O gancho fica folgado no furo.", a: "O pino usa o diâmetro do furo menos 0,4 mm. Se sua impressora sai larga ou justa, mude o diâmetro do furo nos dois modelos em 0,2 mm e imprima um gancho de teste." }, BED_FAQ],
  },
  bookHolder: {
    use: ["Suporte de mesa para livro de receitas, caderno ou tablet, e apoio de polegar para ler com uma mão só."],
    avoid: ["Livros muito pesados no apoio de polegar: ele segura a página, não o livro."],
    tips: ["O suporte de mesa imprime com a base na mesa, sem suporte: a inclinação para trás é suave.", "Com 2 cores, o batente e os pés ficam numa cor e o nome em relevo em outra."],
    faq: [{ q: "Qual a largura certa?", a: "Um pouco menor que o livro aberto: 120 mm serve para a maioria dos livros de receitas." }, COLORS_FAQ],
  },
  mechanics: {
    use: ["Engrenagem, polia, correia, planetário, roda dentada e corrente para projetos de máquina, robótica e reparo."],
    avoid: ["Peça que gira sob carga sem testar: imprima uma de teste e confira a folga entre os dentes."],
    tips: ["Imprima engrenagens deitadas, com 4 paredes e 40% de preenchimento.", "Módulo e número de dentes definem o diâmetro: use o mesmo módulo nas peças que se encaixam."],
    faq: [{ q: "A engrenagem trava.", a: "Aumente a folga entre os dentes (0,1 a 0,2 mm) e confira se as duas peças têm o mesmo módulo." }, BED_FAQ],
  },
  cupHandle: {
    use: ["Alça removível para copo térmico cônico (Stanley e parecidos), para carregar com uma mão."],
    avoid: ["Copos muito cheios sem testar o encaixe: imprima antes o anel de teste."],
    tips: ["Imprima em PETG, que aguenta o peso e o calor do copo.", "Meça o diâmetro da base e do topo do seu copo e escolha o modelo mais próximo nas sugestões."],
    faq: [{ q: "A alça escorrega.", a: "Diminua o diâmetro do aro em 1 mm ou ligue mais paredes; o copo cônico aperta de baixo para cima." }],
  },
  sinkFunnel: {
    use: ["Tampa de ralo, funil, O-ring e retentor feitos pela sua medida, para reparo em casa."],
    avoid: ["Vedação de gás, água quente sob pressão ou contato com alimento sem material próprio: use peça comprada."],
    tips: ["Meça o ralo por dentro com paquímetro ou régua e confira com uma peça de teste.", "PETG aguenta melhor a água; lave sem água muito quente."],
    faq: [{ q: "A tampa não entra no ralo.", a: "O pino usa uma folga de 0,4 mm. Se o ralo for de plástico mole ou irregular, teste com 0,6 mm." }],
  },
  micHolder: {
    use: [
      "Transformar o microfone de lapela sem fio num mini microfone de mão para entrevista, reportagem, podcast, igreja ou evento.",
      "Brinde de profissão: a caixinha tem o formato do tema (casa, halter, cruz, balão, livro) ou do desenho da pessoa, com o nome ou a logo na frente.",
    ],
    avoid: [
      "Microfone que você não tem para medir: as medidas prontas são das fichas e não contam o ímã ou o clipe. Imprima o anel de teste antes de vender.",
      "Formato fino demais: mais estreito que o microfone com 2,4 mm de parede de cada lado (uns 38 mm no Lark M2), o meio fica estreito e o desenho perde a cara.",
    ],
    tips: [
      "Comece pelo anel de teste (uns 10 minutos): é o mesmo encaixe das costas. O microfone deitado deve entrar sem forçar, com o clipe por cima da travessa, e sair puxando para trás. Ajuste a folga e só então imprima a canopla.",
      "Placa 1: a caixinha numa peça só, deitada, com as costas abertas para baixo e o logo em cima. Não precisa de suporte: o teto do bolso se fecha aos poucos, em meia-volta, e o resto é ponte curta.",
      "Placa 2: a bolinha, o anel, o cabo e a pecinha, em pé. A grade tem furinhos de 1,6 mm, feitos para bico de 0,4. Na espuma impressa, ligue a pele texturizada (fuzzy skin) no fatiador para ela parecer espuma.",
      "Monte com cola: o cabo no rebaixo de baixo; a pecinha no rebaixo de cima; o anel passa pela pecinha e a bolinha encaixa nela. O microfone entra por trás, deitado: empurre para dentro com o clipe por cima da travessa e a haste dele no rasgo do meio. As costas ficam abertas: luz e botão à vista.",
      "Com AMS, a caixinha e o relevo da frente saem em cores diferentes; na placa 2, o anel prata é a única troca de cor (2 mm).",
    ],
    faq: [
      { q: "Como tiro o microfone para carregar?", a: "Puxe ele para trás pela abertura das costas. Não precisa mexer no cabo nem usar ferramenta." },
      { q: "Espuma impressa, grade ou espuma comprada?", a: "A espuma impressa é lisa e sai em qualquer cor. A grade parece microfone de palco, com o anel prata. Para a espuma comprada (de mini microfone, uns 30 mm), escolha Espuma comprada: o topo ganha um furo onde a base dela entra apertada." },
      { q: "Posso usar o meu desenho no formato?", a: "Sim: escolha Meu desenho e envie o SVG ou a imagem. O app fecha o contorno, põe o microfone no meio e avisa se ficar estreito." },
      { q: "Posso vender?", a: "Sim. A peça é gerada pelo app, com formato e medidas próprias; não usa arquivo de terceiros." },
    ],
  },
  jigs: {
    use: ["Gabaritos de oficina: furação com guia de broca, gabarito de raio e régua de marcação."],
    avoid: ["Tolerância de precisão industrial: a peça impressa serve para marcar e guiar, não para medir micrômetros."],
    tips: ["Imprima deitado, com 4 paredes, para a guia não flexionar.", "Confira o furo guia com a broca antes de usar na peça de verdade."],
    faq: [{ q: "A broca anda dentro do furo guia.", a: "Use o diâmetro da broca mais 0,2 mm de folga; mais que isso a guia perde precisão." }],
  },
};

/** Texto de apoio quando um modelo novo ainda não tem família com ajuda escrita. */
export const GENERIC_HELP: GuideHelp = {
  use: ["Quando você quer um modelo pronto para ajustar o nome, as medidas e as cores e salvar o 3MF."],
  avoid: ["Peças que passam da mesa da sua impressora: o app avisa."],
  tips: ["Confira a prévia e a lista de peças antes de imprimir.", "Veja \"Dicas de impressão\" ao lado do botão de salvar: elas mudam de modelo para modelo."],
  faq: [{ q: "Posso imprimir em outro material?", a: "Sim. PETG aguenta mais o uso do dia a dia que PLA; confira as dicas do modelo." }, COLORS_FAQ, BED_FAQ],
};
