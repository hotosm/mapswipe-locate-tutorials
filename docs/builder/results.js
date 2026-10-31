import { EXAMPLE_PROJECT, imageryTemplate, resultsBounds, selectCells } from "./results-tools.js";
import { loadProject } from "./results-file.js";
import { foldSetup, setStatus } from "./setup-card.js";

const state = { rows: null, name: "", cells: null };
const element = (id) => document.getElementById(id);

const map = new maplibregl.Map({
  container: "map",
  style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e9ecf1" } }] },
  center: [0, 20],
  zoom: 1,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }));

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
  setStatus(`${state.cells.features.length} of ${state.rows.length} cells kept, in ${tiles} tiles.`);
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

// The page address carries the link, so copying the address shares these results.
async function load(link) {
  setStatus("Reading the results...");
  const { name, fileName, rows } = await loadProject(link);
  showResults(rows);
  state.rows = rows;
  state.name = fileName;
  showCells();
  foldSetup(name);
  history.replaceState(null, "", `?project=${encodeURIComponent(link)}`);
}

function showError(error) {
  console.error(error);
  setStatus(error.message);
}

element("setup").addEventListener("submit", (event) => {
  event.preventDefault();
  load(element("project-link").value.trim()).catch(showError);
});

element("example").addEventListener("click", () => {
  element("project-link").value = EXAMPLE_PROJECT;
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

// The results parameter carries a direct results link, which the project link field also reads.
const params = new URLSearchParams(location.search);
const sharedLink = params.get("project") ?? params.get("results");
if (sharedLink) {
  element("project-link").value = sharedLink;
  load(sharedLink).catch(showError);
}
