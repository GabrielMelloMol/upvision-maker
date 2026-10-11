# API dos kits de montar (KitTemplate)

Base comum em `src/geometry/kit/`. Um modelo de kit é só o desenho das **peças planas** e da **montagem**; a base faz o resto
(cartão, galhos, pontos de corte, números, nome, cores, escala, arte em relevo, prévia do montado, avisos).

```ts
import { rect, disc, crossLap, tabWindow, tab, dovetail, pinHole, type KitTemplate } from "../kit";

export const meuKit: KitTemplate = {
  id: "meuKit", label: "Meu kit", blurb: "…",
  palette: [{ key: "body", label: "Corpo", default: "#c9cdd2" }, { key: "wheel", label: "Rodas", default: "#1c1c1e" }],
  defaults: { comprimento: 80 },                       // parâmetros do modelo (planos: número, texto, booleano)
  sections: [{ title: "Medidas", fields: [{ k: "comprimento", kind: "num", label: "Comprimento", min: 40, max: 160 }] }],
  artTargets: [["lateral", "Lateral"]],                // peças que aceitam logo em relevo (opcional)
  build: ({ M, k, t, fit, pinFit, scale, p }) => ({    // k(obj) registra o objeto do Manifold para apagar no fim
    parts: [/* KitPart[] */], assembly: [/* Placement[] */], steps: ["Encaixe {lateral} …"], pairs: [/* KitPair[] */],
  }),
};
```

Registrar na tela: `kitTemplateDef(meuKit, { category: "home", icon })` em `src/tools/models/catalog/*` (campos do kit vêm junto).

## Tipos (`src/geometry/kit/types.ts`)

- **KitPart** `{ id, label, count?, layers: [{cs, color, z?}], pins?: [{x,y,r,len,color?}], thickness? }`: `cs` em mm no plano XY,
  com furos/fendas/abas já feitos; `layers[0]` é o contorno (arrumação e pontos de corte); `color` é uma chave da `palette`;
  `count` cópias iguais (cada uma com seu número); `pins` sobem da face de cima (disco + cilindro em pé).
- **Placement** `{ part, index?, rotate?: [rx,ry,rz], translate: [x,y,z] }`: onde a peça fica no montado. Plano impresso = XY
  com z de 0 a t. Gira (graus, ordem X, Y, Z) e depois move. Sem `index`, as cópias são usadas na ordem.
  Dicas: de pé no plano XZ = `rotate [90,0,0]`; no plano YZ = `[90,0,90]`; virada de cabeça para baixo = `[180,0,0]`.
- **KitPair** `{ a, b, kind: "pin-hole" | "tab-window" | "slot-slot" | "other", gap? }`: toque intencional ("id" ou "id#n").
  A colisão ignora o par, mas a folga dele é conferida (≤ `gap`, padrão `fit`, + 0,08 mm).
- **KitEnv**: `M`, `k`, `t` (espessura), `fit` (folga da fenda), `pinFit` (folga do furo sobre o pino: ~0,15 por pressão; gire
  com `spin`/`pinFit` ~0,3), `scale` (multiplique as medidas), `p` (todos os parâmetros, inclusive `spin`).
- `steps`: `{id}` vira o(s) número(s) das peças (`4`, `4 a 7`, `1, 3`); o texto vai nos avisos como "Para montar: …".
- `warnings`: avisos do próprio modelo (somam aos da base).

## Juntas (`joints.ts`, funções puras de CS)

`rect`, `disc`, `poly`; `crossLap` (meia-fenda: uma placa de cima, a outra de baixo, cada uma até a metade); `tabWindow`
(janela para aba: `tabW+fit` × `t+fit`); `tab`; `dovetail` (`{tail, socket}`); `pinHole` (furo = pino + folga).

## O que a base entrega

`buildKitTemplate(ctx, tpl, params)` → `{ models, warnings, meta }`: cartão (moldura + galhos + ≥ 2 pontos de corte por peça +
número no galho + nome gravado), uma parte por cor da paleta, o montado (`previewOnly`) ao lado, vários cartões na mesa, cartão
maior automático se não couber (com aviso). Parâmetros do kit (`DEFAULT_KIT_COMMON`): `title, cardSize, compact, copies, scale,
thickness, fit, pinFit, spin, gap, frame, runner, engrave, showAssembled, frameColor, titleColor, c_<cor>` e a arte em relevo
(`artPart, artFace front|back, artSize %, artRelief mm, c_art`). Na face de trás a peça sai virada no cartão (sem pino).

## Testar um modelo

```ts
import { kitInstances, assemblySolids, checkAssembly } from "../kit";
const { insts, build, env } = kitInstances(M, k, meuKit, {});
const rep = checkAssembly(M, k, assemblySolids(M, k, insts, build.assembly), build.pairs ?? [], env.fit);
expect(rep.collisions).toEqual([]);                 // nada se sobrepõe fora dos pares declarados
rep.pairs.forEach((q) => expect(q.ok).toBe(true));  // folgas dos pares dentro do esperado
```

Veja `src/geometry/kit/kit.test.ts` (kit de teste com meia-fenda e pino × furo). Peças pequenas juntas num galho comum
(`group`) ainda não existem: ficam em fileiras como as outras.
