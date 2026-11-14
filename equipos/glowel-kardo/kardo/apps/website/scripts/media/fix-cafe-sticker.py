"""Café photo: rewrite the footer of the table sticker.

Local tool, not part of the build. The generated photo
(Docs/renders/sitio/alimentos-cafe.jpeg) reads "kardo.oom.ms" at the foot of
the sticker. This erases those few pixels with the sticker's own navy (never
the teal ring around them) and writes "kardo.com.mx" in the same size, grey
and softness. The source stays untouched; the result is
Docs/renders/sitio/alimentos-cafe-corregida.jpg, which landing-images.mjs
picks up.

    python3 scripts/media/fix-cafe-sticker.py

Needs Python 3 with numpy and Pillow.
"""

import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SITIO = os.path.abspath(os.path.join(SITE, "..", "..", "Docs", "renders", "sitio"))
SOURCE = os.path.join(SITIO, "alimentos-cafe.jpeg")
TARGET = os.path.join(SITIO, "alimentos-cafe-corregida.jpg")

# The footer line in the 825 × 1024 photo: a box around the bad text and its
# centre and height (measured on the source).
BOX = (378, 961, 458, 976)
CENTER = (417.5, 969.5)
CAP_HEIGHT = 5.6
FONTS = [
    "/System/Library/Fonts/Avenir Next.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
]


def main():
    img = Image.open(SOURCE).convert("RGB")
    a = np.asarray(img).astype(float)
    x0, y0, x1, y1 = BOX
    patch = a[y0:y1, x0:x1]

    # The ring is the lowest teal run in each column (it curves under the
    # line); the old print is whatever is lighter than the navy above it.
    r, g, b = patch[..., 0], patch[..., 1], patch[..., 2]
    lum = patch.mean(-1)
    teal = (g - r > 28) & (lum > 60)
    text = np.zeros(lum.shape, bool)
    navy = np.zeros(lum.shape, bool)
    for x in range(patch.shape[1]):
        rows = np.where(teal[:, x])[0]
        ring_top = patch.shape[0]
        if len(rows):
            # walk up from the lowest teal pixel while the run continues
            ring_top = rows[-1]
            while ring_top - 1 in rows:
                ring_top -= 1
        above = np.arange(patch.shape[0]) < ring_top - 1
        text[:, x] = above & (lum[:, x] > 52)
        navy[:, x] = above & (lum[:, x] <= 52)

    # Fill the text pixels from the nearest navy in the same column, above or
    # below, so the sticker's shading stays.
    out = patch.copy()
    for x in range(patch.shape[1]):
        col = np.where(navy[:, x])[0]
        if not len(col):
            continue
        for y in np.where(text[:, x])[0]:
            near = col[np.argsort(np.abs(col - y))[:3]]
            out[y, x] = patch[near, x].mean(0)
    a[y0:y1, x0:x1] = out

    # Colour of the print: the mean of its 15 lightest pixels (the rest are
    # edges blended with the navy), so it keeps the photo's light.
    lightest = np.argsort(lum, axis=None)[-15:]
    grey = patch.reshape(-1, 3)[lightest].mean(0)

    # Draw at 8×, then reduce, to get the same soft small type as the photo.
    scale = 8
    font_path = next(p for p in FONTS if os.path.exists(p))
    font = ImageFont.truetype(font_path, int(CAP_HEIGHT * scale * 1.42), index=0)
    label = "kardo.com.mx"
    layer = Image.new("L", (img.width * scale, img.height * scale), 0)
    draw = ImageDraw.Draw(layer)
    left, top, right, bottom = draw.textbbox((0, 0), label, font=font)
    cx, cy = CENTER[0] * scale, CENTER[1] * scale
    draw.text((cx - (left + right) / 2, cy - (top + bottom) / 2), label, font=font, fill=255)
    alpha = np.asarray(
        layer.resize(img.size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.35))
    ).astype(float)[..., None] / 255
    a = a * (1 - alpha) + grey * alpha

    Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8)).save(TARGET, quality=95)
    print(os.path.relpath(TARGET, SITE))


if __name__ == "__main__":
    main()
