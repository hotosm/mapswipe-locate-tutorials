---
icon: lucide/map-pinned
---

# Label in OpenStreetMap

Trace each object in OpenStreetMap over the project imagery, so every label is checked against the same images the model trains on. Then download the traced areas with the HOT Export Tool. [LearnOSM](https://learnosm.org/en/beginner/id-editor/) teaches editing in iD; the steps below cover what this workflow adds. In [JOSM](https://learnosm.org/en/josm/start-josm/), add the imagery as in [LearnOSM: adding imagery](https://learnosm.org/en/josm/josm-adding-imagery/).

OpenAerialMap states that "All imagery is available to be traced in OpenStreetMap" ([source](https://openaerialmap.org/legal)). For imagery released under a licence with attribution, the OpenStreetMap Foundation publishes [waiver templates](https://osmfoundation.org/wiki/Licence/Waiver_and_Permission_Templates/Template_text_for_aerial_imagery_waivers). Mapping for a project follows the [Organised Editing Guidelines](https://wiki.osmfoundation.org/wiki/Organised_Editing_Guidelines).

## 1. Add the project imagery

1. Open iD from <https://www.openstreetmap.org/edit> and log in.
2. Open the **Background** panel (++b++) and click **…** next to **Custom**.
3. Paste the project's tile URL in **Custom Background Settings** and click **OK**.

iD accepts `{z}` as it is ([iD source](https://github.com/openstreetmap/iD/blob/develop/data/core.yaml)).

![Custom Background Settings with the Freetown tile URL](../../assets/dataset/id-custom-imagery.jpg)

## 2. Find the objects

1. Drag the file saved with **Download cells** in [View the results](../view-results.md) onto the map. iD shows it under **Map Data** (++u++) > **Custom Map Data**.
2. Zoom to a marked cell.
3. Check that each area already mapped there matches the object in the image.

![Drone imagery of Freetown in iD at zoom 20](../../assets/dataset/id-imagery-shown.jpg)

## 3. Trace and tag each object

1. Click **Area** and trace tight around an array of touching panels.
2. Choose the **Rooftop Solar Panel** preset.
3. Click **Accept the suggested updates** when iD suggests `generator:output:electricity=yes`.
4. Repeat steps 1 to 3 for each array of touching panels.

The preset adds `power=generator`, `generator:source=solar`, `generator:method=photovoltaic`, `generator:type=solar_photovoltaic_panel` and `location=roof` ([preset](https://github.com/openstreetmap/id-tagging-schema/blob/main/data/presets/power/generator/method/photovoltaic/location/roof.json), [OSM wiki](https://wiki.openstreetmap.org/wiki/Tag:generator:source%3Dsolar)).

![A traced array with its tags in iD](../../assets/dataset/id-trace-tag.jpg)

For other objects, trace each one as an area (the auto labeller skips points), with these tags:

- Water tanks: `man_made=storage_tank` and `content=water` ([wiki](https://wiki.openstreetmap.org/wiki/Tag:man_made%3Dstorage_tank)). Where line: `man_made = 'storage_tank' AND content = 'water'`.
- Ponds: `natural=water` and `water=pond` ([wiki](https://wiki.openstreetmap.org/wiki/Tag:water%3Dpond)). Where line: `natural = 'water' AND water = 'pond'`.
- Green spaces, such as parks: `leisure=park` ([wiki](https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dpark)). Where line: `leisure = 'park'`.

In step 5, rename `solar_panels` (letters, numbers and underscores), list the tag keys under `select`, and use the object's `where` line. For water tanks:

```yaml
water_tanks:
  types:
    - polygons
  select:
    - man_made
    - content
  where: >-
    man_made = 'storage_tank'
    AND content = 'water'
```

Other green spaces and water bodies use other tags ([Key:leisure](https://wiki.openstreetmap.org/wiki/Key:leisure), [Key:water](https://wiki.openstreetmap.org/wiki/Key:water)). The Export Tool accepts `AND` ([YAML guide](https://export.hotosm.org/learn/yaml)).

## 4. Upload

Click **Save** and upload the changes, as in [LearnOSM](https://learnosm.org/en/beginner/id-editor/).

## 5. Download with the HOT Export Tool

Log in to the [HOT Export Tool](https://export.hotosm.org) with your OpenStreetMap account and click **Start Exporting**. Fill in the four steps of the form ([source](https://github.com/hotosm/osm-export-tool/blob/main/ui/app/components/ExportForm.js)):

1. **Describe**: name the export, and draw the area of interest on the map, or load `area-of-interest.geojson` from [Create a Locate project](../create-a-project.md#4-download-the-area-of-interest) in the **Import AOI** dialog ([source](https://github.com/hotosm/osm-export-tool/blob/main/ui/app/components/aoi/DropZoneDialog.js)).
2. **Formats**: tick **Geojson .geojson**.
3. **Data**: open the **YAML** tab and paste:

    ```yaml
    solar_panels:
      types:
        - polygons
      select:
        - power
        - generator:source
        - location
      where: generator:source = 'solar'
    ```

4. **Summary**: click **Create Export**, then download the `.zip` file when it is ready.

The YAML follows the Export Tool's [YAML guide](https://export.hotosm.org/learn/yaml). The tool updates from OpenStreetMap every minute ([source](https://github.com/hotosm/osm-export-tool)).

![The HOT Export Tool start page](../../assets/dataset/export-tool-landing.jpg)

## 6. Load the file in the auto labeller

1. In the [auto labeller](../../builder/boxes.html), load the project.
2. Under **Load labels (GeoJSON)**, click the file field (**Choose File** or **Browse…**) and pick the `.geojson` file from the download.
3. Go through the tiles with **Next**, and tap any object that is still missing.
4. Click **Download dataset**, then [check the dataset](index.md#check-the-dataset).

![Labels loaded from a GeoJSON file on a tile in the auto labeller](../../assets/dataset/labeller-load-labels.jpg)

## Roads and drains

Roads and drains are delivered as lines. The auto labeller skips lines, so the file comes straight from the Export Tool. Map every road or drain in the project area.

1. In step 3, trace each road or drain as a line along its centre, with `highway=*` and `surface=*` for a road ([Key:highway](https://wiki.openstreetmap.org/wiki/Key:highway), [Key:surface](https://wiki.openstreetmap.org/wiki/Key:surface)), or `waterway=drain` for a lined drain and `waterway=ditch` for an unlined one ([drain](https://wiki.openstreetmap.org/wiki/Tag:waterway%3Ddrain), [ditch](https://wiki.openstreetmap.org/wiki/Tag:waterway%3Dditch)). Add `surface` to every road, including those already mapped, and move any line that doesn't match the imagery.
2. In step 5, use `lines` under `types`:

    ```yaml
    roads:
      types:
        - lines
      select:
        - highway
        - surface
      where: >-
        highway IN ('primary','secondary','tertiary',
        'unclassified','residential','service','track')
        AND surface IS NOT NULL
    ```

    For drains, list `waterway` under `select` and use `where: waterway IN ('drain','ditch')`. The Export Tool accepts `IN`, `AND` and `IS NOT NULL` ([YAML guide](https://export.hotosm.org/learn/yaml)).

3. Unzip the download and open its `.geojson` file in QGIS. Open the attribute table and click the [field calculator](https://docs.qgis.org/latest/en/docs/user_manual/working_with_vector/attribute_table.html#using-the-field-calculator). Tick **Create a new field**, set **Output field name** to `object_name` and **Output field type** to text, enter `'road'` or `'drain'` with the single quotes, and click **OK**. Click **Save Edits**, then right-click the layer, choose **Export > Save Features As…**, set **Format** to **GeoJSON** and name the file `labels.geojson`.
4. Open `labels.geojson` in a text editor and add the `imagery_url` line after `"type": "FeatureCollection",`, as in [The imagery URL at the top](../what-to-deliver.md#the-imagery-url-at-the-top).
