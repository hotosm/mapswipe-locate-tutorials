# MapSwipe Locate tutorials

Step-by-step guides for creating a MapSwipe Locate Objects project, building its tutorial, publishing it and downloading the results. The site also hosts five helper pages: the area finder, which finds the imagery footprint and prepares the area of interest and cover image; the tutorial builder, for picking tutorial tiles and marking their answers; the imagery merger, which merges several images into one tile URL; the results map, which turns the aggregated results into GeoJSON cells marked by a chosen share of volunteers; and the auto labeller, for marking each object on those tiles with a box or an outline and downloading them as a YOLO detection or segmentation dataset with a GeoJSON of the labels.

Published at <https://hotosm.github.io/mapswipe-locate-tutorials/>.

## Run locally

Requires [uv](https://docs.astral.sh/uv/), [just](https://just.systems/) and Node.js 22 or later.

```sh
just setup
just run
```

The guides are in `docs/`, the helper pages in `docs/builder/`. `just test` runs the helper tests and `just build` writes the site to `site/`.

The fAIr icon in `docs/builder/fair-logo.svg` comes from [hotosm/ui](https://github.com/hotosm/ui/blob/main/src/components/tool-menu/assets/icon-fair.svg), licensed GPL-3.0.
