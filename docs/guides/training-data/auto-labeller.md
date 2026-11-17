---
icon: lucide/wand-sparkles
---

# Label with the auto labeller

The [auto labeller](../../builder/boxes.html) runs EdgeTAM in the browser and draws a box from a tap or a drag on each object. The [helpers page](../../helpers/index.md#auto-labeller) describes each control.

## 1. Load the project

1. Open the [auto labeller](../../builder/boxes.html).
2. **Project link**: paste the project link, as in [View the results](../view-results.md#1-load-the-project).
3. **Volunteer share (%)**: the share of volunteers who must mark a cell before it counts. Enter the share you chose in the results map, for example `50`.
4. **Other imagery URL (optional)**: a tile URL that starts with `https://` and contains `{z}`, `{x}` and `{y}`, to label on other imagery of the same place. Leave it empty to use the project's imagery. Your labels stay when you change it.
5. **Also show tiles below the share**: leave it unticked to label only the marked tiles. Tick it to also go through the other tiles volunteers saw, after the marked tiles, for objects they missed. Those tiles show in full.
6. Leave **Model** as it is.
7. **Object name (the class)**, under **What to label**: enter the object, for example `solar panel`. Every label gets it as `object_name`. You can also enter it later with **Change**.
8. Click **Load**. The first tile opens.
9. Wait until the status line says **Ready**. The first load downloads the EdgeTAM model (41 MB), which can take up to a minute (observed in the auto labeller).

**Try the Freetown example** loads the example project.

??? note "Label without a MapSwipe project"
    Under **Source**, choose **Tile URL and area**, then fill in:

    - **Tile URL**: a URL that starts with `https://` and contains `{z}`, `{x}` and `{y}`, for example the tile URL from the [area finder](../../builder/area.html).
    - **Zoom**: the zoom of the tiles to label, for example `20`. The imagery must serve two zoom levels deeper, so zoom 22 for 20.
    - **Area (GeoJSON polygons)**: a file of Polygon or MultiPolygon features, for example `area-of-interest.geojson` from the area finder.

    The auto labeller lists every tile the polygons touch; an area of more than 5,000 tiles shows an error.

## 2. Label each tile

1. Tap the middle of each object. A box appears around it, and the counts in the side panel go up. Solar panels are the exception: touching panels form one array and get one box.
2. When a box is wrong, click **Undo** (++"z"++) and drag a box close around the object.
3. When that fails, choose **Draw by hand** above the tile (++"d"++). With **Output** set to **Boxes**, drag along one side of the object at any angle, then tap the opposite side, or slide to it and lift. **Undo** cancels a side you started. With **Outlines**, drag a box around the object. **Model (tap)** switches back.
4. **Clear tile** removes every label on the tile, and **Undo** right after brings them back.
5. Click **Next** (++arrow-right++) for the next tile, and **Previous** (++arrow-left++) to go back. The next tile loads while you label. To jump to a tile, type its number in the box after **Tile** and press ++enter++.
6. With a MapSwipe project, cells below the share are dimmed. To see the whole tile, open **Settings** and untick **Dim cells below the share**.

### Objects with types

When each object needs an attribute, such as `roof:material` for buildings or `natural` for trees ([What to deliver](../what-to-deliver.md)), set it under **What to label** before you click **Load**, or later with **Change**:

1. **Object name**: enter the object, for example `building`.
2. **Attribute (optional)**: enter the attribute name, for example `roof:material`.
3. **Values, separated by commas**: enter the values, for example `metal, roof_tiles, concrete`. Up to eight values. One button per value appears above the tile, each with its own colour and number. For a file from QGIS or OpenStreetMap, set the attribute and values before **Load labels (GeoJSON)**, so each feature keeps its value.
4. Click the button of a value, or press its number key on a keyboard (`1` for the first value), then tap each object of that type. The label takes the value's colour. Label every object on the tile, including objects of a value that stays far below 1,000 ([Number of labels](../what-to-deliver.md#number-of-labels)).
5. To change a label's value, pick the right value, then tap inside the label. The status line says, for example, "Set to roof:material: metal". Where labels overlap, the tap changes the one drawn last.

The bold line in the side panel names the most common value and its count, and the bar under it turns green when that value reaches 1,000. On screens wider than 800 pixels, a table under the bar counts each value and the labels without one.

A grey label doesn't have a listed value, for example one made before the values were set. **Download** names how many labels are grey and saves the file once each one has a value. In the download, each value is one class in `data.yaml`, and each feature of `labels.geojson` carries its value under the attribute name.

## 3. Download the dataset

1. **Output**, under **Settings**: choose **Boxes** for objects such as solar panels or boats, and **Outlines** for buildings and other shapes that follow their edges.
2. Click **Download**. **Labels (GeoJSON)**, the default, saves only the labels. Choose **Full dataset (.zip)** for the YOLO dataset with images.

<video src="../../assets/dataset/labeller.mp4" autoplay loop muted playsinline aria-label="Loading the project, tapping two solar arrays, moving to the next tile and downloading the dataset"></video>

Then [check the dataset](index.md#check-the-dataset).

## Come back later

The auto labeller saves the labels and the **What to label** fields in the browser after each change. The line under **Download** shows the time of the last save. A red message above the bold count in the side panel means the last change wasn't saved.

When the page opens again, or after **Change**, **Continue where you left off** lists the saved projects and areas. **Continue** opens one at the tile you left. **Remove** deletes its saved labels and settings from the browser; the open project shows only **Continue**. The labels stay when you change the share or **Also show tiles below the share**. They stay until you remove them or delete the site's data in the browser settings. A browser can also delete them when the disk runs low. Safari, with cross-site tracking prevention on, deletes them when the site goes seven days of browser use without a click or tap ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)).

To continue on another computer, or to keep a copy, download **Labels (GeoJSON)**. On the other computer, load the same project, or the same tile URL, zoom and area file, then open **Settings** and choose the file under **Load labels (GeoJSON)**. Each label goes back on its tile with its value. An empty **Object name** or **Attribute** field is filled from the file, with its values. Labels from an auto labeller file that are already on a tile aren't added twice. A file downloaded with **Output** set to **Boxes** holds only boxes; download with **Outlines** to keep the outlines.

A project or area opens in one tab at a time. When a save fails or is still running, the browser asks before the page closes.
