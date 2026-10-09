// Fica à parte (sem importar o catálogo de modelos) para a busca do ⌘K abrir leve.
/** Palavras extras das telas (ferramentas) da Criar, por id da página. */
export const PAGE_ALIASES: Record<string, string> = {
  svg: "svg imagem em desenho vetorizar vetor desenho imagem logo png jpg contorno converter",
  cutter: "cortador de biscoito bolacha massa fondant molde",
  keychain: "chaveiro nome argola lote",
  medal: "medalha troféu prêmio fita",
  extrude: "extrusão relevo desenho svg peça 3d stl transformar em 3d",
  qr: "qr code pix pagamento wifi link",
  models: "modelos prontos catálogo",
  spools: "etiqueta rolo filamento qr estoque",
  lithophane: "foto em relevo litofania e quadro litofania lithophane colorida relevo baixo-relevo quadro por camadas shadowbox shadow box luz lâmpada quadro de luz abajur foto 3d",
  pixel: "pixel art mosaico 8 bits quebra cabeça ímã imã",
  organizers: "organizador organizadores gaveta caixinhas divisória medir gridfinity ferramenta foto encaixe contorno bandeja caixa avulsa",
  colorsplit: "separar 3mf por cor dividir cores 3mf cor separar pintado bambu",
  owndecal: "decal adesivo nome logo stl 3mf face plana colar",
  scad: "openscad customizer scad parâmetros personalizar",
  search3d: "buscar modelos 3d internet thingiverse printables makerworld baixar stl",
  ai: "ia claude inteligência artificial descrever peça",
};


/** Abas das telas que juntam várias ferramentas: aparecem na busca pelo nome que a pessoa conhecia e abrem já na aba (intent). */
export const PAGE_TABS: { pageId: string; tab: string; label: string; blurb: string; keywords: string }[] = [
  { pageId: "organizers", tab: "drawer", label: "Organizador de gaveta", blurb: "Organizadores › pela medida da gaveta: desenhe as caixinhas e imprima base e módulos.", keywords: "gaveta medir caixinhas divisória gridfinity organizador pela medida" },
  { pageId: "organizers", tab: "photo", label: "Organizador pela foto", blurb: "Organizadores › pela foto das ferramentas: encaixe exato de cada ferramenta.", keywords: "ferramenta foto encaixe contorno bandeja gridfinity gaveta organizador" },
  { pageId: "organizers", tab: "bins", label: "Caixinhas avulsas (Gridfinity)", blurb: "Organizadores › caixinha, base, base pela gaveta e teste de encaixe.", keywords: "gridfinity caixinha base teste encaixe bin modular avulsa organizador" },
];
