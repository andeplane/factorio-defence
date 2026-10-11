# Graphics and the asset manifest

The game renders with Factorio's graphics when they are present locally, and
with generated placeholder graphics otherwise, so the repo runs for anyone.

**Factorio's graphics are © Wube Software and must never be committed.**
`public/assets/factorio/` is gitignored for this reason.

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
`base` (e.g. `base/graphics/entity/...`). Copy the files from a local install
(`Factorio.app/Contents/data/base/graphics/` on macOS) keeping those paths.

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
    "grass-1": { "file": "base/graphics/terrain/grass-1/hr-grass-1.png", "size": 64, "variants": 16, "scale": 0.5 }
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

### Keys the game uses today

`transport-belt/north`, `transport-belt/east`, `transport-belt/south`,
`transport-belt/west`, the eight curves `transport-belt/<from>_to_<to>`
(e.g. `transport-belt/east_to_north`: moving east, turning north, as in
`transport-belt-pictures.lua`), `assembling-machine-1`, `assembling-machine-1/shadow`,
`radar`, `radar/shadow`, `wooden-chest`; tiles `grass-1`, `dirt-1`, `sand-1`.

Fields the engine does not use yet (`directionCount`, `repeatCount`,
`variationCount`, `tint`, `applyRuntimeTint`, ...) are allowed and ignored.

Any key missing from the manifest (or whose image fails to load) falls back to
its placeholder, so the manifest can grow incrementally. Extra keys are fine
and will be picked up as prototypes start referencing them.
