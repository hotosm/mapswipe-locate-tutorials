---
icon: lucide/wrench
---

# Helpers

Pages that prepare the files the manager asks for and clean up the results. They run in the browser, and each has an example button to try it with sample data.

<div class="grid cards" markdown>

-   :lucide-crop: **[Area helper](../builder/area.html)**

    Paste an image from imagery.hotosm.org. Get its real footprint, an area of interest cut to the imagery with a tile estimate, the tile URL and a cover image.

-   :lucide-grid-3x3: **[Scenario builder](../builder/index.html)**

    Load the project's processed tasks, click tiles and cells to mark the tutorial answers, and download the scenario file.

-   :lucide-images: **[Mosaic helper](../builder/mosaic.html)**

    Add two or more images from imagery.hotosm.org. Get one tile URL that shows them all, and check it on the map.

-   :lucide-square-check: **[Results helper](../builder/results.html)**

    Load the Aggregated Results of a finished project, set the share of volunteers a cell needs, and download the cells as GeoJSON.

</div>

## Mosaic helper

Use it when the project area needs more than one image.

Before you start, copy the page address or **Copy TMS** of each image on <https://imagery.hotosm.org/browse>, as in [step 1 of Create a Locate project](../guides/create-a-project.md#1-prepare-the-area-tile-url-and-cover-image). Then open the [mosaic helper](../builder/mosaic.html). The numbers below match the numbers on the page.

1. Under **1. Images**, paste one image per field. Click **Add image** for each further image, and **Remove** to drop one. Click **Merge**.

    ![Mosaic helper with two images and the Merge button](../assets/helpers/mosaic-images.png)

    The map shows the merged imagery, with a red outline per image, and the list on the right shows each image with its date. Zoom in with the **+** button to check the imagery where the images meet.

2. Click **2. Copy tile URL** and use it as the **Custom Imagery Server URL** in the manager and as the tile URL in the scenario builder.

    ![Merged imagery, the tile URL and the copy button](../assets/helpers/mosaic-merged.png)

The tile URL lists the image IDs (`/raster/collections/openaerialmap/tiles/...?ids=<id>,<id>`), and the HOT imagery API merges those images on every tile request ([titiler-pgstac documentation](https://stac-utils.github.io/titiler-pgstac/latest/endpoints/collections_endpoints/)). To change the mosaic, edit the IDs in the URL.

- Where images overlap, the newest is drawn on top: pgstac sorts items by `datetime` descending by default ([source](https://github.com/stac-utils/pgstac/blob/main/src/pgstac/sql/002d_keyset.sql)).
- The URL sets `exitwhenfull=false` and `skipcovered=false`, so an older image still fills the parts of a tile where a newer image has no pixels.
- White or near-black edges of a newer image are drawn on top of older imagery. When they hide what volunteers need to see, leave that image out.
- The area helper reads one image at a time, so its footprint and area of interest cover only that image. For an area across several images, draw the area of interest in a tool such as <https://geojson.io>.

The **Load Banepa example** button merges two images over Banepa, Nepal.

## Results helper

Use it on a finished project to get only the cells volunteers marked, as GeoJSON.

Before you start, get the **Aggregated Results** link (`.csv.gz`) as described in [Download the results](../guides/download-results.md), or download the file. Then open the [results helper](../builder/results.html). The numbers below match the numbers on the page.

1. Paste the link under **1. Aggregated Results link**, or choose the file (`.csv.gz` or unzipped `.csv`), and click **Load**.

    ![Results helper with a results link and the Load button](../assets/helpers/results-load.png)

2. Move the **2.** slider to the share of volunteers a cell needs, for example 50%. The map and the counts under the slider update as you move it. Click a cell on the map to check its properties.
3. Click **3. Download cells** to save the GeoJSON. [Use the results in QGIS](../guides/qgis.md) continues from this file.

    To share the results, copy the page address: after a link loads, the address carries it, and the page loads it again when opened. The address carries the link only: it opens at 50%, so tell others the percentage you used. Results from a chosen file cannot be shared this way.

    ![Kept cells, a cell's properties, the slider and the download button](../assets/helpers/results-cells.png)

How the cells are chosen and drawn:

- A cell is kept when Single Feature and Multiple Features answers together make up at least the chosen share of the volunteers who saw it.
- Each kept cell becomes a square, cut from its tile row by row from the top left ([source](https://github.com/mapswipe/manager-dashboard/blob/develop/app/utils/geo.ts)). The split is done in Web Mercator, the projection the tiles are cut in.
- On the map, Multiple Features cells have the darker fill. Click a cell to see its properties.

The download has one feature per kept cell, with these properties:

| Property | Meaning |
|---|---|
| `tile_id` | The tile, as `zoom-x-y`, for example `20-773386-440490` (the `task_id` of the results) |
| `cell_index` | The cell inside the tile, counted row by row from the top left, starting at 0 (the `task_partition_index` of the results) |
| `majority_answer` | Which of the two feature answers got more votes: **Multiple Features** when at least as many volunteers answered Multiple Features as Single Feature, otherwise **Single Feature**. **No** answers are left out of the comparison |
| `single_feature_votes` | How many volunteers answered Single Feature (one tap) |
| `multiple_features_votes` | How many volunteers answered Multiple Features (two taps); 0 for projects without that answer |
| `volunteers_total` | How many volunteers saw the cell |
| `feature_vote_percent` | Single Feature and Multiple Features votes together, as a percentage of `volunteers_total`, rounded |

The vote counts show how volunteers split. For example, 6 Single Feature and 5 Multiple Features votes give `majority_answer` Single Feature, but nearly half saw several objects; check such cells on the imagery. `feature_vote_percent` and `volunteers_total` together show how sure the result is: 100% of 1 volunteer and 75% of 20 volunteers both pass a 50% threshold, but the second rests on many more answers.

The map shows the imagery from the `url` column of the file. For projects on `tiles.openaerialmap.org` the map stays blank under the cells, since that server sends no CORS headers; the download works the same.

The **Load Freetown example** button loads production project 3451, Locate Solar Panels Freetown (zoom 20, 4x4 cells).
