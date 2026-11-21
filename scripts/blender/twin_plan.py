"""
Plan-twin geometry for the Blender generators — pure Python, no bpy.

Reads the twin.json + layout.json written by scripts/twin/export-twin.ts and
answers the questions both twin_build.py (shell) and twin_furnish.py
(furniture) ask: which room is this point in, what is behind this wall face
(solid wall, window, door, open), which way does each door swing, and can a
0.6 m wide walker still reach every doorway once furniture is down.

Conventions are the twin's: plan metres, x east, y north, walls as centre
lines with a thickness, openings at a distance along their wall.
"""
import json
import math
import os
from collections import deque

PASSABLE = {"door", "entry", "slider", "opening"}
# who a door swings into: the more private room of the two
PRIVACY = {"bath": 5, "wc": 5, "laundry": 4, "storage": 4, "mamad": 3, "bedroom": 3, "master": 3,
           "kitchen": 2, "dining": 1, "living": 1, "corridor": 0, "entry": 0, "balcony": -1, "other": 1}
WET = {"bath", "wc", "laundry"}


def pip(x, y, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def overlap(a, b, eps=1e-6):
    return a[0] < b[2] - eps and b[0] < a[2] - eps and a[1] < b[3] - eps and b[1] < a[3] - eps


def grow(r, d):
    return [r[0] - d, r[1] - d, r[2] + d, r[3] + d]


class Wall:
    def __init__(self, w, openings):
        self.id, self.kind, self.t = w["id"], w["kind"], w["thickness"]
        self.a, self.b = tuple(w["a"]), tuple(w["b"])
        dx, dy = self.b[0] - self.a[0], self.b[1] - self.a[1]
        self.L = math.hypot(dx, dy) or 1.0
        self.u = (dx / self.L, dy / self.L)
        self.n = (-self.u[1], self.u[0])  # left normal
        self.axis = abs(dx) < 1e-6 or abs(dy) < 1e-6
        self.openings = sorted([o for o in openings if o["wallId"] == self.id], key=lambda o: o["at"])

    def at(self, s, off=0.0):
        return (self.a[0] + self.u[0] * s + self.n[0] * off, self.a[1] + self.u[1] * s + self.n[1] * off)

    def footprint(self, s1=0.0, s2=None, pad=0.0):
        """Axis-aligned box of [s1, s2] at full thickness (axis-aligned walls only)."""
        s2 = self.L if s2 is None else s2
        p, q = self.at(s1), self.at(s2)
        h = self.t / 2 + pad
        if abs(self.u[1]) < 1e-6:
            return [min(p[0], q[0]), p[1] - h, max(p[0], q[0]), p[1] + h]
        return [p[0] - h, min(p[1], q[1]), p[0] + h, max(p[1], q[1])]

    def opening_at(self, s):
        for o in self.openings:
            if o["at"] - o["width"] / 2 <= s <= o["at"] + o["width"] / 2:
                return o
        return None

    def solid_spans(self, kinds=PASSABLE | {"window"}):
        """[s1, s2] stretches of full-height wall between openings of the given kinds."""
        out, s = [], 0.0
        for o in self.openings:
            if o["kind"] not in kinds:
                continue
            g1, g2 = o["at"] - o["width"] / 2, o["at"] + o["width"] / 2
            if g1 > s + 1e-6:
                out.append((s, g1))
            s = max(s, g2)
        if self.L > s + 1e-6:
            out.append((s, self.L))
        return out


class Plan:
    def __init__(self, twin, layout):
        self.twin, self.layout = twin, layout
        self.H = twin.get("wallHeight", 2.8)
        self.rooms = {r["id"]: r for r in twin["rooms"]}
        self.rtype = {r["id"]: r["type"] for r in twin["rooms"]}
        self.rects = {k: tuple(v) for k, v in layout["rooms"].items()}
        self.walls = [Wall(w, twin["openings"]) for w in twin["walls"]]
        self.wall_by_id = {w.id: w for w in self.walls}
        self.sides = {o["id"]: o for o in layout["openings"]}
        self.spawn = layout["spawn"]
        xs = [p[0] for r in twin["rooms"] for p in r["polygon"]] + [c for w in self.walls for c in (w.a[0], w.b[0])]
        ys = [p[1] for r in twin["rooms"] for p in r["polygon"]] + [c for w in self.walls for c in (w.a[1], w.b[1])]
        self.bounds = (min(xs) - 0.4, min(ys) - 0.4, max(xs) + 0.4, max(ys) + 0.4)
        self.doors = [self._door(o) for o in twin["openings"] if o["kind"] in ("door", "entry")]

    @classmethod
    def load(cls, folder):
        with open(os.path.join(folder, "twin.json"), encoding="utf-8") as f:
            twin = json.load(f)
        with open(os.path.join(folder, "layout.json"), encoding="utf-8") as f:
            layout = json.load(f)
        return cls(twin, layout)

    # ── rooms ────────────────────────────────────────────────────────────────
    def room_at(self, x, y):
        for rid, r in self.rooms.items():
            if pip(x, y, r["polygon"]):
                return rid
        return None

    def room_near(self, x, y):
        r = self.room_at(x, y)
        if r:
            return r
        best, bd = "living", 1e9
        for rid, (x1, y1, x2, y2) in self.rects.items():
            d = math.hypot(max(x1 - x, 0, x - x2), max(y1 - y, 0, y - y2))
            if d < bd:
                best, bd = rid, d
        return best

    def in_wall(self, x, y, pad=0.0, skip=None):
        for w in self.walls:
            if w is skip or not w.axis:
                continue
            f = w.footprint(pad=pad)
            if f[0] <= x <= f[2] and f[1] <= y <= f[3]:
                s = (x - w.a[0]) * w.u[0] + (y - w.a[1]) * w.u[1]
                o = w.opening_at(s)
                if o is None or o["kind"] == "window":
                    return w
        return None

    # ── what is behind a wall face, sampled ──────────────────────────────────
    def face_runs(self, w, side, depth=0.03, step=0.02):
        """Runs along one face of wall w (side +1 = left normal): [(s1, s2, room, opening|None)],
        skipping stretches buried in other walls. Used for skirting, tiles and sill stones."""
        runs = []
        n = max(1, int(round(w.L / step)))
        cur = None
        for i in range(n):
            s = (i + 0.5) * w.L / n
            x, y = w.at(s, side * (w.t / 2 + depth))
            room = self.room_at(x, y)
            if room and self.in_wall(x, y, skip=w):
                room = None
            o = w.opening_at(s)
            key = (room, o["id"] if o else None)
            if cur and cur[0] == key:
                cur[2] = (i + 1) * w.L / n
            else:
                if cur:
                    runs.append(cur)
                cur = [key, i * w.L / n, (i + 1) * w.L / n]
        if cur:
            runs.append(cur)
        ops = {o["id"]: o for o in w.openings}
        return [(a, b, k[0], ops.get(k[1])) for k, a, b in runs]

    # ── doors ────────────────────────────────────────────────────────────────
    def _door(self, o):
        w = self.wall_by_id[o["wallId"]]
        side = self.sides[o["id"]]
        front, back = side["front"], side["back"]
        if o["kind"] == "entry":
            swing = 1 if front else -1  # front doors open inwards
        else:
            pf, pb = PRIVACY.get(self.rtype.get(front), -9), PRIVACY.get(self.rtype.get(back), -9)
            swing = 1 if pf >= pb else -1
        room = front if swing > 0 else back
        s1, s2 = o["at"] - o["width"] / 2, o["at"] + o["width"] / 2
        # hinge on the gap end closer to a wall of the swing room, so the open leaf parks against it
        hinge = s2
        if room in self.rects:
            x1, y1, x2, y2 = self.rects[room]

            def room_dist(s, sgn):
                for k in range(1, 200):
                    x, y = w.at(s + sgn * k * 0.02, swing * (w.t / 2 + 0.3))
                    if self.room_at(x, y) != room or self.in_wall(x, y):
                        return k * 0.02
                return 4.0
            hinge = s1 if room_dist(s1, -1) < room_dist(s2, +1) else s2
        return {"id": o["id"], "kind": o["kind"], "wall": w, "s1": s1, "s2": s2, "width": o["width"],
                "head": o.get("head", 2.2), "swing": swing, "room": room, "other": back if swing > 0 else front,
                "hinge": hinge}

    def door_leaf(self, d, thick=0.04):
        """Open leaf (90°) for interior doors, closed leaf for the entry: (p, q, off1, off2) for apt_lib.obox."""
        w, sw = d["wall"], d["swing"]
        if d["kind"] == "entry":
            face = sw * (w.t / 2 - 0.02)
            return ("closed", w.at(d["s1"]), w.at(d["s2"]), face - sw * 0.06, face)
        sgn = 1 if d["hinge"] == d["s2"] else -1  # leaf lies on the gap side of the hinge
        h = d["hinge"]
        face = sw * w.t / 2
        a, b = sorted((h - sgn * thick, h))
        return ("open", w.at(a), w.at(b), face, face + sw * (d["width"] - 0.01))

    def keepouts(self, room):
        """Rectangles furniture in `room` must stay out of: door swing squares and the approach in
        front of every doorway / slider / passage, on both sides."""
        out = []
        for o in self.twin["openings"]:
            if o["kind"] not in PASSABLE:
                continue
            w = self.wall_by_id[o["wallId"]]
            if not w.axis:
                continue
            s1, s2 = o["at"] - o["width"] / 2, o["at"] + o["width"] / 2
            d = next((d for d in self.doors if d["id"] == o["id"]), None)
            for sgn in (1, -1):
                deep = 0.9
                if d and d["kind"] == "door" and d["swing"] == sgn:
                    deep = max(deep, d["width"] + 0.15)
                p = w.at(s1 - 0.05, sgn * w.t / 2)
                q = w.at(s2 + 0.05, sgn * (w.t / 2 + deep))
                r = [min(p[0], q[0]), min(p[1], q[1]), max(p[0], q[0]), max(p[1], q[1])]
                cx, cy = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2
                if self.room_at(cx, cy) == room or room is None:
                    out.append(r)
        return out

    # ── room sides for furniture against walls ───────────────────────────────
    def room_sides(self, rid, step=0.05):
        """Sides of the room's walk rectangle, shrunk to the wall faces, each sampled into
        kinds: 'wall' | 'window:<sill>' | 'door' | 'open'. Returns (inner_rect, sides)."""
        x1, y1, x2, y2 = self.rects[rid]
        inner = [x1, y1, x2, y2]
        # shrink each side to the face of any wall lying on it
        for w in self.walls:
            if not w.axis:
                continue
            f = w.footprint()
            if abs(w.u[1]) < 1e-6:  # horizontal wall
                if f[2] <= x1 + 0.05 or f[0] >= x2 - 0.05:
                    continue
                if f[1] - 0.02 <= y1 <= f[3] + 0.02:
                    inner[1] = max(inner[1], f[3])
                if f[1] - 0.02 <= y2 <= f[3] + 0.02:
                    inner[3] = min(inner[3], f[1])
            else:
                if f[3] <= y1 + 0.05 or f[1] >= y2 - 0.05:
                    continue
                if f[0] - 0.02 <= x1 <= f[2] + 0.02:
                    inner[0] = max(inner[0], f[2])
                if f[0] - 0.02 <= x2 <= f[2] + 0.02:
                    inner[2] = min(inner[2], f[0])
        X1, Y1, X2, Y2 = inner
        defs = {"S": ((X1, Y1), (1, 0), X2 - X1), "E": ((X2, Y1), (0, 1), Y2 - Y1),
                "N": ((X2, Y2), (-1, 0), X2 - X1), "W": ((X1, Y2), (0, -1), Y2 - Y1)}
        sides = {}
        for name, (o, u, L) in defs.items():
            v = (-u[1], u[0])
            n = max(1, int(round(L / step)))
            kinds = []
            for i in range(n):
                a = (i + 0.5) * L / n
                x, y = o[0] + u[0] * a - v[0] * 0.03, o[1] + u[1] * a - v[1] * 0.03
                kinds.append(self._behind(x, y))
            sides[name] = {"name": name, "o": o, "u": u, "v": v, "L": L, "kinds": kinds, "step": L / n}
        return inner, sides

    def _behind(self, x, y):
        for w in self.walls:
            if not w.axis:
                continue
            f = w.footprint(pad=0.035)
            if not (f[0] <= x <= f[2] and f[1] <= y <= f[3]):
                continue
            s = (x - w.a[0]) * w.u[0] + (y - w.a[1]) * w.u[1]
            if s < -0.01 or s > w.L + 0.01:
                continue
            o = w.opening_at(s)
            if o is None:
                return "glass" if w.kind in ("glazing", "railing") else "wall"
            if o["kind"] == "window":
                return f"window:{o.get('sill', 0.9):.2f}"
            return "door"
        return "open"

    @staticmethod
    def stretches(side, ok):
        """Maximal [a1, a2] runs of a side whose sample kinds satisfy ok(kind)."""
        out, start = [], None
        st = side["step"]
        for i, k in enumerate(side["kinds"] + ["__end"]):
            good = k != "__end" and ok(k)
            if good and start is None:
                start = i
            elif not good and start is not None:
                out.append((start * st, i * st))
                start = None
        return out

    # ── walkability grid ─────────────────────────────────────────────────────
    def grid(self, cell=0.05):
        return Grid(self, cell)


class Grid:
    """Occupancy raster of the flat; free cells are inside a room and at least `h` from any box."""

    def __init__(self, plan, cell=0.05, h=0.3):
        self.p, self.c, self.h = plan, cell, h
        bx1, by1, bx2, by2 = plan.bounds
        self.x0, self.y0 = bx1, by1
        self.nx, self.ny = int(math.ceil((bx2 - bx1) / cell)), int(math.ceil((by2 - by1) / cell))
        self.inside = bytearray(self.nx * self.ny)
        for j in range(self.ny):
            for i in range(self.nx):
                if plan.room_at(self.x0 + (i + 0.5) * cell, self.y0 + (j + 0.5) * cell):
                    self.inside[j * self.nx + i] = 1
        # doorways through thick walls belong to no room polygon: count them as floor
        for w in plan.walls:
            for o in w.openings:
                if w.axis and o["kind"] in PASSABLE:
                    x1, y1, x2, y2 = w.footprint(o["at"] - o["width"] / 2, o["at"] + o["width"] / 2)
                    for j in range(max(0, int((y1 - self.y0) / cell)), min(self.ny, int((y2 - self.y0) / cell) + 1)):
                        for i in range(max(0, int((x1 - self.x0) / cell)), min(self.nx, int((x2 - self.x0) / cell) + 1)):
                            self.inside[j * self.nx + i] = 1
        self.blocked = bytearray(self.nx * self.ny)
        for b in plan.layout["wallBoxes"]:
            self.stamp(b, self.blocked)

    def idx(self, x, y):
        i, j = int((x - self.x0) / self.c), int((y - self.y0) / self.c)
        if 0 <= i < self.nx and 0 <= j < self.ny:
            return j * self.nx + i
        return -1

    def stamp(self, b, arr):
        h, c = self.h, self.c
        x1, y1, x2, y2 = b
        i1, i2 = max(0, int((x1 - h - self.x0) / c)), min(self.nx - 1, int((x2 + h - self.x0) / c))
        j1, j2 = max(0, int((y1 - h - self.y0) / c)), min(self.ny - 1, int((y2 + h - self.y0) / c))
        hh = h * h - 1e-9
        for j in range(j1, j2 + 1):
            cy = self.y0 + (j + 0.5) * c
            dy = max(y1 - cy, 0, cy - y2)
            row = j * self.nx
            for i in range(i1, i2 + 1):
                cx = self.x0 + (i + 0.5) * c
                dx = max(x1 - cx, 0, cx - x2)
                if dx * dx + dy * dy < hh:
                    arr[row + i] = 1

    def add(self, b):
        self.stamp(b, self.blocked)

    def reach(self, extra=()):
        """Cells reachable from the spawn with the given extra boxes added."""
        blocked = self.blocked
        if extra:
            blocked = bytearray(self.blocked)
            for b in extra:
                self.stamp(b, blocked)
        seen = bytearray(self.nx * self.ny)
        s = self.idx(self.p.spawn[0], self.p.spawn[1])
        if s < 0 or blocked[s]:
            return seen
        seen[s] = 1
        q = deque([s])
        nx, inside = self.nx, self.inside
        while q:
            k = q.popleft()
            i = k % nx
            for n in (k + 1 if i + 1 < nx else -1, k - 1 if i > 0 else -1, k + nx, k - nx):
                if 0 <= n < len(seen) and not seen[n] and not blocked[n] and inside[n]:
                    seen[n] = 1
                    q.append(n)
        return seen

    def door_points(self):
        pts = []
        for o in self.p.layout["openings"]:
            if o["kind"] in ("window", "entry"):
                continue
            for sgn, room in ((1, o["front"]), (-1, o["back"])):
                if not room:
                    continue
                d = o["thickness"] / 2 + 0.45
                pts.append((o["id"], o["centre"][0] + o["normal"][0] * d * sgn, o["centre"][1] + o["normal"][1] * d * sgn))
        return pts

    def ok(self, extra=(), must=()):
        """True when every doorway (both sides) and every `must` point stays reachable."""
        seen = self.reach(extra)
        # A doorway already cut off before any furniture (a real plan can have a door onto a
        # closed void, or a probe point inside a wall) cannot be kept clear: ignore those,
        # otherwise every placement would be refused and the apartment stays empty.
        if getattr(self, "_base_ok", None) is None:
            base = self.reach()
            self._base_ok = {(i, round(x, 3), round(y, 3)) for i, x, y in self.door_points()
                             if self.idx(x, y) >= 0 and base[self.idx(x, y)]}
        for i, x, y in self.door_points():
            if (i, round(x, 3), round(y, 3)) not in self._base_ok:
                continue
            k = self.idx(x, y)
            if k < 0 or not seen[k]:
                return False
        for x, y in must:
            k = self.idx(x, y)
            if k < 0 or not seen[k]:
                return False
        return True

    def unreachable(self):
        seen = self.reach()
        return [i for i, x, y in self.door_points() if not seen[self.idx(x, y)]]
