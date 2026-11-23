# MapSwipe Locate tutorials

Step-by-step guides for creating a MapSwipe Locate Objects project, building its tutorial, publishing it, downloading the results and creating a training dataset. The site also hosts six helper pages:

- Area finder: finds the imagery footprint, uses it or drawn shapes as the area of interest, and prepares the cover image.
- Tutorial builder: picks tutorial tiles and marks their answers.
- Imagery merger: merges several images into one tile URL.
- Results map: turns the aggregated results into GeoJSON cells marked by a chosen share of volunteers.
- Auto labeller: marks each object on those tiles with a rotated box or an outline, or loads labels from a GeoJSON file, and downloads them as GeoJSON.
- Labels checker: checks a `labels.geojson` before delivery.

Published at <https://hotosm.github.io/mapswipe-locate-tutorials/>.

## Run locally

Requires [uv](https://docs.astral.sh/uv/), [just](https://just.systems/) and Node.js 22 or later.

```sh
just setup
just run
```

The guides are in `docs/`, the helper pages in `docs/builder/`. `just test` runs the helper tests and `just build` writes the site to `site/`.

The fAIr icon in `docs/builder/fair-logo.svg` comes from [hotosm/ui](https://github.com/hotosm/ui/blob/main/src/components/tool-menu/assets/icon-fair.svg), licensed GPL-3.0.
