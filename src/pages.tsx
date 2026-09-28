import { Calculator as CalcIcon, Cylinder, House, Package, Printer, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Calculator from "./pages/Calculator";
import Filaments from "./pages/Filaments";
import Home from "./pages/Home";
import Materials from "./pages/Materials";
import Preferences from "./pages/Preferences";
import Printers from "./pages/Printers";

export type Go = (pageId: string) => void;
export type PageDef = {
  id: string;
  label: string;
  group: "" | "Ferramentas" | "Gestão" | "Preferências";
  icon: LucideIcon;
  /** Frase curta do card na tela inicial. */
  blurb?: string;
  render: (go: Go) => ReactNode;
};

export const PAGES: PageDef[] = [
  { id: "home", label: "Início", group: "", icon: House, render: (go) => <Home go={go} /> },
  { id: "calculator", label: "Calculadora", group: "Gestão", icon: CalcIcon, blurb: "Custo e preço por canal de venda.", render: () => <Calculator /> },
  { id: "filaments", label: "Filamentos", group: "Gestão", icon: Cylinder, blurb: "Estoque, mínimo e custo médio.", render: () => <Filaments /> },
  { id: "materials", label: "Materiais extras", group: "Gestão", icon: Package, blurb: "Embalagens, argolas, ímãs…", render: () => <Materials /> },
  { id: "printers", label: "Impressoras", group: "Gestão", icon: Printer, blurb: "Potência para o custo de energia.", render: () => <Printers /> },
  { id: "preferences", label: "Preferências", group: "Preferências", icon: Settings, render: () => <Preferences /> },
];
