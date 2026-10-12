# Graphics and the asset manifest

The game renders with Factorio's graphics when they are present locally, and
with generated placeholder graphics otherwise, so the repo runs for anyone.

**Factorio's graphics are © Wube Software and must never be committed.**
`public/assets/factorio/` is gitignored for this reason.

## Extracting from your Factorio install

```sh
FACTORIO_PATH="$HOME/Library/Application Support/Steam/steamapps/common/Factorio" npm run extract-sprites
```

`FACTORIO_PATH` can be the install folder, `factorio.app`, or its `data`
directory. Leave it unset to try the usual Steam and standalone locations on
macOS, Linux and Windows (Git Bash/WSL). It needs `lua` (5.2 or newer),
`python3` with Pillow, and `rsync`. Only Factorio 1.1 has been tested.

The script (`tools/factorio-extract/`) runs the game's own Lua prototype
definitions (`data/core` and `data/base`) outside the game, so every size,
frame count and shift in the manifest comes from the game data:

1. `load.lua` runs Factorio's data stage and builds `data.raw`.
2. `dump.lua` keeps the graphics of the prototypes a tower defence needs
   (belts, inserters, machines, fluids, power, turrets, walls, enemies,
   resources, tiles, projectiles, explosions, icons), prefers the
   `hr_version` sprites, and writes them to `prototypes.json` along with
   the list of image files they use.
3. The referenced images and all icons are copied into
   `public/assets/factorio/`.
4. `convert.py` flattens `prototypes.json` into `manifest.json` (the format
   below). It also cuts each tile's variant row into `tiles/<name>.png`, and
   pre-composites the 1.1 transition masks with the tile texture into
   `tiles/<name>-<piece>-<dir>.png`.

`prototypes.json` holds the full sprite trees (all layers and fields), for
anything the flat manifest leaves out.

## Layout

```
public/assets/factorio/
  manifest.json
  base/graphics/entity/transport-belt/hr-transport-belt.png   # mirrors data/base/graphics/...
  base/graphics/entity/assembling-machine-1/hr-assembling-machine-1.png
  base/graphics/terrain/...
```

Image paths in the manifest are relative to `public/assets/factorio/` and
keep Factorio's `__base__/graphics/...` path with `__base__` written as
`base` (e.g. `base/graphics/entity/...`). Derived tile images live in
`tiles/`.

Only the images behind the keys the game actually uses are fetched at
startup (`AssetStore.preload`), so the manifest can describe every sprite in
the game without slowing down loading.

## manifest.json

Field names are Factorio's prototype fields in camelCase, so values can be
copied from `data/base/prototypes/entity/*.lua`. For 1.1 entities use the
`hr_version` block (scale 0.5). `shift` is in tiles, as in Factorio
(`util.by_pixel(x, y)` = `[x / 32, y / 32]`).

```jsonc
{
  "version": 1,
  "animations": {
    // One entry per animation the game asks for (see "Keys" below).
    "assembling-machine-1": {
      "file": "base/graphics/entity/assembling-machine-1/hr-assembling-machine-1.png",
      "width": 214, "height": 226,
      "frameCount": 32, "lineLength": 8,
      "shift": [0, 0.0625],
      "scale": 0.5
    },
    "assembling-machine-1/shadow": {
      "file": "base/graphics/entity/assembling-machine-1/hr-assembling-machine-1-shadow.png",
      "width": 190, "height": 165,
      "frameCount": 32, "lineLength": 8,
      "shift": [0.265625, 0.15625],
      "scale": 0.5,
      "drawAsShadow": true
    },
    // Directional sheets: pick the row with "y" (Factorio 1.1 belt rows are
    // east=0, west=1, north=2, south=3, 128 px apart in the hr sheet).
    "transport-belt/east": {
      "file": "base/graphics/entity/transport-belt/hr-transport-belt.png",
      "width": 128, "height": 128, "y": 0,
      "frameCount": 16, "scale": 0.5
    }
  },
  "tiles": {
    // Optional. A row of `variants` square images, `size` px each.
    "grass-1": { "file": "tiles/grass-1.png", "size": 64, "variants": 16, "scale": 0.5, "layer": 26 },
    "grass-1/side/north": { "file": "tiles/grass-1-side-north.png", "size": 64, "variants": 8, "scale": 0.5 }
  }
}
```

