"""Gera public/og.png: o banner de compartilhamento (1200×630), um "m" preto no centro.

Usa a mesma Roboto Black (900) do site, convertida do woff2 do @fontsource.
    uv run --with pillow --with fonttools --with brotli scripts/og-image.py
"""

import io
import pathlib

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
WOFF2 = ROOT / "node_modules/@fontsource/roboto/files/roboto-latin-900-normal.woff2"
OUT = ROOT / "public/og.png"
W, H = 1200, 630

font_bytes = io.BytesIO()
font = TTFont(WOFF2)
font.flavor = None
font.save(font_bytes)
font_bytes.seek(0)

image = Image.new("RGB", (W, H), "#ffffff")
draw = ImageDraw.Draw(image)
roboto = ImageFont.truetype(font_bytes, 560)
# Centraliza pela caixa real do glifo, não pela linha de base
left, top, right, bottom = draw.textbbox((0, 0), "m", font=roboto)
draw.text(((W - (right - left)) / 2 - left, (H - (bottom - top)) / 2 - top), "m", font=roboto, fill="#0a0a0a")
image.save(OUT, optimize=True)
print(f"{OUT.relative_to(ROOT)}: {W}x{H}, {OUT.stat().st_size // 1024} kB, glifo {right - left}x{bottom - top}")
