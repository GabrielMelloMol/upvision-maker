# Símbolo da UpVision (#138): python3 scripts/brand-mark.py → src/assets/brand/mark.svg (cor) e mark-mono.svg.
# Fonte: src/assets/brand/fontes/ (do site da UpVision). A pilha e a mesa são isométricas; a moldura, de frente.
import math, sys
INK = "currentColor"
C, N = math.cos(math.radians(30)), math.sin(math.radians(30))
CX, CY = 256, 306   # centro da pilha no desenho
K = 1.0

def iso(x, y, z):
    return (CX + (x - y) * C * K, CY + (x + y) * N * K - z * K)

def rsquare(half, r, steps=6):
    """Contorno de um quadrado arredondado (lado 2*half, raio r) no plano, anti-horário."""
    pts = []
    for cx, cy, a0 in [(half - r, half - r, 0), (-half + r, half - r, 90), (-half + r, -half + r, 180), (half - r, -half + r, 270)]:
        for k in range(steps + 1):
            a = math.radians(a0 + 90 * k / steps)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

def hull(pts):
    pts = sorted(set(pts))
    def cross(o, a, b): return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]

def d(pts): return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + " Z"

def slab(half, r, z0, z1, top, side, hole=None, hole_fill=None, cls="", top_op=1, side_op=1, line=None):
    """Bloco isométrico: lateral (casco das bordas de cima e de baixo) e tampo; com `hole`, o tampo é um anel."""
    ring = rsquare(half, r)
    t = [iso(x, y, z1) for x, y in ring]
    b = [iso(x, y, z0) for x, y in ring]
    out = f'<g class="{cls}"><path d="{d(hull(t + b))}" fill="{side}" opacity="{side_op}"/>'
    if hole:
        inner = [iso(x, y, z1) for x, y in rsquare(*hole)]
        out += f'<path d="{d(t)} {d(inner[::-1])}" fill="{top}" opacity="{top_op}" fill-rule="evenodd"/><path d="{d(inner)}" fill="{hole_fill}" opacity="{side_op}"/>'
    else:
        out += f'<path d="{d(t)}" fill="{top}" opacity="{top_op}"/>'
    if line:  # versão monocromática: contorno do tampo, para as camadas se separarem sobre qualquer fundo
        out += f'<path d="{d(t)}" fill="none" stroke="{line}" stroke-width="3" stroke-linejoin="round"/>'
    return out + "</g>"

def mark(mono=False):
    blue = ["#3AA0FF", "#2F7BFF", "#3B5BF0"]; blue_side = ["#1F6FE0", "#1D55D6", "#2A3FC4"]
    orange = ["#FF8A1F", "#FF6A1A"]; orange_side = ["#D9620F", "#C9500C"]
    if mono:
        blue = blue_side = orange = orange_side = None
    parts = []
    # moldura de frente: corpo, visor (em cima, ao centro) e botão (à esquerda)
    parts.append(f'<path d="M150 108h40a10 10 0 0 1 10 10v14h-60v-14a10 10 0 0 1 10-10z" fill="{INK}"/>')
    parts.append(f'<path d="M214 134l20-28a14 14 0 0 1 11.4-6h69.2a14 14 0 0 1 11.4 6l20 28z" fill="{INK}"/>')
    parts.append(f'<rect x="66" y="134" width="380" height="316" rx="64" fill="none" stroke="{INK}" stroke-width="34"/>')
    parts.append(f'<rect x="84" y="176" width="344" height="8" rx="4" fill="{INK}"/><rect x="84" y="192" width="344" height="8" rx="4" fill="{INK}"/>')
    # mesa isométrica e os 3 LEDs da frente
    if mono:
        parts.append(slab(88, 13, -28, -12, INK, INK, cls="bed", top_op=0.3, side_op=0.55))
    else:  # preta como na marca; no app o tema escuro troca por --mark-bed (grafite)
        parts.append(slab(88, 13, -28, -12, "var(--mark-bed-top, #3A3A3E)", "var(--mark-bed, #1D1D1F)", cls="bed"))
    for k in range(3):
        x, y = iso(88, 36 + k * 15, -20)
        parts.append(f'<circle class="bed" cx="{x:.1f}" cy="{y:.1f}" r="4" fill="{"#2F7BFF" if not mono else "currentColor"}" opacity="{1 if not mono else 0.45}"/>')
    # camadas de baixo para cima: laranja → azul; a de cima é um anel
    layers = [(orange[1], orange_side[1]), (orange[0], orange_side[0]), (blue[2], blue_side[2]), (blue[1], blue_side[1]), (blue[0], blue_side[0])] if not mono else [(None, None)] * 5
    z = -8
    for i, (top, side) in enumerate(layers):
        last = i == len(layers) - 1
        hole = (26, 8) if last else None
        if mono:
            g = slab(52, 15, z, z + 11, INK, INK, hole=hole, hole_fill=INK, cls=f"layer l{i}", top_op=0.12, side_op=0.4, line=INK)
        else:
            g = slab(52, 15, z, z + 11, top, side, hole=hole, hole_fill=blue_side[2] if last else None, cls=f"layer l{i}")
        parts.append(g)
        z += 13.5
    # carro do bico com o LED azul, na frente da pilha (o bico entra no anel de cima)
    parts.append(f'<rect x="224" y="158" width="64" height="56" rx="12" fill="{INK}"/>')
    parts.append(f'<rect x="240" y="198" width="32" height="7" rx="3.5" fill="{"#2F7BFF" if not mono else INK}" opacity="{1 if not mono else 0.45}"/>')
    parts.append(f'<path d="M245 214h22l-8.6 15a3 3 0 0 1-4.8 0z" fill="{INK}"/>')
    return parts

