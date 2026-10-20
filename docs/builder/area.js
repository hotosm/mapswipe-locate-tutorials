import { imageryMask, parseImageId, pixelToLonLat, tileCount } from "./area-tools.js";

const API = "https://api.imagery.hotosm.org";
const PREVIEW_SIZE = 1024;
// Patches smaller than 2000 m² are white roofs or specks, not gaps in the imagery.
const MIN_PATCH_SQUARE_METRES = 2000;

const state = { footprint: null, area: null, zoom: 20 };
const element = (id) => document.getElementById(id);

const map = new maplibregl.Map({
  container: "map",
  style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e9ecf1" } }] },
  center: [0, 20],
  zoom: 1,
  canvasContextAttributes: { preserveDrawingBuffer: true },
});

function setStatus(message) {
  element("status").textContent = message;
}

function download(name, blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadGeoJson(name, feature) {
  download(name, new Blob([JSON.stringify(turf.featureCollection([feature]))], { type: "application/geo+json" }));
}

function showLayer(id, data, paint) {
  if (map.getSource(id)) {
    map.getSource(id).setData(data);
    return;
  }
  map.addSource(id, { type: "geojson", data });
  map.addLayer({ id, type: "line", source: id, paint });
}

function describeSize(feature) {
  return `${(turf.area(feature) / 1e6).toFixed(2)} km², about ${tileCount(turf.bbox(feature), state.zoom)} tiles at zoom ${state.zoom}`;
}

function dropSmallPatches(multiPolygon) {
  const largeEnough = (ring) => turf.area(turf.polygon([ring])) >= MIN_PATCH_SQUARE_METRES;
  const polygons = multiPolygon.coordinates
    .filter(([outer]) => largeEnough(outer))
    .map(([outer, ...holes]) => [outer, ...holes.filter(largeEnough)]);
  if (polygons.length === 0) throw new Error("No imagery found in this image.");
  return turf.multiPolygon(polygons);
}

async function findFootprint(imageId, bbox) {
  const response = await fetch(`${API}/raster/collections/openaerialmap/items/${imageId}/preview.png?assets=visual&max_size=${PREVIEW_SIZE}&dst_crs=epsg:4326`);
  if (!response.ok) throw new Error(`The imagery preview failed with HTTP ${response.status}.`);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);

  const mask = imageryMask(data, width, height);
  d3.blur2({ data: mask, width, height }, 1);
  const [outline] = d3.contours().size([width, height]).thresholds([0.5])(mask);
  const toLonLat = pixelToLonLat(bbox, width, height);
  const coordinates = outline.coordinates.map((polygon) => polygon.map((ring) => ring.map(toLonLat)));
  const footprint = dropSmallPatches({ type: "MultiPolygon", coordinates });
  return turf.simplify(footprint, { tolerance: (bbox[2] - bbox[0]) / width, highQuality: true });
}

element("setup").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const imageId = parseImageId(element("image").value);
    state.zoom = Number(element("zoom").value);
    setStatus("Loading the image and finding its footprint...");
    const response = await fetch(`${API}/stac/collections/openaerialmap/items/${imageId}`);
    if (!response.ok) throw new Error(`Image ${imageId} was not found (HTTP ${response.status}).`);
    const item = await response.json();

    const tileUrl = `${API}/raster/collections/openaerialmap/items/${imageId}/tiles/WebMercatorQuad/{z}/{x}/{y}?assets=visual&nodata=0`;
    if (map.getSource("imagery")) {
      map.removeLayer("imagery");
      map.removeSource("imagery");
    }
    map.addSource("imagery", { type: "raster", tiles: [tileUrl], tileSize: 256, maxzoom: 22, bounds: item.bbox });
    map.addLayer({ id: "imagery", type: "raster", source: "imagery" }, map.getLayer("footprint") ? "footprint" : undefined);
    map.fitBounds([[item.bbox[0], item.bbox[1]], [item.bbox[2], item.bbox[3]]], { padding: 20 });

    state.footprint = await findFootprint(imageId, item.bbox);
    state.area = null;
    showLayer("footprint", state.footprint, { "line-color": "#d73f3f", "line-width": 2 });
    showLayer("area", turf.featureCollection([]), { "line-color": "#ffdd00", "line-width": 3 });

    element("tile-url").textContent = tileUrl;
    element("footprint-size").textContent = describeSize(state.footprint);
    element("area-size").textContent = "Not drawn yet";
    element("details").hidden = false;
    for (const id of ["download-footprint", "draw", "cover"]) element(id).disabled = false;
    element("download-area").disabled = true;
    setStatus(`${item.properties?.title ?? imageId}: the red line is where the image has imagery. Draw the area volunteers will map inside it.`);
  } catch (error) {
    setStatus(error.message);
  }
});

element("zoom").addEventListener("change", () => {
  state.zoom = Number(element("zoom").value);
  if (state.footprint) element("footprint-size").textContent = describeSize(state.footprint);
  if (state.area) element("area-size").textContent = describeSize(state.area);
});

element("draw").addEventListener("click", () => {
  setStatus("Press and drag on the map to draw a rectangle.");
  map.dragPan.disable();
  map.getCanvas().style.cursor = "crosshair";
  let start = null;

  const rectangle = (end) => turf.bboxPolygon([
    Math.min(start.lng, end.lng), Math.min(start.lat, end.lat), Math.max(start.lng, end.lng), Math.max(start.lat, end.lat),
  ]);
  const onDown = (event) => { start = event.lngLat; };
  const onMove = (event) => { if (start) showLayer("area", rectangle(event.lngLat), {}); };
  const onUp = (event) => {
    map.off("mousedown", onDown);
    map.off("mousemove", onMove);
    map.dragPan.enable();
    map.getCanvas().style.cursor = "";
    const clipped = turf.intersect(turf.featureCollection([rectangle(event.lngLat), state.footprint]));
    if (!clipped) {
      showLayer("area", turf.featureCollection([]), {});
      setStatus("The rectangle has no imagery inside it. Draw again inside the red line.");
      return;
    }
    state.area = clipped;
    showLayer("area", clipped, {});
    element("area-size").textContent = describeSize(clipped);
    element("download-area").disabled = false;
    setStatus("The yellow line is the area of interest, cut to the imagery. Download it, or draw again.");
  };
  map.on("mousedown", onDown);
  map.on("mousemove", onMove);
  map.once("mouseup", onUp);
});

element("download-footprint").addEventListener("click", () => downloadGeoJson("imagery-footprint.geojson", state.footprint));
element("download-area").addEventListener("click", () => downloadGeoJson("area-of-interest.geojson", state.area));
element("cover").addEventListener("click", () => {
  const outlines = ["footprint", "area"];
  for (const id of outlines) map.setLayoutProperty(id, "visibility", "none");
  map.once("idle", () => {
    map.getCanvas().toBlob((blob) => download("cover-image.jpg", blob), "image/jpeg", 0.9);
    for (const id of outlines) map.setLayoutProperty(id, "visibility", "visible");
  });
  map.triggerRepaint();
});
