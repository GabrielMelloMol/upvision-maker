import { unzipSync } from "fflate";

/** Teto da soma do que se descompacta de um arquivo importado (3MF, planilha): acima disso, recusa (B27). */
export const unzipLimits = { total: 256 * 1024 * 1024 };

export class ZipTooBig extends Error {}

/**
 * Abre um .zip (3MF, xlsx) recusando o que descompactaria para além do teto. Um zip pequeno pode guardar vários GB
 * de zeros ("zip bomb") e travar a janela por falta de memória; o tamanho original de cada entrada vem do cabeçalho,
 * então a conta é feita antes de descompactar qualquer coisa. `accept` escolhe as entradas que importam (as outras
 * nem contam).
 */
export function safeUnzip(bytes: Uint8Array, accept: (file: { name: string; originalSize: number }) => boolean = () => true): Record<string, Uint8Array> {
  let total = 0;
  return unzipSync(bytes, {
    filter: (f) => {
      if (!accept(f)) return false;
      total += f.originalSize;
      if (total > unzipLimits.total) throw new ZipTooBig(`Este arquivo é grande demais para abrir com segurança (passa de ${Math.round(unzipLimits.total / 1024 / 1024)} MB descompactado).`);
      return true;
    },
  });
}
