---
icon: lucide/pen-tool
---

# Label in QGIS

Start from the map in [Use the results in QGIS](../qgis.md), with the imagery and the marked cells. The steps follow the QGIS manual on [creating layers](https://docs.qgis.org/latest/en/docs/user_manual/managing_data_source/create_layers.html) and [editing](https://docs.qgis.org/latest/en/docs/user_manual/working_with_vector/editing_geometry_attributes.html), and were checked in QGIS 4.2.

## 1. Create a layer

Open **Layer > Create Layer > New Temporary Scratch Layer…**. Enter the **Layer name** `solar panels`, set **Geometry type** to **Polygon** and the CRS to **EPSG:4326 - WGS 84**, and click **OK**. The layer opens ready for editing; if the pencil next to it is off, turn it on with **Layer > Toggle Editing**.

![New Temporary Scratch Layer with a polygon layer in EPSG:4326](../../assets/dataset/qgis-new-layer.jpg)

## 2. Choose the rectangle tool

Show the shape tools with **View > Toolbars > Shape Digitizing Toolbar**. Click **Add Polygon Feature**. In the digitizing method list, which shows **Digitize with Segment** at first, choose **Digitize Shape**. In the rectangle list, choose **Rectangle from 3 points (projected)**.

![The rectangle list with Rectangle from 3 points (projected)](../../assets/dataset/qgis-rectangle-tool.jpg)

## 3. Draw a rectangle around each object

For each array of touching panels, left-click two corners along one long edge, then right-click on the opposite edge. The manual describes the tool as drawing an oriented rectangle where "the length of the second edge is computed from the projection of the third point on the first edge."

![A rotated rectangle around an array, over the imagery and the marked cells](../../assets/dataset/qgis-rectangle.jpg)

## 4. Save the layer as GeoJSON

Click **Layer > Save Layer Edits**. Right-click the layer, choose **Make Permanent…**, set **Format** to **GeoJSON**, enter a **File name** ending in `.geojson`, and click **OK**. The file keeps the layer's CRS, EPSG:4326.

![Make Permanent with the GeoJSON format](../../assets/dataset/qgis-make-permanent.jpg)

## 5. Load the file in the auto labeller

In the [auto labeller](../../builder/boxes.html), load the project. Under **Load labels (GeoJSON)**, click **Choose File** and pick the file. Check each tile, click **Download dataset**, then [check the dataset](index.md#check-the-dataset).

![QGIS rectangles loaded on a tile in the auto labeller](../../assets/dataset/labeller-load-labels.jpg)
