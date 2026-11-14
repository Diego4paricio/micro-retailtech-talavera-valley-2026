"""Photos of the hero's phone pages (src/components/hero/HeroPages.tsx).

Local tool, not part of the build. Reads the sources that
scripts/media/fuentes/descargar-hero-paginas.sh downloads (Higgsfield and
Unsplash, git-ignored) and writes public/media/hero/<name>.webp, cropped to
the box each page draws and sized for a phone at 2x inside the hero.

    python3 scripts/media/hero-pages.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / "scripts/media/fuentes/hero-paginas"
OUT = ROOT / "public/media/hero"

# name: (source file, width, height[, focus x]) of the box on the 390 px
# page, at 1.5x (the page is drawn at 0.57 inside the hero; 1.5x covers a 2x
# screen). The focus moves a horizontal crop off the center (0 left, 1 right).
JOBS = {
    "floreria-ramo": ("floreria-ramo.png", 390, 356, 0.4),
    "floreria-rosas": ("floreria-rosas.jpg", 177, 150),
    "floreria-suculenta": ("floreria-suculenta.jpg", 177, 150),
    "salon-unas": ("salon-unas.jpg", 250, 250),
    "restaurante-chilaquiles": ("restaurante-chilaquiles.png", 354, 230),
    "restaurante-enchiladas": ("restaurante-enchiladas.jpg", 58, 58),
    "restaurante-concha": ("restaurante-concha.jpg", 58, 58),
    "restaurante-cafe": ("restaurante-cafe.jpg", 58, 58),
    "inmobiliaria-casa": ("inmobiliaria-casa.png", 390, 318),
    "inmobiliaria-sala": ("inmobiliaria-sala.jpg", 170, 104),
    "inmobiliaria-cocina": ("inmobiliaria-cocina.jpg", 170, 104),
    "despacho-oficina": ("despacho-oficina.jpg", 346, 200),
}
SCALE = 1.5
MIN_SIDE = 120


def cover(
    image: Image.Image, width: int, height: int, focus: float = 0.5
) -> Image.Image:
    """Crop to the box's ratio around the focus, then resize to the box."""
    ratio = width / height
    w, h = image.size
    if w / h > ratio:
        cut = round(h * ratio)
        left = round((w - cut) * focus)
        image = image.crop((left, 0, left + cut, h))
    else:
        cut = round(w / ratio)
        image = image.crop((0, (h - cut) // 2, w, (h - cut) // 2 + cut))
    return image.resize((width, height), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (source, width, height, *focus) in JOBS.items():
        factor = max(SCALE, MIN_SIDE / min(width, height))
        box = (round(width * factor), round(height * factor))
        image = Image.open(SOURCES / source).convert("RGB")
        result = cover(image, *box, *focus)
        target = OUT / f"{name}.webp"
        result.save(target, "WEBP", quality=80, method=6)
        print(f"{target.relative_to(ROOT)}  {box[0]}x{box[1]}  {target.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
