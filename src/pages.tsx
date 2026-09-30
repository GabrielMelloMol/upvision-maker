import { Award, Bot, Calculator as CalcIcon, Cookie, Cylinder, KeyRound, Layers, House, ImageUp, Package, Palette, Printer, Settings, ShoppingBag, Users, Building2, ClipboardList, FileText, LayoutDashboard, LineChart, Receipt, QrCode as QrIcon, Split } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Boxes, Braces, ChartNoAxesColumn, Globe, Grid3x3, Shapes, Sparkle, Sun, Tag, Wallet } from "lucide-react";
import { lazy, type ReactNode } from "react";
import Home from "./pages/Home";

// Cada página vira um chunk próprio: a abertura do app não carrega OpenSCAD, MediaPipe etc.
const Create = lazy(() => import("./pages/Create"));
const Calculator = lazy(() => import("./pages/Calculator"));
const Products = lazy(() => import("./pages/Products"));
const Customers = lazy(() => import("./pages/Customers"));
const Orders = lazy(() => import("./pages/Orders"));
const Quotes = lazy(() => import("./pages/Quotes"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Finance = lazy(() => import("./pages/Finance"));
const Costs = lazy(() => import("./pages/Costs"));
const Company = lazy(() => import("./pages/Company"));
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
const QrCode = lazy(() => import("./tools/QrCode"));
const Models = lazy(() => import("./tools/Models"));
const SpoolLabels = lazy(() => import("./tools/SpoolLabels"));
const Lithophane = lazy(() => import("./tools/Lithophane"));
const ColorSplit = lazy(() => import("./tools/ColorSplit"));
const ModelSearch = lazy(() => import("./tools/ModelSearch"));
const ScadCustomizer = lazy(() => import("./tools/ScadCustomizer"));
const PixelArt = lazy(() => import("./tools/PixelArt"));

export type Go = (pageId: string) => void;

/** Seções da barra lateral (#139): poucas portas de entrada; as telas de cada uma aparecem só quando ela está aberta. */
export type SectionId = "home" | "create" | "sell" | "stock" | "results" | "settings";
export type SectionDef = { id: SectionId; label: string; icon: LucideIcon; /** tela que abre ao clicar na seção */ landing: string };
export const SECTIONS: SectionDef[] = [
  { id: "home", label: "Início", icon: House, landing: "home" },
  { id: "create", label: "Criar", icon: Sparkle, landing: "create" },
  { id: "sell", label: "Vender", icon: Wallet, landing: "orders" },
  { id: "stock", label: "Estoque", icon: Boxes, landing: "filaments" },
  { id: "results", label: "Resultados", icon: ChartNoAxesColumn, landing: "dashboard" },
  { id: "settings", label: "Ajustes", icon: Settings, landing: "preferences" },
];
export type PageDef = {
  id: string;
  label: string;
  group: "" | "Ferramentas" | "Gestão" | "Preferências";
  section: SectionId;
  icon: LucideIcon;
  /** Frase curta do card na tela inicial. */
  blurb?: string;
  /** Só aparece no `npm run dev` / `tauri dev` (página interna de manutenção). */
  devOnly?: boolean;
  render: (go: Go) => ReactNode;
};

const ALL: PageDef[] = [
  { id: "home", section: "home", label: "Início", group: "", icon: House, render: (go) => <Home go={go} /> },
  { id: "create", section: "create", label: "Criar", group: "", icon: Sparkle, render: (go) => <Create go={go} /> },
  { id: "svg", section: "create", label: "Imagem → SVG", group: "Ferramentas", icon: ImageUp, blurb: "Vetoriza logo ou desenho em 1 a 4 cores, em mm.", render: (go) => <ImageToSvg go={go} /> },
  { id: "cutter", section: "create", label: "Cortador de biscoito", group: "Ferramentas", icon: Cookie, blurb: "Lâmina + carimbo a partir do desenho.", render: () => <CookieCutter /> },
  { id: "keychain", section: "create", label: "Chaveiros", group: "Ferramentas", icon: KeyRound, blurb: "Nome + logo em 2 cores, também em lote.", render: () => <Keychain /> },
  { id: "medal", section: "create", label: "Medalhas", group: "Ferramentas", icon: Award, blurb: "Formato, texto, imagem e alça para fita.", render: () => <Medal /> },
  { id: "extrude", section: "create", label: "Extrusão 3D", group: "Ferramentas", icon: Layers, blurb: "SVG vira peça em STL/3MF, com base opcional.", render: () => <Extrude /> },
  { id: "qr", section: "create", label: "QR Code e Pix", group: "Ferramentas", icon: QrIcon, blurb: "Pix com valor, link ou Wi-Fi; SVG e 3MF em 2 cores.", render: () => <QrCode /> },
  { id: "models", section: "create", label: "Modelos prontos", group: "Ferramentas", icon: Shapes, blurb: "Placa Pix, topo de bolo, carimbo, troféu, chaveiro NFC…", render: () => <Models /> },
  { id: "spools", section: "create", label: "Etiquetas de rolo", group: "Ferramentas", icon: Tag, blurb: "QR por rolo: baixa de gramas lendo a etiqueta.", render: () => <SpoolLabels /> },
  { id: "lithophane", section: "create", label: "Litofania e quadro", group: "Ferramentas", icon: Sun, blurb: "Foto em relevo: litofania ou quadro por camadas.", render: () => <Lithophane /> },
  { id: "pixel", section: "create", label: "Pixel art", group: "Ferramentas", icon: Grid3x3, blurb: "Imagem em pixels nas cores dos filamentos: mosaico, quebra-cabeça ou ímã.", render: () => <PixelArt /> },
  { id: "colorsplit", section: "create", label: "Separar 3MF por cor", group: "Ferramentas", icon: Split, blurb: "3MF pintado vira uma peça por cor.", render: () => <ColorSplit /> },
  { id: "scad", section: "create", label: "OpenSCAD personalizável", group: "Ferramentas", icon: Braces, blurb: "Arquivo .scad do Customizer vira formulário e 3MF.", render: () => <ScadCustomizer /> },
  { id: "search3d", section: "create", label: "Buscar modelos", group: "Ferramentas", icon: Globe, blurb: "Printables, MakerWorld, Thingiverse, Cults3D e Thangs; licenças.", render: (go) => <ModelSearch go={go} /> },
  { id: "ai", section: "create", label: "Pedir à IA", group: "Ferramentas", icon: Bot, blurb: "Descreva a peça e o Claude modela (pago por uso).", render: (go) => <AskAI go={go} /> },
  { id: "dashboard", section: "results", label: "Painel", group: "Gestão", icon: LayoutDashboard, blurb: "Prazos, estoque acabando e resultado do mês.", render: (go) => <Dashboard go={go} /> },
  { id: "orders", section: "sell", label: "Pedidos", group: "Gestão", icon: ClipboardList, blurb: "Quadro por status, prazos e baixa de estoque.", render: () => <Orders /> },
  { id: "quotes", section: "sell", label: "Orçamentos", group: "Gestão", icon: FileText, blurb: "PDF com QR Pix, consignação e catálogo.", render: (go) => <Quotes go={go} /> },
  { id: "finance", section: "results", label: "Financeiro", group: "Gestão", icon: LineChart, blurb: "Receita, lucro, R$/hora e gráficos.", render: () => <Finance /> },
  { id: "costs", section: "results", label: "Custos operacionais", group: "Gestão", icon: Receipt, blurb: "Aluguel, impostos, parcelas…", render: () => <Costs /> },
  { id: "calculator", section: "sell", label: "Calculadora", group: "Gestão", icon: CalcIcon, blurb: "Custo e preço por canal de venda.", render: (go) => <Calculator go={go} /> },
  { id: "customers", section: "sell", label: "Clientes", group: "Gestão", icon: Users, blurb: "Contatos, endereço e desconto padrão.", render: () => <Customers /> },
  { id: "products", section: "sell", label: "Produtos", group: "Gestão", icon: ShoppingBag, blurb: "Composição, fotos, kits e estoque pronto.", render: () => <Products /> },
  { id: "filaments", section: "stock", label: "Filamentos", group: "Gestão", icon: Cylinder, blurb: "Estoque, mínimo e custo médio.", render: () => <Filaments /> },
  { id: "materials", section: "stock", label: "Materiais extras", group: "Gestão", icon: Package, blurb: "Embalagens, argolas, ímãs…", render: () => <Materials /> },
  { id: "printers", section: "stock", label: "Impressoras", group: "Gestão", icon: Printer, blurb: "Potência para o custo de energia.", render: () => <Printers /> },
  { id: "company", section: "settings", label: "Dados da empresa", group: "Preferências", icon: Building2, render: () => <Company /> },
  { id: "preferences", section: "settings", label: "Preferências", group: "Preferências", icon: Settings, render: () => <Preferences /> },
  { id: "design", section: "settings", label: "Design (interno)", group: "Preferências", icon: Palette, devOnly: true, render: () => <DesignCatalog /> },
];

export const PAGES = ALL.filter((p) => !p.devOnly || import.meta.env.DEV);
