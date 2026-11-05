import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from "https://cdn.jsdelivr.net/npm/terra-draw@1.37.0/+esm";
import { TerraDrawMapLibreGLAdapter } from "https://cdn.jsdelivr.net/npm/terra-draw-maplibre-gl-adapter@1.5.0/+esm";
import { areaProblems, cellMetres, gridLines, imageryMask, multiPolygonTileCount, orderedBounds, pixelToLonLat, tileAt } from "./area-tools.js";
import { tileImageUrl } from "./scenarios.js";
import { fetchItem, imageTitle, mosaicTileUrl, parseImageIdsFromLink, unionBounds } from "./mosaic-tools.js";
import { showMapLoading } from "./map-loading.js";
import { copyText, foldSetup, setStatus, working } from "./setup-card.js";

const API = "https://api.imagery.hotosm.org";
// The imagery API can take minutes to render a 1024 px preview it has not made before, and 512 px takes seconds.
const PREVIEW_SIZE = 512;
// Patches smaller than 2000 m² are white roofs or specks, not gaps in the imagery.
const MIN_PATCH_SQUARE_METRES = 2000;

const EXAMPLE_IMAGE = "https://imagery.hotosm.org/browse?selected_id=69075f1de47603686de24fe8";
// A map zoom three levels above the project zoom shows each tile 64 pixels wide; further out the lines merge.
const GRID_ZOOM_SPAN = 3;
const state = { footprint: null, area: null, zoom: 20, cells: 4, load: 0, tileUrl: "" };
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
showMapLoading(map);

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

function showVolunteerView() {
  element("volunteer-view").hidden = !state.footprint;
  if (!state.footprint) return;
  const { lng, lat } = map.getCenter();
  const { x, y } = tileAt(lng, lat, state.zoom);
  element("view-hint").hidden = turf.booleanPointInPolygon([lng, lat], state.footprint);
  element("view-image").src = tileImageUrl(state.tileUrl, x, y, state.zoom);
  const cells = element("view-cells");
  cells.style.gridTemplateColumns = `repeat(${state.cells}, 1fr)`;
  cells.replaceChildren(...Array.from({ length: state.cells ** 2 }, () => document.createElement("span")));
}

// The middle of the image bounds can fall on a gap or an edge, so the map starts on the point deepest inside the imagery.
function centreOnImagery() {
  const [west, south, east, north] = turf.bbox(state.footprint);
  const spacing = Math.max(east - west, north - south) / 20;
  const candidates = turf.pointGrid([west, south, east, north], spacing, { units: "degrees", mask: state.footprint }).features;
  const depths = [turf.pointOnFeature(state.footprint), ...candidates].map((point) => [point, turf.pointToPolygonDistance(point, state.footprint)]);
  const [deepest] = depths.reduce((best, entry) => (entry[1] < best[1] ? entry : best));
  map.jumpTo({ ...map.cameraForBounds([[west, south], [east, north]], { padding: 20 }), center: deepest.geometry.coordinates });
}

function areaFile(feature) {
  return new Blob([JSON.stringify(turf.featureCollection([feature]))], { type: "application/geo+json" });
}

function drawnPolygons() {
  return draw.getSnapshot().filter((feature) => feature.properties.mode === "polygon" && feature.geometry.type === "Polygon" && !feature.properties.currentlyDrawing);
}

function asMultiPolygon({ geometry }) {
  return turf.multiPolygon(geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates);
}

function joined(features) {
  return features.length === 1 ? features[0] : turf.union(turf.featureCollection(features));
}

