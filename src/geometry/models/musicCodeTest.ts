import { linkPayload } from "../../domain/qr";
import type { ManifoldToplevel } from "../manifold";
import { toMesh } from "../mesh";
import { readTopView } from "../qrScan";
import { qrShape } from "./musicCode";

const MARGIN_MODULES = 4; // margem clara da norma em volta do código, na imagem do teste
const RELIEF_MM = 1;

/** Testa a leitura da vista de cima do QR (o mesmo leitor da ferramenta QR Code): `ok` se lê o mesmo link. */
export function testQrReading(M: ManifoldToplevel, link: string, widthMm: number): { ok: boolean; read: string | null } {
  const shape = qrShape(M, link, widthMm);
  const solid = shape.cs.extrude(RELIEF_MM);
  try {
    const read = readTopView(M, toMesh(solid), widthMm + 2 * MARGIN_MODULES * shape.featureMm);
    return { ok: read === linkPayload(link), read };
  } finally {
    solid.delete();
    shape.cs.delete();
  }
}
