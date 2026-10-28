export const EXAMPLE_RESULTS = "https://backend.mapswipe.org/media/project/3451/asset/export/01M4XMNSMS88HMY96H3P356DR0/agg_results_by_task_3451.csv.gz";

const REQUIRED_COLUMNS = ["task_id", "task_partition_index", "0_count", "1_count", "total_count", "tile_x", "tile_y", "tile_z", "url"];

const RESULTS_HOSTS = ["backend.mapswipe.org", "backend-stage.mapswipe.org"];

// A shared page address makes the viewer's browser fetch the link, so only MapSwipe export hosts are read.
export function checkResultsLink(link) {
  const url = URL.canParse(link) ? new URL(link) : null;
  if (!url || url.protocol !== "https:" || !RESULTS_HOSTS.includes(url.hostname) || url.port || url.username || url.password) {
    throw new Error(`Only results links from ${RESULTS_HOSTS.join(" or ")} are read. Download the file and choose it instead.`);
  }
  return url.href;
}

export function isGzip(bytes) {
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export function checkResults(rows) {
  const missing = REQUIRED_COLUMNS.filter((column) => !(column in (rows[0] ?? {})));
  if (rows.length === 0 || missing.length > 0) {
    throw new Error(`This file is not an Aggregated Results CSV: it lacks ${missing.join(", ") || "rows"}.`);
  }
}

export function subGridSize(rows) {
  const cells = rows.reduce((largest, row) => Math.max(largest, row.task_partition_index), 0) + 1;
  const size = Math.sqrt(cells);
  if (!Number.isInteger(size)) throw new Error(`The cells per tile (${cells}) do not form a square grid.`);
  return size;
}

// Projects without Multiple Features have no 2_count column.
export function positiveCount(row) {
  return row["1_count"] + (row["2_count"] ?? 0);
}

// A tie between Single and Multiple counts as Multiple.
export function cellAnswer(row) {
  return (row["2_count"] ?? 0) >= row["1_count"] ? "Multiple Features" : "Single Feature";
}

// Compared in whole numbers so that, for example, 29 of 100 passes a 29% threshold.
export function passesThreshold(row, thresholdPercent) {
  return row.total_count > 0 && positiveCount(row) * 100 >= thresholdPercent * row.total_count;
}

function tileFractionToLonLat(x, y, zoom) {
  const size = 2 ** zoom;
  const longitude = (x / size) * 360 - 180;
  const latitude = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI;
  return [longitude, latitude];
}

// Cells are counted row by row from the top left, split evenly in Web Mercator.
export function cellPolygon(tileX, tileY, zoom, size, cell) {
  const west = tileX + (cell % size) / size;
  const north = tileY + Math.floor(cell / size) / size;
  const east = west + 1 / size;
  const south = north + 1 / size;
  const ring = [[west, north], [east, north], [east, south], [west, south], [west, north]];
  return { type: "Polygon", coordinates: [ring.map(([x, y]) => tileFractionToLonLat(x, y, zoom))] };
}

export function selectCells(rows, thresholdPercent) {
  const size = subGridSize(rows);
  return {
    type: "FeatureCollection",
    features: rows.filter((row) => passesThreshold(row, thresholdPercent)).map((row) => ({
      type: "Feature",
      geometry: cellPolygon(row.tile_x, row.tile_y, row.tile_z, size, row.task_partition_index),
      properties: {
        tile_id: row.task_id,
        cell_index: row.task_partition_index,
        majority_answer: cellAnswer(row),
        single_feature_votes: row["1_count"],
        multiple_features_votes: row["2_count"] ?? 0,
        volunteers_total: row.total_count,
        feature_vote_percent: Math.round((positiveCount(row) / row.total_count) * 100),
      },
    })),
  };
}

export function resultsBounds(rows) {
  let [west, north, east, south] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { tile_x: x, tile_y: y } of rows) {
    [west, north, east, south] = [Math.min(west, x), Math.min(north, y), Math.max(east, x), Math.max(south, y)];
  }
  const zoom = rows[0].tile_z;
  return [tileFractionToLonLat(west, south + 1, zoom), tileFractionToLonLat(east + 1, north, zoom)];
}

export function imageryTemplate({ url, tile_z: zoom, tile_x: x, tile_y: y }) {
  const tilePath = `/${zoom}/${x}/${y}`;
  if (!url.includes(tilePath)) throw new Error(`The imagery URL does not contain the tile path ${tilePath}.`);
  return url.replace(tilePath, "/{z}/{x}/{y}");
}
