// Gera os ícones do app a partir da marca nova (src/assets/brand/simbolo.svg): `node scripts/brand-icons.mjs`.
// macOS: squircle contínuo no grid da Apple (824 de 1024), sem sombra desenhada: o sistema põe a dele (HIG). Windows: placa com cantos
// transparentes (aparece na barra de tarefas escura); 16/24/32 px usam o favicon da marca (azul, sem o pórtico), que lê de longe.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const INK = "#141a2e";
const ICONS = "src-tauri/icons";
const favicon = readFileSync("src/assets/brand/favicon.svg", "utf8");
const mark = readFileSync("src/assets/brand/simbolo.svg", "utf8")
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .replaceAll("var(--brand-ink,#141a2e)", INK);

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

const plate = `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#EEF1F7"/></linearGradient>`;
// o símbolo ocupa x 14–186 e y 9–191 do viewBox de 200: centro em (100, 100)
const placeMark = (size, scale) => `<g transform="translate(${size / 2 - 100 * scale} ${size / 2 - 100 * scale}) scale(${scale})">${mark}</g>`;

const macSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>${plate}</defs>
  <path d="${squircle(512, 412)}" fill="url(#bg)"/>${placeMark(1024, 3.1)}</svg>`;

const winSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>${plate}</defs>
  <path d="${squircle(512, 500)}" fill="url(#bg)" stroke="#D5DAE2" stroke-width="8"/>${placeMark(1024, 4.2)}</svg>`;

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
  const body = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${placeMark(1024, 3.1).replace(/>.*<\/g>$/s, `>${inner}</g>`)}</svg>\n`;
  const BLUE = '<g fill="#0244e6"><path d="M44 146L100 174L156 146V160L100 188L44 160Z"/><path d="M44 126L100 154L156 126V140L100 168L44 140Z"/><path d="M44 106L100 134L156 106V120L100 148L44 120Z"/></g>';
  const FILAMENT = '<path d="M100 64V78L142 99L100 120L58 99L86 85" fill="none" stroke="#f85a00" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>';
  const FRAME = `<path fill="${INK}" d="M30 170H52L92 190H14ZM148 170H170L186 190H108Z"/><rect x="14" y="18" width="172" height="12" rx="6" fill="${INK}"/><rect x="80" y="8" width="40" height="34" rx="7" fill="${INK}"/><path fill="${INK}" d="M86 46H114L105 62H95Z"/>`;
  writeFileSync(`${dir}/Assets/frame.svg`, body(FRAME));
  writeFileSync(`${dir}/Assets/stack.svg`, body(BLUE));
  writeFileSync(`${dir}/Assets/filament.svg`, body(FILAMENT));
  const light = "srgb:0.07843,0.10196,0.18039,1.00000"; // #141A2E
  const dark = "srgb:0.96078,0.96078,0.96863,1.00000"; // #F5F5F7
  const group = (name, layer, extra = {}) => ({ name, layers: [{ "image-name": `${layer}.svg`, name: layer, ...extra }], shadow: { kind: "neutral", opacity: 0.4 } });
  const icon = {
    // a versão escura vai em fill-specializations JUNTO com a base (só "fill" + especialização é ignorado)
    "fill-specializations": [{ value: { "automatic-gradient": "srgb:0.96863,0.97255,0.98039,1.00000" } }, { appearance: "dark", value: { "automatic-gradient": "srgb:0.07843,0.10196,0.18039,1.00000" } }],
    groups: [
      group("Filamento", "filament"),
      group("Pilha", "stack", { glass: true }),
      group("Moldura", "frame", { "fill-specializations": [{ value: { solid: light } }, { appearance: "dark", value: { solid: dark } }] }),
    ],
    "supported-platforms": { squares: ["macOS"] },
  };
  writeFileSync(`${dir}/icon.json`, JSON.stringify(icon, null, 2));
  const out = mkdtempSync(join(tmpdir(), "appicon-"));
  execFileSync("xcrun", ["actool", dir, "--compile", out, "--platform", "macosx", "--minimum-deployment-target", "11.0", "--app-icon", "AppIcon", "--output-partial-info-plist", join(out, "partial.plist")], { stdio: "ignore" });
  copyFileSync(join(out, "Assets.car"), `${ICONS}/Assets.car`);
}
await browser.close();
