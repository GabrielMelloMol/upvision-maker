import { DEFAULT_PROFILE, mergeProfiles, type PrintProfile } from "../../geometry/printProfile";
import type { Params } from "./fields";


/** Configuração recomendada por modelo pronto (#86), por cima do padrão (0,2 mm · 3 paredes · 15% · sem suporte). */
export const MODEL_PROFILES: Record<string, PrintProfile> = {
  spurGear: { layerHeight: 0.16, walls: 4, infill: 40, notes: ["Imprima deitada, como sai no arquivo. Se os dentes do par travarem, aumente a folga de 0,05 em 0,05 mm; se balançarem demais, reduza. Peça de bancada: não foi testada com carga ou motor forte."] },
  planetary: { layerHeight: 0.16, walls: 4, infill: 40, notes: ["Imprima cada peça deitada. O porta-satélites sai com os pinos para cima: vire-o sobre os planetas na montagem, com o eixo do sol passando pelo furo do meio. Se algo travar, aumente a folga dos dentes. Peça de bancada: não foi testada com carga."] },
  pulley: { layerHeight: 0.16, walls: 4, infill: 50, notes: ["Imprima deitada. Rosqueie o parafuso M3 de fixação direto no plástico (ou use porca embutida). Confira o passo da correia antes de imprimir: GT2 é 2 mm, HTD 3M é 3 mm."] },
  timingBelt: { layerHeight: 0.2, walls: 2, infill: 100, notes: ["Imprima em TPU 95A, devagar (20 a 30 mm/s) e sem retração. É uma correia de bancada: não substitui uma correia de fábrica em máquina de precisão."] },
  sprocket: { layerHeight: 0.16, walls: 4, infill: 40, notes: ["Imprima deitada. Confira a corrente que você tem (ANSI 25, ANSI 35, 06B ou 08B); com a folga muito justa o rolete não entra, com a folga solta a corrente pula."] },
  chain: { layerHeight: 0.16, walls: 3, infill: 100, support: false, brim: false, notes: ["Imprima como está no arquivo, sem suporte e sem brim nos pinos. Se os elos grudarem, aumente a folga de 0,05 em 0,05 mm; depois de esfriar, dobre cada junta para soltar."] },
  cutterStamp: { walls: 2, notes: ["Lâmina fina: deixe ligado \"Detectar paredes finas\" no fatiador para ela não sumir."] },
  ejector: { walls: 3, infill: 20 },
  candyMold: { walls: 3, infill: 20, notes: ["Imprima a forma com a aba na mesa e o êmbolo com a marca para baixo. Use filamento próprio para alimento (PETG/PLA food safe) e lave bem: peça impressa tem frestas."] },
  gymDumbbell: { walls: 3, infill: 40, notes: ["Imprima deitado, como sai no arquivo: troque o filamento na barra e no texto como no AMS, ou use uma cor só."] },
  gymKettlebell: { walls: 3, infill: 40 },
  paperClip: { layerHeight: 0.16, walls: 2, infill: 100, notes: ["Imprima deitado, como sai no arquivo. A fita é fina de propósito: PETG flexiona mais e aguenta mais aberturas que PLA. Se quebrar ao abrir, aumente a fita ou a altura."] },
  bookThumb: { walls: 3, infill: 30, notes: ["O anel sai em pé e a aba chata na mesa: sem suporte. PETG é mais confortável na pele e resiste melhor ao uso."] },
  bookStand: { walls: 3, infill: 20, notes: ["Imprima como está no arquivo, com a base na mesa: o apoio inclinado não precisa de suporte. Para tablet pesado, ligue mais paredes (4) ou preencha 30%."] },
  bagClip: { walls: 4, infill: 30, notes: ["Imprima deitado, como sai no arquivo: as hastes flexionam sem quebrar."] },
  fridgeMagnet: { walls: 3, infill: 20, notes: ["Há uma pausa para colocar os ímãs: coloque todos com a mesma face para cima e retome; as camadas seguintes cobrem. Confira a altura de camada igual à do fatiador."] },
  shirtPrint: {
    walls: 2,
    infill: 100,
    topLayers: 1,
    bottomLayers: 1,
    notes: [
      "Imprima deitada, de cara para a mesa, em TPU ou PLA fino; a altura de camada é a do campo (são só 1 a 4 camadas). Mesa limpa e lisa; no TPU, velocidade baixa e sem retração.",
    ],
  },
  kitCard: { walls: 2, infill: 100, brim: false, notes: ["Imprima o cartão como está no arquivo. Os pontos de corte são finos de propósito (2 camadas): destaque as peças dobrando de leve. A fenda (espessura + folga) pode precisar de ajuste: se ficar justa demais, aumente a folga de 0,05 em 0,05 mm e imprima de novo."] },
  kitAviao: { walls: 2, infill: 100, brim: false, notes: ["Imprima o cartão como está no arquivo. Os pontos de corte são finos de propósito (2 camadas): destaque as peças dobrando de leve. A fenda (espessura + folga) pode precisar de ajuste: se ficar justa demais, aumente a folga de 0,05 em 0,05 mm e imprima de novo."] },
  kitHelicoptero: { walls: 2, infill: 100, brim: false, notes: ["Imprima o cartão como está no arquivo. Os pontos de corte são finos de propósito (2 camadas): destaque as peças dobrando de leve. A fenda (espessura + folga) pode precisar de ajuste: se ficar justa demais, aumente a folga de 0,05 em 0,05 mm e imprima de novo."] },
  kitCar: { walls: 2, infill: 100, brim: false, notes: ["Imprima o cartão como está no arquivo. Destaque as peças dobrando de leve os pontos de corte. As rodas giram no pino com folga de 0,3 mm: se agarrarem, aumente a folga do giro; a trava aperta na ponta do pino (aumente o aperto se não entrar)."] },
  kitTruck: { walls: 2, infill: 100, brim: false, notes: ["Imprima o cartão como está no arquivo. Destaque as peças dobrando de leve os pontos de corte. As rodas giram no pino com folga de 0,3 mm: se agarrarem, aumente a folga do giro; a trava aperta na ponta do pino (aumente o aperto se não entrar)."] },
  kitBicho: { walls: 2, infill: 100, brim: false, notes: ["Imprima o cartão como está no arquivo e destaque as peças dobrando de leve nos pontos de corte. As fatias entram na coluna pelas fendas (espessura + folga): se ficarem justas demais, aumente a folga de 0,05 em 0,05 mm."] },
  kitBau: { walls: 2, infill: 100, brim: false, notes: ["Imprima o cartão como está no arquivo e destaque as peças nos pontos de corte. Os pinos saem de pé no cartão: corte rente e lixe. Se as abas ficarem justas demais, aumente a folga da fenda; se o pino ficar frouxo, diminua a folga do pino."] },
  keycap: { walls: 3, infill: 20, notes: ["Sai de ponta-cabeça, com o topo na mesa: a legenda fica lisa e a haste cresce sem suporte. A folga da cruz depende da impressora: imprima uma tecla de teste e ajuste de 0,1 em 0,1 mm. Troque o filamento nas primeiras camadas (a legenda) como no AMS."] },
  phoneKeychain: { walls: 4, infill: 40, notes: ["Faz força (abridor e apoio do celular): PETG aguenta mais que PLA. Imprima deitado, como sai no arquivo."] },
  aroma: { walls: 3, infill: 20, notes: ["A tampa sai de pé, com o logo para cima: sem suporte. Se a tampa não girar, imprima o teste da rosca e ajuste a folga."] },
  cupHandle: { walls: 4, infill: 25, notes: ["Imprima em PETG (aguenta o peso e o calor do copo). Fica de pé como no arquivo: a alça inclinada em cima imprime sem suporte. Antes da peça inteira, imprima só o anel de teste e confira o encaixe no copo."] },
  drainCover: { walls: 3, infill: 30, notes: ["PETG aguenta água quente. O pino é bem justo de propósito: teste a folga num pedaço do pino antes."] },
  funnel: { walls: 3, infill: 20, notes: ["Imprima de cabeça para baixo, como no arquivo. Para alimento ou remédio, não use: peça impressa tem frestas."] },
  oring: { walls: 2, infill: 100, notes: ["TPU 95A, devagar (20 a 30 mm/s), sem retração. Serve para poeira e respingo; não para pressão, óleo quente ou gás."] },
  seal: { walls: 2, infill: 100, notes: ["TPU 95A, devagar e sem retração. Serve para graxa, poeira e respingo em eixo lento; não para pressão ou óleo quente."] },
  boardBox: { walls: 3, infill: 15, notes: ["Imprima antes a bandeja de teste: confira se a placa assenta nos pinos e os furos batem. PETG ou ABS aguentam o calor de placas que esquentam; PLA amolece perto de reguladores quentes."] },
  spoolHolder: { walls: 4, infill: 25, notes: ["O eixo imprime em pé, com a cabeça na mesa. Antes de gastar a base inteira, imprima só o eixo e confira no furo do seu carretel."] },
  drillJig: { walls: 4, infill: 40, notes: ["O gabarito sai de ponta-cabeça (o batente para cima). Fure devagar e com a broca afiada: o plástico esquenta."] },
  radiusGauge: { walls: 2, infill: 100 },
  labelJig: { walls: 2, infill: 100 },
  slingshot: { walls: 5, infill: 100, notes: ["Imprima deitado, em PETG ou ABS. Para segurar o elástico, amarre pelos furos das pontas. Troque a peça se aparecer trinca."] },
  micHolder: { walls: 3, infill: 15, notes: ["Imprima antes o anel de teste (o mesmo encaixe das costas) e experimente o microfone com o clipe. As metades saem deitadas, com o corte na mesa, sem suporte; o cabo sai em pé. Monte com os pinos e cola."] },
  phoneCase: { walls: 2, infill: 20, notes: ["TPU 95A, devagar (20 a 30 mm/s), sem retração, bico entre 220 e 235 °C. Imprima antes a peça de teste e experimente no aparelho: a capa só encaixa se as medidas forem as do seu aparelho."] },
  opener: { walls: 4, infill: 40, notes: ["Faz força: PETG aguenta mais que PLA."] },
  openerImage: { walls: 4, infill: 40, notes: ["Faz força: PETG aguenta mais que PLA. Base, relevo e borda têm cores diferentes: troque o filamento na camada em que o relevo começa."] },
  clicker: { walls: 3, infill: 30 },
  articulatedName: { walls: 2, brim: false, notes: ["Dobradiça já montada: sem brim nem suporte. Depois de esfriar, gire as letras para soltar."] },
  spinner: { walls: 2, notes: ["Gira já montado: sem suporte."] },
  keyHolder: { walls: 4, infill: 25 },
  shadowbox: { walls: 2, infill: 15, notes: ["Cada placa é de uma cor só: use \"Mesa por cor\" e imprima uma de cada vez; a borda mais alta é o espaçador."] },
  ornamentSpinner: { walls: 2, notes: ["Gira já montado: sem suporte. Teste o giro antes de pendurar."] },
  starMap: { walls: 2, infill: 15, notes: ["As estrelas são relevo fino: camada de 0,12 a 0,16 mm e placa de frente para cima.", "Estrelas vazadas (LED atrás): imprima com a frente para baixo, como sai no arquivo; a tampa vai em outra peça."] },
  musicCard: { walls: 2, infill: 15, notes: ["Textos e botões são relevo fino: imprima com a placa de frente para cima, camada de 0,12 a 0,16 mm."] },
  tableLamp: { walls: 3, notes: ["Cúpula clara e fina deixa a luz passar; a base pede mais preenchimento para ter peso."] },
  lamp: { walls: 2, notes: ["Difusor em filamento branco (1ª camada)."] },
  cutoutFrame: { walls: 3, infill: 20, notes: ["Moldura e desenho saem na mesma espessura, lado a lado: imprima deitado, como no arquivo. Troque o filamento entre as peças se quiser duas cores."] },
  cutoutStand: { walls: 3, infill: 20, notes: ["Imprima a placa deitada e a base como saem no arquivo; a lingueta encaixa na base sem cola."] },
  lineArt: { walls: 3, infill: 20 },
  coloring: { layerHeight: 0.16 },
  snowflake: { walls: 2 },
  bigFrame: { walls: 3, infill: 15, notes: ["Imprima as peças de frente para cima, como estão no arquivo. As caudas de andorinha deslizam no sentido da espessura: encaixe na ordem dos números, sem cola. Se ficar justo, passe uma lixa fina na cauda."] },
  phoneStandFold: { walls: 3, infill: 20, layerHeight: 0.2, notes: ["Imprima aberto e deitado, como sai no arquivo, sem suporte e sem brim nas dobradiças (o brim fecharia a folga). Depois de esfriar, dobre e abra cada dobradiça algumas vezes para soltar. Se ficar presa, imprima de novo com folga 0,5."] },
  phoneStand: { walls: 4, infill: 25, notes: ["Imprima de pé na base, como sai no arquivo: o apoio inclinado não precisa de suporte. 4 paredes deixam o apoio firme com o peso do aparelho."] },
};

const VASE_SPIRAL: PrintProfile = { spiral: true, walls: 1, infill: 0, topLayers: 0, bottomLayers: 3, notes: ["Modo vaso: bico 0,4 e parede única; para uma parede mais firme, use largura de linha 0,6 no fatiador."] };

/** Modelo com campo "Altura de camada" (pausa para inserir tag/ímã): o fatiador usa a mesma camada. */
export function profileFor(id: string, p: Params): PrintProfile {
  const base = mergeProfiles(DEFAULT_PROFILE, MODEL_PROFILES[id]);
  const layer = Number(p.layerHeight);
  const out = layer > 0 ? { ...base, layerHeight: layer } : base;
  // vaso em modo espiral (#92): o fatiador sobe uma parede só, sem preenchimento nem topo
  return id === "vase" && p.mode === "spiral" ? mergeProfiles(out, VASE_SPIRAL) : out;
}
