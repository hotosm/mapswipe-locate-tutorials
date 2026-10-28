import assert from "node:assert/strict";
import { test } from "node:test";

import { mosaicTileUrl, parseImageIds, unionBounds } from "../docs/builder/mosaic-tools.js";
import { tileImageUrl } from "../docs/builder/scenarios.js";

const BANEPA = "62d86c65d8499800053796c4";
const TRAINING_CENTER = "64fac6d25ee57100013326fb";

test("each field holds one image, empty fields are skipped and a repeated image counts once", () => {
  const values = [
    `https://imagery.hotosm.org/browse?lat=27.6&selected_id=${BANEPA}`,
    "  ",
    `https://api.imagery.hotosm.org/raster/collections/openaerialmap/items/${TRAINING_CENTER}/tiles/WebMercatorQuad/{z}/{x}/{y}?assets=visual`,
    BANEPA,
  ];
  assert.deepEqual(parseImageIds(values), [BANEPA, TRAINING_CENTER]);
});

test("fewer than two different images is rejected, and a bad field is named by its position", () => {
  assert.throws(() => parseImageIds([BANEPA, BANEPA]), /at least two/);
  assert.throws(() => parseImageIds([BANEPA, "not-an-image"]), /^Error: Image 2: .*image ID/);
  assert.throws(() => parseImageIds(["", BANEPA, "not-an-image"]), /^Error: Image 3:/);
});

test("the mosaic tile URL lists every image and fills in to a tile request in the scenario builder", () => {
  assert.equal(
    tileImageUrl(mosaicTileUrl([BANEPA, TRAINING_CENTER]), 773386, 440490, 20),
    `https://api.imagery.hotosm.org/raster/collections/openaerialmap/tiles/WebMercatorQuad/20/773386/440490?ids=${BANEPA},${TRAINING_CENTER}&exitwhenfull=false&skipcovered=false&assets=visual&nodata=0`,
  );
});

test("the combined bounds cover every image", () => {
  assert.deepEqual(unionBounds([[85.49, 27.61, 85.54, 27.65], [85.54, 27.6, 85.55, 27.62]]), [85.49, 27.6, 85.55, 27.65]);
});
