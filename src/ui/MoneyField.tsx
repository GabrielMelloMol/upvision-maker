import { formatMoneyInput, parseMoney } from "./parse";
import SmartField, { type SmartFieldProps } from "./SmartField";

type Props = Omit<SmartFieldProps, "parse" | "invalidText" | "prefix" | "formatOnBlur">;

/** Valor em R$: aceita "15,9", "1.234,56" ou "R$ 15"; ao sair do campo formata com 2 casas. O pai lê com parseMoney(). */
export default function MoneyField(p: Props) {
  return (
    <SmartField inputMode="decimal" placeholder="0,00" autoComplete="off" {...p} prefix="R$" parse={parseMoney} formatOnBlur={formatMoneyInput} invalidText="Digite um valor, ex.: 15,90." />
  );
}
