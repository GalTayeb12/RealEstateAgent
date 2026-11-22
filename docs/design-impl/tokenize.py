"""Rewrite hard-coded light-theme colours in inline styles to theme-aware `var(--c-*, <original>)`.
The --c-* variables are only defined under `.cin` (components/theme/cinematic.css), so the light
theme renders the same literal colours; cinematic routes get the dark palette.
Usage: python docs/design-impl/tokenize.py <file> [...]"""
import re, sys

BG = {"background", "backgroundColor"}
COL = {"color", "accentColor", "fill", "stroke", "caretColor"}
INK = {"#123F40", "#123332", "#0C3031", "#082526"}
WHITE = {"#FFF", "#FFFFFF", "#FBFAF7"}
SOFT = {"#EEF4F3", "#F0F6F5", "#EFEDE6", "#EDEBE7", "#FAFAF8", "#FAFAF9", "#D4EDEA", "#F5F3EE", "#EDEAE3", "#F4F5F0", "#E9EEEA", "#EAF3F2", "#F5F2EC"}
LINE = {"#E8E4DF", "#B8D4D3", "#E0DDD7", "#D4DED8", "#E4DED3", "#C0DBD9"}
GOLD = {"#756039", "#A88B52", "#8A6530", "#B38B4D"}


def role(prop):
    if prop in BG:
        return "bg"
    if prop in COL:
        return "col"
    if prop.startswith(("border", "outline")):
        return "line"
    return None


def pick(r, h):
    u = h.upper()
    if u in GOLD:
        return "gold"
    if u in {"#526563", "#4E6566", "#55534C", "#3A6B6A"}:
        return None if r == "bg" else "muted"
    if u == "#9E3434":
        return "err"
    if u == "#FBECEA":
        return "err-bg"
    if u in {"#FCF2D9", "#FFF8E6", "#EDD9A3", "#FEF3E2"}:
        return "warn-bg"
    if u == "#246046":
        return "ok"
    if r == "bg":
        if u in INK:
            return "btn" if u == "#123F40" else "btn-hover"
        if u in WHITE:
            return "card"
        if u in SOFT or u in LINE:
            return "soft"
    if r == "col":
        if u in INK:
            return "ink"
        if u in WHITE:
            return "on-btn"
    if r == "line":
        if u in INK:
            return "ink"
        if u in LINE or u in SOFT:
            return "line"
    return None


HEX = re.compile(r"var\(--c-[a-z-]+,#[0-9A-Fa-f]{3,6}\)|#[0-9A-Fa-f]{6}\b|#[fF]{3}\b")
# `prop: <value up to the next prop:>` on one line; works for strings, ternaries and template literals
SEG = re.compile(r"\b([A-Za-z]+):\s([^\n]*?)(?=,?\s+[A-Za-z]+:\s|\n|$)")


def fix(src):
    def seg(m):
        prop, val = m.group(1), m.group(2)
        r = role(prop) or ("bg" if prop == "bg" else "col" if prop in {"fg", "text"} else None)
        if r is None and "gradient" not in val:
            return m.group(0)

        def h(mm):
            if mm.group(0).startswith("var("):
                return mm.group(0)
            n = pick(r or "bg", mm.group(0))
            return f"var(--c-{n},{mm.group(0)})" if n else mm.group(0)

        return f"{prop}: {HEX.sub(h, val)}"

    return SEG.sub(seg, src)


for f in sys.argv[1:]:
    s = open(f, encoding="utf8", newline="").read()
    n = fix(s)
    open(f, "w", encoding="utf8", newline="").write(n)
    print(f, "changed" if n != s else "no change")
