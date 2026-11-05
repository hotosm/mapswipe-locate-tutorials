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
