import { IMAGE_HINT, matchImageId, orderedBounds, parseImageId } from "./area-tools.js";

export const RASTER_API = "https://api.imagery.hotosm.org/raster";
const STAC_ITEMS = "https://api.imagery.hotosm.org/stac/collections/openaerialmap/items";
export const EXAMPLE_IMAGES = [
  "https://imagery.hotosm.org/browse?lat=27.6337&lon=85.5228&zoom=13.4&selected_id=62d86c65d8499800053796c4",
  "https://imagery.hotosm.org/browse?lat=27.6190&lon=85.5425&zoom=17&selected_id=64fac6d25ee57100013326fb",
];

export function parseImageIds(values) {
  const ids = values.map((value, index) => ({ value: value.trim(), position: index + 1 })).filter(({ value }) => value).map(({ value, position }) => {
    const id = matchImageId(value);
    if (!id) throw new Error(`Image ${position}: ${IMAGE_HINT}`);
    return id;
  });
  const unique = [...new Set(ids)];
  if (unique.length < 2) throw new Error("Add at least two different images.");
  return unique;
}

// Without the two flags, an older image is skipped wherever a newer image's outline covers it, even where that image has no pixels.
export function mosaicTileUrl(ids) {
  return `${RASTER_API}/collections/openaerialmap/tiles/WebMercatorQuad/{z}/{x}/{y}?ids=${ids.join(",")}&exitwhenfull=false&skipcovered=false&assets=visual&nodata=0`;
}

// The merger's tile URL lists its images as ids=<id>,<id>; any other link names one image.
export function parseImageIdsFromLink(text) {
  const listed = text.match(/[?&]ids=([^&]+)/);
  if (!listed) return [parseImageId(text)];
  return [...new Set(decodeURIComponent(listed[1]).split(",").map((value) => parseImageId(value)))];
}

export async function fetchItem(id) {
  const response = await fetch(`${STAC_ITEMS}/${id}`);
  if (!response.ok) throw new Error(`Image ${id} was not found (HTTP ${response.status}).`);
  return response.json();
}

export function imageTitle(item) {
  const date = item.properties?.datetime ?? item.properties?.start_datetime;
  return `${item.properties?.title ?? item.id} (${date?.slice(0, 10) ?? "no date"})`;
}

export function unionBounds(items) {
  const bboxes = items.map(orderedBounds);
  return [
    Math.min(...bboxes.map((bbox) => bbox[0])),
    Math.min(...bboxes.map((bbox) => bbox[1])),
    Math.max(...bboxes.map((bbox) => bbox[2])),
    Math.max(...bboxes.map((bbox) => bbox[3])),
  ];
}
