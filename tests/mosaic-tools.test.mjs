import assert from "node:assert/strict";
import { test } from "node:test";

import { imageTitle, mosaicTileUrl, parseImageIds, parseImageIdsFromLink, unionBounds } from "../docs/builder/mosaic-tools.js";
import { tileImageUrl } from "../docs/builder/scenarios.js";
import { AREA_HINT } from "../docs/builder/area-tools.js";

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

test("the mosaic tile URL lists every image and fills in to a tile request in the tutorial builder", () => {
  assert.equal(
    tileImageUrl(mosaicTileUrl([BANEPA, TRAINING_CENTER]), 773386, 440490, 20),
    `https://tiles.imagery.hotosm.org/raster/collections/openaerialmap/tiles/WebMercatorQuad/20/773386/440490?ids=${BANEPA},${TRAINING_CENTER}&exitwhenfull=false&skipcovered=false&assets=visual&expression=b1;b2;b3&rescale=0,255&nodata=0`,
  );
});

test("the combined bounds cover every image", () => {
  assert.deepEqual(unionBounds([[85.49, 27.61, 85.54, 27.65], [85.54, 27.6, 85.55, 27.62]]), [85.49, 27.6, 85.55, 27.65]);
  assert.deepEqual(unionBounds([[-13.2991565, 8.5004312, -13.1252206, 8.3971738]]), [-13.2991565, 8.3971738, -13.1252206, 8.5004312]);
});

test("the merger's tile URL gives each of its images once, with or without spaces or an encoded comma, and any other link gives one image", () => {
  assert.deepEqual(parseImageIdsFromLink(mosaicTileUrl([BANEPA, TRAINING_CENTER, BANEPA])), [BANEPA, TRAINING_CENTER]);
  assert.deepEqual(parseImageIdsFromLink(mosaicTileUrl([BANEPA, TRAINING_CENTER]).replace(",", ", ")), [BANEPA, TRAINING_CENTER]);
  assert.deepEqual(parseImageIdsFromLink(mosaicTileUrl([BANEPA, TRAINING_CENTER]).replace(",", "%2C")), [BANEPA, TRAINING_CENTER]);
  assert.deepEqual(parseImageIdsFromLink(`https://imagery.hotosm.org/browse?selected_id=${BANEPA}`), [BANEPA]);
  assert.throws(() => parseImageIdsFromLink(`https://api.imagery.hotosm.org/raster/tiles?ids=${BANEPA},not-an-image`), /image ID/);
});

test("an image is named by its title and capture date, or by its ID when it has neither", () => {
  assert.equal(imageTitle({ id: BANEPA, properties: { title: "Banepa", datetime: "2022-04-15T00:00:00Z" } }), "Banepa (2022-04-15)");
  assert.equal(imageTitle({ id: BANEPA, properties: { start_datetime: "2023-09-07T05:00:00Z" } }), `${BANEPA} (2023-09-07)`);
  assert.equal(imageTitle({ id: BANEPA, properties: {} }), `${BANEPA} (no date)`);
});

test("the area finder's hint, naming the TiTiler option, shows for a link that is not an image or a merger list", () => {
  assert.throws(() => parseImageIdsFromLink("https://example.org/tiles/{z}/{x}/{y}.png", AREA_HINT), /TiTiler \/cog\/ tile URL/);
  assert.throws(() => parseImageIdsFromLink(`https://example.org/tiles?ids=${BANEPA},not-an-image`, AREA_HINT), /TiTiler \/cog\/ tile URL/);
});

test("parseImageIds expands a pasted merger tile URL so more images can join it", () => {
  assert.deepEqual(parseImageIds([mosaicTileUrl([BANEPA, TRAINING_CENTER])]), [BANEPA, TRAINING_CENTER]);
  const third = "64fac6d25ee57100013326ff";
  assert.deepEqual(parseImageIds([mosaicTileUrl([BANEPA, TRAINING_CENTER]), third]), [BANEPA, TRAINING_CENTER, third]);
  assert.deepEqual(parseImageIds([BANEPA, mosaicTileUrl([BANEPA, TRAINING_CENTER])]), [BANEPA, TRAINING_CENTER]);
  assert.throws(() => parseImageIds([mosaicTileUrl([BANEPA, TRAINING_CENTER]).replace(TRAINING_CENTER, "not-an-image")]), /^Error: Image 1: .*merged tile URL/);
  assert.throws(() => parseImageIds([`https://example.org/tiles?ids=%E0%A4,${BANEPA}`, TRAINING_CENTER]), /^Error: Image 1:/);
});
