import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from "https://cdn.jsdelivr.net/npm/terra-draw@1.37.0/+esm";
import { TerraDrawMapLibreGLAdapter } from "https://cdn.jsdelivr.net/npm/terra-draw-maplibre-gl-adapter@1.5.0/+esm";
import { areaProblems, cellMetres, gridLines, imageryMask, multiPolygonTileCount, orderedBounds, parseImageId, pixelToLonLat } from "./area-tools.js";
import { foldSetup, setStatus } from "./setup-card.js";

const API = "https://api.imagery.hotosm.org";
const PREVIEW_SIZE = 1024;
// Patches smaller than 2000 m² are white roofs or specks, not gaps in the imagery.
const MIN_PATCH_SQUARE_METRES = 2000;

const EXAMPLE_IMAGE = "https://imagery.hotosm.org/browse?selected_id=69075f1de47603686de24fe8";
// A map zoom three levels above the project zoom shows each tile 64 pixels wide; further out the lines merge.
const GRID_ZOOM_SPAN = 3;
const state = { footprint: null, area: null, zoom: 20, cells: 4 };
const element = (id) => document.getElementById(id);
const chosenZoom = () => Number(document.querySelector('input[name="zoom"]:checked').value);
const chosenCells = () => Number(document.querySelector('input[name="cells"]:checked').value);

const map = new maplibregl.Map({
  container: "map",
  style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e9ecf1" } }] },
  center: [0, 20],
  zoom: 1,
  canvasContextAttributes: { preserveDrawingBuffer: true },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }));

const DRAWN_STYLE = { fillColor: "#ffffff", fillOpacity: 0, outlineColor: "#ffffff", outlineWidth: 2 };
let draw = null;
const drawReady = new Promise((resolve) => map.on("load", () => {
  draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map }),
    modes: [
      new TerraDrawPolygonMode({ styles: DRAWN_STYLE }),
      new TerraDrawSelectMode({ flags: { polygon: { feature: { draggable: true, coordinates: { draggable: true, midpoints: true, deletable: true } } } } }),
    ],
  });
  draw.start();
  draw.on("finish", showArea);
  draw.on("change", (ids, type) => type === "delete" && showArea());
  resolve();
}));

