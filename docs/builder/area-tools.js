const IMAGE_ID = /(?:selected_id=|\/items\/)([0-9a-f]{24}|[0-9a-f-]{36})|^([0-9a-f]{24}|[0-9a-f-]{36})$/;

export const IMAGE_HINT = "Paste an imagery.hotosm.org link, a Copy TMS URL or an image ID.";

export function matchImageId(text) {
  const match = text.trim().match(IMAGE_ID);
  return match ? match[1] ?? match[2] : null;
}

export function parseImageId(text) {
  const id = matchImageId(text);
  if (!id) throw new Error(IMAGE_HINT);
  return id;
}

// Drone mosaics pad their edges with white or black, which is not imagery.
export function isEmptyPixel(red, green, blue, alpha) {
  if (alpha === 0) return true;
  const bright = red >= 245 && green >= 245 && blue >= 245;
  const dark = red <= 10 && green <= 10 && blue <= 10;
  return bright || dark;
}

export function imageryMask(rgba, width, height) {
  const mask = new Float64Array(width * height);
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    mask[index] = isEmptyPixel(rgba[offset], rgba[offset + 1], rgba[offset + 2], rgba[offset + 3]) ? 0 : 1;
  }
  return mask;
}

// Some imagery records list the bbox latitudes north first; longitudes stay as listed, since west can exceed east across the antimeridian.
export function orderedBounds([west, y1, east, y2]) {
  return [west, Math.min(y1, y2), east, Math.max(y1, y2)];
}

// The preview covers the image bounds in EPSG:4326, so pixels map linearly to degrees.
export function pixelToLonLat([west, south, east, north], width, height) {
  return ([x, y]) => [west + (x / width) * (east - west), north - (y / height) * (north - south)];
}

function tileX(longitude, zoom) {
  return Math.floor(((longitude + 180) / 360) * 2 ** zoom);
}

function tileY(latitude, zoom) {
  const radians = (latitude * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * 2 ** zoom);
}

export function tileAt(longitude, latitude, zoom) {
  return { x: tileX(longitude, zoom), y: tileY(latitude, zoom) };
}

// An estimate: MapSwipe groups tiles in strips three rows tall and an even number of columns wide.
export function tileCount([west, south, east, north], zoom) {
  const columns = tileX(east, zoom) - tileX(west, zoom) + 1;
  const rows = tileY(south, zoom) - tileY(north, zoom) + 1;
  return (columns + (columns % 2)) * Math.ceil(rows / 3) * 3;
}

function ringBounds(ring) {
  const longitudes = ring.map(([longitude]) => longitude);
  const latitudes = ring.map(([, latitude]) => latitude);
  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
}

// Processing cuts the area into strips three rows tall from its northmost tile, then each part into its own columns.
export function multiPolygonTileCount(coordinates, zoom) {
  const bounds = coordinates.map(([outer]) => ringBounds(outer));
  const firstRow = tileY(Math.max(...bounds.map(([, , , north]) => north)), zoom);
  const strip = (latitude) => Math.floor((tileY(latitude, zoom) - firstRow) / 3);
  return bounds.reduce((sum, [west, south, east, north]) => {
    const columns = tileX(east, zoom) - tileX(west, zoom) + 1;
    return sum + (columns + (columns % 2)) * (strip(south) - strip(north) + 1) * 3;
  }, 0);
}

function tileLongitude(x, zoom) {
  return (x / 2 ** zoom) * 360 - 180;
}

function tileLatitude(y, zoom) {
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** zoom))) * 180) / Math.PI;
}

