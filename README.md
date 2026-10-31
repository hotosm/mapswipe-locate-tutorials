# MapSwipe Locate tutorials

Step-by-step guides for creating a MapSwipe Locate Objects project, building its tutorial, publishing it and downloading the results. The site also hosts five helper pages: the area helper, which finds the imagery footprint and prepares the area of interest and cover image; the scenario builder, for picking tutorial tiles and marking their answers; the mosaic helper, which merges several images into one tile URL; the results helper, which turns the aggregated results into GeoJSON cells marked by a chosen share of volunteers; and the box helper, for marking each object on those tiles with a box or an outline and downloading them as a YOLO detection or segmentation dataset.

Published at <https://hotosm.github.io/mapswipe-locate-tutorials/>.

## Run locally

Requires [uv](https://docs.astral.sh/uv/), [just](https://just.systems/) and Node.js 22 or later.

```sh
just setup
just run
```

The guides are in `docs/`, the helper pages in `docs/builder/`. `just test` runs the helper tests and `just build` writes the site to `site/`.

