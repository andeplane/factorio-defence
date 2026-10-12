"""Flatten the raw prototype dump into the engine's manifest format (docs/ASSETS.md)."""
import json, re, struct, sys, os

raw_path, data_dir, out_path = sys.argv[1:4]
P = json.load(open(raw_path))["prototypes"]

def png_size(path):
    with open(os.path.join(data_dir, path), "rb") as f:
        h = f.read(24)
    return struct.unpack(">II", h[16:24])

def camel(s):
    return re.sub(r"_([a-z])", lambda m: m.group(1).upper(), s)

FIELDS = ["width", "height", "x", "y", "frame_count", "line_length", "scale", "shift", "animation_speed",
          "draw_as_shadow", "draw_as_glow", "draw_as_light", "run_mode", "repeat_count", "direction_count",
          "variation_count", "lines_per_file", "tint", "apply_runtime_tint", "frame_sequence", "slice", "axially_symmetrical"]

def is_sprite(n):
    return isinstance(n, dict) and ("filename" in n or "filenames" in n or "stripes" in n)

STITCHED = {}

def stitch(n):
    """Joins stripes that split the FRAMES across files (each stripe holds every
    direction) into one sheet: one row per direction, frames left to right.
    Returns the derived file, or None when the stripes split directions instead."""
    st, dc = n["stripes"], n.get("direction_count", 1)
    fc = n.get("frame_count", 1)
    if len(st) < 2 or any(s.get("height_in_frames") != dc for s in st) or sum(s.get("width_in_frames", 0) for s in st) != fc:
        return None
    key = tuple(s["filename"] for s in st)
    if key not in STITCHED:
        from PIL import Image
        w, h = n["width"], n["height"]
        sheet = Image.new("RGBA", (fc * w, dc * h))
        x = 0
        for s in st:
            with Image.open(os.path.join(data_dir, s["filename"])) as img:
                part = img.crop((s.get("x", 0), s.get("y", 0), s.get("x", 0) + s["width_in_frames"] * w, s.get("y", 0) + dc * h))
                sheet.paste(part, (x, 0))
            x += s["width_in_frames"] * w
        rel = "stitched/" + os.path.basename(st[0]["filename"]).replace("-1.png", ".png")
        os.makedirs(os.path.join(os.path.dirname(os.path.abspath(out_path)), "stitched"), exist_ok=True)
        sheet.save(os.path.join(os.path.dirname(os.path.abspath(out_path)), rel))
        STITCHED[key] = rel
    return STITCHED[key]

def entry(n):
    e = {}
    if "stripes" in n:
        merged = stitch(n)
        if merged:
            n = {k: v for k, v in n.items() if k != "stripes"}
            n["filename"] = merged
            n.setdefault("line_length", n.get("frame_count", 1))
    if "filename" in n: e["file"] = n["filename"]
    if "filenames" in n: e["files"] = n["filenames"]
    if "stripes" in n:
        e["stripes"] = [{"file": s["filename"], "widthInFrames": s.get("width_in_frames"),
                         "heightInFrames": s.get("height_in_frames"), "x": s.get("x", 0), "y": s.get("y", 0)} for s in n["stripes"]]
    if "size" in n and "width" not in n:
        sz = n["size"]; n = dict(n, width=sz[0] if isinstance(sz, list) else sz, height=sz[1] if isinstance(sz, list) else sz)
    for f in FIELDS:
        if f in n: e[camel(f)] = n[f]
    if n.get("blend_mode") in ("additive", "additive-soft"): e["additive"] = True
    if "width" not in e and "file" in e:  # whole-image sprite
        e["width"], e["height"] = png_size(e["file"])
    return e

out = {}
SPEED = 1.0  # multiplier for the field being flattened (crafting speed, belt speed, ...)

def emit(key, n):
    if key in out: return
    e = entry(n)
    if SPEED != 1.0 and (e.get("frameCount") or 1) > 1:
        e["animationSpeed"] = round(e.get("animationSpeed", 1) * SPEED, 4)
    out[key] = e
    for d, de in directions(n, e):
        out.setdefault(f"{key}/dir/{d}", de)

