import { showMapLoading } from "./map-loading.js";

const MAPLIBRE = "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl";
const SELECTED_COLOUR = "#ffd400";
const LABELLED_COLOUR = "#1f9d55";
let library = null;

// MapLibre is loaded on the first review, so labelling never waits for it.
function loadMapLibre() {
  library ??= new Promise((resolve, reject) => {
    const style = Object.assign(document.createElement("link"), { rel: "stylesheet", href: `${MAPLIBRE}.css` });
    const script = Object.assign(document.createElement("script"), { src: `${MAPLIBRE}.js` });
    script.addEventListener("load", () => resolve(window.maplibregl));
    script.addEventListener("error", () => {
      library = null;
      style.remove();
      script.remove();
      reject(new Error("The map didn't load. Check the connection and open Review again."));
    });
    document.head.append(style, script);
  });
  return library;
}

function bounds(grid) {
  const points = grid.features.flatMap((feature) => feature.geometry.coordinates[0]);
  const longitudes = points.map(([longitude]) => longitude);
  const latitudes = points.map(([, latitude]) => latitude);
  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
}

function tileBounds(grid, index) {
  return bounds({ features: [grid.features[index]] });
}

// MapLibre allows zoom levels up to 24 (https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/).
function shownZoom(view) {
  return Math.min(view.maxzoom + 1, 24);
}

// Zoomed out, a tile is a few pixels wide, so only a fill shows whether it has labels.
function tileOpacity(view) {
  const tileZoom = view.maxzoom - 2;
  return ["interpolate", ["linear"], ["zoom"], tileZoom - 3, 0.85, tileZoom - 1, 0];
}

function outlineOpacity(view, opacity) {
  const tileZoom = view.maxzoom - 2;
  return ["interpolate", ["linear"], ["zoom"], tileZoom - 3, 0, tileZoom - 1, opacity];
}

function fadeTiles(map, view) {
  map.setPaintProperty("tiles-hit", "fill-opacity", tileOpacity(view));
  map.setPaintProperty("tiles-empty", "line-opacity", outlineOpacity(view, 0.7));
  map.setPaintProperty("tiles-labelled", "line-opacity", outlineOpacity(view, 0.9));
}

function addImagery(map, template, maxzoom) {
  map.addSource("imagery", { type: "raster", tiles: [template], tileSize: 256, maxzoom });
  map.addLayer({ id: "imagery", type: "raster", source: "imagery" }, "tiles-hit");
}

function createMap(maplibregl, container, view, onPick) {
  const reach = bounds(view.grid);
  const map = new maplibregl.Map({ container, style: { version: 8, sources: {}, layers: [] }, bounds: reach, fitBoundsOptions: { padding: 20 }, maxZoom: shownZoom(view), attributionControl: false });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
  showMapLoading(map);
  map.on("load", () => {
    map.addSource("tiles", { type: "geojson", data: view.grid });
    map.addSource("labels", { type: "geojson", data: view.labels });
    map.addSource("selected", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "tiles-hit", type: "fill", source: "tiles", paint: { "fill-color": ["case", ["get", "labelled"], LABELLED_COLOUR, "#ffffff"], "fill-opacity": 0 } });
    map.addLayer({ id: "tiles-empty", type: "line", source: "tiles", filter: ["!", ["get", "labelled"]], paint: { "line-color": "#ffffff", "line-width": 1, "line-dasharray": [3, 3] } });
    map.addLayer({ id: "tiles-labelled", type: "line", source: "tiles", filter: ["get", "labelled"], paint: { "line-color": "#ffffff", "line-width": 1.5 } });
    map.addLayer({ id: "labels-fill", type: "fill", source: "labels", paint: { "fill-color": view.colour, "fill-opacity": 0.15 } });
    map.addLayer({ id: "labels-line", type: "line", source: "labels", paint: { "line-color": view.colour, "line-width": 2 } });
    map.addLayer({ id: "selected", type: "line", source: "selected", paint: { "line-color": SELECTED_COLOUR, "line-width": 3 } });
    addImagery(map, view.template, view.maxzoom);
    fadeTiles(map, view);
  });
  map.on("click", "tiles-hit", (event) => onPick(event.features[0].properties.index));
  map.on("mouseenter", "tiles-hit", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "tiles-hit", () => { map.getCanvas().style.cursor = ""; });
  return map;
}

export function createReview(container, onPick) {
  let map = null;
  let ready = null;
  let shown = null;
  let selected = null;

  async function show(view) {
    const maplibregl = await loadMapLibre();
    // A map built in a hidden container fits its bounds to the wrong size.
    if (!container.checkVisibility()) return;
    if (!map) {
      map = createMap(maplibregl, container, view, onPick);
      ready = new Promise((resolve) => map.once("load", resolve));
    }
    map.resize();
    await ready;
    map.getSource("tiles").setData(view.grid);
    map.getSource("labels").setData(view.labels);
    for (const layer of ["labels-fill", "labels-line"]) map.setPaintProperty(layer, layer === "labels-fill" ? "fill-color" : "line-color", view.colour);
    if (shown && shown.key !== view.key) {
      map.removeLayer("imagery");
      map.removeSource("imagery");
      addImagery(map, view.template, view.maxzoom);
      map.setMaxZoom(shownZoom(view));
      fadeTiles(map, view);
      map.fitBounds(bounds(view.grid), { padding: 20, animate: false });
    }
    shown = view;
    select(selected);
  }

  function select(index, { move = false } = {}) {
    selected = index;
    const feature = shown?.grid.features[index];
    if (!feature || !map?.getSource("selected")) return;
    map.getSource("selected").setData({ type: "FeatureCollection", features: [feature] });
    if (move) map.fitBounds(tileBounds(shown.grid, index), { padding: 40, maxZoom: shown.maxzoom - 1 });
  }

  return { show, select };
}