def svg(parts, extra=""):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 60 432 432" fill="currentColor">{extra}{"".join(parts)}</svg>\n'

if __name__ == "__main__" and "--icon" not in sys.argv:
    open(sys.argv[1] if len(sys.argv) > 1 else "src/assets/brand/mark.svg", "w").write(svg(mark()))
    open(sys.argv[2] if len(sys.argv) > 2 else "src/assets/brand/mark-mono.svg", "w").write(svg(mark(True)))


def icon_composer(out_dir):
    """Ícone do macOS 26+ (#138) no formato do Icon Composer: camadas separadas (moldura, mesa, pilha) para o
    sistema fazer as versões clara, escura e tingida com Liquid Glass. Compila com `xcrun actool` (ver brand-icons.mjs)."""
    import json, os, re
    parts = mark()
    groups = {"frame": [], "bed": [], "stack": []}
    for p in parts:
        key = "bed" if 'class="bed"' in p else "stack" if 'class="layer' in p else "frame"
        groups[key].append(p)
    # 1024 × 1024 com o desenho centrado no grid (mesma escala do ícone clássico)
    k = 1.8
    tx, ty = 512 - 256 * k, 512 - 283 * k
    os.makedirs(f"{out_dir}/Assets", exist_ok=True)
    for name, ps in groups.items():
        body = "".join(ps).replace("currentColor", "#1D1D1F")
        body = re.sub(r"var\(--mark-bed-top, (#[0-9A-Fa-f]+)\)", r"\1", body)
        body = re.sub(r"var\(--mark-bed, (#[0-9A-Fa-f]+)\)", r"\1", body)
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><g transform="translate({tx:.1f} {ty:.1f}) scale({k})">{body}</g></svg>\n'
        open(f"{out_dir}/Assets/{name}.svg", "w").write(svg)
    light = "srgb:0.11373,0.11373,0.12157,1.00000"   # #1D1D1F
    dark = "srgb:0.96078,0.96078,0.96863,1.00000"    # #F5F5F7
    icon = {
        # a versão escura vai em fill-specializations JUNTO com a base (só "fill" + especialização é ignorado)
        "fill-specializations": [{"value": {"automatic-gradient": "srgb:0.96863,0.97255,0.98039,1.00000"}},
                                 {"appearance": "dark", "value": {"automatic-gradient": "srgb:0.10980,0.10980,0.11765,1.00000"}}],
        "groups": [
            {"name": "Pilha", "layers": [{"image-name": "stack.svg", "name": "stack", "glass": True}], "shadow": {"kind": "layer-color", "opacity": 0.5}, "translucency": {"enabled": True, "value": 0.2}},
            {"name": "Mesa", "layers": [{"image-name": "bed.svg", "name": "bed"}], "shadow": {"kind": "neutral", "opacity": 0.4}},
            {"name": "Moldura", "layers": [{"image-name": "frame.svg", "name": "frame", "fill-specializations": [{"value": {"solid": light}}, {"appearance": "dark", "value": {"solid": dark}}]}],
             "shadow": {"kind": "neutral", "opacity": 0.4}},
        ],
        "supported-platforms": {"squares": ["macOS"]},
    }
    json.dump(icon, open(f"{out_dir}/icon.json", "w"), indent=2)


if __name__ == "__main__" and "--icon" in sys.argv:
    icon_composer(sys.argv[sys.argv.index("--icon") + 1])
