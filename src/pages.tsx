import { Award, Bot, Calculator as CalcIcon, Cookie, Cylinder, KeyRound, Layers, House, ImageUp, Package, Palette, Printer, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { lazy, type ReactNode } from "react";
import Home from "./pages/Home";

// Cada página vira um chunk próprio: a abertura do app não carrega OpenSCAD, MediaPipe etc.
const Calculator = lazy(() => import("./pages/Calculator"));
const Filaments = lazy(() => import("./pages/Filaments"));
const Materials = lazy(() => import("./pages/Materials"));
const Preferences = lazy(() => import("./pages/Preferences"));
const Printers = lazy(() => import("./pages/Printers"));
const DesignCatalog = lazy(() => import("./pages/DesignCatalog"));
const AskAI = lazy(() => import("./tools/AskAI"));
const CookieCutter = lazy(() => import("./tools/CookieCutter"));
const Extrude = lazy(() => import("./tools/Extrude"));
const Keychain = lazy(() => import("./tools/Keychain"));
const Medal = lazy(() => import("./tools/Medal"));
const ImageToSvg = lazy(() => import("./tools/ImageToSvg"));

export type Go = (pageId: string) => void;
export type PageDef = {
  id: string;
  label: string;
  group: "" | "Ferramentas" | "Gestão" | "Preferências";
  icon: LucideIcon;
  /** Frase curta do card na tela inicial. */
  blurb?: string;
  /** Só aparece no `npm run dev` / `tauri dev` (página interna de manutenção). */
  devOnly?: boolean;
  render: (go: Go) => ReactNode;
};

const ALL: PageDef[] = [
  { id: "home", label: "Início", group: "", icon: House, render: (go) => <Home go={go} /> },
  { id: "svg", label: "Imagem → SVG", group: "Ferramentas", icon: ImageUp, blurb: "Vetoriza logo ou desenho em 1 cor, em mm.", render: (go) => <ImageToSvg go={go} /> },
  { id: "cutter", label: "Cortador de biscoito", group: "Ferramentas", icon: Cookie, blurb: "Lâmina + carimbo a partir do desenho.", render: () => <CookieCutter /> },
  { id: "keychain", label: "Chaveiros", group: "Ferramentas", icon: KeyRound, blurb: "Nome + logo em 2 cores, também em lote.", render: () => <Keychain /> },
  { id: "medal", label: "Medalhas", group: "Ferramentas", icon: Award, blurb: "Formato, texto, imagem e alça para fita.", render: () => <Medal /> },
  { id: "extrude", label: "Extrusão 3D", group: "Ferramentas", icon: Layers, blurb: "SVG vira peça em STL/3MF, com base opcional.", render: () => <Extrude /> },
  { id: "ai", label: "Pedir à IA", group: "Ferramentas", icon: Bot, blurb: "Descreva a peça e o Claude modela (pago por uso).", render: (go) => <AskAI go={go} /> },
  { id: "calculator", label: "Calculadora", group: "Gestão", icon: CalcIcon, blurb: "Custo e preço por canal de venda.", render: () => <Calculator /> },
  { id: "filaments", label: "Filamentos", group: "Gestão", icon: Cylinder, blurb: "Estoque, mínimo e custo médio.", render: () => <Filaments /> },
  { id: "materials", label: "Materiais extras", group: "Gestão", icon: Package, blurb: "Embalagens, argolas, ímãs…", render: () => <Materials /> },
  { id: "printers", label: "Impressoras", group: "Gestão", icon: Printer, blurb: "Potência para o custo de energia.", render: () => <Printers /> },
  { id: "preferences", label: "Preferências", group: "Preferências", icon: Settings, render: () => <Preferences /> },
  { id: "design", label: "Design (interno)", group: "Preferências", icon: Palette, devOnly: true, render: () => <DesignCatalog /> },
];

export const PAGES = ALL.filter((p) => !p.devOnly || import.meta.env.DEV);
