/**
 * Contrato do Organizador pela foto (#169) entre a foto (Forja: foto → contornos em mm) e o 3D (Torno: contornos → peça).
 */
export type ToolOutline = {
  id: string;
  /** Contorno externo em mm, anti-horário, com a origem no canto da folha. */
  points: [number, number][];
  /** Furos de dentro da ferramenta (ex.: argola da tesoura), em mm. */
  holes?: [number, number][][];
  /** Altura da ferramenta deitada, se conhecida. */
  heightMm?: number;
  label?: string;
};

/** Tamanho da folha usada como régua (A4 = 210 × 297 mm). */
export type Sheet = { widthMm: number; heightMm: number };
