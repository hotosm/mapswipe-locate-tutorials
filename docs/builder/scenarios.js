export const EXAMPLE = {
  tileUrl: "https://api.imagery.hotosm.org/raster/collections/openaerialmap/items/62d86c65d8499800053796c4/tiles/WebMercatorQuad/{z}/{x}/{y}?assets=visual&nodata=0",
  tasks: "../examples/files/banepa-water-tanks-processed-tasks.geojson",
};

export const ANSWERS = ["No", "Single Feature", "Multiple Features"];

export function nextAnswer(answer) {
  return (answer + 1) % ANSWERS.length;
}

export function emptyReferences(subGridSize) {
  return Array(subGridSize * subGridSize).fill(0);
}

export function checkTasks(tasks) {
  const valid = tasks?.type === "FeatureCollection"
    && Array.isArray(tasks.features)
    && tasks.features.length > 0
    && tasks.features.every((feature) => ["Polygon", "MultiPolygon"].includes(feature.geometry?.type)
      && ["tile_x", "tile_y", "tile_z"].every((key) => Number.isInteger(feature.properties?.[key])));
  if (!valid) throw new Error("This file is not a processed tasks GeoJSON: every feature needs a polygon and tile_x, tile_y and tile_z.");
}

export function taskBounds(tasks) {
  let [west, south, east, north] = [180, 90, -180, -90];
  for (const feature of tasks.features) {
    const rings = feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates.flat() : feature.geometry.coordinates;
    for (const [longitude, latitude] of rings.flat()) {
      west = Math.min(west, longitude);
      south = Math.min(south, latitude);
      east = Math.max(east, longitude);
      north = Math.max(north, latitude);
    }
  }
  return [[west, south], [east, north]];
}

export function tileImageUrl(template, x, y, z) {
  return template.replace("{z}", z).replace("{x}", x).replace("{y}", y);
}

// Browsers block tile reads from servers without CORS headers, which leaves the manager's map previews blank.
// An HTTP error is accepted: tiles outside the image return 404 from servers that do send CORS headers.
export async function checkTileAccess(template, task, fetchTile = fetch) {
  const { tile_x: x, tile_y: y, tile_z: z } = task.properties;
  try {
    await fetchTile(tileImageUrl(template, x, y, z));
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw new Error("Browsers cannot read tiles from this URL (no CORS headers, or the server cannot be reached), so the manager's tutorial preview would stay blank. Use a tile URL from api.imagery.hotosm.org, as the area helper and the mosaic helper give.", { cause: error });
  }
}

// Matches the MapSwipe manager upload: one feature per screen, references ordered row by row.
export function scenarioFile(scenarios) {
  return {
    type: "FeatureCollection",
    features: scenarios.map((scenario, index) => ({
      type: "Feature",
      geometry: scenario.geometry,
      properties: {
        tile_x: scenario.tileX,
        tile_y: scenario.tileY,
        tile_z: scenario.tileZ,
        screen: index + 1,
        references: scenario.references,
      },
    })),
  };
}
