"""
Builds the app's four static Rubik weights from the variable font.

    python scripts/make-fonts.py path/to/Rubik[wght].ttf

Rubik is SIL OFL 1.1 (https://github.com/googlefonts/rubik); the licence sits
next to the files in apps/mobile/assets/fonts/OFL.txt. Each weight is
instanced from the variable file and subset to Latin, Latin Extended-A
(Š Ž Č Ć Đ), Serbian Cyrillic and the punctuation the app sets, with
tabular figures kept — about 75 KB a file. Needs fonttools (pip).
"""
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

UNICODES = (
    "U+0020-007E,U+00A0-00FF,U+0100-017F,U+0400-045F,U+0490-0491,"
    "U+2013-2014,U+2018-201E,U+2022,U+2026,U+2030,U+20AC,U+2116,U+2212,U+2260,U+2264,U+2265"
)
WEIGHTS = [400, 500, 700, 900]
OUT = os.path.join(os.path.dirname(__file__), "..", "apps", "mobile", "assets", "fonts")


def main(src: str) -> None:
    os.makedirs(OUT, exist_ok=True)
    for w in WEIGHTS:
        var = TTFont(src)
        inst = instancer.instantiateVariableFont(var, {"wght": w}, inplace=False, updateFontNames=True)
        opts = subset.Options()
        opts.layout_features = ["kern", "liga", "ccmp", "locl", "mark", "mkmk", "tnum", "pnum", "lnum", "case"]
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        opts.hinting = False
        s = subset.Subsetter(opts)
        s.populate(unicodes=subset.parse_unicodes(UNICODES))
        s.subset(inst)
        out = os.path.join(OUT, f"Rubik-{w}.ttf")
        subset.save_font(inst, out, opts)
        print(out, os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
