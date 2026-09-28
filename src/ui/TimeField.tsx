import { formatDuration, parseDuration } from "./parse";
import SmartField, { type SmartFieldProps } from "./SmartField";

type Props = Omit<SmartFieldProps, "parse" | "preview" | "invalidText"> & { /** Unidade de um número solto. */ bare?: "h" | "min" };

/** Tempo num campo só: "3h20", "3:20", "200 min" ou "3" (horas). O pai lê com parseDuration(). */
export default function TimeField({ bare = "h", hint = "Ex.: 3h20, 3:20 ou 200 min", ...p }: Props) {
  return (
    <SmartField
      inputMode="text"
      placeholder="3h20"
      autoComplete="off"
      {...p}
      hint={hint}
      parse={(t) => parseDuration(t, bare)}
      preview={(m) => `${formatDuration(m)}${m >= 60 ? ` (${m} min)` : ""}`}
      invalidText="Não entendi o tempo. Use 3h20, 3:20 ou 200 min."
    />
  );
}
