# perlin-canvas

A small, dependency-free animated background: a grid of tiny "lamp" cells
driven by layered Perlin noise, each one snapping between a handful of
brightness steps and picking its color off a hue path. No libraries, no
build step — one `<canvas>` and about 150 lines of vanilla JS.

![Preview](preview.png)

**[Live demo](https://claude.ai/code/artifact/c28f42b6-981e-4e55-9b0a-cf4b3cecc245)**

## What it's doing

- **Noise field.** A seeded 3D Perlin noise, combined at three octaves
  (`fbm`), drives each cell's brightness over time. A second, independent
  noise field drives each cell's *hue*, so color and brightness drift
  separately instead of moving together.
- **Popcorn twinkle, not a fade.** Each cell gets its own fixed random
  threshold (a cheap integer hash of its grid position), so as the noise
  field sweeps past that threshold, cells snap on individually — a "popcorn"
  effect — rather than the whole field softly pulsing as one sheet.
- **Six brightness steps, seven hue bands.** Both the brightness and hue
  values are quantized before use, so the field reads as distinct lit cells
  in distinct shades, not a smooth gradient wash.
- **RGB subpixel rendering.** Each lit cell is drawn as three vertical
  slivers — pure red, pure green, pure blue — composited with
  `globalCompositeOperation = 'lighter'` (additive blending). Overlapping
  glow pushes toward a warm highlight, and the split channels give the whole
  field a low-res LED/circuit-board texture instead of flat colored squares.
- **Drifting density.** A slow, large-scale noise field modulates how many
  cells are eligible to light up in a given region, so brighter and dimmer
  patches drift across the canvas over time — like embers shifting in a bed
  of coals — rather than one flat, uniform texture.
- **Respects `prefers-reduced-motion`.** If the OS setting is on, the field
  renders one static frame and stops there instead of animating.

## Where this came from

The mechanism (grid of noise-driven cells, additive RGB-subpixel
rendering, per-cell popcorn thresholds) is a recreation of the animated
hero background on [pinloop.ai](https://pinloop.ai/), reverse-engineered
from its shipped source and rebuilt independently — same technique, new
palette (their build runs a blue/violet/orchid hue path; this one runs
ember-orange through gold into jade-green) and a different masking
approach (their version clears text zones for page copy; this one is a
full-bleed, general-purpose background with a slow density drift instead).

## Using it

`main.js` exposes a single global, `PerlinCanvas.mount(canvas, options)`.
Point it at any canvas element (sized by CSS however you like — full-page,
a card, a hero banner) and it sizes itself to that canvas's box and redraws
on resize:

```html
<canvas id="field" style="position: fixed; inset: 0; width: 100%; height: 100%"></canvas>
<script src="main.js"></script>
<script>
  var field = PerlinCanvas.mount(document.getElementById('field'), {
    hues: ['#ff5a1f', '#f4c430', '#2fb88a'],
    cellSize: 11,
    speed: 1,
    density: 1,
  });
</script>
```

`mount()` returns a small handle:

| Method | Does |
| --- | --- |
| `setOptions(partial)` | Merge in new options and redraw immediately — safe to call every frame from a slider's `input` event. |
| `stop()` / `start()` | Pause and resume the animation loop. |
| `destroy()` | Stop and drop the window resize listener. |

### Options

| Option | Default | Controls |
| --- | --- | --- |
| `hues` | ember → jade, 7 stops | The color path a cell's hue is drawn from. Hex strings or `[r,g,b]` triples, in visual order. |
| `dark` | `'#080907'` | The unlit floor color cells ramp up from. |
| `pale` | `'#ffeed6'` | The hottest highlight color cells ramp up to. |
| `cellSize` | `11` | CSS px per lamp cell — smaller reads finer-grained, larger reads chunkier. |
| `speed` | `1` | Multiplies elapsed time before it reaches the noise fields — pacing, not frame rate. `2` is twice as fast, `0.5` half as fast. |
| `density` | `1` | Multiplies how many cells are eligible to light up. Below `1` is sparser, above `1` fuller (it saturates past roughly `1.6`). |
| `fps` | `24` | Frames per second the draw loop targets. |
| `seed` | `20260911` | Seeds the noise lattice — change it for a different arrangement of where cells tend to cluster. |
| `respectReducedMotion` | `true` | Freeze on a single frame when the OS requests reduced motion. |

The demo page (`index.html`) wires all of these except `dark`/`pale`/`fps`/`seed`
up to a small control panel in the top-right corner, with three palette
presets (Ember/Jade, Cobalt/Orchid, Rose/Gold) — open it locally or via the
live demo link above and play with the sliders.

### As a desktop wallpaper

This is a live web page, not a static image, so getting it onto a desktop
takes one extra step:

- Use an HTML-capable wallpaper engine (e.g. [Lively
  Wallpaper](https://www.rocksdanister.com/lively/) on Windows) and point it
  at `index.html` directly, or
- Screen-record a loop, or grab a still frame you like, and use that as a
  conventional static wallpaper.

## License

MIT — see [LICENSE](LICENSE).
