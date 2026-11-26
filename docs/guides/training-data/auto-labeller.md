---
icon: lucide/wand-sparkles
---

# Label with the auto labeller

The [auto labeller](../../builder/boxes.html) runs EdgeTAM in the browser and draws a box from a tap or a drag on each object.

## 1. Load the project

1. Open the [auto labeller](../../builder/boxes.html).
2. **Project link**: paste the project link, as in [View the results](../view-results.md#1-load-the-project).
3. **Volunteer share (%)**: the share of volunteers who must mark a cell before it counts. Enter the share you chose in the results map, for example `50`.
4. **Other imagery URL (optional)**: a tile URL that starts with `https://` and contains `{z}`, `{x}` and `{y}`, to label on other imagery of the same place. Leave it empty to use the project's imagery. Your labels stay when you change it.
5. **Also show tiles below the share**: leave it unticked to label only the marked tiles. Tick it to also go through the other tiles volunteers saw, after the marked tiles, for objects they missed. Cells on those tiles aren't dimmed.
6. Leave **Model** as it is.
7. **Object name (the class)**, under **What to label**: enter the object, for example `solar panel`. Every label gets it as `object_name`. You can also enter it later with **Change**.
8. Click **Load**. The **Label** tab opens at the first tile, or at the tile you left.
9. Wait until the status line says **Ready**. The first load downloads the EdgeTAM model, about 41 MB.

**Try the Freetown example** loads the example project.

??? note "Label without a MapSwipe project"
    Under **Source**, choose **Tile URL and area**, then fill in:

    - **Tile URL**: a URL that starts with `https://` and contains `{z}`, `{x}` and `{y}`, for example the tile URL from the [area finder](../../builder/area.html).
    - **Zoom**: the zoom of the tiles to label, for example `20`. A tile URL without `@1x` must serve two zoom levels deeper, so zoom 22 when **Zoom** is 20.
    - **Area (GeoJSON polygons)**: a file of Polygon or MultiPolygon features, for example `area-of-interest.geojson` from the area finder.

    The auto labeller lists every tile the polygons touch; an area of more than 5,000 tiles shows an error.

## 2. Label each tile

**Shortcuts**, above **Settings** in the side panel, lists the keys.

The **Label** tab, under the project name in the side panel, shows one tile as large as the window allows.

1. Click (or tap) the middle of each object. A box appears around it, and the counts in the side panel go up. Touching solar panels form one array and get one box.
2. When a box is wrong, click **Undo** (++"z"++) and drag a box close around the object.
3. When that fails, choose **Draw by hand** in the side panel (++"d"++). With **Output** set to **Boxes**, drag along one side of the object at any angle, then tap the opposite side, or slide to it and lift. A box across the tile edge is cut at the edge. **Undo** or ++escape++ cancels a side you started. With **Outlines**, drag a box around the object. **Model (tap)** switches back.
4. To look closer, zoom into the tile with the mouse wheel, the **+** and **-** buttons on the tile, or the ++plus++ and ++minus++ keys. Hold ++space++ and drag, or drag with the middle mouse button, to move around the zoomed tile. **Fit** (++0++) shows the whole tile again. Touch screens hide the **+** and **-** buttons and show the whole tile.
5. **Clear** removes every label on the tile, and **Undo** right after brings them back.
6. Click **Next** (++arrow-right++) for the next tile, and **Previous** (++arrow-left++) to go back. Each tile you open counts as viewed. The next tile loads while you label. To jump to a tile, type its number in the box after **Tile** and press ++enter++.
7. With a MapSwipe project, cells below the share are dimmed. To see the whole tile and the whole map, open **Settings** and untick **Dim cells below the share**.

### Review the labels

The **Review** tab (++escape++) shows every tile and every label on a map over the imagery, to find objects that are left out.

1. The map marks each tile:
    - Green border: in the list, with labels.
    - Solid white border: in the list, viewed, without labels.
    - Faint white border: in the list, not viewed yet.
    - Thin grey border, as you zoom in: another tile of the MapSwipe project. With **Tile URL and area**, every tile is in the list.
    - Yellow border: the tiles you picked with ++shift++. With none picked, the tile open in **Label**.

    Zoomed out, the tiles in the list are filled in these colours. Zoomed in, the labels show in their colours.

    With a MapSwipe project, the cells that reach the **Volunteer share** stay bright, as on the [results map](../../helpers/index.md#results-map), and the rest of the project is dimmed. **Dim cells below the share**, in **Settings**, turns this off.

2. Zoom with the mouse wheel or the **+** and **-** buttons. Drag with the left or middle mouse button to move the map.
3. Click a tile to open it in the **Label** tab, and add the missing labels. A tile with a grey border joins the end of the list and stays there after a reload.

    To label only some tiles, hold ++shift++ and click them, or drag a box over them, then open the **Label** tab. Hold ++shift++ and click a picked tile to remove it. A picked tile with a grey border joins the list. **Next** and **Previous** then move only through those tiles. On the map, **Clear selection**, ++escape++ or a click on a tile without ++shift++ goes back to the whole list, and so does typing a tile number.

4. Click **Review** (++escape++) to go back to the map where you left it.
5. To fix labels on the map, click **Edit labels** (++"e"++). Click it again to turn it off. While it is on, clicking a tile doesn't open it.
    - Zoom in close, then draw a box. With **Output** set to **Boxes**, drag along one side of the object at any angle, then click the opposite side. ++escape++ or **Undo** cancels a side you started. With **Outlines**, drag a box around the object. If you set values ([Objects with types](#objects-with-types)), it takes the value picked in the side panel.
    - A box across tile edges is split at the edges into one label per tile. A tile with a grey border you draw on joins the list. Each part keeps its shape in the download.
    - Click a label to select it. Where labels overlap, the click selects all of them. Hold ++shift++ and click a label to add it to the selection, or to remove it. Hold ++shift++ and drag to select every label the box touches. **Clear selection** or ++escape++ clears the selection. **Delete** (++delete++ or ++backspace++) removes the selected labels, and a value button sets their value.
    - **Undo** (++"z"++) undoes the last change on the map. Turning **Edit labels** off clears this history. Hold ++space++ and drag, or drag with the middle mouse button, to move the map.

    To label with the model, open the tile in **Label**.

### Objects with types

When each object needs an attribute, such as `roof:material` for buildings or `natural` for trees ([What to deliver](../what-to-deliver.md)), set it under **What to label** before you click **Load**, or later with **Change**:

1. **Object name**: enter the object, for example `building`.
2. **Attribute (optional)**: enter the attribute name, for example `roof:material`.
3. **Values, separated by commas**: enter the values, for example `metal, roof_tiles, concrete`. You can enter up to eight values. One button per value appears in the side panel, each with its own colour and number. For a file from QGIS or OpenStreetMap, set the attribute and values before **Load labels (GeoJSON)**, so each feature keeps its value.
4. Click the button of a value, or press its number key on a keyboard (`1` for the first value), then tap each object of that type. The label takes the value's colour. Label every object on the tile, including objects of a value that stays far below 1,000 ([Number of labels](../what-to-deliver.md#number-of-labels)).
5. To change a label's value, pick the right value, then tap inside the label. The status line says, for example, "Set to roof:material: metal". Where labels overlap, the tap changes the one drawn last.
6. To rename a value, click **Change**, type the new name over the old one in **Values, separated by commas**, and press ++tab++. The labels of that value take the new name. Rename one value at a time. Pick a name that isn't in the list and that no label has yet. Otherwise the labels keep the old value and turn grey. To fix this, type the old name back, or another name.

The bold line in the side panel names the most common value and its count, and the bar under it turns green when that value reaches 1,000. On screens wider and taller than 800 pixels, a table under the bar counts each value and the labels without one.

A grey label doesn't have a listed value, for example one made before the values were set. **Download** names how many labels are grey and saves the file once each one has a value. Each feature of `labels.geojson` carries its value under the attribute name.

## 3. Download the labels

1. **Output**, under **Settings**: choose **Boxes** for objects such as solar panels or boats, and **Outlines** for buildings and other shapes that follow their edges.
2. In the list next to **Download**, choose **Labels (GeoJSON)** for the labels, or **Tiles (GeoJSON)** for the list of tiles ([What the downloads hold](../../helpers/index.md#auto-labeller)). Click **Download**. The line under it names the saved file. If something needs fixing, the line is red and says what to fix, and a **Download anyway** button appears. Click it to save the labels now and fix the problem later. The file keeps each label with its value, and **Load labels (GeoJSON)** loads it back. Labels on tiles outside the project or area, such as from a file of a neighbouring area, are also saved in the file, and the line says how many.

<video src="../../assets/dataset/labeller.mp4" autoplay loop muted playsinline aria-label="Loading the project, tapping two solar arrays, moving to the next tile and downloading the labels"></video>

Then [check the dataset](index.md#check-the-dataset).

## Come back later

The auto labeller saves the labels, the tiles you viewed and the **What to label** fields in the browser after each change. The line "Saved in this browser at" under **Download** gives the time of the last save. A red message above the bold count in the side panel means the last change wasn't saved.

When the page opens again, or after **Change**, **Continue where you left off** lists the saved projects and areas. **Continue** opens it at the tile you left. **Remove** deletes its saved labels and settings from the browser; the project that is open can't be removed, so it shows only **Continue**. The labels stay until you remove them or delete the site's data in the browser settings, even when you change the share or **Also show tiles below the share**. A browser can also delete them when the disk runs low. Safari, with cross-site tracking prevention on, deletes them when the site goes seven days of browser use without a click or tap ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)).

To continue on another computer, or to keep a copy, download **Labels (GeoJSON)**. If the line under **Download** names a problem, click **Download anyway**. On the other computer, load the same project, or the same tile URL, zoom and area file, then open **Settings** and choose the file under **Load labels (GeoJSON)**. Each label goes back on its tile with its value. A file with another imagery URL still loads. A red message asks you to check that the labels are on the right objects. An empty **Object name** or **Attribute** field is filled from the file, with its values. Labels from an auto labeller file that are already on a tile aren't added twice. With **Output** set to **Boxes**, the model's labels are saved as boxes and labels drawn by hand as drawn; download with **Outlines** to keep the model's outlines. To keep which tiles you viewed, also download **Tiles (GeoJSON)**, and on the other computer load that file the same way.

A project or area opens in one tab at a time. When a save fails or is still running, the browser asks before the page closes.
