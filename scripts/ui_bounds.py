"""Print the centre coordinates of the first UI node with an exact text match.

    python scripts/ui_bounds.py <base64-utf8-label> < dump.xml

The label arrives base64-encoded and the dump is read as raw bytes, because
Windows Python decodes both argv and stdin with the ANSI codepage. Anything with
a diacritic — "Vaše karte", "zovi žir" — silently failed to match otherwise,
which is worse than erroring: the caller just sees "not found".
"""

import base64
import re
import sys

NODE = re.compile(r'text="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"')


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: ui_bounds.py <base64-label>", file=sys.stderr)
        return 2

    label = base64.b64decode(sys.argv[1]).decode("utf-8")
    xml = sys.stdin.buffer.read().decode("utf-8", "replace")

    for match in NODE.finditer(xml):
        if match.group(1) != label:
            continue
        x1, y1, x2, y2 = (int(v) for v in match.groups()[1:])
        print((x1 + x2) // 2, (y1 + y2) // 2)
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
