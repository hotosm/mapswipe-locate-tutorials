---
icon: lucide/wand-sparkles
---

# Label with the auto labeller

The [auto labeller](../../builder/boxes.html) runs EdgeTAM in the browser and draws a box from a tap or a drag on each object. The [helpers page](../../helpers/index.md#auto-labeller) describes each control.

## 1. Load the project

1. Open the [auto labeller](../../builder/boxes.html).
2. **Project link**: paste the project link, as in [View the results](../view-results.md#1-load-the-project).
3. **Volunteer share (%)**: enter the share you chose in the results map, for example `50`.
4. Leave **Model** as it is and click **Load**. The first marked tile opens.
5. Wait until the status line says **Ready**. The first load downloads the EdgeTAM model (41 MB), which can take up to a minute (observed in the auto labeller).

**Try the Freetown example** loads the example project.

## 2. Label each tile

1. Tap the middle of each group of touching objects. A box appears around it, and the counts in the side panel go up.
2. When a box is wrong, click **Undo**, then drag a box close around the object, or click **Draw** to draw the box yourself: drag along one long side of the object, then tap its opposite side.
3. Click **Next** for the next tile, and **Previous** to go back.

## 3. Download the dataset

1. Keep **Boxes** as the **Output**.
2. **Object name**: enter the object, for example `solar panel`.
3. Click **Download dataset**. A `.zip` file is saved.

<video src="../../assets/dataset/labeller.mp4" autoplay loop muted playsinline aria-label="Loading the project, tapping two solar arrays, moving to the next tile and downloading the dataset"></video>

Then [check the dataset](index.md#check-the-dataset).
