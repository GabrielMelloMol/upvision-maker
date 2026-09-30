// Gera os ícones do app a partir de src/assets/brand/mark.svg (#138): `node scripts/brand-icons.mjs`.
// macOS: squircle contínuo no grid da Apple (824 de 1024, sombra suave). Windows: placa com cantos
// transparentes (aparece na barra de tarefas escura), e 16/24/32 px com um desenho simplificado.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const INK = "#1D1D1F";
const ICONS = "src-tauri/icons";
const mark = readFileSync("src/assets/brand/mark.svg", "utf8")
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .replaceAll("currentColor", INK);

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

const plate = `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#ECEFF4"/></linearGradient>`;
// o desenho ocupa x 38–474 e y 104–468 do viewBox 512: centro em (256, 286)
const placeMark = (size, scale) => `<g transform="translate(${size / 2 - 256 * scale} ${size / 2 - 286 * scale}) scale(${scale})">${mark}</g>`;

const macSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>${plate}
  <filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#000" flood-opacity="0.25"/></filter></defs>
  <path d="${squircle(512, 412)}" fill="url(#bg)" filter="url(#sh)"/>${placeMark(1024, 1.25)}</svg>`;

const winSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>${plate}</defs>
  <path d="${squircle(512, 500)}" fill="url(#bg)" stroke="#D5DAE2" stroke-width="8"/>${placeMark(1024, 1.6)}</svg>`;

// 16–32 px: sem trilho, bico e LEDs; moldura grossa e 3 camadas para ler de longe
const smallSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs>${plate}</defs>
  <path d="${squircle(16, 15.5)}" fill="url(#bg)" stroke="#C9CFD8" stroke-width="0.6"/>
  <rect x="12" y="6" width="8" height="4" rx="1.5" fill="${INK}"/>
  <rect x="5.5" y="9.5" width="21" height="16" rx="4.5" fill="none" stroke="${INK}" stroke-width="3"/>
  <rect x="10" y="12.5" width="12" height="2.6" rx="1" fill="#2F6BFF"/>
  <rect x="10" y="15.6" width="12" height="2.6" rx="1" fill="#5B4BF0"/>
  <rect x="10" y="18.7" width="12" height="2.6" rx="1" fill="#FF6A1A"/>
  <rect x="8.5" y="21.7" width="15" height="1.8" rx="0.9" fill="${INK}"/></svg>`;

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
for (const size of [16, 24, 32]) images.push({ size, data: await png(smallSvg, size) });
for (const size of [48, 64, 256]) images.push({ size, data: await png(winSvg, size) });
writeFileSync(`${ICONS}/icon.ico`, ico(images));
writeFileSync(`${ICONS}/32x32.png`, images[2].data);
await browser.close();
