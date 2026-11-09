import { tiles as coverTiles } from "https://cdn.jsdelivr.net/npm/@mapbox/tile-cover@3.0.2/+esm";
import { TARGET_OBJECTS, collectionCheck, featureList, fileChecks, holdsLines, isLine, isMappable, isWellFormed, lineTargetCheck, parseLabels, targetCheck, topLineRow, topType, typeCounts, typeKeys, typeTable, zoomFromTileIds } from "./checker-tools.js";
import { targetProgress } from "./boxes-tools.js";
import { showMapLoading } from "./map-loading.js";
import { foldSetup, setStatus, working } from "./setup-card.js";

const EXAMPLE_LABELS = "../examples/files/stellenbosch-roofs-labels.geojson";
const EXAMPLE_AREA = "../examples/files/stellenbosch-roofs-aoi.geojson";
// The zoom of the training dataset the example comes from; whole buildings lack a tile_id to read it from.
const EXAMPLE_ZOOM = 19;
const state = { labels: null, area: null };
const element = (id) => document.getElementById(id);

const map = new maplibregl.Map({
  container: "map",
  style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e9ecf1" } }] },
  center: [0, 20],
  zoom: 1,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
showMapLoading(map);

const isPolygon = (feature) => ["Polygon", "MultiPolygon"].includes(feature.geometry?.type);

function crossingCheck(features) {
  const bad = features.flatMap((feature, index) => (isPolygon(feature) && isWellFormed(feature) && turf.kinks(feature).features.length > 0 ? [index + 1] : []));
  return { title: "Outlines that don't cross themselves", ok: bad.length === 0, detail: bad.length ? `An outline crosses itself: feature ${featureList(bad)}.` : "", bad };
}

// A label counts as inside when a point on it is inside a shape of the area of interest; a label cut by the area's edge still counts.
function areaCheck(features, area) {
  const shapes = area.features.filter(isPolygon);
  const drawn = features.flatMap((feature, index) => (isWellFormed(feature) ? [[feature, index + 1]] : []));
  const bad = drawn.filter(([feature]) => !shapes.some((shape) => turf.booleanPointInPolygon(turf.pointOnFeature(feature), shape))).map(([, number]) => number);
  return { title: "Every label inside the area of interest", ok: bad.length === 0, detail: bad.length ? `Outside the area of interest: feature ${featureList(bad)}.` : "", bad };
}

function showChecks(checks) {
  element("checks").replaceChildren(...checks.map((check) => {
    const item = document.createElement("li");
    item.className = check.ok ? "pass" : "fail";
    const title = document.createElement("strong");
    title.textContent = check.title;
    const verdict = document.createElement("span");
    verdict.className = "verdict";
    verdict.textContent = check.ok ? "Passed" : "To fix";
    item.append(verdict, title);
    if (check.detail) item.append(Object.assign(document.createElement("span"), { className: "detail", textContent: check.detail }));
    return item;
  }));
}

const lineKilometres = (feature) => turf.length(feature, { units: "kilometers" });

function projectZoom() {
  return element("zoom").value === "" ? null : Number(element("zoom").value);
}

function measures(zoom) {
  const featureTiles = zoom === null ? () => [] : (feature) => coverTiles(feature.geometry, { min_zoom: zoom, max_zoom: zoom }).map(([x, y]) => `${x}/${y}`);
  return { lineKilometres, featureTiles };
}

function showCounts(rows, withLines, withTiles) {
  element("counts").classList.toggle("with-lines", withLines);
  element("counts").classList.toggle("with-tiles", withTiles);
  element("counts").tBodies[0].replaceChildren(...rows.map(({ label, count, share, kilometres, tiles }) => {
    const row = document.createElement("tr");
    row.insertCell().textContent = label;
    row.insertCell().textContent = count.toLocaleString("en");
    row.insertCell().textContent = `${share.toFixed(1)}%`;
    Object.assign(row.insertCell(), { className: "length", textContent: kilometres > 0 ? `${kilometres.toFixed(1)} km` : "" });
    Object.assign(row.insertCell(), { className: "tiles", textContent: tiles.toLocaleString("en") });
    return row;
  }));
}

// The same line and bar as the auto labeller: the most common type against the target, green once reached; lines count the tiles of the type with the most.
function showTarget(label, top, unit) {
  const { percent, reached } = targetProgress(top, TARGET_OBJECTS);
  const target = `${TARGET_OBJECTS.toLocaleString("en")} ${unit}`;
  element("target-line").textContent = label ? `${top.toLocaleString("en")} of ${target}: ${label}` : `0 of ${target}: every label lacks a type value`;
  element("target-bar").style.width = `${percent}%`;
  element("target-bar").classList.toggle("reached", reached);
  element("target-summary").hidden = false;
}

function problemNumbers(checks) {
  return new Set(checks.flatMap((check) => check.bad ?? []));
}

function replaceSource(id, source, layers) {
  for (const layer of layers) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
  if (map.getSource(id)) map.removeSource(id);
  map.addSource(id, source);
  for (const layer of layers) map.addLayer(layer);
}

function showMap(labels, area, problems, imageryOk) {
  if (map.getLayer("imagery")) map.removeLayer("imagery");
  if (map.getSource("imagery")) map.removeSource("imagery");
  if (imageryOk) {
    // Tiles load a box's width beyond the labels on each side, which covers the padded fit and keeps requests near the project.
    const [west, south, east, north] = turf.bbox({ type: "FeatureCollection", features: [...labels.features.filter(isMappable), ...(area?.features.filter(isMappable) ?? [])] });
    const [width, height] = [east - west, north - south];
    const reach = [Math.max(west - width, -180), Math.max(south - height, -85), Math.min(east + width, 180), Math.min(north + height, 85)];
    map.addSource("imagery", { type: "raster", tiles: [labels.imagery_url], tileSize: 256, maxzoom: 22, bounds: reach });
    map.addLayer({ id: "imagery", type: "raster", source: "imagery" }, map.getLayer("labels-fill") ? "labels-fill" : undefined);
  }
  const drawn = labels.features
    .map((feature, index) => ({ ...feature, properties: { ...feature.properties, _feature: index + 1, _problem: problems.has(index + 1) } }))
    .filter(isMappable);
  const colour = ["case", ["get", "_problem"], "#d73f3f", "#ffd500"];
  replaceSource("labels", { type: "geojson", data: { type: "FeatureCollection", features: drawn } }, [
    { id: "labels-fill", type: "fill", source: "labels", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": colour, "fill-opacity": 0.15 } },
    { id: "labels-line", type: "line", source: "labels", paint: { "line-color": colour, "line-width": 2 } },
  ]);
  // A dot marks each box or outline so small ones show when zoomed out, and each label with a problem at every zoom, so a flat one can still be found.
  const centres = drawn.filter((feature) => !isLine(feature) || feature.properties._problem).map((feature) => turf.centroid(feature, { properties: feature.properties }));
  replaceSource("centres", { type: "geojson", data: { type: "FeatureCollection", features: centres } }, [
    { id: "label-points", type: "circle", source: "centres", maxzoom: 16, filter: ["!", ["get", "_problem"]], paint: { "circle-radius": 4, "circle-color": "#ffd500", "circle-stroke-width": 1, "circle-stroke-color": "#16181d" } },
    { id: "problem-points", type: "circle", source: "centres", filter: ["get", "_problem"], paint: { "circle-radius": 6, "circle-color": "#d73f3f", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" } },
  ]);
  replaceSource("area", { type: "geojson", data: area ?? { type: "FeatureCollection", features: [] } }, [
    { id: "area-line", type: "line", source: "area", paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [2, 2] } },
  ]);
  element("area-hint").hidden = !area;
  // The map shrinks when the side panel appears on a phone, so it takes its new size before fitting.
  map.resize();
  const shown = [...drawn, ...(area?.features.filter(isMappable) ?? [])];
  if (drawn.length > 0) map.fitBounds(turf.bbox({ type: "FeatureCollection", features: shown }), { padding: 40, maxZoom: 20 });
}

function check() {
  const { labels, area } = state;
  const typeKey = element("type-key").value || null;
  const checks = fileChecks(labels);
  const [collection, imagery] = checks;
  const zoom = projectZoom();
  const counts = collection.ok ? typeCounts(labels, typeKey) : [];
  const rows = collection.ok ? typeTable(labels, typeKey, measures(zoom)) : [];
  const lines = collection.ok && holdsLines(labels);
  const target = lines ? lineTargetCheck(rows, zoom) : targetCheck(counts);
  if (collection.ok) checks.push(crossingCheck(labels.features), ...(area ? [areaCheck(labels.features, area)] : []), target);
  showChecks(checks);
  showCounts(rows, collection.ok && labels.features.filter(isWellFormed).some(isLine), zoom !== null);
  if (!collection.ok) element("target-summary").hidden = true;
  else if (lines && zoom === null) element("target-summary").hidden = true;
  else if (lines) {
    const top = topLineRow(rows);
    showTarget(top?.label ?? "", top?.tiles ?? 0, "tiles");
  } else showTarget(...topType(counts), "labels");
  const passed = checks.filter((item) => item.ok).length;
  const toFix = checks.length - passed;
  const count = collection.ok ? labels.features.length : 0;
  setStatus(`${count.toLocaleString("en")} ${count === 1 ? "feature" : "features"}. Checks: ${passed} passed, ${toFix} to fix.`);
  if (collection.ok) showMap(labels, area, problemNumbers(checks), imagery.ok);
}

function showTypeChoice(labels) {
  const keys = labels.type === "FeatureCollection" && Array.isArray(labels.features) ? typeKeys(labels) : [];
  const options = [new Option("object_name only", ""), ...keys.map((key) => new Option(key, key))];
  element("type-key").replaceChildren(...options);
  // A file from the auto labeller holds at most one extra property, its attribute, which is the type.
  if (keys.length === 1) element("type-key").value = keys[0];
  element("type-choice").hidden = keys.length === 0;
}

async function readGeojson(source) {
  if (typeof source === "string") {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`The example failed to load (HTTP ${response.status}).`);
    return parseLabels(await response.text());
  }
  return parseLabels(await source.text());
}

function areaFeatures(geojson) {
  if (geojson.type === "Feature") return [geojson];
  if (geojson.type === "FeatureCollection") return geojson.features;
  throw new Error("An area of interest file isn't a GeoJSON Feature or FeatureCollection.");
}

// Several Locate projects bring one area file each; together they form the area of interest.
async function load(labelsSource, areaSources, name, knownZoom = null) {
  setStatus("Reading the files...");
  const labels = await readGeojson(labelsSource);
  const areas = await Promise.all(areaSources.map(readGeojson));
  const area = areas.length > 0 ? { type: "FeatureCollection", features: areas.flatMap(areaFeatures) } : null;
  if (area && !area.features.some(isPolygon)) throw new Error("The area of interest lacks a Polygon or MultiPolygon.");
  state.labels = labels;
  state.area = area;
  showTypeChoice(labels);
  const zoom = knownZoom ?? (collectionCheck(labels).ok ? zoomFromTileIds(labels) : null);
  const listed = [...element("zoom").options].some((option) => option.value === String(zoom));
  element("zoom").value = listed ? String(zoom) : "";
  foldSetup(name);
  check();
  if (zoom !== null && !listed) setStatus(`${element("status").textContent} The labels' tile_id gives zoom ${zoom}, outside 14 to 22; choose the project zoom.`);
}

function showError(error) {
  console.error(error);
  setStatus(error.message);
}

element("setup").addEventListener("submit", (event) => {
  event.preventDefault();
  const labelsFile = element("labels-file").files[0];
  working(() => load(labelsFile, [...element("area-file").files], labelsFile.name)).catch(showError);
});

element("example").addEventListener("click", () => {
  working(() => load(EXAMPLE_LABELS, [EXAMPLE_AREA], "Stellenbosch roofs", EXAMPLE_ZOOM)).catch(showError);
});

element("type-key").addEventListener("change", check);
element("zoom").addEventListener("change", check);

function propertyTable(properties) {
  const table = document.createElement("table");
  for (const [name, value] of Object.entries(properties)) {
    if (name === "_problem") continue;
    const row = table.insertRow();
    row.insertCell().textContent = name === "_feature" ? "feature number" : name;
    row.insertCell().textContent = value;
  }
  return table;
}

const phoneWidth = window.matchMedia("(max-width: 800px)");
for (const layer of ["labels-fill", "labels-line", "label-points", "problem-points"]) {
  map.on("click", layer, (event) => {
    new maplibregl.Popup({ maxWidth: "min(360px, calc(100vw - 32px))" }).setLngLat(event.lngLat).setDOMContent(propertyTable(event.features[0].properties)).addTo(map);
    // On a phone the popup is nearly as wide as the map, so the label moves to the centre for the popup to fit.
    if (phoneWidth.matches) map.easeTo({ center: event.lngLat });
  });
  map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
}
