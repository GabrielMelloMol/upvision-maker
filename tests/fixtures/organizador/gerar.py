"""Foto realista de teste do Organizador pela foto (#169).

Folha A4 numa mesa de madeira, 3 ferramentas (prismas de altura conhecida) fotografadas por um celular com zoom 2x
(48 mm equivalentes) a ~55 cm, com inclinação, rotação, distorção de barril, sombra suave, luz irregular, vinheta,
ruído de sensor, desfoque leve e JPEG. Grava a verdade (medidas da base de cada ferramenta) em verdade.json.
uso: python3 gerar.py <saida.jpg> [--sem-exif] [--inclinacao GRAUS] [--sombra FORCA]
"""
import json
import math
import sys

import cv2
import numpy as np
from PIL import Image

args = sys.argv[1:]
OUT = args[0]
EXIF = "--sem-exif" not in args
TILT = float(args[args.index("--inclinacao") + 1]) if "--inclinacao" in args else 9.0
SHADOW = float(args[args.index("--sombra") + 1]) if "--sombra" in args else 0.55

W, H = 4032, 3024          # 12 MP, paisagem
SS = 2                     # supersample
F35 = 48                   # zoom 2x
f_px = F35 * math.hypot(W, H) / 43.27
rng = np.random.default_rng(169)

# ---------- cena (mm): folha A4 retrato, origem num canto, z para cima ----------
SHEET = (210.0, 297.0)


def rounded_rect(cx, cy, length, width, n=10):
    """Retângulo com pontas arredondadas, comprido em y."""
    r = width / 2
    pts = []
    for k in range(n + 1):
        a = math.pi + math.pi * k / n
        pts.append((cx + r * math.cos(a), cy + length / 2 - r - r * math.sin(a)))
    for k in range(n + 1):
        a = math.pi * k / n
        pts.append((cx + r * math.cos(a), cy - length / 2 + r - r * math.sin(a)))
    return pts


