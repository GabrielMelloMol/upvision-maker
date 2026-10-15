// Gera os ícones do app a partir da marca nova (favicon.svg, igual ao ícone do site): `node scripts/brand-icons.mjs`.
// Ícone azul do site. macOS: squircle contínuo no grid da Apple (824 de 1024), sem sombra desenhada: o sistema põe a dela (HIG). Windows: placa
// com cantos transparentes; 16/24/32 px usam o favicon da marca (só pilha e fio), que lê de longe.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const ICONS = "src-tauri/icons";
const favicon = readFileSync("src/assets/brand/favicon.svg", "utf8");
const BLUE = "#0244e6", NIGHT = "#0b1f66";
// o ícone do site (viewBox 32): pilha branca + fio laranja; o fundo azul fica por conta da placa de cada plataforma
const STACK = '<g fill="#fff"><path d="M5 18.2L16 23.7L27 18.2V21.6L16 27.1L5 21.6Z"/><path d="M5 12.8L16 18.3L27 12.8V16.2L16 21.7L5 16.2Z"/></g>';
const FILAMENT = '<path d="M16 5.6L25.4 10.3L16 15L6.6 10.3Z" fill="none" stroke="#f85a00" stroke-width="2.6" stroke-linejoin="round"/>';

/** Superelipse (n = 5) centrada em c com raio r: o "canto contínuo" dos ícones da Apple. */
function squircle(c, r, n = 5, steps = 256) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const cos = Math.cos(t), sin = Math.sin(t);
    const x = c + r * Math.sign(cos) * Math.abs(cos) ** (2 / n);
    const y = c + r * Math.sign(sin) * Math.abs(sin) ** (2 / n);
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

const plate = `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1558f2"/><stop offset="1" stop-color="${BLUE}"/></linearGradient>`;
/** O desenho de 32 unidades ocupando `span` px, centrado em `size`. */
const place = (size, span, inner) => `<g transform="translate(${(size - span) / 2} ${(size - span) / 2}) scale(${span / 32})">${inner}</g>`;

const macSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>${plate}</defs>
  <path d="${squircle(512, 412)}" fill="url(#bg)"/>${place(1024, 824, STACK + FILAMENT)}</svg>`;

const winSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>${plate}</defs>
  <path d="${squircle(512, 500)}" fill="url(#bg)"/>${place(1024, 1000, STACK + FILAMENT)}</svg>`;

const browser = await chromium.launch();
async function png(svg, size) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
  const out = await page.screenshot({ omitBackground: true });
  await page.close();
  return out;
}

/** .ico com PNGs dentro (Windows Vista+), um por tamanho. */
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.data)]);
}

writeFileSync(`${ICONS}/app-icon.png`, await png(macSvg, 1024));
execFileSync("npx", ["tauri", "icon", `${ICONS}/app-icon.png`, "-o", ICONS], { stdio: "inherit" });
for (const extra of ["android", "ios", "64x64.png"]) rmSync(`${ICONS}/${extra}`, { recursive: true, force: true }); // o app é só desktop
const images = [];
for (const size of [16, 24, 32]) images.push({ size, data: await png(favicon, size) });
for (const size of [48, 64, 256]) images.push({ size, data: await png(winSvg, size) });
writeFileSync(`${ICONS}/icon.ico`, ico(images));
writeFileSync(`${ICONS}/32x32.png`, images[2].data);

// macOS 26+ (#138): camadas no formato do Icon Composer, compiladas para Assets.car (só no Mac, com o Xcode)
if (process.platform === "darwin") {
  const dir = `${ICONS}/AppIcon.icon`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(`${dir}/Assets`, { recursive: true });
  const body = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${place(1024, 824, inner)}</svg>\n`;
  writeFileSync(`${dir}/Assets/stack.svg`, body(STACK));
  writeFileSync(`${dir}/Assets/filament.svg`, body(FILAMENT));
  const group = (name, layer, extra = {}) => ({ name, layers: [{ "image-name": `${layer}.svg`, name: layer, ...extra }], shadow: { kind: "neutral", opacity: 0.4 } });
  const icon = {
    // o fundo muda com a aparência do sistema (claro/escuro; a tinted o sistema tinge a partir das camadas); a escura vai JUNTO com a base
    "fill-specializations": [{ value: { "automatic-gradient": "srgb:0.00784,0.26667,0.90196,1.00000" } }, { appearance: "dark", value: { "automatic-gradient": "srgb:0.04314,0.12157,0.40000,1.00000" } }],
    groups: [group("Filamento", "filament"), group("Pilha", "stack", { glass: true })],
    "supported-platforms": { squares: ["macOS"] },
  };
  writeFileSync(`${dir}/icon.json`, JSON.stringify(icon, null, 2));
  const out = mkdtempSync(join(tmpdir(), "appicon-"));
  execFileSync("xcrun", ["actool", dir, "--compile", out, "--platform", "macosx", "--minimum-deployment-target", "11.0", "--app-icon", "AppIcon", "--output-partial-info-plist", join(out, "partial.plist")], { stdio: "ignore" });
  copyFileSync(join(out, "Assets.car"), `${ICONS}/Assets.car`);
}
await browser.close();
