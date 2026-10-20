# MapSwipe Locate tutorials

Step-by-step guides for creating a MapSwipe Locate Objects project, building its tutorial, publishing it and downloading the results. The site also hosts two helper pages: the area helper, which finds the imagery footprint and prepares the area of interest and cover image, and the scenario builder, for picking tutorial tiles and marking their answers.

Published at <https://hotosm.github.io/mapswipe-locate-tutorials/>.

## Run locally

Requires [uv](https://docs.astral.sh/uv/), [just](https://just.systems/) and Node.js 22 or later.

```sh
just setup
just run
```

The guides are in `docs/`, the scenario builder in `docs/builder/`. `just test` runs the builder tests and `just build` writes the site to `site/`.

