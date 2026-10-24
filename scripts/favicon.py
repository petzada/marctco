"""Gera o ícone da aba: um "m" preto grande sobre um quadrado branco de cantos arredondados.

O "m" é o contorno do glifo da Roboto Black (900), o mesmo do site e do og.png, então não
depende de fonte instalada. Saídas em public/: favicon.svg, favicon.ico (16/32/48) e
apple-touch-icon.png (180).
    uv run --with pillow --with fonttools --with brotli scripts/favicon.py
"""

import io
import pathlib

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
WOFF2 = ROOT / "node_modules/@fontsource/roboto/files/roboto-latin-900-normal.woff2"
PUBLIC = ROOT / "public"
INK, PAPER = "#0a0a0a", "#ffffff"

font = TTFont(WOFF2)
glyphs = font.getGlyphSet()
glyph = glyphs[font.getBestCmap()[ord("m")]]

# Caixa do glifo em unidades da fonte (y para cima)
bounds = BoundsPen(glyphs)
glyph.draw(bounds)
x0, y0, x1, y1 = bounds.bounds

# viewBox 64x64: o "m" ocupa ~80% da largura, centralizado, y invertido para o SVG
SIZE, MARGIN = 64, 6.5
scale = (SIZE - 2 * MARGIN) / (x1 - x0)
dx = (SIZE - (x1 - x0) * scale) / 2 - x0 * scale
dy = (SIZE + (y1 - y0) * scale) / 2 + y0 * scale
path = SVGPathPen(glyphs, ntos=lambda n: f"{n:.2f}".rstrip("0").rstrip("."))
glyph.draw(TransformPen(path, (scale, 0, 0, -scale, dx, dy)))

svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}">'
    f'<rect width="{SIZE}" height="{SIZE}" rx="14" fill="{PAPER}"/>'
    f'<path fill="{INK}" d="{path.getCommands()}"/></svg>\n'
)
(PUBLIC / "favicon.svg").write_text(svg, encoding="utf-8")

# Versões em PNG/ICO com a mesma proporção, desenhadas com a fonte convertida para TTF
ttf = io.BytesIO()
font.flavor = None
font.save(ttf)


def raster(px: int, radius: float) -> Image.Image:
    image = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, px - 1, px - 1), radius=radius, fill=PAPER)
    target = px * (SIZE - 2 * MARGIN) / SIZE
    size = int(px)
    while True:
        ttf.seek(0)
        roboto = ImageFont.truetype(ttf, size)
        left, top, right, bottom = draw.textbbox((0, 0), "m", font=roboto)
        if right - left <= target or size < 4:
            break
        size -= 1
    draw.text(((px - (right - left)) / 2 - left, (px - (bottom - top)) / 2 - top), "m", font=roboto, fill=INK)
    return image


raster(180, 0).convert("RGB").save(PUBLIC / "apple-touch-icon.png", optimize=True)  # o iOS arredonda sozinho
raster(48, 10).save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print("public/favicon.svg, favicon.ico, apple-touch-icon.png gerados")
