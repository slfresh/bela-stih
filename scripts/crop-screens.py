"""Turn raw phone captures into the frames Play will actually accept.

    python scripts/crop-screens.py                      # store/screens -> store/screens-cropped
    python scripts/crop-screens.py --in DIR --out DIR

A 1080x2400 capture is NOT uploadable: Play refuses a screenshot whose long
side is more than twice its short side, and 2400 / 1080 is 2.22. The frames
come from the Samsung SM-G780G, whose status bar is 88 px tall and whose
three-button navigation bar is 144 px. Taking 96 px off the top and 144 off
the bottom removes both and lands on exactly 1080x2160 = 1:2, which is the
widest Play allows. It also drops the alpha channel, because Play asks for
24-bit PNG.

It used to take 120 and 120, which kept the navigation bar's top 24 px on
every frame: a dark strip the bright-bar check could not see.

The same phone draws its Edge-panel handle, a translucent grey bar, over
every app at the left edge (x 0..13, y 328..682 of the raw frame). It is
painted out row by row with the app's own page just beside it; where that
page is not flat, something of the app's reaches the edge, and the script
refuses rather than smear it.

The checks refuse rather than ship something wrong: a frame that is not
1080x2400, one that still has a bright system bar inside the kept region, one
whose navigation bar starts above the bottom crop, one with app content beside
the handle, and one that looks like it has already been cropped.
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - the message is the point
    sys.exit("!! Pillow is needed: python -m pip install pillow")

RAW_W, RAW_H = 1080, 2400
TOP = 96
BOTTOM = 144
OUT_H = RAW_H - TOP - BOTTOM  # 2160, exactly 2x the width

# The Edge-panel handle on the raw frame: columns [0, HANDLE_W), rows
# HANDLE_ROWS. Measured at x 0..13, y 328..682; the margins take its soft edges.
HANDLE_W = 16
HANDLE_ROWS = (320, 692)

REPO = Path(__file__).resolve().parent.parent
DEFAULT_IN = REPO / "apps" / "mobile" / "store" / "screens"
DEFAULT_OUT = REPO / "apps" / "mobile" / "store" / "screens-cropped"


def brightest_row(img: Image.Image, y0: int, y1: int) -> float:
    """The mean luminance of the brightest row in a band — a system bar spikes it."""
    px = img.convert("L").crop((0, y0, img.width, y1))
    w = px.width
    data = list(px.getdata()) if not hasattr(px, "get_flattened_data") else list(px.get_flattened_data())
    return max(sum(data[y * w : (y + 1) * w]) / w for y in range(px.height))


def nav_bar_top(img: Image.Image) -> int:
    """The first row of the flat band at the bottom of a raw frame: the navigation bar.

    Read on the left-edge columns, clear of the bar's three icons, from the
    bottom up for as long as each row keeps the bottom row's colour. The app's
    own ground above the bar differs from it, so the edge is sharp.
    """
    rgb = img.convert("RGB")
    xs = range(10, 130, 10)

    def row(y: int) -> tuple:
        px = [rgb.getpixel((x, y)) for x in xs]
        return tuple(sum(c[i] for c in px) / len(px) for i in range(3))

    base = row(img.height - 3)
    y = img.height - 3
    while y > img.height - 400 and max(abs(a - b) for a, b in zip(row(y), base)) <= 6:
        y -= 1
    return y + 1


def erase_edge_handle(img: Image.Image, name: str) -> Image.Image:
    """Paint the handle's strip with the page just beside it, one row at a time."""
    rgb = img.convert("RGB")
    px = rgb.load()
    src = HANDLE_W + 2
    for y in range(*HANDLE_ROWS):
        page = px[src, y]
        further = px[src + 6, y]
        if max(abs(a - b) for a, b in zip(page, further)) > 3:
            raise SystemExit(
                f"!! {name}: the app draws beside the edge handle at y={y} ({page} vs {further}) "
                f"- painting the handle out would smear it. Re-take the frame."
            )
        for x in range(src):
            px[x, y] = page
    return rgb


def crop(src: Path, dst: Path) -> str:
    img = Image.open(src)
    if (img.width, img.height) != (RAW_W, RAW_H):
        if (img.width, img.height) == (RAW_W, OUT_H):
            raise SystemExit(f"!! {src.name} is already {RAW_W}x{OUT_H} - already cropped?")
        raise SystemExit(f"!! {src.name} is {img.width}x{img.height}, expected {RAW_W}x{RAW_H}")

    # A dark bar has no bright row to give it away: find its edge instead.
    nav = nav_bar_top(img)
    if nav < RAW_H - BOTTOM:
        raise SystemExit(
            f"!! {src.name}: the navigation bar starts at y={nav}, but the crop keeps rows down to "
            f"y={RAW_H - BOTTOM} - a strip of it would ship. Another phone? Re-measure TOP and BOTTOM."
        )

    kept = erase_edge_handle(img, src.name).crop((0, TOP, RAW_W, RAW_H - BOTTOM))

    # The status bar's glyphs and the navigation bar's are far brighter than
    # the app's own dark ground; if one survived the crop, say so.
    top_band = brightest_row(kept, 0, 40)
    bottom_band = brightest_row(kept, kept.height - 40, kept.height)
    if top_band > 90 or bottom_band > 90:
        where = "top" if top_band > 90 else "bottom"
        raise SystemExit(
            f"!! {src.name}: a system bar survived the {where} crop "
            f"(mean luminance {max(top_band, bottom_band):.0f}) - was it captured at {RAW_W}x{RAW_H}?"
        )

    dst.parent.mkdir(parents=True, exist_ok=True)
    kept.save(dst, "PNG")
    return f"   {dst.name}  {kept.width}x{kept.height}  {dst.stat().st_size // 1024} KiB  (nav bar from y={nav})"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", default=str(DEFAULT_IN))
    ap.add_argument("--out", dest="dst", default=str(DEFAULT_OUT))
    args = ap.parse_args()

    src_dir, dst_dir = Path(args.src), Path(args.dst)
    shots = sorted(src_dir.glob("*.png"))
    if not shots:
        raise SystemExit(f"!! no PNGs in {src_dir}")
    print(f"Cropping {len(shots)} frames {RAW_W}x{RAW_H} -> {RAW_W}x{OUT_H} (24-bit)")
    for shot in shots:
        print(crop(shot, dst_dir / shot.name))
    print(f"== ok: {dst_dir}")


if __name__ == "__main__":
    main()
