import { formatMass, parseMass } from "./parse";
import SmartField, { type SmartFieldProps } from "./SmartField";

type Props = Omit<SmartFieldProps, "parse" | "preview" | "invalidText"> & { spoolG?: number };

/** Gramas, quilos ou rolos: "850", "1,2 kg", "2 rolos" (usa o peso do rolo). O pai lê com parseMass(). */
export default function MassField({ spoolG = 1000, hint = "Em gramas, kg ou rolos (ex.: 2 rolos)", ...p }: Props) {
  return (
    <SmartField
      inputMode="text"
      autoComplete="off"
      {...p}
      hint={hint}
      parse={(s) => parseMass(s, spoolG)}
      preview={(g) => formatMass(g, spoolG)}
      invalidText="Use gramas (850), kg (1,2 kg) ou rolos (2 rolos)."
    />
  );
}
