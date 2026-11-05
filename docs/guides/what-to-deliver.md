---
icon: lucide/package-check
---

# What to deliver

The final delivery is one GeoJSON file of labels, with the imagery it was labelled on. Any labelling method works: the [auto labeller](training-data/auto-labeller.md), [QGIS](training-data/qgis.md), [OpenStreetMap](training-data/openstreetmap.md) or another tool, as long as the file passes the checklist below.

![Left: red cells volunteers marked on a tile with fishing boats. Right: a yellow box around each fully visible boat](../assets/dataset/cells-to-labels.jpg)

MapSwipe gives the red cells: where the objects roughly are. The delivery is the yellow labels: one label around each object.

## Checklist

Check every line before you deliver.

| | Requirement | Example |
|---|---|---|
| 1 | **One GeoJSON file**, in longitude and latitude (EPSG:4326), the coordinate system GeoJSON uses ([RFC 7946, section 4](https://www.rfc-editor.org/rfc/rfc7946#section-4)) | `labels.geojson` |
| 2 | **The imagery URL at the top** of the file, as `imagery_url` | [see below](#the-imagery-url-at-the-top) |
| 3 | **One feature per object**: a box or outline around it, or a line along the road's centre | one box per solar array |
| 4 | **`object_name` on every feature** | `solar panel` |
| 5 | **Attributes on every feature** when the object has types or kinds | `natural: tree` or `natural: tree_group`; `surface: unpaved`; `roof:material: metal` |
| 6 | **Nothing missed**. Per tile: every object on each delivered tile (one imagery square of the project). Per object: every object in the area of interest | all boats on the tile, also the ones cut off at its edge |
| 7 | **At least 1,000 of each object type**, counted per type ([see below](#how-much-is-enough)) | 1,000 metal roofs and 1,000 tile roofs; 1,000 paved and 1,000 unpaved road segments |

Extra properties on each feature are fine. The auto labeller adds `tile_id`, `image`, `output`, `source`, `marked_cells` and `imagery_url`.

## The imagery URL at the top

Put the project's tile URL, the one from [step 5 of Create a Locate project](create-a-project.md#5-save-a-cover-image-and-copy-the-tile-url), at the top of the file as `imagery_url`. GeoJSON allows extra members like this next to `features` ([RFC 7946, section 6.1](https://www.rfc-editor.org/rfc/rfc7946#section-6.1)). Anyone who opens the file can then load the same imagery and check each label against it.

```json
{
  "type": "FeatureCollection",
  "imagery_url": "https://api.imagery.hotosm.org/raster/collections/openaerialmap/items/69075f1de47603686de24fe8/tiles/WebMercatorQuad/{z}/{x}/{y}?assets=visual&nodata=0",
  "features": []
}
```

The auto labeller writes `imagery_url` at the top of `labels.geojson`.

## Per object or per tile

Both are accepted:

| Labelled | Each feature is | Typical method |
|---|---|---|
| **Per object** | The whole object, even when it crosses tile edges | QGIS, OpenStreetMap |
| **Per tile** | The part of the object on one tile, with that tile's `tile_id` | Auto labeller |

## How much is enough

!!! warning "At least 1,000 of each object type"
    The labels train an object detection model, which learns each type of object as its own class. Every type needs at least 1,000 labelled objects of its own: 1,000 metal roofs and 1,000 tile roofs, not 1,000 roofs in total.

| Object | Target | Counted as |
|---|---|---|
| One object type, such as solar panels or fishing boats | At least 1,000 | One feature per object |
| Several types, such as roof materials | At least 1,000 of each type | One feature per object, grouped by its attribute |
| Roads, such as paved and unpaved | At least 1,000 segments of each surface | One feature per segment between two junctions |

The [auto labeller](training-data/auto-labeller.md) counts toward 1,000 objects. Ultralytics, the model library the dataset is laid out for, recommends "at least 1,500 images and 10,000 labeled instances per class" for reliable real-world performance ([source](https://docs.ultralytics.com/guides/data-collection-and-annotation/#how-many-images-do-i-need-for-training-ultralytics-yolo-models)), so 1,000 of each type is a starting set that later projects add to.

## Examples

Each example shows the labels on the imagery, then one feature of the file, with its coordinates shortened. Every feature sits in a FeatureCollection with `imagery_url` at the top, as shown above.

### Solar panels

One box around each array of touching panels, turned to follow the array, in the Freetown image. These are the auto labeller's boxes from one tap on each array, as written to its label file.

![Two rows of rooftop solar panels in Freetown, each with a tight yellow box turned to follow the array](../assets/dataset/deliver-solar.png)

```json
{
  "type": "Feature",
  "geometry": { "type": "Polygon", "coordinates": [[[-13.1906509, 8.4672741], [-13.1906501, 8.4672579], [-13.1906031, 8.4672601], [-13.1906039, 8.4672764], [-13.1906509, 8.4672741]]] },
  "properties": { "object_name": "solar panel" }
}
```

### Fishing boats

One box around each boat, in the Pemba Island images. Labelled per tile, each feature also names its tile.

![Fishing boats on a Pemba Island tile with the red cells volunteers marked, each boat with a yellow box around it](../assets/dataset/deliver-boats.jpg)

```json
{
  "type": "Feature",
  "geometry": { "type": "Polygon", "coordinates": [[[39.8210793, -5.2398882], [39.8210793, -5.2399908], [39.8211479, -5.2399908], [39.8211479, -5.2398882], [39.8210793, -5.2398882]]] },
  "properties": { "object_name": "fishing boat", "tile_id": "20-640275-539571" }
}
```

The Pemba project merges several images, so its `imagery_url` lists them all after `ids=`. Copy it from the project's tile URL as it is.

### Solid waste

Boxes around the waste, piles and single items alike, so every patch of waste on the ground has a label. A large dump gets several boxes.

![Solid waste on open ground and along a road, with a yellow box around each pile and around each small item](../assets/dataset/deliver-waste.webp)

Each feature has the same shape as the solar panel example, with:

```json
{ "object_name": "solid waste" }
```

### Trees

One box around each tree crown, small trees included. The dotted line marks the tile, and every tree inside it gets a box. All the trees in this picture are single trees.

![Trees on a tile, inside a dotted tile outline, with a yellow box around each tree crown](../assets/dataset/deliver-trees.webp)

Trees come in two kinds, so every feature needs the attribute that says which one it is:

| Kind | When | Label | Attribute |
|---|---|---|---|
| **Single tree** | One crown you can tell apart | A box around the crown | `natural: tree` |
| **Tree group** | Crowns that touch so closely you can't tell where one crown ends and the next begins | An outline around the whole group | `natural: tree_group` |

Both follow the OpenStreetMap tags [natural=tree](https://wiki.openstreetmap.org/wiki/Tag:natural%3Dtree) and [natural=tree_group](https://wiki.openstreetmap.org/wiki/Tag:natural%3Dtree_group).

```json
{ "object_name": "tree", "natural": "tree" }
```

```json
{ "object_name": "tree", "natural": "tree_group" }
```

### Roads, with attributes

One line along the centre of each road segment, with its type and surface. The attribute names follow the OpenStreetMap keys [highway](https://wiki.openstreetmap.org/wiki/Key:highway) and [surface](https://wiki.openstreetmap.org/wiki/Key:surface).

![Roads in Stellenbosch, South Africa: asphalt roads in yellow along their centre, and a ground track in light blue](../assets/dataset/deliver-roads.jpg)

Labels from HOT's [road surface training dataset](https://huggingface.co/datasets/hotosm/fAIr-guru-td-road-surface), © OpenStreetMap contributors (ODbL), on OpenAerialMap imagery (CC-BY 4.0, Open Imagery Network contributors).

```json
{
  "type": "Feature",
  "geometry": { "type": "LineString", "coordinates": [[18.838858, -33.9200017], [18.8388636, -33.9199506]] },
  "properties": { "object_name": "road", "highway": "residential", "surface": "asphalt" }
}
```

Roads fit poorly as a Locate Objects project (see [Check that your object fits](check-your-object.md)), so their labels usually come from OpenStreetMap or QGIS.

### Buildings by roof type, with attributes

One outline around each building, following its roof edges, with its roof material. The attribute name follows the OpenStreetMap key [roof:material](https://wiki.openstreetmap.org/wiki/Key:roof:material); [roof:colour](https://wiki.openstreetmap.org/wiki/Key:roof:colour) works the same way for the roof colour.

![A dense block of houses in Stellenbosch, South Africa, each roof outlined in yellow along its edges, all with metal roofs](../assets/dataset/deliver-roofs.jpg)

Labels from HOT's [roof type training dataset](https://huggingface.co/datasets/hotosm/fAIr-guru-td-roof-type), © OpenStreetMap contributors (ODbL), on OpenAerialMap imagery (CC-BY 4.0, Open Imagery Network contributors).

```json
{
  "type": "Feature",
  "geometry": { "type": "Polygon", "coordinates": [[[18.8409309, -33.9176639], [18.8408984, -33.9176786], [18.8409269, -33.917722], [18.8409594, -33.9177073], [18.8409309, -33.9176639]]] },
  "properties": { "object_name": "building", "roof:material": "metal" }
}
```

This tile has only metal roofs. A tile with several roof types labels each building the same way, with its own `roof:material` value. One project per roof type keeps the volunteer question simple; the attribute then records the type of each labelled building.
