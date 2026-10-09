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
  phoneKeychain: { walls: 4, infill: 40, notes: ["Faz força (abridor e apoio do celular): PETG aguenta mais que PLA. Imprima deitado, como sai no arquivo."] },
  opener: { walls: 4, infill: 40, notes: ["Faz força: PETG aguenta mais que PLA."] },
  clicker: { walls: 3, infill: 30 },
  articulatedName: { walls: 2, brim: false, notes: ["Dobradiça já montada: sem brim nem suporte. Depois de esfriar, gire as letras para soltar."] },
  spinner: { walls: 2, notes: ["Gira já montado: sem suporte."] },
  keyHolder: { walls: 4, infill: 25 },
  shadowbox: { walls: 2, infill: 15, notes: ["Cada placa é de uma cor só: use \"Mesa por cor\" e imprima uma de cada vez; a borda mais alta é o espaçador."] },
  musicCard: { walls: 2, infill: 15, notes: ["Textos e botões são relevo fino: imprima com a placa de frente para cima, camada de 0,12 a 0,16 mm."] },
  tableLamp: { walls: 3, notes: ["Cúpula clara e fina deixa a luz passar; a base pede mais preenchimento para ter peso."] },
  lamp: { walls: 2, notes: ["Difusor em filamento branco (1ª camada)."] },
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
