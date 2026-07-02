"""Generate dev bank-book OCR fixture (run once; requires Pillow)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "public" / "dev-fixtures" / "bank-book-ocr-sample.jpg"

FIELDS = [
    ("\u0e0a\u0e37\u0e48\u0e2d\u0e1a\u0e31\u0e0d\u0e0a\u0e35", "\u0e19\u0e32\u0e22 \u0e20\u0e39\u0e23\u0e34\u0e1e\u0e31\u0e12\u0e19 \u0e1b\u0e31\u0e0d\u0e0d\u0e32"),
    ("\u0e40\u0e25\u0e02\u0e17\u0e35\u0e48\u0e1a\u0e31\u0e0d\u0e0a\u0e35", "431-013603-2"),
    ("\u0e1b\u0e23\u0e30\u0e40\u0e20\u0e17\u0e1a\u0e31\u0e0d\u0e0a\u0e35", "\u0e2d\u0e2d\u0e21\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c"),
    ("\u0e2a\u0e32\u0e02\u0e32", "\u0e40\u0e0b\u0e47\u0e19\u0e17\u0e23\u0e31\u0e25\u0e40\u0e27\u0e34\u0e25\u0e14\u0e4c"),
]

TITLE = "\u0e18\u0e19\u0e32\u0e04\u0e32\u0e23\u0e44\u0e17\u0e22\u0e1e\u0e32\u0e13\u0e34\u0e0a\u0e22\u0e4c"
SUBTITLE = "\u0e2a\u0e21\u0e38\u0e14\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e40\u0e07\u0e34\u0e19\u0e1d\u0e32\u0e01"


def main() -> None:
    w, h = 900, 1200
    img = Image.new("RGB", (w, h), (252, 248, 240))
    draw = ImageDraw.Draw(img)
    try:
        title_font = ImageFont.truetype("DejaVuSans.ttf", 32)
        label_font = ImageFont.truetype("DejaVuSans.ttf", 22)
        value_font = ImageFont.truetype("DejaVuSans-Bold.ttf", 26)
    except OSError:
        title_font = ImageFont.load_default()
        label_font = ImageFont.load_default()
        value_font = ImageFont.load_default()

    draw.text((40, 40), TITLE, fill=(0, 51, 102), font=title_font)
    draw.text((40, 90), SUBTITLE, fill=(20, 20, 20), font=label_font)
    draw.rectangle((30, 150, 870, 670), outline=(180, 180, 180), width=2)

    y = 180
    for label, value in FIELDS:
        draw.text((40, y), label, fill=(60, 60, 60), font=label_font)
        draw.text((40, y + 34), value, fill=(0, 0, 0), font=value_font)
        y += 110

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, format="JPEG", quality=92)
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
