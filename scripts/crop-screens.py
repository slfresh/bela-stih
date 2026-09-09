"""Turn raw phone captures into the frames Play will actually accept.

    python scripts/crop-screens.py                      # store/screens -> store/screens-cropped
    python scripts/crop-screens.py --in DIR --out DIR

A 1080x2400 capture is NOT uploadable: Play refuses a screenshot whose long
side is more than twice its short side, and 2400 / 1080 is 2.22. Taking 120 px
off the top and 120 off the bottom removes both system bars and lands on
exactly 1080x2160 = 1:2, which is the widest Play allows. It also drops the
alpha channel, because Play asks for 24-bit PNG.

The checks refuse rather than ship something wrong: a frame that is not
1080x2400, one that still has a bright system bar inside the kept region, and
one that looks like it has already been cropped.
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - the message is the point
    sys.exit("!! Pillow is needed: python -m pip install pillow")

RAW_W, RAW_H = 1080, 2400
TOP = 120
BOTTOM = 120
OUT_H = RAW_H - TOP - BOTTOM  # 2160, exactly 2x the width

REPO = Path(__file__).resolve().parent.parent
DEFAULT_IN = REPO / "apps" / "mobile" / "store" / "screens"
DEFAULT_OUT = REPO / "apps" / "mobile" / "store" / "screens-cropped"


def brightest_row(img: Image.Image, y0: int, y1: int) -> float:
    """The mean luminance of the brightest row in a band — a system bar spikes it."""
    px = img.convert("L").crop((0, y0, img.width, y1))
    w = px.width
    data = list(px.getdata()) if not hasattr(px, "get_flattened_data") else list(px.get_flattened_data())
    return max(sum(data[y * w : (y + 1) * w]) / w for y in range(px.height))


def crop(src: Path, dst: Path) -> str:
    img = Image.open(src)
    if (img.width, img.height) != (RAW_W, RAW_H):
        if (img.width, img.height) == (RAW_W, OUT_H):
            raise SystemExit(f"!! {src.name} is already {RAW_W}x{OUT_H} - already cropped?")
        raise SystemExit(f"!! {src.name} is {img.width}x{img.height}, expected {RAW_W}x{RAW_H}")

    kept = img.crop((0, TOP, RAW_W, RAW_H - BOTTOM)).convert("RGB")

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
    return f"   {dst.name}  {kept.width}x{kept.height}  {dst.stat().st_size // 1024} KiB"


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
