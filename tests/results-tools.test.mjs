import assert from "node:assert/strict";
import { test } from "node:test";

import { cellAnswer, cellPolygon, checkResults, checkResultsLink, imageryTemplate, isGzip, passesThreshold, resultsBounds, selectCells, subGridSize } from "../docs/builder/results-tools.js";

const row = (cell, counts, extra = {}) => ({
  task_id: "20-485848-499534", task_partition_index: cell, tile_x: 485848, tile_y: 499534, tile_z: 20, url: "", ...counts, ...extra,
});
const fullGrid = (size, counts) => Array.from({ length: size * size }, (_, cell) => row(cell, counts));

test("the first cell is the top-left quarter of the tile and the last is the bottom-right", () => {
  const tile = cellPolygon(0, 0, 1, 1, 0).coordinates[0];
  const first = cellPolygon(0, 0, 1, 2, 0).coordinates[0];
  const last = cellPolygon(0, 0, 1, 2, 3).coordinates[0];
  assert.deepEqual(first[0], tile[0]);
  assert.deepEqual(last[2], tile[2]);
  assert.deepEqual(first[2], last[0]);
  assert.equal(first[0][0], -180);
  assert.equal(last[2][0], 0);
  assert.ok(Math.abs(last[2][1]) < 1e-9);
});

test("cell 1 of a 4x4 grid is the second cell of the top row", () => {
  const tile = cellPolygon(485848, 499534, 20, 1, 0).coordinates[0];
  const [west, north] = cellPolygon(485848, 499534, 20, 4, 1).coordinates[0][0];
  const width = tile[1][0] - tile[0][0];
  assert.ok(Math.abs(west - (tile[0][0] + width / 4)) < 1e-12);
  assert.equal(north, tile[0][1]);
});

test("the threshold keeps cells at exactly the share and drops cells just below it", () => {
  assert.equal(passesThreshold(row(0, { "0_count": 71, "1_count": 29, total_count: 100 }), 29), true);
  assert.equal(passesThreshold(row(0, { "0_count": 72, "1_count": 28, total_count: 100 }), 29), false);
  assert.equal(passesThreshold(row(0, { "0_count": 0, "1_count": 0, total_count: 0 }), 1), false);
});

test("Single and Multiple Features answers both count towards the share", () => {
  assert.equal(passesThreshold(row(0, { "0_count": 2, "1_count": 1, "2_count": 1, total_count: 4 }), 50), true);
});

test("results without a Multiple Features column count only Single Feature answers", () => {
  const cells = selectCells(fullGrid(4, { "0_count": 1, "1_count": 3, total_count: 4 }), 75);
  assert.equal(cells.features.length, 16);
  assert.deepEqual(cells.features[5].properties, {
    tile_id: "20-485848-499534", cell_index: 5, majority_answer: "Single Feature", single_feature_votes: 3, multiple_features_votes: 0, volunteers_total: 4, feature_vote_percent: 75,
  });
});

test("a cell is Multiple Features when Multiple answers equal or outnumber Single answers", () => {
  assert.equal(cellAnswer(row(0, { "1_count": 2, "2_count": 1 })), "Single Feature");
  assert.equal(cellAnswer(row(0, { "1_count": 1, "2_count": 1 })), "Multiple Features");
  assert.equal(cellAnswer(row(0, { "1_count": 0, "2_count": 3 })), "Multiple Features");
});

test("the sub-grid size follows the highest cell index, and a non-square count is rejected", () => {
  assert.equal(subGridSize(fullGrid(4, {})), 4);
  assert.equal(subGridSize(fullGrid(8, {})), 8);
  assert.throws(() => subGridSize([row(0, {}), row(4, {})]), /square grid/);
});

test("a file without the aggregated results columns is rejected", () => {
  assert.throws(() => checkResults([]), /Aggregated Results/);
  assert.throws(() => checkResults([{ task_id: "a" }]), /task_partition_index/);
  assert.doesNotThrow(() => checkResults([row(0, { "0_count": 1, "1_count": 0, total_count: 1 })]));
});

test("the imagery template replaces only the tile path of the row's URL", () => {
  const url = "https://example.org/cog/tiles/WebMercatorQuad/20/485848/499534@1x?url=https://bucket/20/1.tif";
  assert.equal(
    imageryTemplate({ url, tile_z: 20, tile_x: 485848, tile_y: 499534 }),
    "https://example.org/cog/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?url=https://bucket/20/1.tif",
  );
  assert.throws(() => imageryTemplate({ url, tile_z: 19, tile_x: 1, tile_y: 2 }), /tile path/);
});

test("the bounds run from the south-west corner of the lowest tile to the north-east of the highest", () => {
  const rows = [{ tile_x: 0, tile_y: 0, tile_z: 1 }, { tile_x: 1, tile_y: 1, tile_z: 1 }];
  const [[west, south], [east, north]] = resultsBounds(rows);
  assert.equal(west, -180);
  assert.equal(east, 180);
  assert.ok(south < -85 && north > 85);
});

test("gzip files are recognised by their first two bytes", () => {
  assert.equal(isGzip(new Uint8Array([0x1f, 0x8b, 8])), true);
  assert.equal(isGzip(new TextEncoder().encode("idx,task_id")), false);
});

test("only https results links on the MapSwipe backends are read", () => {
  const link = "https://backend-stage.mapswipe.org/media/project/897/asset/export/01M5CHWKW63AR0ZXFB2P3YXECN/agg_results_by_task_897.csv.gz";
  assert.equal(checkResultsLink(link), link);
  assert.doesNotThrow(() => checkResultsLink("https://backend.mapswipe.org/media/project/3451/agg_results_by_task_3451.csv.gz"));
  assert.throws(() => checkResultsLink("http://backend.mapswipe.org/media/a.csv.gz"), /Only results links/);
  assert.throws(() => checkResultsLink("https://backend.mapswipe.org.example.com/a.csv.gz"), /Only results links/);
  assert.throws(() => checkResultsLink("https://backend.mapswipe.org@example.com/a.csv.gz"), /Only results links/);
  assert.throws(() => checkResultsLink("https://user@backend.mapswipe.org/a.csv.gz"), /Only results links/);
  assert.throws(() => checkResultsLink("https://backend.mapswipe.org:8443/a.csv.gz"), /Only results links/);
  assert.throws(() => checkResultsLink("notaurl"), /Only results links/);
});

test("a split cell keeps both vote counts and rounds its percentage", () => {
  const [cell] = selectCells([row(0, { "0_count": 1, "1_count": 1, "2_count": 1, total_count: 3 })], 50).features;
  assert.deepEqual(cell.properties, {
    tile_id: "20-485848-499534", cell_index: 0, majority_answer: "Multiple Features",
    single_feature_votes: 1, multiple_features_votes: 1, volunteers_total: 3, feature_vote_percent: 67,
  });
});
