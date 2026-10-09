import { DEFAULT_PROFILE, mergeProfiles, type PrintProfile } from "../../geometry/printProfile";
import type { Params } from "./fields";


/** Configuração recomendada por modelo pronto (#86), por cima do padrão (0,2 mm · 3 paredes · 15% · sem suporte). */
export const MODEL_PROFILES: Record<string, PrintProfile> = {
  cutterStamp: { walls: 2, notes: ["Lâmina fina: deixe ligado \"Detectar paredes finas\" no fatiador para ela não sumir."] },
  ejector: { walls: 3, infill: 20 },
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
  keycap: { walls: 3, infill: 20, notes: ["Sai de ponta-cabeça, com o topo na mesa: a legenda fica lisa e a haste cresce sem suporte. A folga da cruz depende da impressora: imprima uma tecla de teste e ajuste de 0,1 em 0,1 mm. Troque o filamento nas primeiras camadas (a legenda) como no AMS."] },
  phoneKeychain: { walls: 4, infill: 40, notes: ["Faz força (abridor e apoio do celular): PETG aguenta mais que PLA. Imprima deitado, como sai no arquivo."] },
  opener: { walls: 4, infill: 40, notes: ["Faz força: PETG aguenta mais que PLA."] },
  clicker: { walls: 3, infill: 30 },
  articulatedName: { walls: 2, brim: false, notes: ["Dobradiça já montada: sem brim nem suporte. Depois de esfriar, gire as letras para soltar."] },
  spinner: { walls: 2, notes: ["Gira já montado: sem suporte."] },
  keyHolder: { walls: 4, infill: 25 },
  shadowbox: { walls: 2, infill: 15, notes: ["Cada placa é de uma cor só: use \"Mesa por cor\" e imprima uma de cada vez; a borda mais alta é o espaçador."] },
  ornamentSpinner: { walls: 2, notes: ["Gira já montado: sem suporte. Teste o giro antes de pendurar."] },
  starMap: { walls: 2, infill: 15, notes: ["As estrelas são relevo fino: camada de 0,12 a 0,16 mm e placa de frente para cima."] },
  musicCard: { walls: 2, infill: 15, notes: ["Textos e botões são relevo fino: imprima com a placa de frente para cima, camada de 0,12 a 0,16 mm."] },
  tableLamp: { walls: 3, notes: ["Cúpula clara e fina deixa a luz passar; a base pede mais preenchimento para ter peso."] },
  lamp: { walls: 2, notes: ["Difusor em filamento branco (1ª camada)."] },
  cutoutFrame: { walls: 3, infill: 20, notes: ["Moldura e desenho saem na mesma espessura, lado a lado: imprima deitado, como no arquivo. Troque o filamento entre as peças se quiser duas cores."] },
  cutoutStand: { walls: 3, infill: 20, notes: ["Imprima a placa deitada e a base como saem no arquivo; a lingueta encaixa na base sem cola."] },
  lineArt: { walls: 3, infill: 20 },
  coloring: { layerHeight: 0.16 },
  snowflake: { walls: 2 },
  bigFrame: { walls: 3, infill: 15, notes: ["Imprima as peças de frente para cima, como estão no arquivo. As caudas de andorinha deslizam no sentido da espessura: encaixe na ordem dos números, sem cola. Se ficar justo, passe uma lixa fina na cauda."] },
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
