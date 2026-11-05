---
icon: lucide/map
---

# View the results

The [results map](../builder/results.html) shows the cells volunteers marked over the project imagery, and downloads them as GeoJSON for labelling. Follow the steps in order.

## 1. Load the project

1. Open the [results map](../builder/results.html).
2. **Project link**: paste the address of the project page on the MapSwipe website, `https://mapswipe.org/en/projects/<firebase id>/`. [Download the results](download-results.md#from-the-mapswipe-website-production) shows where to find it.
3. Click **Load**. The map shows the imagery with the marked cells in red. Large projects take longer to load, and the imagery can take a minute to appear (observed in the results map).

For a project not on the website yet, such as a new stage project, paste its **Aggregated Results** link from the [MapSwipe API](download-results.md#from-the-mapswipe-api-stage-and-production) in the same field. **Try the Freetown example** loads the [example project](../examples/freetown-solar-panels.md).

## 2. Choose the volunteer share

Drag the **Volunteer share** slider to the share of volunteers a cell needs, for example 50%. The map keeps the cells where at least that share of volunteers marked the object, and the side panel counts them.

## 3. Check the cells

1. Scroll or pinch over the map to zoom in on the red cells.
2. Zoom in until the cells are clearly visible, then click a cell. Its votes open in a popup on the map. The [helpers page](../helpers/index.md#results-map) explains each value.

## 4. Download the cells

Click **Download cells**. The file has one square per kept cell, with `tile_id`, `cell_index`, `majority_answer`, `single_feature_votes`, `multiple_features_votes`, `volunteers_total` and `feature_vote_percent`.

<video src="../assets/results/results-map.mp4" autoplay loop muted playsinline aria-label="Loading the project, moving the volunteer share, opening a cell and downloading the cells"></video>

Next, [create a training dataset](training-data/index.md) from the marked tiles with the auto labeller, QGIS, Label Studio or OpenStreetMap. [Download the results](download-results.md) describes the project's export files, with every answer of every volunteer.
