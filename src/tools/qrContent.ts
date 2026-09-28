import { pixPayload } from "../domain/pix";
import { linkPayload, wifiPayload, type WifiInput } from "../domain/qr";
import { parseMoney } from "../ui/parse";

export type QrMode = "pix" | "link" | "wifi" | "text";
export type QrForm = {
  pix: { key: string; name: string; city: string; amount: string; txid: string };
  link: string;
  wifi: WifiInput;
  text: string;
};

export const EMPTY_QR_FORM: QrForm = {
  pix: { key: "", name: "", city: "", amount: "", txid: "" },
  link: "",
  wifi: { ssid: "", password: "", security: "WPA" },
  text: "",
};

/** Texto do QR para o modo escolhido; `error` explica o que falta, sem lançar. */
export function qrContent(mode: QrMode, f: QrForm): { text: string | null; error: string | null } {
  try {
    if (mode === "pix") {
      const amount = f.pix.amount.trim() ? parseMoney(f.pix.amount) : undefined;
      if (amount !== undefined && !Number.isFinite(amount)) return { text: null, error: "Valor do Pix inválido. Ex.: 25,00" };
      return { text: pixPayload({ key: f.pix.key, name: f.pix.name, city: f.pix.city, amount, txid: f.pix.txid.trim() || undefined }), error: null };
    }
    if (mode === "link") return { text: linkPayload(f.link), error: null };
    if (mode === "wifi") return { text: wifiPayload(f.wifi), error: null };
    return f.text.trim() ? { text: f.text, error: null } : { text: null, error: "Digite o texto do QR Code." };
  } catch (e) {
    return { text: null, error: e instanceof Error ? e.message : String(e) };
  }
}
