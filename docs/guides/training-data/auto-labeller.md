---
icon: lucide/wand-sparkles
---

# Label with the auto labeller

The [auto labeller](../../builder/boxes.html) runs EdgeTAM in the browser and draws a box from a tap or a drag on each object. The [helpers page](../../helpers/index.md#auto-labeller) describes each control.

## 1. Load the project

1. Open the [auto labeller](../../builder/boxes.html).
2. **Project link**: paste the project link, as in [View the results](../view-results.md#1-load-the-project).
3. **Volunteer share (%)**: the share of volunteers who must mark a cell before it counts. Enter the share you chose in the results map, for example `50`.
4. Leave **Model** as it is.
5. **Object name**, under **What to label**: enter the object, for example `solar panel`.
6. Click **Load**. The first marked tile opens.
7. Wait until the status line says **Ready**. The first load downloads the EdgeTAM model (41 MB), which can take up to a minute (observed in the auto labeller).

**Try the Freetown example** loads the example project.

## 2. Label each tile

1. Tap the middle of each object. A box appears around it, and the counts in the side panel go up. Solar panels are the exception: touching panels form one array and get one box.
2. When a box is wrong, click **Undo**, then drag a box close around the object, or click **Draw** to draw the box yourself. With **Boxes**, drag along one long side of the object, then tap its opposite side. With **Outlines**, one drag draws an upright box.
3. Click **Next** for the next tile, and **Previous** to go back.

### Objects with types

When each object needs an attribute, such as `roof:material` for buildings or `natural` for trees ([What to deliver](../what-to-deliver.md)), set it under **What to label** before you click **Load**, or later with **Change**:

1. **Object name**: enter the object, for example `building`.
2. **Attribute (optional)**: enter the attribute name, for example `roof:material`.
3. **Values, separated by commas**: enter the values, for example `metal, roof_tiles, concrete`. Up to eight values. One button per value appears above the tile, each with its own colour and number. Set both before **Load labels (GeoJSON)**: each loaded feature then keeps its value of that attribute.
4. Click the button of a value, or press its number key on a keyboard (`1` for the first value), then tap each object of that type. The label takes the value's colour, and the bold line shows the count of each value. The bar fills with the count of the most common value, so it turns green when one value reaches 1,000. Label every object on the tile, including objects of a value that stays far below 1,000 ([Number of labels](../what-to-deliver.md#number-of-labels)).
5. To change a label's value, pick the right value, then tap inside the label. The status line says, for example, "Set to roof:material: metal". Where labels overlap, the tap changes the one drawn last.

A grey label doesn't have a listed value, for example one made before the values were set. **Download dataset** names how many labels are grey and saves the file once each one has a value. The object name, attribute and values stay in the browser with the labels, so they fill the empty fields when the same project loads again. In the download, each value is one class in `data.yaml`, and each feature of `labels.geojson` carries its value under the attribute name.

## 3. Download the dataset

1. **Output**: choose **Boxes** for objects such as solar panels or boats, and **Outlines** for buildings and other shapes that follow their edges.
2. Click **Download dataset**. A `.zip` file is saved.

<video src="../../assets/dataset/labeller.mp4" autoplay loop muted playsinline aria-label="Loading the project, tapping two solar arrays, moving to the next tile and downloading the dataset"></video>

Then [check the dataset](index.md#check-the-dataset).
