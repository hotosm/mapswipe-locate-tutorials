import { EXAMPLE_RESULTS, checkResults, checkResultsLink, imageryTemplate, isGzip, resultsBounds, selectCells } from "./results-tools.js";

const state = { rows: null, name: "", cells: null };
const element = (id) => document.getElementById(id);

const map = new maplibregl.Map({
  container: "map",
  style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e9ecf1" } }] },
  center: [0, 20],
  zoom: 1,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }));

function setStatus(message) {
  element("status").textContent = message;
}

async function readText(blob) {
  const bytes = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (!isGzip(bytes)) return blob.text();
  return new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).text();
}

function parseCsv(text) {
  const parsed = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) throw new Error(`The CSV could not be read: ${parsed.errors[0].message} (row ${parsed.errors[0].row}).`);
  checkResults(parsed.data);
  return parsed.data;
}

function threshold() {
  return Number(element("threshold").value);
}

function showCells() {
  element("threshold-value").textContent = `${threshold()}%`;
  if (!state.rows) return;
  state.cells = selectCells(state.rows, threshold());
  map.getSource("cells").setData(state.cells);
  const tiles = new Set(state.rows.map((row) => row.task_id)).size;
  const multiple = state.cells.features.filter((cell) => cell.properties.majority_answer === "Multiple Features").length;
  element("answer-counts").textContent = `${state.cells.features.length - multiple} Single Feature, ${multiple} Multiple Features`;
  setStatus(`${state.cells.features.length} of ${state.rows.length} cells in ${tiles} tiles were marked by at least ${threshold()}% of volunteers.`);
  element("download").disabled = state.cells.features.length === 0;
}

function showResults(rows) {
  for (const id of ["cells-line", "cells-fill", "imagery"]) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of ["cells", "imagery"]) if (map.getSource(id)) map.removeSource(id);
  const bounds = resultsBounds(rows);
  map.addSource("imagery", { type: "raster", tiles: [imageryTemplate(rows[0])], tileSize: 256, maxzoom: rows[0].tile_z, bounds: bounds.flat() });
  map.addLayer({ id: "imagery", type: "raster", source: "imagery" });
  map.addSource("cells", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "cells-fill",
    type: "fill",
    source: "cells",
    paint: { "fill-color": "#d73f3f", "fill-opacity": ["match", ["get", "majority_answer"], "Multiple Features", 0.55, 0.2] },
  });
  map.addLayer({ id: "cells-line", type: "line", source: "cells", paint: { "line-color": "#d73f3f", "line-width": 2 } });
  map.fitBounds(bounds, { padding: 20 });
}

async function load(name, blob) {
  setStatus("Reading the results...");
  const rows = parseCsv(await readText(blob));
  showResults(rows);
  state.rows = rows;
  state.name = name.replace(/\.gz$/, "").replace(/\.csv$/, "");
  showCells();
}

// The page address carries the link, so copying the address shares these results.
async function loadUrl(link) {
  const url = checkResultsLink(link);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The results file failed to load (HTTP ${response.status}).`);
  await load(new URL(url).pathname.split("/").pop(), await response.blob());
  history.replaceState(null, "", `?results=${encodeURIComponent(url)}`);
}

element("setup").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const file = element("results-file").files[0];
    const url = element("results-url").value.trim();
    if (url) await loadUrl(url);
    else if (file) {
      await load(file.name, file);
      history.replaceState(null, "", location.pathname);
    }
    else throw new Error("Paste a results link or choose a file.");
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
});

element("example").addEventListener("click", () => {
  element("results-file").value = "";
  element("results-url").value = EXAMPLE_RESULTS;
  element("setup").requestSubmit();
});

element("threshold").addEventListener("input", showCells);

function propertyTable(properties) {
  const table = document.createElement("table");
  for (const [name, value] of Object.entries(properties)) {
    const row = table.insertRow();
    row.insertCell().textContent = name;
    row.insertCell().textContent = value;
  }
  return table;
}

map.on("click", "cells-fill", (event) => {
  new maplibregl.Popup({ maxWidth: "360px" }).setLngLat(event.lngLat).setDOMContent(propertyTable(event.features[0].properties)).addTo(map);
});
map.on("mouseenter", "cells-fill", () => { map.getCanvas().style.cursor = "pointer"; });
map.on("mouseleave", "cells-fill", () => { map.getCanvas().style.cursor = ""; });

element("download").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state.cells)], { type: "application/geo+json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.name}_cells_${threshold()}.geojson`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

element("results-file").addEventListener("change", () => { element("results-url").value = ""; });

const sharedLink = new URLSearchParams(location.search).get("results");
if (sharedLink) {
  element("results-url").value = sharedLink;
  loadUrl(sharedLink).catch((error) => {
    console.error(error);
    setStatus(error.message);
  });
}