### Animation fields

| field | default | meaning |
| --- | --- | --- |
| `file` / `files` | – | image path, or several (Factorio `filenames`) |
| `linesPerFile` | ∞ | rows per file when `files` is used |
| `width`, `height` | – | frame size in source px |
| `x`, `y` | 0 | offset of the first frame in the image |
| `frameCount` | 1 | frames (1 = static sprite) |
| `lineLength` | frameCount | frames per row |
| `scale` | 1 | 0.5 for hr sprites |
| `shift` | [0, 0] | sprite centre offset from entity centre, in tiles |
| `animationSpeed` | 1 | frames per tick (60 ticks/s) |
| `drawAsShadow` | false | render in the shadow layer |
| `additive` | false | additive blending (lights, glow) |
| `runMode` | forward | `forward`, `backward`, `forward-then-backward` |
| `tint` | – | colour multiplied into the layer, `{r,g,b,a}` or `[r,g,b,a]`, 0-1 or 0-255 (masks) |

### Tiles

A tile entry is a row of `variants` square images, `size` px each, starting
at `x`, `y`. Pre-slice each tile's variant row into its own image (e.g.
`tiles/grass-1.png`) rather than pointing into Factorio's terrain sheets:
with linear filtering, the GPU samples a little past each variant's edge, so
neighbouring rows or transparent padding in a shared sheet bleed in and show
up as seams between tiles. The engine also copies each variant into its own
padded cell at load time, so variants in one row cannot bleed into each other.

### Tile transitions

Each base tile entry carries Factorio's `layer`. Where a tile borders one of
a lower layer, the lower cell gets overlay pieces cut from the higher tile,
chosen from which of its edges and corners touch the higher tile (anything
at or above that layer counts, so borders run on under even higher tiles):

| key | the higher tile H lies |
| --- | --- |
| `H/side/<north\|east\|south\|west>` | across that one edge |
| `H/inner_corner/<ne\|se\|sw\|nw>` | along both edges meeting at that corner |
| `H/u_transition/<edge>` | along three edges; `<edge>` is the open one |
| `H/o_transition` | along all four edges |
| `H/outer_corner/<ne\|se\|sw\|nw>` | only diagonally, with neither adjacent edge H |

Two opposite edges draw two `side` pieces. Pieces are ordinary tile entries
(final RGBA colour, a row of `variants`), drawn centred on the cell at
`size * scale` world px (32 = one tile). Missing pieces are skipped; real
Factorio tiles never get placeholder borders.

### Directional layers

Sheets with several directions (units, turret guns) are split into one key
per direction as `<key>/dir/<d>`, with `d = 0` facing north and counting
clockwise (16 directions for units, 64 for turrets). Prototypes refer to them
as `<key>/dir/{dir}` and the engine picks `d` from the thing's orientation.
Mask layers (`/2`, `/3`) are greyscale and get their colour from `tint`.

### Keys the game uses today

`transport-belt/north`, `transport-belt/east`, `transport-belt/south`,
`transport-belt/west`, the eight curves `transport-belt/<from>_to_<to>`
(e.g. `transport-belt/east_to_north`: moving east, turning north, as in
`transport-belt-pictures.lua`), `assembling-machine-1`, `assembling-machine-1/shadow`,
`radar`, `radar/shadow`, `wooden-chest`, `pumpjack`, `pumpjack/shadow`,
`pumpjack/north`, `pumpjack/north/shadow`, `gun-turret`, `gun-turret/2`, `gun-turret/attacking_animation[/shadow|/2]/dir/{0-63}`,
`small-biter[/shadow|/2|/3]/dir/{0-15}` and the same for `medium-biter`;
tiles `grass-1`, `dirt-1`, `sand-1`. Layers that are neither in the manifest
nor have a placeholder are skipped and listed in one console warning.

Fields the engine does not use yet (`directionCount`, `repeatCount`,
`variationCount`, `tint`, `applyRuntimeTint`, ...) are allowed and ignored.

Any key missing from the manifest (or whose image fails to load) falls back to
its placeholder, so the manifest can grow incrementally. Extra keys are fine
and will be picked up as prototypes start referencing them.
