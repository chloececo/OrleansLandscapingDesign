# Orleans Landscaping Design — The Garden Plan

An interactive landscape and planting design for the Orleans property. Seven
garden beds wrap the house; you can open any bed, see and rearrange its plants,
try different planting styles, preview how the bed will look in real life
(**elevation view**), and print or share a report.

The whole app is a single, self-contained `index.html` — no build step, no
dependencies, no backend. It's hosted as a static page on GitHub Pages.

## How to view

Just open [`index.html`](index.html) in any modern browser (double-click it, or
drag it into a browser tab). Everything — the catalog, the icons, the plan and
elevation renderers — is baked into that one file.

Your work auto-saves to the browser's `localStorage` (key `gardenPlan16`), so
reloading the page loses nothing.

## Project structure

| Path | What it is |
| --- | --- |
| [`index.html`](index.html) | The entire app — UI, plant catalog, bed data, plan + elevation renderers, save/report logic. ~600 KB. |
| [`garden_beds.json`](garden_beds.json) | Source bed geometry traced from the site sketch (polygons in image pixels, `px_per_foot` to convert to feet). The `BEDS` array inside `index.html` is derived from this. |
| [`version.json`](version.json) | `{"version":"…"}` — polled by the open page to show the "new version available" banner (see **Releasing**). |
| [`scratchpad/`](scratchpad/) | Design tooling, not shipped: plant-icon customizers/studios, the elevation-icon pickers, and various test/preview harnesses used to design the `ELEV_*` icons. |

## Data model

All of these live near the top of the `<script>` in `index.html`:

- **`BEDS`** (~line 795) — the seven beds: `id`, display `name`, `polygons`
  (pixels), `edges_ft`, `area_sqft`, `light`, a `blurb`, and `name_ideas`.
  Pixel coordinates are divided by `px_per_foot` (11.0) to get feet.
- **`PLANTS`** (same line) — the plant catalog keyed by plant id (`pid`), e.g.
  `boxwood`. Each entry has `name`, `sci` (botanical name), `color`, `spread`,
  `cat` (Shrub / Perennial / Grass / Fern / Groundcover / Herb / Vine / Tree),
  `light`, `drought`, `pollinator`, `deer`, `naNative`, `origin`, `wiki`.
- **`EXISTING`** (~line 805) — plants already in the ground, per bed. Each
  placement is `{eid, pid, x, y}` (feet), optionally `r`/`h` to override size.
- **`PINNED`** (~line 811) — feature plants pinned to a bed's centre by the
  auto-layout (e.g. a peony anchors the East Wing Bed).
- **`HT`** (~line 828) — mature height in feet per `pid`; drives back-to-front
  tiering in both the plan and the elevation view. Plants not listed fall back
  to a per-category default in `HTCAT`.
- **`ELEV_*`** icon tables — how each plant is drawn in the elevation view:
  `ELEV_SHRUB`, `ELEV_PEREN`, `ELEV_GRASS`, `ELEV_FERN`, `ELEV_VINE`,
  `ELEV_GROUND`, `ELEV_HERB`. Simple plants use a named `body`/shape; complex
  ones use `kind:'custom'` with parametric `bush`/`stem`/`leaf`/`flower`
  controls (these were tuned in the `scratchpad/` icon studios).
- **`BLOOMS`** (~line 2794) — selectable bloom colors (e.g. hydrangeas), synced
  between the plan circle and the elevation icon.

## Editing the design

- **Move / add an existing plant** — edit the `EXISTING` block: add a
  `{eid, pid, x, y}` entry under the bed's id, where `x`/`y` are in feet from
  the bed's origin and `pid` matches a key in `PLANTS`.
- **Add a plant to the catalog** — add an entry to `PLANTS` keyed by a new
  `pid`, give it an `HT` value (or let `HTCAT` cover it), and add an icon in the
  matching `ELEV_*` table so it renders in the elevation view.
- **Customize an elevation icon** — tweak the plant's entry in its `ELEV_*`
  table. For `kind:'custom'` plants, the parametric fields map to the controls
  in the `scratchpad/` icon studios, which are handy for previewing changes
  before pasting values back in.

## Conventions

Work is tracked through GitHub **issues** and **pull requests** — one issue per
feature/change, referenced from the PR (e.g. `(#57)`). Keep changes scoped and
mention the issue number in the commit/PR.

## Releasing / deploying

On **every** release, bump the version in **two** places to the same value so
users with the page already open get the "new version available" refresh banner:

1. `const APP_VERSION = '…'` near the bottom of `index.html`.
2. `version.json` — `{"version":"…"}`.

Use a date-based version like `2026-08-20.1` (bump the trailing number for a
second deploy the same day). The open page polls `version.json` on load, every
few minutes, and when the tab regains focus; when it no longer matches the
baked-in `APP_VERSION` it shows a Refresh prompt. User work auto-saves to
`localStorage` (`gardenPlan16`), so reloading loses nothing.
