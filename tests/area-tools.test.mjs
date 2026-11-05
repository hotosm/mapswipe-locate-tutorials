import assert from "node:assert/strict";
import { test } from "node:test";

import { areaProblems, cellMetres, gridLines, imageryMask, isEmptyPixel, maxAreaSquareKm, multiPolygonTileCount, orderedBounds, parseImageId, pixelToLonLat, tileAt, tileCount } from "../docs/builder/area-tools.js";

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

test("a bbox listed north first, as in the Freetown imagery record, is put in west, south, east, north order", () => {
  assert.deepEqual(orderedBounds([-13.2991565, 8.5004312, -13.1252206, 8.3971738]), [-13.2991565, 8.3971738, -13.1252206, 8.5004312]);
  assert.deepEqual(orderedBounds([85.0, 27.0, 86.0, 28.0]), [85.0, 27.0, 86.0, 28.0]);
  assert.deepEqual(orderedBounds([179.5, -17.0, -179.5, -16.0]), [179.5, -17.0, -179.5, -16.0]);
});

test("the tile count matches what MapSwipe processing created for the Freetown area", () => {
  assert.equal(tileCount([-13.197283, 8.454954, -13.171633, 8.467287], 20), 2964);
});

test("an odd column count rounds up to even, as MapSwipe groups do", () => {
  assert.equal(tileCount([85.5205, 27.6295, 85.5238, 27.6322], 20), 144);
});

test("a single tile counts as two columns and three rows", () => {
  const oneTile = [85.52051, 27.62951, 85.52052, 27.62952];
  assert.equal(tileCount(oneTile, 20), 6);
});

test("a view inside one tile draws the cell lines around it, and twice as many with 8x8", () => {
  const zoom = 20;
  const west = ((485854 + 0.3) / 2 ** zoom) * 360 - 180;
  const east = ((485854 + 0.6) / 2 ** zoom) * 360 - 180;
  const latitude = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** zoom))) * 180) / Math.PI;
  const lines = gridLines([west, latitude(499537 + 0.6), east, latitude(499537 + 0.3)], zoom, 4).features;
  const vertical = lines.filter((line) => line.geometry.coordinates[0][0] === line.geometry.coordinates[1][0]);
  const horizontal = lines.filter((line) => line.geometry.coordinates[0][1] === line.geometry.coordinates[1][1]);
  assert.deepEqual(vertical.map((line) => line.properties.kind), ["cell", "cell", "cell"]);
  assert.deepEqual(horizontal.map((line) => line.properties.kind), ["cell", "cell", "cell"]);
  const tileWest = (485854 / 2 ** zoom) * 360 - 180;
  const cellWidth = 360 / 2 ** zoom / 4;
  assert.ok(Math.abs(vertical[0].geometry.coordinates[0][0] - (tileWest + cellWidth)) < 1e-12);
  const fine = gridLines([west, latitude(499537 + 0.6), east, latitude(499537 + 0.3)], zoom, 8).features;
  const fineVertical = fine.filter((line) => line.geometry.coordinates[0][0] === line.geometry.coordinates[1][0]);
  assert.equal(fineVertical.length, 4);
  assert.ok(Math.abs(fineVertical[0].geometry.coordinates[0][0] - (tileWest + 2 * (cellWidth / 2))) < 1e-12);
});

test("in a 4x4 grid, the lines marked as tile edges fall on whole tiles and the others do not", () => {
  const verticals = gridLines([-13.186, 8.46, -13.184, 8.462], 20, 4).features.filter((line) => line.geometry.coordinates[0][0] === line.geometry.coordinates[1][0]);
  const tilePosition = (line) => ((line.geometry.coordinates[0][0] + 180) / 360) * 2 ** 20;
  const onWholeTile = (line) => Math.abs(tilePosition(line) - Math.round(tilePosition(line))) < 1e-6;
  assert.ok(verticals.some((line) => line.properties.kind === "tile"));
  for (const line of verticals) assert.equal(onWholeTile(line), line.properties.kind === "tile");
});

test("a cell at zoom 20 is about 9.5 m wide on the equator with 4x4, and smaller further from it", () => {
  assert.ok(Math.abs(cellMetres(0, 20, 4) - 9.5546) < 0.001);
  assert.ok(Math.abs(cellMetres(0, 20, 2) - 2 * cellMetres(0, 20, 4)) < 1e-9);
  assert.ok(Math.abs(cellMetres(60, 20, 4) - cellMetres(0, 20, 4) / 2) < 1e-9);
});

test("MapSwipe's area limit is 320 km² at zoom 20 and shrinks fourfold per zoom level", () => {
  assert.equal(maxAreaSquareKm(20), 320);
  assert.equal(maxAreaSquareKm(21), 80);
  assert.equal(maxAreaSquareKm(18), 5120);
});

test("an area at the limit passes, and one over it or over 1 MB is reported", () => {
  assert.deepEqual(areaProblems(320, 20, 1024 * 1024), []);
  assert.match(areaProblems(320.01, 20, 1000)[0], /up to 320 km² at zoom 20/);
  assert.match(areaProblems(1, 20, 1024 * 1024 + 1)[0], /accepts up to 1 MB/);
  assert.equal(areaProblems(321, 20, 2 * 1024 * 1024).length, 2);
});

const tileEdgeLatitude = (y, zoom) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** zoom))) * 180) / Math.PI;
const tileEdgeLongitude = (x, zoom) => (x / 2 ** zoom) * 360 - 180;
// A rectangle inside columns x to x + columns - 1 and rows y to y + rows - 1 at zoom 20.
const partOverTiles = (x, y, rows, columns = 2) => {
  const [west, east] = [tileEdgeLongitude(x + 0.1, 20), tileEdgeLongitude(x + columns - 0.1, 20)];
  const [north, south] = [tileEdgeLatitude(y + 0.1, 20), tileEdgeLatitude(y + rows - 0.1, 20)];
  return [[[west, south], [east, south], [east, north], [west, north], [west, south]]];
};

test("separate parts are counted one by one, not over the rectangle around them all", () => {
  const near = partOverTiles(485800, 499501, 3);
  const far = partOverTiles(486000, 499702, 3);
  assert.equal(multiPolygonTileCount([near], 20), 6);
  assert.ok(multiPolygonTileCount([near, far], 20) < tileCount([tileEdgeLongitude(485800, 20), tileEdgeLatitude(499705, 20), tileEdgeLongitude(486002, 20), tileEdgeLatitude(499501, 20)], 20));
});

test("a part that crosses a strip boundary of the whole area counts both strips", () => {
  const first = partOverTiles(485800, 499501, 3);
  const second = partOverTiles(486000, 499502, 3, 4);
  assert.equal(multiPolygonTileCount([first, second], 20), 2 * 3 + 4 * 6);
});

test("the tile at a point is the slippy map tile that contains it, changing exactly at the tile edges", () => {
  assert.deepEqual(tileAt(-13.19063, 8.46711, 20), { x: 485867, y: 499535 });
  assert.deepEqual(tileAt(-13.1908034, 8.4672785, 20), { x: 485867, y: 499535 });
  assert.deepEqual(tileAt(-13.1908037, 8.4672787, 20), { x: 485866, y: 499534 });
  assert.deepEqual(tileAt(-13.19063, 8.46711, 18), { x: 121466, y: 124883 });
});