function download(name, blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Terra Draw's layers stay on top, so drawn shapes and their corners can be seen and grabbed.
function drawingLayer() {
  return map.getStyle().layers.find(({ id }) => id.startsWith("td-"))?.id;
}

function showLayer(id, data, paint) {
  if (map.getSource(id)) {
    map.getSource(id).setData(data);
    return;
  }
  map.addSource(id, { type: "geojson", data });
  map.addLayer({ id, type: "line", source: id, paint }, drawingLayer());
}

function showGrid() {
  if (!state.footprint) return;
  const visible = map.getZoom() >= state.zoom - GRID_ZOOM_SPAN;
  const bounds = map.getBounds();
  showLayer("grid", visible ? gridLines([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()], state.zoom, state.cells) : turf.featureCollection([]), {
    "line-color": "#ffffff",
    "line-opacity": ["match", ["get", "kind"], "tile", 0.9, 0.6],
    "line-width": ["match", ["get", "kind"], "tile", 2, 1],
  });
  const [, latitude] = turf.centroid(state.footprint).geometry.coordinates;
  const metres = cellMetres(latitude, state.zoom, state.cells).toFixed(1);
  const hint = visible ? "" : ". Zoom in to see the grid";
  element("cell-size").textContent = `about ${metres} m by ${metres} m at zoom ${state.zoom}, ${state.cells}x${state.cells}${hint}`;
}

function areaFile(feature) {
  return new Blob([JSON.stringify(turf.featureCollection([feature]))], { type: "application/geo+json" });
}

function drawnPolygons() {
  return draw.getSnapshot().filter((feature) => feature.properties.mode === "polygon" && feature.geometry.type === "Polygon" && !feature.properties.currentlyDrawing);
}

// Every drawn shape is cut to the footprint, and the pieces together form one MultiPolygon feature.
function chosenArea() {
  const drawn = drawnPolygons();
  if (drawn.length === 0) return state.footprint;
  const merged = drawn.length === 1 ? drawn[0] : turf.union(turf.featureCollection(drawn));
  const clipped = turf.intersect(turf.featureCollection([merged, state.footprint]));
  return clipped && turf.multiPolygon(clipped.geometry.type === "Polygon" ? [clipped.geometry.coordinates] : clipped.geometry.coordinates);
}

function showArea() {
  state.area = chosenArea();
  element("use-footprint").disabled = drawnPolygons().length === 0;
  element("download-area").disabled = !state.area;
  showFill("area", state.area ?? turf.featureCollection([]));
  if (!state.area) {
    element("area-size").textContent = "Outside the imagery. Draw inside the red line.";
    element("area-problems").textContent = "";
    return;
  }
  const squareKm = turf.area(state.area) / 1e6;
  element("area-size").textContent = `${squareKm.toFixed(2)} km², about ${multiPolygonTileCount(state.area.geometry.coordinates, state.zoom).toLocaleString("en")} tiles at zoom ${state.zoom}`;
  element("area-problems").textContent = areaProblems(squareKm, state.zoom, areaFile(state.area).size).join(" ");
}

function showFill(id, data) {
  if (map.getSource(id)) {
    map.getSource(id).setData(data);
    return;
  }
  map.addSource(id, { type: "geojson", data });
  map.addLayer({ id: `${id}-fill`, type: "fill", source: id, paint: { "fill-color": "#ffdd00", "fill-opacity": 0.2 } }, drawingLayer());
  map.addLayer({ id, type: "line", source: id, paint: { "line-color": "#ffdd00", "line-width": 3 } }, drawingLayer());
}

function stopDrawing() {
  draw.setMode("select");
  element("draw").textContent = "Draw area";
  element("draw").setAttribute("aria-pressed", "false");
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
    await drawReady;
    const imageId = parseImageId(element("image").value);
    state.zoom = chosenZoom();
    state.cells = chosenCells();
    setStatus("Loading the image...");
    const response = await fetch(`${API}/stac/collections/openaerialmap/items/${imageId}`);
    if (!response.ok) throw new Error(`Image ${imageId} was not found (HTTP ${response.status}).`);
    const item = await response.json();
    const bounds = orderedBounds(item.bbox);

    const tileUrl = `${API}/raster/collections/openaerialmap/items/${imageId}/tiles/WebMercatorQuad/{z}/{x}/{y}?assets=visual&nodata=0`;
    if (map.getSource("imagery")) {
      map.removeLayer("imagery");
      map.removeSource("imagery");
    }
    map.addSource("imagery", { type: "raster", tiles: [tileUrl], tileSize: 256, maxzoom: 22, bounds });
    map.addLayer({ id: "imagery", type: "raster", source: "imagery" }, map.getStyle().layers[1]?.id);
    map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 20 });

    state.footprint = await findFootprint(imageId, bounds);
    showLayer("footprint", state.footprint, { "line-color": "#d73f3f", "line-width": 2 });
    draw.clear();
    stopDrawing();
    showArea();

    showGrid();
    element("tile-url").textContent = tileUrl;
    element("details").hidden = false;
    for (const id of ["draw", "cover"]) element(id).disabled = false;
    foldSetup(item.properties?.title ?? imageId);
    setStatus("The yellow area is the imagery footprint, ready to download. Draw area to choose part of it.");
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
});

element("example").addEventListener("click", () => {
  element("image").value = EXAMPLE_IMAGE;
  document.querySelector('input[name="zoom"][value="20"]').checked = true;
  element("setup").requestSubmit();
});

element("sub-grid").addEventListener("change", () => {
  state.cells = chosenCells();
  showGrid();
});

map.on("moveend", showGrid);

element("zoom-levels").addEventListener("change", () => {
  state.zoom = chosenZoom();
  showGrid();
  if (state.footprint) showArea();
});

element("draw").addEventListener("click", () => {
  if (draw.getMode() === "polygon") {
    stopDrawing();
    setStatus("Click a shape to move it or drag its corners.");
    return;
  }
  draw.setMode("polygon");
  element("draw").textContent = "Done";
  element("draw").setAttribute("aria-pressed", "true");
  setStatus("Click to add corners, and click the first corner to close the shape. Draw more shapes for separate places.");
});

element("use-footprint").addEventListener("click", () => {
  draw.clear();
  stopDrawing();
  showArea();
  setStatus("The yellow area is the imagery footprint.");
});

element("download-area").addEventListener("click", () => download("area-of-interest.geojson", areaFile(state.area)));
element("cover").addEventListener("click", () => {
  const outlines = ["footprint", "area", "area-fill", "grid", ...map.getStyle().layers.map(({ id }) => id).filter((id) => id.startsWith("td-"))];
  for (const id of outlines) map.setLayoutProperty(id, "visibility", "none");
  map.once("idle", () => {
    map.getCanvas().toBlob((blob) => download("cover-image.jpg", blob), "image/jpeg", 0.9);
    for (const id of outlines) map.setLayoutProperty(id, "visibility", "visible");
  });
  map.triggerRepaint();
});