def directions(n, e):
    """Split a rotated sheet (direction_count > 1) into one entry per direction.

    Direction 0 is north, going clockwise, as in Factorio. Frames for direction d
    start at index d * frameCount; entries are emitted only where that start can be
    addressed with x/y (always true for 1-frame sprites, stripes and row-aligned sheets).
    """
    dc = e.get("directionCount", 1)
    if dc <= 1: return []
    fc = e.get("frameCount", 1)
    w, h = e["width"], e["height"]
    base = {k: v for k, v in e.items() if k not in ("directionCount", "files", "stripes", "linesPerFile", "file", "x", "y")}
    res = []
    if "stripes" in e:
        stripes, d = e["stripes"], 0
        for s in stripes:
            for row in range(s["heightInFrames"] or 1):
                res.append((d, dict(base, file=s["file"], x=s["x"], y=s["y"] + row * h, frameCount=fc, lineLength=fc)))
                d += 1
        return res
    ll = e.get("lineLength") or (dc if fc == 1 else fc)
    files = e.get("files") or [e.get("file")]
    lpf = e.get("linesPerFile") or 10**9
    x0, y0 = e.get("x", 0), e.get("y", 0)
    for d in range(dc):
        start = d * fc
        if fc > 1 and start % ll: return []
        line = start // ll
        fi = min(line // lpf, len(files) - 1)
        res.append((d, dict(base, file=files[fi], x=x0 + (start % ll) * w, y=y0 + (line % lpf) * h, lineLength=ll)))
    return res

DIRS = ("north", "east", "south", "west")

def flatten(n, key):
    if isinstance(n, list):
        if len(n) == 1: return flatten(n[0], key)
        for i, x in enumerate(n): flatten(x, f"{key}/{i}")
        return
    if not isinstance(n, dict): return
    if is_sprite(n):
        emit(key, n); return
    if isinstance(n.get("sheets"), list) and not any(d in n for d in DIRS):
        n = dict(n, layers=n["sheets"]); n.pop("sheets")
    for wrap in ("sheet", "sheets", "animation", "picture"):
        if list(n.keys()) == [wrap] or (wrap in ("sheet", "sheets") and wrap in n and not any(d in n for d in DIRS)):
            return flatten(n[wrap], key)
    if "layers" in n:
        main = [l for l in n["layers"] if not (isinstance(l, dict) and (l.get("draw_as_shadow") or l.get("draw_as_glow") or l.get("draw_as_light")))]
        shadow = [l for l in n["layers"] if isinstance(l, dict) and l.get("draw_as_shadow")]
        glow = [l for l in n["layers"] if isinstance(l, dict) and (l.get("draw_as_glow") or l.get("draw_as_light")) and not l.get("draw_as_shadow")]
        for group, suffix in ((main, ""), (shadow, "/shadow"), (glow, "/glow")):
            for i, l in enumerate(group):
                flatten(l, key + suffix + (f"/{i+1}" if i else ""))
        return
    for k, v in n.items():
        if isinstance(v, (dict, list)):
            flatten(v, f"{key}/{k}")

PRIMARY = ["animation", "animations", "picture", "pictures", "structure", "graphics_set", "base_picture", "run_animation",
           "folded_animation", "horizontal_animation", "platform_picture", "fluid_background", "sprite", "connection_sprites"]
SKIP = {"icon", "icons", "dark_background_icon", "water_reflection", "circuit_connector_sprites", "circuit_wire_connection_points",
        "variants", "radius_visualisation_specification", "integration_patch", "shadow"}
ENTITY_TYPES = [t for t in P if t not in ("item", "ammo", "gun", "capsule", "module", "tool", "fluid", "recipe", "item-group", "tile")]

# Belts: 20-row sheets, one row per belt piece (transport-belt-pictures.lua index order)
BELT_ROWS = ["east", "west", "north", "south", "east_to_north", "north_to_east", "west_to_north", "north_to_west",
             "south_to_east", "east_to_south", "south_to_west", "west_to_south", "starting_south", "ending_south",
             "starting_west", "ending_west", "starting_north", "ending_north", "starting_east", "ending_east"]

for name, p in sorted(P.get("character", {}).items()):
    for anim, node in sorted(p.get("animations", {}).items()):
        flatten(node, f"{name}/{anim}")

for t in ENTITY_TYPES:
    if t == "character": continue
    for name, p in sorted(P[t].items()):
        key = name if t != "corpse" else f"corpse/{name}"
        bas = p.get("belt_animation_set")
        if bas:
            s = bas["animation_set"]
            for i, r in enumerate(BELT_ROWS):
                e = entry(s); e.pop("directionCount", None); e["y"] = s.get("y", 0) + i * s["height"]
                e["animationSpeed"] = round(p.get("speed", 0.03125) * p.get("animation_speed_coefficient", 32), 4)
                out[f"{key}/{r}" if t == "transport-belt" else f"{key}/belt/{r}"] = e
        crafting = p.get("crafting_speed") if t in ("assembling-machine", "furnace") else None
        fields = [f for f in p if isinstance(p[f], (dict, list)) and f not in SKIP and f != "belt_animation_set"]
        prim = next((f for f in PRIMARY if f in fields), None)
        for f in [prim] + sorted(x for x in fields if x != prim) if prim else sorted(fields):
            SPEED = 1.0
            if crafting and f in ("animation", "animations", "working_visualisations", "idle_animation"): SPEED = crafting
            if t == "unit" and f == "run_animation" and p.get("distance_per_frame"):
                SPEED = p["movement_speed"] / p["distance_per_frame"]
            flatten(p[f], key if f == prim else f"{key}/{f}")
        # Entities whose primary graphic is directional (pumpjack: animations.north)
        # leave the bare key free; use the static base picture for it.
        if key not in out and "base_picture" in fields:
            for k in [k for k in out if k == f"{key}/base_picture" or k.startswith(f"{key}/base_picture/")]:
                out.setdefault(key + k[len(f"{key}/base_picture"):], out[k])

# Radar dishes are 64-direction rotated sprites; play them as a spinning animation.
rs = P["radar"]["radar"].get("rotation_speed", 0.01)
for k in ("radar", "radar/shadow"):
    e = out[k]; n = e.pop("directionCount", 1)
    e["frameCount"], e["animationSpeed"] = n, round(rs * n, 4)

# Friendly aliases for the keys the game asks for.
def alias(new, old):
    if old in out: out.setdefault(new, out[old])

alias("stone-furnace/fire", "stone-furnace/working_visualisations/0/animation")
alias("stone-furnace/fire/light", "stone-furnace/working_visualisations/0/animation/2")
alias("stone-furnace/ground_light", "stone-furnace/working_visualisations/1/animation")
alias("steel-furnace/fire", "steel-furnace/working_visualisations/0/animation")
for drill in ("electric-mining-drill",):
    for d in DIRS:
        alias(f"{drill}/{d}", f"{drill}/animation/{d}")                 # static body, output facing d
        alias(f"{drill}/{d}/shadow", f"{drill}/animation/{d}/shadow")
        alias(f"{drill}/{d}/output", f"{drill}/animation/{d}/2")         # animated output chute
        alias(f"{drill}/{d}/drill", f"{drill}/working_visualisations/2/{d}_animation")  # moving drill head
        alias(f"{drill}/{d}/drill/shadow", f"{drill}/working_visualisations/2/{d}_animation/shadow")
# Inserters: the platform sheet holds the entity directions north, east, south,
# west. An inserter's direction is its pickup side, so the side it drops to is
# the opposite one; platform/<d> is keyed by the drop side.
OPPOSITE = {"north": "south", "east": "west", "south": "north", "west": "east"}
for name in P.get("inserter", {}):
    plat = out.get(name)
    if plat:
        for drop in DIRS:
            out.setdefault(f"{name}/platform/{drop}", dict(plat, x=DIRS.index(OPPOSITE[drop]) * plat["width"]))
    for part in ("hand_base", "hand_open", "hand_closed"):
        alias(f"{name}/{part}", f"{name}/{part}_picture")
        alias(f"{name}/{part}/shadow", f"{name}/{part}_shadow")

# Icons: items first, then fluids, entities, recipes
for t in ["item", "ammo", "gun", "capsule", "module", "tool", "fluid", "item-group"] + ENTITY_TYPES + ["recipe"]:
    for name, p in sorted(P.get(t, {}).items()):
        k = f"icon/{name}" if t != "item-group" else f"icon/group/{name}"
        if k in out: continue
        if isinstance(p.get("icon"), str):
            sz = p.get("icon_size", 64)
            out[k] = {"file": p["icon"], "width": sz, "height": sz, "mipmaps": p.get("icon_mipmaps", 1)}
        elif p.get("icons"):
            out[k] = {"layers": [{"file": i["icon"], "width": i.get("icon_size", p.get("icon_size", 64)),
                                  "height": i.get("icon_size", p.get("icon_size", 64)),
                                  **({"tint": i["tint"]} if "tint" in i else {}),
                                  **({"shift": i["shift"]} if "shift" in i else {}),
                                  **({"scale": i["scale"]} if "scale" in i else {})} for i in p["icons"]]}

tiles = {}
for name, p in sorted(P["tile"].items()):
    for m in p["variants"].get("main", []):
        scale = m.get("scale", 1)
        px = int(32 * m["size"] / scale)
        w, h = png_size(m["picture"])
        variants = m["count"] if m["count"] > 1 else max(1, w // px)
        if "concrete-dummy" in m["picture"]: continue
        tk = name if m["size"] == 1 else f"{name}@{m['size']}x{m['size']}"
        tiles[tk] = {"file": m["picture"], "size": px, "variants": variants, "x": m.get("x", 0), "y": m.get("y", 0),
                     "scale": scale, "tilesPerVariant": m["size"]}
        if "probability" in m: tiles[tk]["probability"] = m["probability"]
    mb = p["variants"].get("material_background")
    if mb:
        scale = mb.get("scale", 1)
        tiles.setdefault(name, {"file": mb["picture"], "size": int(32 / scale), "variants": mb.get("count", 1),
                                "x": 0, "y": 0, "scale": scale, "tilesPerVariant": 1})
    if "map_color" in p and name in tiles: tiles[name]["mapColor"] = p["map_color"]

# Cut each tile's variant row into its own image. Sampling a sub-rectangle of
# Factorio's terrain sheets with linear filtering bleeds in the next row (the
# 2x2 variants) and the transparent area right of the row, which shows up as
# dark seams between tiles. A one-row image clamps cleanly at its edges.
from PIL import Image
out_dir = os.path.dirname(os.path.abspath(out_path))
os.makedirs(os.path.join(out_dir, "tiles"), exist_ok=True)
for tk, td in tiles.items():
    with Image.open(os.path.join(data_dir, td["file"])) as img:
        row = img.crop((td["x"], td["y"], td["x"] + td["variants"] * td["size"], td["y"] + td["size"]))
        rel = f"tiles/{tk}.png"
        row.save(os.path.join(out_dir, rel))
    td.update(file=rel, x=0, y=0, source=td["file"])

# Tile layers: the higher layer draws its transition over the lower neighbour.
for name, p in P["tile"].items():
    if name in tiles and "layer" in p: tiles[name]["layer"] = p["layer"]

# Transition pieces for natural tiles (grass, dirt, sand, ...). In 1.1 these are
# the tile's own texture cut out by a greyscale mask (white = this tile). The
# mask sheets hold one row per orientation, verified against hr-transition-*.png:
#   inner_corner / outer_corner rows: ne, se, sw, nw
#   side rows: north, east, south, west (the edge the tile lies across)
#   u_transition rows: open edge south, west, north, east
#   o_transition: a single row
PIECE_ROWS = {
    "inner_corner": ["ne", "se", "sw", "nw"],
    "outer_corner": ["ne", "se", "sw", "nw"],
    "side": ["north", "east", "south", "west"],
    "u_transition": ["south", "west", "north", "east"],
    "o_transition": [None],
}
for name, p in sorted(P["tile"].items()):
    v = p["variants"]
    if name not in tiles or "side" in v or "side_mask" not in v: continue
    base = tiles[name]
    with Image.open(os.path.join(out_dir, base["file"])) as material:
        material = material.convert("RGBA")
        for piece, rows in PIECE_ROWS.items():
            m = v.get(piece + "_mask")
            if not m: continue
            scale = m.get("scale", 1)
            px = int(32 / scale)
            count = min(m.get("count", 1), base["variants"])
            with Image.open(os.path.join(data_dir, m["picture"])) as sheet:
                sheet = sheet.convert("L")
                for r, d in enumerate(rows):
                    img = Image.new("RGBA", (count * px, px))
                    for i in range(count):
                        x, y = m.get("x", 0) + i * px, m.get("y", 0) + r * px
                        mask = sheet.crop((x, y, x + px, y + px))
                        tile_img = material.crop((i * base["size"], 0, (i + 1) * base["size"], base["size"])).resize((px, px))
                        tile_img.putalpha(mask)
                        img.paste(tile_img, (i * px, 0))
                    rel = f"tiles/{name}-{piece}" + (f"-{d}" if d else "") + ".png"
                    img.save(os.path.join(out_dir, rel))
                    tiles[f"{name}/{piece}" + (f"/{d}" if d else "")] = {
                        "file": rel, "size": px, "variants": count, "x": 0, "y": 0, "scale": scale}

manifest = {
    "version": 1,
    "source": "Factorio 1.1.110 base data (c) Wube Software. Local only, never commit or redistribute.",
    "animations": dict(sorted(out.items())),
    "tiles": tiles,
}
json.dump(manifest, open(out_path, "w"), indent=1)
print(len(out), "animations,", len(tiles), "tiles")
