#!/usr/bin/env python3
"""Generate the desktop app icon set from the CareerPilot brand mark.

The mark is the same geometric arrow used by the web logo: a neon triangle with a
dark centre stroke. Everything is drawn with Pillow so the assets can be rebuilt
without design tooling.

Usage: python3 scripts/generate-icons.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
ICONS = BUILD / "icons"
NEON = (57, 255, 20)
DARK = (6, 16, 7)
BACKGROUND_TOP = (17, 26, 19)
BACKGROUND_BOTTOM = (5, 8, 5)


def _diagonal_gradient(size: int, start: tuple[int, int, int], end: tuple[int, int, int]) -> Image.Image:
    image = Image.new("RGB", (size, size))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            t = (x * 0.35 + y * 0.65) / max(size - 1, 1)
            pixels[x, y] = tuple(round(start[i] + (end[i] - start[i]) * t) for i in range(3))
    return image


def _rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def _mark_mask(size: int, inset: float = 1.0) -> Image.Image:
    """Triangle mark scaled to the canvas, with the centre stroke cut out."""
    scale = size / 1024
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    points = [
        (256 * scale, 760 * scale),
        (512 * scale, 232 * scale),
        (768 * scale, 760 * scale),
        (512 * scale, 624 * scale),
    ]
    draw.polygon(points, fill=255)
    # Centre stroke is part of the brand mark: punch it out of the fill.
    if inset > 0:
        stroke_width = max(2, round(46 * scale))
        draw.line(
            [(512 * scale, 430 * scale), (512 * scale, 760 * scale)],
            fill=0,
            width=stroke_width,
        )
        radius = stroke_width / 2
        for cy in (430 * scale, 760 * scale):
            draw.ellipse(
                (512 * scale - radius, cy - radius, 512 * scale + radius, cy + radius), fill=0
            )
    return mask


def make_full_icon(size: int = 1024) -> Image.Image:
    base = _diagonal_gradient(size, BACKGROUND_TOP, BACKGROUND_BOTTOM).convert("RGBA")
    base.putalpha(_rounded_mask(size, round(size * 0.21875)))

    # Subtle inner border.
    border = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(border)
    inset = round(size * 0.0254)
    bdraw.rounded_rectangle(
        (inset, inset, size - inset - 1, size - inset - 1),
        radius=round(size * 0.199),
        outline=(*NEON, 64),
        width=max(2, round(size * 0.0098)),
    )
    base = Image.alpha_composite(base, border)

    mark = _mark_mask(size)
    neon_layer = _diagonal_gradient(size, (141, 255, 116), (31, 174, 9)).convert("RGBA")
    neon_layer.putalpha(mark)

    # Soft glow behind the mark.
    glow_alpha = mark.filter(ImageFilter.GaussianBlur(radius=max(3, round(size * 0.022))))
    glow = Image.new("RGBA", (size, size), (*NEON, 0))
    glow.putalpha(glow_alpha.point(lambda value: round(value * 0.5)))
    base = Image.alpha_composite(base, glow)
    base = Image.alpha_composite(base, neon_layer)

    # Accent dot.
    dot = ImageDraw.Draw(base)
    r = round(size * 0.0254)
    cx, cy = round(size * 0.8008), round(size * 0.1992)
    dot.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(*NEON, 217))
    return base


def make_tray_icon(size: int, monochrome: bool) -> Image.Image:
    """Tray icons: coloured mark for Windows/Linux, black template for macOS."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = _mark_mask(size)
    if monochrome:
        fill = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    else:
        fill = Image.new("RGBA", (size, size), (*NEON, 255))
    fill.putalpha(mask)
    image = Image.alpha_composite(image, fill)
    return image


def _save_icns(source: Image.Image, destination: Path) -> None:
    try:
        source.save(destination, format="ICNS")
        return
    except Exception:  # noqa: BLE001 - fall back to a hand-written PNG container
        pass

    # ICNS is a simple container of PNG representations.
    import struct

    type_by_size = {
        16: b"icp4",
        32: b"icp5",
        64: b"icp6",
        128: b"ic07",
        256: b"ic08",
        512: b"ic09",
        1024: b"ic10",
    }
    chunks = []
    import io

    for size, icon_type in type_by_size.items():
        buffer = io.BytesIO()
        source.resize((size, size), Image.LANCZOS).save(buffer, format="PNG")
        payload = buffer.getvalue()
        chunks.append(icon_type + struct.pack(">I", len(payload) + 8) + payload)
    body = b"".join(chunks)
    destination.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)

    master = make_full_icon(1024)
    master.save(BUILD / "icon.png")
    master.save(BUILD / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48),
                                          (64, 64), (128, 128), (256, 256)])
    _save_icns(master, BUILD / "icon.icns")

    for size in (16, 32, 48, 64, 128, 256, 512, 1024):
        master.resize((size, size), Image.LANCZOS).save(ICONS / f"{size}x{size}.png")

    make_tray_icon(32, monochrome=False).save(BUILD / "tray.png")
    make_tray_icon(64, monochrome=False).save(BUILD / "tray@2x.png")
    make_tray_icon(16, monochrome=True).save(BUILD / "trayTemplate.png")
    make_tray_icon(32, monochrome=True).save(BUILD / "trayTemplate@2x.png")

    print("Wrote icon.png, icon.ico, icon.icns, icons/ and tray assets to", BUILD)


if __name__ == "__main__":
    main()
