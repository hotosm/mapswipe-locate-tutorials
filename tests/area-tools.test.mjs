import assert from "node:assert/strict";
import { test } from "node:test";

import { imageryMask, isEmptyPixel, parseImageId, pixelToLonLat, tileCount } from "../docs/builder/area-tools.js";

const ID = "62d86c65d8499800053796c4";

test("the image ID is read from a browse link, a TMS URL or the bare ID", () => {
  assert.equal(parseImageId(`https://imagery.hotosm.org/browse?lat=27.6&lon=85.5&zoom=13&selected_id=${ID}`), ID);
  assert.equal(parseImageId(`https://api.imagery.hotosm.org/raster/collections/openaerialmap/items/${ID}/tiles/WebMercatorQuad/{z}/{x}/{y}?assets=visual`), ID);
  assert.equal(parseImageId(` ${ID} `), ID);
  const uuid = "f766000e-184d-4edb-aa65-da4fda986eee";
  assert.equal(parseImageId(`https://imagery.hotosm.org/browse?selected_id=${uuid}`), uuid);
  assert.equal(parseImageId(`https://api.imagery.hotosm.org/raster/collections/openaerialmap/items/${uuid}/tiles/WebMercatorQuad/{z}/{x}/{y}`), uuid);
  assert.equal(parseImageId(uuid), uuid);
  assert.throws(() => parseImageId("https://imagery.hotosm.org/browse"), /image ID/);
});

test("white, black and transparent pixels are empty, imagery pixels are not", () => {
  assert.equal(isEmptyPixel(255, 255, 255, 255), true);
  assert.equal(isEmptyPixel(0, 0, 0, 255), true);
  assert.equal(isEmptyPixel(120, 90, 60, 0), true);
  assert.equal(isEmptyPixel(250, 250, 200, 255), false);
  assert.equal(isEmptyPixel(30, 40, 20, 255), false);
  assert.equal(isEmptyPixel(245, 245, 245, 255), true);
  assert.equal(isEmptyPixel(244, 245, 245, 255), false);
  assert.equal(isEmptyPixel(10, 10, 10, 255), true);
  assert.equal(isEmptyPixel(11, 10, 10, 255), false);
});

test("the mask marks imagery pixels with 1 in reading order", () => {
  const rgba = [255, 255, 255, 255, 100, 120, 90, 255, 0, 0, 0, 255, 200, 180, 160, 255];
  assert.deepEqual(Array.from(imageryMask(rgba, 2, 2)), [0, 1, 0, 1]);
});

test("pixel corners map to the image bounds", () => {
  const toLonLat = pixelToLonLat([85.0, 27.0, 86.0, 28.0], 100, 50);
  assert.deepEqual(toLonLat([0, 0]), [85.0, 28.0]);
  assert.deepEqual(toLonLat([100, 50]), [86.0, 27.0]);
  assert.deepEqual(toLonLat([50, 25]), [85.5, 27.5]);
});

test("the tile count matches what MapSwipe processing created for the Banepa area", () => {
  assert.equal(tileCount([85.5205, 27.6295, 85.5235, 27.6322], 20), 120);
});

test("an odd column count rounds up to even, as MapSwipe groups do", () => {
  assert.equal(tileCount([85.5205, 27.6295, 85.5238, 27.6322], 20), 144);
});

test("a single tile counts as two columns and three rows", () => {
  const oneTile = [85.52051, 27.62951, 85.52052, 27.62952];
  assert.equal(tileCount(oneTile, 20), 6);
});