// Every drawn shape is cut to the footprint, and the pieces together form one MultiPolygon feature.
function chosenArea() {
  const drawn = drawnPolygons();
  if (drawn.length === 0) return state.footprint;
  const clipped = turf.intersect(turf.featureCollection([joined(drawn), state.footprint]));
  return clipped && asMultiPolygon(clipped);
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

function dropSmallPatches(multiPolygon, imageId) {
  const largeEnough = (ring) => turf.area(turf.polygon([ring])) >= MIN_PATCH_SQUARE_METRES;
  const polygons = multiPolygon.coordinates
    .filter(([outer]) => largeEnough(outer))
    .map(([outer, ...holes]) => [outer, ...holes.filter(largeEnough)]);
  if (polygons.length === 0) throw new Error(`No imagery found in image ${imageId}.`);
  return turf.multiPolygon(polygons);
}

async function findFootprint(imageId, bbox) {
  const response = await fetch(`${API}/raster/collections/openaerialmap/items/${imageId}/preview.png?assets=visual&max_size=${PREVIEW_SIZE}&dst_crs=epsg:4326`);
  if (!response.ok) throw new Error(`The preview of image ${imageId} failed with HTTP ${response.status}.`);
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
  const footprint = dropSmallPatches({ type: "MultiPolygon", coordinates }, imageId);
  return turf.simplify(footprint, { tolerance: (bbox[2] - bbox[0]) / width, highQuality: true });
}

// Images can lie far apart, so each one in the list zooms the map to its footprint.
function showImageList(items, footprints) {
  element("image-list").replaceChildren(...items.map((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "link";
    button.textContent = imageTitle(item);
    button.addEventListener("click", () => map.fitBounds(turf.bbox(footprints[index]), { padding: 20 }));
    const entry = document.createElement("li");
    entry.append(button);
    return entry;
  }));
  for (const id of ["images-label", "images"]) element(id).hidden = items.length === 1;
}

function clearArea() {
  state.footprint = null;
  state.area = null;
  for (const id of ["footprint", "area", "grid"]) map.getSource(id)?.setData(turf.featureCollection([]));
  for (const id of ["draw", "cover", "download-area", "use-footprint"]) element(id).disabled = true;
  element("details").hidden = true;
  element("volunteer-view").hidden = true;
  element("area-problems").textContent = "";
}

element("setup").addEventListener("submit", (event) => {
  event.preventDefault();
  working(async () => {
    // A newer Load replaces this one while its requests are still running.
    const load = ++state.load;
    const isCurrent = () => load === state.load;
    try {
      await drawReady;
      const ids = parseImageIdsFromLink(element("image").value);
      state.zoom = chosenZoom();
      state.cells = chosenCells();
      setStatus(ids.length === 1 ? "Loading the image..." : `Loading ${ids.length} images...`);
      const items = await Promise.all(ids.map(fetchItem));
      if (!isCurrent()) return;
      const bounds = unionBounds(items.map((item) => item.bbox));

      const tileUrl = ids.length === 1
        ? `${API}/raster/collections/openaerialmap/items/${ids[0]}/tiles/WebMercatorQuad/{z}/{x}/{y}?assets=visual&nodata=0`
        : mosaicTileUrl(ids);
      if (map.getSource("imagery")) {
        map.removeLayer("imagery");
        map.removeSource("imagery");
      }
      map.addSource("imagery", { type: "raster", tiles: [tileUrl], tileSize: 256, maxzoom: 22, bounds });
      map.addLayer({ id: "imagery", type: "raster", source: "imagery" }, map.getStyle().layers[1]?.id);
      map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 20 });
      draw.clear();
      stopDrawing();
      clearArea();
      foldSetup(items.length === 1 ? items[0].properties?.title ?? ids[0] : `${items.length} images`);

      let found = 0;
      const showProgress = () => setStatus(ids.length === 1 ? "Finding the imagery footprint..." : `Finding the imagery footprint, ${found} of ${ids.length} images done...`);
      showProgress();
      const footprints = await Promise.all(items.map(async (item, index) => {
        const footprint = await findFootprint(ids[index], orderedBounds(item.bbox));
        found += 1;
        if (isCurrent()) showProgress();
        return footprint;
      }));
      if (!isCurrent()) return;
      state.footprint = asMultiPolygon(joined(footprints));
      showLayer("footprint", state.footprint, { "line-color": "#d73f3f", "line-width": 2 });
      showArea();
      state.tileUrl = tileUrl;
      centreOnImagery();

      element("tile-url").textContent = tileUrl;
      showImageList(items, footprints);
      element("details").hidden = false;
      for (const id of ["draw", "cover"]) element(id).disabled = false;
      const imageListHint = items.length === 1 ? "" : " Click an image under Images to go to it.";
      setStatus(`The yellow area is the imagery footprint, ready to download. Draw area to choose part of it.${imageListHint}`);
    } catch (error) {
      console.error(error);
      if (isCurrent()) setStatus(error.message);
    }
  }, { lockSetup: false });
});

const linkedImage = new URLSearchParams(location.search).get("image");
if (linkedImage) {
  element("image").value = linkedImage;
  history.replaceState(null, "", location.pathname);
  element("setup").requestSubmit();
}

element("example").addEventListener("click", () => {
  element("image").value = EXAMPLE_IMAGE;
  document.querySelector('input[name="zoom"][value="20"]').checked = true;
  element("setup").requestSubmit();
});

element("sub-grid").addEventListener("change", () => {
  state.cells = chosenCells();
  showGrid();
  showVolunteerView();
});

map.on("moveend", () => {
  showGrid();
  showVolunteerView();
});

element("zoom-levels").addEventListener("change", () => {
  state.zoom = chosenZoom();
  showGrid();
  showVolunteerView();
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

element("copy-tile-url").addEventListener("click", () => copyText(element("tile-url").textContent, "Tile URL"));
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
