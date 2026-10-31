export const EXAMPLE_PROJECT = "https://mapswipe.org/en/projects/01M4XM3A1B2WV1T04A8SHV2DBK/";

const REQUIRED_COLUMNS = ["task_id", "task_partition_index", "0_count", "1_count", "total_count", "tile_x", "tile_y", "tile_z", "url"];

const RESULTS_HOSTS = ["backend.mapswipe.org", "backend-stage.mapswipe.org"];
const WEBSITE_HOSTS = ["mapswipe.org", "website-stage.mapswipe.org"];
const PROJECT_PATH = /^\/[a-z]{2}\/projects\/[0-9A-Za-z]+\/?$/;

function httpsUrl(link, hosts) {
  const url = URL.canParse(link) ? new URL(link) : null;
  const plain = url && url.protocol === "https:" && !url.port && !url.username && !url.password;
  return plain && hosts.includes(url.hostname) ? url : null;
}

// A shared page address makes the viewer's browser fetch the link, so only MapSwipe hosts are read.
export function checkResultsLink(link) {
  const url = httpsUrl(link, RESULTS_HOSTS);
  if (!url) throw new Error(`Only results links from ${RESULTS_HOSTS.join(" or ")} are read.`);
  return url.href;
}

// Website project pages are static and readable from any site; stage projects are often missing there, so direct results links are read too.
export function projectLink(link) {
  const page = httpsUrl(link, WEBSITE_HOSTS);
  if (page && PROJECT_PATH.test(page.pathname)) return { page: page.href };
  if (httpsUrl(link, RESULTS_HOSTS)) return { results: checkResultsLink(link) };
  throw new Error("Paste the project page link from mapswipe.org, for example https://mapswipe.org/en/projects/<id>/.");
}

// The website embeds each project's data, export links included, as JSON in the page.
export function projectResults(html) {
  const data = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (!data) throw new Error("This page has no project data.");
  const project = JSON.parse(data[1]).props?.pageProps;
  if (!project) throw new Error("This page has no project data.");
  const link = project.exportAggregatedResults?.file?.url;
  if (!link) throw new Error(`${project.name ?? "This project"} has no Aggregated Results yet.`);
  return { name: project.name, results: checkResultsLink(link) };
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

export function tileFractionToLonLat(x, y, zoom) {
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

const OPENAERIALMAP_TILES = /^https?:\/\/tiles\.openaerialmap\.org\/([0-9a-f]+\/\d+\/[0-9a-f]+)\/\{z\}\/\{x\}\/\{y\}(\.png)?$/;

// tiles.openaerialmap.org answers with a redirect to this titiler address that carries no CORS header, so browsers stop there.
function browserReadableTemplate(template) {
  const openAerialMap = template.match(OPENAERIALMAP_TILES);
  if (!openAerialMap) return template;
  return `https://titiler.hotosm.org/cog/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?url=https://oin-hotosm-temp.s3.us-east-1.amazonaws.com/${openAerialMap[1]}.tif`;
}

export function imageryTemplate({ url, tile_z: zoom, tile_x: x, tile_y: y }) {
  const tilePath = `/${zoom}/${x}/${y}`;
  if (!url.includes(tilePath)) throw new Error(`The imagery URL does not contain the tile path ${tilePath}.`);
  return browserReadableTemplate(url.replace(tilePath, "/{z}/{x}/{y}"));
}
