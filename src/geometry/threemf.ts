import { strToU8, zipSync } from "fflate";
import type { Mesh, Model } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n: number) => String(Math.round(n * 1e4) / 1e4);

function meshXml(m: Mesh): string {
  const v: string[] = [];
  for (let i = 0; i < m.positions.length; i += 3) v.push(`<vertex x="${num(m.positions[i])}" y="${num(m.positions[i + 1])}" z="${num(m.positions[i + 2])}"/>`);
  const t: string[] = [];
  for (let i = 0; i < m.indices.length; i += 3) t.push(`<triangle v1="${m.indices[i]}" v2="${m.indices[i + 1]}" v3="${m.indices[i + 2]}"/>`);
  return `<mesh><vertices>${v.join("")}</vertices><triangles>${t.join("")}</triangles></mesh>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="text/xml"/><Default Extension="xml" ContentType="text/xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;

/**
 * 3MF com um objeto por modelo e uma parte (componente) por cor.
 * `Metadata/model_settings.config` diz ao Bambu Studio / OrcaSlicer qual extrusora (filamento) cada parte usa:
 * a extrusora é a posição da cor na lista de cores distintas (1ª cor = filamento 1).
 * `pauses`: alturas (mm) do topo da camada ANTES da qual a impressora pausa (ex.: colocar ímã ou tag NFC).
 * O OrcaSlicer lê de qualquer 3MF; o Bambu Studio só de projetos gerados por ele (testado no CLI 2.x).
 */
export function write3mf(models: Model[], { pauses = [] }: { pauses?: number[] } = {}): Uint8Array {
  const colors = [...new Set(models.flatMap((m) => m.parts.map((p) => p.color.toLowerCase())))];
  const extruder = (c: string) => colors.indexOf(c.toLowerCase()) + 1;
  let id = 1;
  const objects: string[] = [];
  const items: string[] = [];
  const config: string[] = [];
  for (const m of models) {
    const partIds = m.parts.map((p) => {
      objects.push(`<object id="${id}" name="${esc(p.name)}" type="model">${meshXml(p.mesh)}</object>`);
      return id++;
    });
    const objId = id++;
    objects.push(`<object id="${objId}" name="${esc(m.name)}" type="model"><components>${partIds.map((p) => `<component objectid="${p}"/>`).join("")}</components></object>`);
    items.push(`<item objectid="${objId}" printable="1"/>`);
    config.push(
      `<object id="${objId}"><metadata key="name" value="${esc(m.name)}"/><metadata key="extruder" value="${extruder(m.parts[0].color)}"/>` +
        m.parts.map((p, i) => `<part id="${partIds[i]}" subtype="normal_part"><metadata key="name" value="${esc(p.name)}"/><metadata key="extruder" value="${extruder(p.color)}"/></part>`).join("") +
        `</object>`,
    );
  }
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">UpVision Maker</metadata><resources>${objects.join("")}</resources><build>${items.join("")}</build></model>`;
  const settings = `<?xml version="1.0" encoding="UTF-8"?>
<config>${config.join("")}</config>`;
  return zipSync({
    "[Content_Types].xml": strToU8(CONTENT_TYPES),
    "_rels/.rels": strToU8(RELS),
    "3D/3dmodel.model": strToU8(model),
    "Metadata/model_settings.config": strToU8(settings),
    ...(pauses.length ? { "Metadata/custom_gcode_per_layer.xml": strToU8(pauseXml(pauses)) } : {}),
  });
}

/** Formato do Bambu Studio / OrcaSlicer: type 1 = pausa (M400 U1 no firmware Bambu). */
function pauseXml(pauses: number[]): string {
  const layers = pauses.map((z) => `<layer top_z="${num(z)}" type="1" extruder="1" color="" extra="" gcode="M400 U1"/>`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<custom_gcodes_per_layer>
<plate>
<plate_info id="1"/>
${layers}
<mode value="SingleExtruder"/>
</plate>
</custom_gcodes_per_layer>
`;
}
