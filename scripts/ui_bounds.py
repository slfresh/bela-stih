"""Print where the first UI node with an exact label is: its centre, or its box.

    python scripts/ui_bounds.py <base64-utf8-label> < dump.xml          # "x y"
    python scripts/ui_bounds.py --box <base64-utf8-label> < dump.xml    # "x1 y1 x2 y2"

The label matches a node's text or, failing that, its accessibility label
(content-desc): an unlabelled block such as the hand is findable by the name
it gives a screen reader.

The label arrives base64-encoded and the dump is read as raw bytes, because
Windows Python decodes both argv and stdin with the ANSI codepage. Anything with
a diacritic — "Vaše karte", "zovi žir" — silently failed to match otherwise,
which is worse than erroring: the caller just sees "not found".
"""

import base64
import html
import re
import sys

NODE = re.compile(r"<node\b[^>]*>")
ATTR = re.compile(r'(\S+?)="([^"]*)"')
BOUNDS = re.compile(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]")


def main() -> int:
    args = sys.argv[1:]
    box = False
    if args and args[0] == "--box":
        box = True
        args = args[1:]
    if not args:
        print("usage: ui_bounds.py [--box] <base64-label>", file=sys.stderr)
        return 2

    label = base64.b64decode(args[0]).decode("utf-8")
    xml = sys.stdin.buffer.read().decode("utf-8", "replace")

    nodes = []
    for tag in NODE.finditer(xml):
        attrs = dict(ATTR.findall(tag.group(0)))
        b = BOUNDS.match(attrs.get("bounds", ""))
        if b:
            nodes.append((html.unescape(attrs.get("text", "")), html.unescape(attrs.get("content-desc", "")), b))

    for key in (0, 1):  # text first, then the accessibility label
        for node in nodes:
            if node[key] != label:
                continue
            x1, y1, x2, y2 = (int(v) for v in node[2].groups())
            print(f"{x1} {y1} {x2} {y2}" if box else f"{(x1 + x2) // 2} {(y1 + y2) // 2}")
            return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