def circle(cx, cy, r, n=48):
    return [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


# chave de fenda: cabo 100×28 + haste 82×7 com ponta → 182 × 28
screwdriver = rounded_rect(30, 205, 100, 28)
shaft = [(26.5, 155), (33.5, 155), (33.5, 79), (32, 73), (28, 73), (26.5, 79)]
# chave de boca: barra 124×15 girada 30° com cabeças de 34 e 28 mm
def wrench():
    body = [(-62, -7.5), (62, -7.5), (62, 7.5), (-62, 7.5)]
    a = math.radians(30)
    rot = lambda p: (125 + p[0] * math.cos(a) - p[1] * math.sin(a), 95 + p[0] * math.sin(a) + p[1] * math.cos(a))
    return [rot(p) for p in body], [[rot((x - 62, y)) for x, y in circle(0, 0, 17)], [rot((x + 62, y)) for x, y in circle(0, 0, 14)]]
# argola (tesoura/chaveiro): anel de 46 mm com furo de 26 mm e cabo 60×12
ring_outer = circle(140, 235, 23)
ring_hole = circle(140, 235, 13)
ring_tail = [(134, 215), (146, 215), (146, 160), (134, 160)]

TOOLS = [
    {"nome": "chave de fenda", "partes": [screwdriver, shaft], "furos": [], "h": 9, "tom": 40},
    {"nome": "chave de boca", "partes": [wrench()[0], *wrench()[1]], "furos": [], "h": 6, "tom": 95},
    {"nome": "argola com cabo", "partes": [ring_outer, ring_tail], "furos": [ring_hole], "h": 8, "tom": 60},
]


# ---------- câmera ----------
def look_at(eye, target, roll_deg):
    f = np.array(target, float) - eye
    f /= np.linalg.norm(f)
    r = np.cross(f, [0, 1, 0]); r /= np.linalg.norm(r)
    d = np.cross(f, r)
    a = math.radians(roll_deg)
    r, d = r * math.cos(a) + d * math.sin(a), d * math.cos(a) - r * math.sin(a)
    return np.stack([r, d, f])


center = np.array([105.0, 148.5, 0.0])
dist = 560.0
t = math.radians(TILT)
eye = center + np.array([dist * math.sin(t) * 0.6, -dist * math.sin(t) * 0.8, dist * math.cos(t)])
R = look_at(eye, center + [6, -4, 0], roll_deg=96)  # folha em pé na foto deitada: gira ~90°, mais 6° tortos


def project(p3):
    q = R @ (np.asarray(p3, float) - eye)
    return (f_px * q[0] / q[2] + W / 2, f_px * q[1] / q[2] + H / 2)


def proj_poly(poly, z):
    return np.array([project((x, y, z)) for x, y in poly]) * SS


# ---------- render ----------
Wb, Hb = W * SS, H * SS
img = np.zeros((Hb, Wb, 3), np.float32)
# mesa de madeira: veios + ruído grosso
yy, xx = np.mgrid[0:Hb, 0:Wb].astype(np.float32)
grain = 0.5 + 0.5 * np.sin((xx * 0.004 + np.sin(yy * 0.0012) * 3) * 6)
coarse = cv2.resize(rng.normal(0, 1, (Hb // 64, Wb // 64)).astype(np.float32), (Wb, Hb), interpolation=cv2.INTER_CUBIC)
wood = 0.42 + 0.06 * grain + 0.03 * coarse
img[..., 0], img[..., 1], img[..., 2] = wood * 0.62, wood * 0.82, wood * 1.0  # BGR, tom castanho
# folha
sheet_px = proj_poly([(0, 0), (SHEET[0], 0), SHEET, (0, SHEET[1])], 0)
sheet_mask = np.zeros((Hb, Wb), np.uint8)
cv2.fillPoly(sheet_mask, [np.round(sheet_px).astype(np.int32)], 255, lineType=cv2.LINE_AA)
paper = 0.93 + 0.01 * rng.normal(0, 1, (Hb, Wb)).astype(np.float32)
sm = sheet_mask.astype(np.float32)[..., None] / 255
img = img * (1 - sm) + np.stack([paper * 0.97, paper * 0.98, paper], -1) * sm

# sombra: luz alta vinda da janela à esquerda e de trás → base empurrada h·k para a direita e para frente, desfocada
light = np.array([0.55, -0.35])
shadow = np.zeros((Hb, Wb), np.float32)
for tool in TOOLS:
    for part in tool["partes"]:
        off = [(x + light[0] * tool["h"] * 1.6, y + light[1] * tool["h"] * 1.6) for x, y in part]
        cv2.fillPoly(shadow, [np.round(proj_poly(off, 0)).astype(np.int32)], 1.0, lineType=cv2.LINE_AA)
    for hole in tool["furos"]:  # a luz passa pelo furo
        off = [(x + light[0] * tool["h"] * 1.6, y + light[1] * tool["h"] * 1.6) for x, y in hole]
        cv2.fillPoly(shadow, [np.round(proj_poly(off, 0)).astype(np.int32)], 0.0, lineType=cv2.LINE_AA)
shadow = cv2.GaussianBlur(shadow, (0, 0), 9 * SS)
img *= (1 - SHADOW * shadow)[..., None]


# ferramentas: prisma = base, topo e paredes (o que a câmera vê da peça de altura h)
def prism_mask(parts, holes, h):
    m = np.zeros((Hb, Wb), np.uint8)
    for part in parts:
        b, top = proj_poly(part, 0), proj_poly(part, h)
        for poly in (b, top):
            cv2.fillPoly(m, [np.round(poly).astype(np.int32)], 255, lineType=cv2.LINE_AA)
        for i in range(len(part)):
            j = (i + 1) % len(part)
            quad = np.array([b[i], b[j], top[j], top[i]])
            cv2.fillConvexPoly(m, np.round(quad).astype(np.int32), 255, lineType=cv2.LINE_AA)
    for hole in holes:  # o furo visto de cima: interseção do furo da base e do topo
        hb = np.zeros_like(m); ht = np.zeros_like(m)
        cv2.fillPoly(hb, [np.round(proj_poly(hole, 0)).astype(np.int32)], 255, lineType=cv2.LINE_AA)
        cv2.fillPoly(ht, [np.round(proj_poly(hole, h)).astype(np.int32)], 255, lineType=cv2.LINE_AA)
        m = np.minimum(m, 255 - np.minimum(hb, ht))
    return m


for tool in TOOLS:
    m = prism_mask(tool["partes"], tool["furos"], tool["h"]).astype(np.float32)[..., None] / 255
    tone = tool["tom"] / 255
    metal = tone + 0.05 * np.sin(xx * 0.01 + yy * 0.006)[..., None] + 0.02 * coarse[..., None]  # brilho do metal
    img = img * (1 - m) + metal * m

# luz irregular (janela à esquerda) e vinheta
gx = (xx / Wb - 0.2)
img *= (1.0 - 0.18 * gx)[..., None]
r2 = ((xx - Wb / 2) / (Wb / 2)) ** 2 + ((yy - Hb / 2) / (Hb / 2)) ** 2
img *= (1 - 0.12 * r2)[..., None]
del xx, yy, grain, coarse, paper, shadow, r2

img = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA)
# distorção de barril leve (k1 = -0,03 na borda)
K1 = -0.03
ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
nx, ny = (xs - W / 2) / (W / 2), (ys - H / 2) / (W / 2)
rr = nx * nx + ny * ny
scale = 1 + K1 * rr
mapx = (nx * scale) * (W / 2) + W / 2
mapy = (ny * scale) * (W / 2) + H / 2
img = cv2.remap(img, mapx, mapy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
# desfoque leve, ruído do sensor (com cor), JPEG
img = cv2.GaussianBlur(img, (0, 0), 0.9)
img += rng.normal(0, 0.018, img.shape).astype(np.float32)
img = np.clip(img * 255, 0, 255).astype(np.uint8)
rgb = Image.fromarray(img[..., ::-1])
exif = Image.Exif()
if EXIF:
    exif[0x010F] = "Apple"
    exif[0x0110] = "iPhone (teste)"
    exif[0x8769] = {0xA405: F35, 0x920A: (int(F35 * 10 / 7.0), 10)}  # FocalLengthIn35mmFilm
rgb.save(OUT, quality=85, exif=exif.tobytes() if EXIF else b"")

# verdade: menor retângulo da base de cada ferramenta (mm), com 50 px/mm
truth = []
for tool in TOOLS:
    m = np.zeros((int(SHEET[1] * 50), int(SHEET[0] * 50)), np.uint8)
    for part in tool["partes"]:
        cv2.fillPoly(m, [np.round(np.array(part) * 50).astype(np.int32)], 255)
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    (_, _), (a, b), _ = cv2.minAreaRect(np.vstack(cnts))
    truth.append({"nome": tool["nome"], "comprimento": round(max(a, b) / 50, 1), "largura": round(min(a, b) / 50, 1), "altura": tool["h"]})
json.dump({"foto": OUT, "exif_focal35": F35 if EXIF else None, "inclinacao": TILT, "distancia_mm": dist, "ferramentas": truth}, open(OUT.rsplit(".", 1)[0] + "-verdade.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(truth, ensure_ascii=False))
