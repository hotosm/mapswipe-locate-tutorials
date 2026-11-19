import { showMapLoading } from "./map-loading.js";

const SELECTED_COLOUR = "#ffd400";
const LABELLED_COLOUR = "#1f9d55";
const LABELLED_FILL = "#4ade80";
const UNLISTED_COLOUR = "#bdbdbd";
const EMPTY = { type: "FeatureCollection", features: [] };

// A loop, since spreading every point into Math.min can pass the engine's argument limit (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/apply#using_apply_and_built-in_functions).
function bounds(features) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const feature of features) {
    for (const [longitude, latitude] of feature.geometry.coordinates[0]) {
      box[0] = Math.min(box[0], longitude);
      box[1] = Math.min(box[1], latitude);
      box[2] = Math.max(box[2], longitude);
      box[3] = Math.max(box[3], latitude);
    }
  }
  return box;
}

// MapLibre allows zoom levels up to 24 (https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/).
function shownZoom(view) {
  return Math.min(view.maxzoom + 1, 24);
}

const HOVERED = ["boolean", ["feature-state", "hover"], false];
// A tile with labels counts as seen even when they came from a file and the tile was never opened.
const SEEN = ["any", ["get", "labelled"], ["get", "viewed"]];
// Levels below the tile zoom where the grey grid starts to fade in and where it is fully drawn; MapLibre zoom counts 512-pixel tiles, so a tile is 32 pixels wide 4 levels below.
const GRID_HIDDEN = 4.5;
const GRID_SHOWN = 3.5;
// Clicks reach a grey tile once its border is about a fifth drawn.
const GRID_CLICKABLE = GRID_HIDDEN - 0.3;

// Zoomed out, a tile is a few pixels wide, so only a fill shows whether it has labels.
function fadeTiles(map, view) {
  const tileZoom = view.maxzoom - 2;
  const byZoom = (zoomedOut, zoomedIn, from, to) => ["interpolate", ["linear"], ["zoom"], tileZoom - from, zoomedOut, tileZoom - to, zoomedIn];
  map.setPaintProperty("tiles-fill", "fill-opacity", byZoom(["case", HOVERED, 0.35, SEEN, 0.85, ["get", "listed"], 0.3, 0], ["case", HOVERED, 0.35, SEEN, 0.2, 0], 3, 2));
  map.setPaintProperty("tiles-line", "line-opacity", byZoom(["case", HOVERED, 1, SEEN, 0.9, ["get", "listed"], 0.5, 0], ["case", HOVERED, 1, SEEN, 0.9, ["get", "listed"], 0.5, 0.7], GRID_HIDDEN, GRID_SHOWN));
  map.setPaintProperty("tiles-halo", "line-opacity", byZoom(["case", ["get", "listed"], 0.45, 0], ["case", ["get", "listed"], 0.45, 0.2], GRID_HIDDEN, GRID_SHOWN));
}

function addImagery(map, view) {
  map.addSource("imagery", { type: "raster", tiles: [view.template], tileSize: 256, maxzoom: view.maxzoom });
  map.addLayer({ id: "imagery", type: "raster", source: "imagery" }, "tiles-fill");
}

function addLayers(map, view) {
  map.addSource("tiles", { type: "geojson", data: view.grid, promoteId: "index" });
  map.addSource("labels", { type: "geojson", data: view.labels });
  map.addSource("selected", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "tiles-fill", type: "fill", source: "tiles", paint: { "fill-color": ["case", ["get", "labelled"], LABELLED_FILL, "#ffffff"], "fill-opacity": 0 } });
  map.addLayer({ id: "tiles-halo", type: "line", source: "tiles", paint: { "line-color": "#000000", "line-width": ["case", ["get", "listed"], 4, 1] } });
  map.addLayer({ id: "tiles-line", type: "line", source: "tiles", paint: { "line-color": ["case", HOVERED, "#ffffff", ["get", "labelled"], LABELLED_COLOUR, ["get", "listed"], "#ffffff", UNLISTED_COLOUR], "line-width": ["case", HOVERED, 3, ["get", "labelled"], 3, ["get", "viewed"], 2, ["get", "listed"], 1, 1] } });
  map.addLayer({ id: "labels-fill", type: "fill", source: "labels", paint: { "fill-color": view.colour, "fill-opacity": 0.15 } });
  map.addLayer({ id: "labels-line", type: "line", source: "labels", paint: { "line-color": view.colour, "line-width": 2 } });
  map.addLayer({ id: "selected", type: "line", source: "selected", paint: { "line-color": SELECTED_COLOUR, "line-width": 3 } });
  addImagery(map, view);
  fadeTiles(map, view);
}

// Call show() only while the container is visible; the first fitBounds needs its size.
export function createTileMap(container, onPick) {
  const map = new maplibregl.Map({ container, style: { version: 8, sources: {}, layers: [] }, center: [0, 0], zoom: 1, attributionControl: false, dragRotate: false, pitchWithRotate: false, keyboard: false, maxPitch: 0 });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
  showMapLoading(map);
  const ready = new Promise((resolve) => map.once("load", resolve));
  let shown = null;
  let layered = false;
  let imageryKey = null;

  // Zoomed out, the tiles outside the list are hidden, so they take neither clicks nor hover until their grey borders show.
  const hidden = ({ listed }) => !listed && (!shown || map.getZoom() < shown.maxzoom - 2 - GRID_CLICKABLE);
  map.on("click", "tiles-fill", (event) => {
    const { properties } = event.features[0];
    if (hidden(properties)) return;
    hover(null);
    onPick(properties.index);
  });
  let hovered = null;
  function hover(index) {
    if (hovered !== null) map.setFeatureState({ source: "tiles", id: hovered }, { hover: false });
    hovered = index;
    if (hovered !== null) map.setFeatureState({ source: "tiles", id: hovered }, { hover: true });
    map.getCanvas().style.cursor = hovered === null ? "" : "pointer";
  }
  map.on("mousemove", "tiles-fill", (event) => {
    const { properties } = event.features[0];
    hover(hidden(properties) ? null : properties.index);
  });
  map.on("mouseleave", "tiles-fill", () => hover(null));

  // fitBounds runs only for a new project or tile list, so the map keeps its place between reviews.
  async function render(view) {
    const first = shown === null;
    map.resize();
    if (!layered) {
      await ready;
      layered = true;
      addLayers(map, view);
    }
    map.getSource("tiles").setData(view.grid);
    map.getSource("labels").setData(view.labels);
    for (const layer of ["labels-fill", "labels-line"]) map.setPaintProperty(layer, layer === "labels-fill" ? "fill-color" : "line-color", view.colour);
    if (imageryKey !== null && imageryKey !== view.key) {
      map.removeLayer("imagery");
      map.removeSource("imagery");
      addImagery(map, view);
      fadeTiles(map, view);
    }
    imageryKey = view.key;
    if (first || shown.key !== view.key) {
      map.setMaxZoom(shownZoom(view));
      map.fitBounds(bounds(view.grid.features), { padding: 40, animate: false });
    }
    shown = view;
    const feature = view.grid.features[view.selected];
    map.getSource("selected").setData(feature ? { type: "FeatureCollection", features: [feature] } : EMPTY);
  }

  // Updates run one after another, so the layers are added once, and a failed update doesn't stop later ones.
  let pending = Promise.resolve();
  function show(view) {
    pending = pending.then(() => render(view), () => render(view));
    return pending;
  }

  return { show };
}