// The manager maps 2x2, 4x4 and 8x8 to one, two and three zoom levels deeper, so cell edges are tile edges at that zoom.
export function gridLines([west, south, east, north], zoom, cellsPerSide) {
  const cellZoom = zoom + Math.log2(cellsPerSide);
  const firstX = tileX(west, cellZoom);
  const lastX = tileX(east, cellZoom) + 1;
  const firstY = tileY(north, cellZoom);
  const lastY = tileY(south, cellZoom) + 1;
  const westEdge = tileLongitude(firstX, cellZoom);
  const eastEdge = tileLongitude(lastX, cellZoom);
  const northEdge = tileLatitude(firstY, cellZoom);
  const southEdge = tileLatitude(lastY, cellZoom);
  const line = (coordinates, kind) => ({ type: "Feature", properties: { kind }, geometry: { type: "LineString", coordinates } });
  const kindOf = (index) => (index % cellsPerSide === 0 ? "tile" : "cell");
  const lines = [];
  for (let x = firstX; x <= lastX; x++) lines.push(line([[tileLongitude(x, cellZoom), southEdge], [tileLongitude(x, cellZoom), northEdge]], kindOf(x)));
  for (let y = firstY; y <= lastY; y++) lines.push(line([[westEdge, tileLatitude(y, cellZoom)], [eastEdge, tileLatitude(y, cellZoom)]], kindOf(y)));
  return { type: "FeatureCollection", features: lines };
}

// A Web Mercator tile is 40,075,016.686 m (the equator) wide at zoom 0, and shrinks with the cosine of the latitude.
export function cellMetres(latitude, zoom, cellsPerSide) {
  return (40075016.686 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom / cellsPerSide;
}

// The zoom whose 256 px tile pixel is closest to the image's ground sample distance, as titiler picks the tilejson maxzoom.
export function finestZoom(latitude, gsdMetres) {
  return Math.round(Math.log2(cellMetres(latitude, 0, 256) / gsdMetres));
}

export function zoomProblem(zoom, latitude, gsdMetres) {
  if (!(gsdMetres > 0)) return null;
  const finest = finestZoom(latitude, gsdMetres);
  return zoom > finest ? `This image's resolution (GSD) is ${Number(gsdMetres.toPrecision(2))} m, so zoom ${finest + 1} and higher enlarge it and look blurred. Choose zoom ${finest} or lower.` : null;
}

export const RASTER_API = "https://tiles.imagery.hotosm.org/raster";

export function itemUrl(id) {
  return `${RASTER_API}/collections/openaerialmap/items/${id}`;
}

// The server ignores bidx, fails on four-band images and greys out unranged expressions, so bands go in as a ranged expression (the record's, or 0 to 255).
export function renderQuery(browse = {}) {
  const expression = browse.expression ?? (browse.bidx ?? [1, 2, 3]).map((band) => `b${band}`).join(";");
  const parts = [`assets=${browse.assets?.[0] ?? "visual"}`, `expression=${expression}`];
  for (const [min, max] of browse.rescale ?? [[0, 255]]) parts.push(`rescale=${min},${max}`);
  if (browse.colormap_name) parts.push(`colormap_name=${browse.colormap_name}`);
  if (browse.color_formula) parts.push(`color_formula=${encodeURIComponent(browse.color_formula)}`);
  parts.push(`nodata=${browse.nodata ?? 0}`);
  return parts.join("&");
}

// The backend refuses an area larger than 5·4^(23−zoom) km², and the manager a file over 1 MB.
const MAX_FILE_BYTES = 1024 * 1024;

export function maxAreaSquareKm(zoom) {
  return 5 * 4 ** (23 - zoom);
}

export function areaProblems(squareKm, zoom, fileBytes) {
  const problems = [];
  if (squareKm > maxAreaSquareKm(zoom)) problems.push(`MapSwipe accepts up to ${maxAreaSquareKm(zoom).toLocaleString("en")} km² at zoom ${zoom}. Draw a smaller area or choose a lower zoom.`);
  if (fileBytes > MAX_FILE_BYTES) problems.push(`The file is ${(fileBytes / MAX_FILE_BYTES).toFixed(1)} MB and MapSwipe accepts up to 1 MB. Draw a simpler area.`);
  return problems;
}
