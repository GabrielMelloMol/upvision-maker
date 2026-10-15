import type { GuideHelp } from "../fields";

/*
 * "Como usar" das ferramentas com tela própria (#209): o mesmo bloco dos Modelos prontos (quando usar, quando não, dicas e
 * perguntas). Sem tabela de campos: cada tela tem os seus controles e a frase de ajuda embaixo de cada um.
 */
const COLORS = {
  q: "Como imprimo em duas cores?",
  a: "Com AMS, use \"Multicor\". Sem AMS, escolha \"Com pausas\" (o 3MF leva a troca de filamento na camada certa) ou \"Mesa por cor\" para imprimir uma cor de cada vez.",
};

export const TOOL_HELP: Record<string, GuideHelp> = {
  svg: {
    use: ["Transformar um logo ou desenho (foto, PNG, JPG) em vetor limpo, em milímetros, de 1 a 4 cores.", "Antes de usar o desenho em um chaveiro, medalha ou placa."],
    avoid: ["Foto com muitos detalhes e sombras: o vetor fica cheio de pontinhos. Prefira desenho com cores chapadas e contraste."],
    tips: ["Quanto menos cores, mais limpo o resultado: comece com 2.", "Confira o desenho na prévia antes de seguir para a ferramenta que vai usar."],
    faq: [{ q: "O desenho saiu com buracos ou manchas.", a: "Diminua o número de cores ou aumente o contraste da imagem e tente de novo." }],
  },
  cutter: {
    use: ["Cortador de biscoito ou massa no contorno de um desenho, com carimbo opcional para marcar o desenho na massa."],
    avoid: ["Desenhos com detalhes finos: a lâmina com menos de 0,8 mm pode não sair com bico de 0,4."],
    tips: ["Passe farinha na massa para o cortador não colar.", "No fatiador, ligue \"Detectar paredes finas\" para a lâmina não sumir.", "Lave à mão, sem água quente: PLA amolece."],
    faq: [{ q: "O cortador pode ir à lava-louças?", a: "Não. O calor deforma o PLA; lave à mão com água morna." }],
  },
  keychain: {
    use: ["Chaveiro com nome e logo em duas cores, um ou vários de uma vez (lote).", "Brinde de empresa, lembrança de festa ou produto para vender."],
    avoid: ["Argola muito perto da borda: pode quebrar. Deixe pelo menos 3 mm de material em volta."],
    tips: ["Use o lote (um nome por linha) para imprimir todos na mesma mesa.", "PETG aguenta mais o uso diário do que PLA.", "Letras grossas e curtas ficam mais firmes."],
    faq: [COLORS, { q: "Como faço vários nomes de uma vez?", a: "Ligue \"Lote\" e escreva um nome por linha; o app arruma todos na mesma mesa." }],
  },
  medal: {
    use: ["Medalha de premiação, formatura ou brinde, redonda ou em outro formato, com texto, imagem e alça para fita."],
    avoid: ["Fita mais larga que a alça: confira a largura antes de imprimir."],
    tips: ["Camada de 0,12 a 0,16 mm deixa texto e relevo nítidos.", "Dourado, prata e bronze ficam bonitos com AMS ou pausas de filamento."],
    faq: [COLORS],
  },
  stamp: {
    use: ["Carimbo seco: duas placas que gravam o desenho em relevo no papel, sem tinta."],
    avoid: ["Papel muito fino: rasga. Use papel de 120 g ou mais."],
    tips: ["Pressione as duas placas com um livro pesado ou uma prensa pequena.", "Teste a folga com uma peça de teste antes de imprimir a definitiva."],
    faq: [{ q: "O relevo ficou fraco.", a: "Aumente a profundidade do desenho ou a pressão; confira se as placas ficaram bem alinhadas pelos pinos." }],
  },
  thermoform: {
    use: ["Caixinha de presente feita com tela de PLA em malha prensada a quente sobre um molde."],
    avoid: ["Aquecer demais: a tela derrete. Aqueça aos poucos e teste primeiro numa tela sobrando."],
    tips: ["Imprima a tela e o molde e confira o encaixe antes de prensar.", "Use luva térmica e trabalhe sobre superfície que aguente o calor."],
    faq: [{ q: "A tela rasgou na prensa.", a: "Está quente demais ou foi puxada rápido. Esquente de leve e pressione devagar." }],
  },
  extrude: {
    use: ["Transformar um desenho (SVG) em uma peça 3D com espessura, com base opcional: carimbo, molde, letreiro ou placa."],
    avoid: ["Desenho com linhas finas demais: precisa de pelo menos 0,8 mm de largura para imprimir."],
    tips: ["Comece com o desenho limpo na ferramenta de SVG.", "Uma base de 1,2 mm deixa tudo numa peça só."],
    faq: [COLORS],
  },
  qr: {
    use: ["Placa ou adesivo com QR do Pix, link, Wi-Fi ou contato; SVG ou 3MF em 2 cores.", "Balcão de loja, feira ou consultório."],
    avoid: ["QR muito pequeno ou com muito texto: fica difícil de ler. Prefira um link curto."],
    tips: ["Teste o QR com o celular antes de imprimir.", "Contraste forte (preto sobre branco) lê melhor.", "O código Pix segue a norma do Banco Central: confira a chave e o nome."],
    faq: [{ q: "Posso colocar o valor?", a: "Sim: o Pix com valor já sai pronto. Sem valor, a pessoa digita ao pagar." }],
  },
  spools: {
    use: ["Etiqueta com QR em cada rolo de filamento: ler a etiqueta dá baixa dos gramas usados."],
    avoid: ["Etiqueta sem cola na superfície: use fita dupla face ou imprima o furo para pendurar."],
    tips: ["Imprima uma etiqueta por rolo e cole no lado do carretel, onde não solta."],
    faq: [{ q: "Preciso estar na internet?", a: "Não. O app lê a etiqueta no próprio computador." }],
  },
  lithophane: {
    use: ["Foto em relevo que só aparece quando a luz passa por trás: litofania, quadro por camadas, relevo de uma cor e shadowbox."],
    avoid: ["Foto escura ou muito pequena: perde os detalhes. Use foto nítida e bem iluminada."],
    tips: ["Filamento branco ou natural deixa a luz passar.", "Camada fina (0,12 mm) mostra mais detalhes.", "Use LED frio por trás, não lâmpada que esquenta."],
    faq: [COLORS, { q: "A foto saiu apagada.", a: "Aumente o contraste da imagem ou diminua a espessura máxima da litofania." }],
  },
  pixel: {
    use: ["Imagem em pixels nas cores dos filamentos que você tem: mosaico, quebra-cabeça ou ímã."],
    avoid: ["Imagens com muitos detalhes e cores: use poucas cores para facilitar a impressão."],
    tips: ["Imprima uma cor por vez (\"Mesa por cor\") e monte; é ótimo para quem não tem AMS.", "Menos pixels imprimem mais rápido e ficam mais firmes."],
    faq: [{ q: "Preciso de AMS?", a: "Não. Cada cor sai numa mesa própria; depois é só montar." }],
  },
  organizers: {
    use: ["Organizar uma gaveta: pela medida dela, pela foto das ferramentas ou com caixinhas avulsas Gridfinity."],
    avoid: ["Medir a gaveta de olho: use uma régua. O app mostra a régua 1:1 em papel e a régua 3D de 25 cm."],
    tips: ["Comece por um exemplo (escritório, oficina, maquiagem, cozinha) e ajuste.", "A base se divide em pedaços que cabem na mesa e se emendam.", "PETG é melhor para a bandeja de talheres: aguenta água quente e detergente."],
    faq: [{ q: "As caixinhas ficaram soltas na base.", a: "Imprima o teste de encaixe e ajuste a folga de 0,05 em 0,05 mm." }, { q: "Posso mudar depois?", a: "Sim: o projeto fica guardado e você pode editar e imprimir só o que mudou." }],
  },
  colorsplit: {
    use: ["Quando você tem um 3MF pintado em várias cores e quer uma peça por cor, para imprimir em outros programas ou outra impressora."],
    avoid: ["3MF sem cores definidas: não há o que separar."],
    tips: ["Confira a lista de cores antes de salvar.", "Cada cor sai como uma peça; o programa de fatiar junta de volta se você quiser."],
    faq: [{ q: "Perde a posição das peças?", a: "Não. Cada peça mantém a posição, só muda para um objeto por cor." }],
  },
  owndecal: {
    use: ["Pôr nome ou logo numa face plana de um STL ou 3MF seu, em outra cor."],
    avoid: ["Faces curvas: a ferramenta trabalha em face plana e voltada para fora."],
    tips: ["Clique na face na prévia para escolher onde vai o nome.", "Escolha uma cor que contrasta com a peça."],
    faq: [COLORS],
  },
  partialcut: {
    use: ["Cortar só um pedaço de um STL ou 3MF, dentro de uma caixa, com pino de encaixe para colar de volta."],
    avoid: ["Corte por uma parte muito fina: o pino precisa de material dos dois lados."],
    tips: ["Mexa na caixa de corte arrastando as alças na prévia.", "O pino e o furo têm folga: confira antes de colar."],
    faq: [{ q: "O pino não entra no furo.", a: "Aumente a folga do pino em 0,05 mm e gere de novo." }],
  },
};
