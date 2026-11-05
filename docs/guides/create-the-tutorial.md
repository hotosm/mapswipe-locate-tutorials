---
icon: lucide/graduation-cap
---

# Create the tutorial

The tutorial runs the first time a volunteer opens the project. It has information pages that explain the object, then scenario pages: real tiles from the project where the volunteer must tap the right cells before moving on. Follow the steps in order. You need the processed project from [Create a Locate project](create-a-project.md).

!!! tip "Check for an existing tutorial first"
    In the manager, open **Tutorials** and look for a published Locate tutorial on the same object, made with imagery that looks like your area. If one fits, skip this page: select it in [Attach the tutorial to the project](publish.md#2-attach-the-tutorial-to-the-project) and publish.

## 1. Create the tutorial

1. In the manager, click **Tutorials** in the top menu.
2. Click **New Tutorial**.
3. **Tutorial title**: enter a title, for example `fAIrSwipe - Solar Panels - Freetown`.
4. **Reference Project**: type part of the project name, for example `Sierra Leone`, and click your processed project in the list.
5. Click **Submit**. The message **Tutorial created successfully!** appears and the page opens as **Update Tutorial**. The tutorial copies the instruction, imagery and grid settings from the reference project.

<video src="../assets/tutorial/tutorial-new.mp4" autoplay loop muted playsinline aria-label="Creating the tutorial with its reference project"></video>

## 2. Download the processed tasks

1. Scroll down to **Project Assets**.
2. Under **Processed Tasks**, click **Download GeoJSON**.
3. Save the file, for example as `processed_geometry.geojson`. If it opens in a new browser tab, press ++ctrl+s++ in that tab, save it, and close the tab.

The file lists every tile of the project.

<video src="../assets/tutorial/tutorial-tasks.mp4" autoplay loop muted playsinline aria-label="Download GeoJSON under Processed Tasks"></video>

## 3. Add an information page

1. Scroll down to **Information Pages** and click **New page**.
2. Enter a title, for example `Solar panels`. In the web app, the title becomes a tab name in the tutorial.
3. Click **Add text block** and describe what the object looks like from above.
4. To show an example picture, click **Add image block** and choose an image.
5. Click **Update tutorial** at the bottom of the page to save your work so far.

<video src="../assets/tutorial/tutorial-information.mp4" autoplay loop muted playsinline aria-label="Adding an information page with a text block"></video>

## 4. Load the tiles in the tutorial builder

1. Open the [tutorial builder](../builder/index.html) in a new browser tab.
2. **Tile URL**: paste the same tile URL as in the project (step 5 of [Create a Locate project](create-a-project.md#5-save-a-cover-image-and-copy-the-tile-url)).
3. **Processed tasks file**: choose the file from step 2.
4. Click **Load**. The project tiles appear on the map as red squares, and the imagery a few seconds later.
5. In the side panel, under **Sub-grid**, click the same size as the project, for example **4x4**.

<video src="../assets/tutorial/builder-load.mp4" autoplay loop muted playsinline aria-label="Loading the tile URL and the processed tasks file"></video>

??? note "The builder says it can't read the tile URL"
    The builder first checks that browsers can read the tile URL. Browsers read only tile servers that send CORS headers, and `api.imagery.hotosm.org` sends them. Use the tile URL from the area finder.

## 5. Mark the scenarios

Each scenario is one tile with the right answer for every cell. The builder shows each scenario as a screen: **Screen 1**, **Screen 2** and so on. Add three to five scenarios that cover the cases volunteers will meet:

- a tile with one or two clear objects,
- a tile with several objects close together,
- a tile without the object, ideally with things that look similar, so volunteers learn what to leave out.

Pick tiles that the imagery covers edge to edge.

For each scenario:

1. Put the mouse over the place you want and turn the mouse wheel to zoom in, until you can see the objects.
2. Click a red square. The tile opens large in the middle of the page, with its cells.
3. Click each cell that holds the object. One click marks **Single Feature** (green), two clicks **Multiple Features** (yellow), and a third click goes back to **No**.
4. Click **Done**. The tile has a yellow outline on the map and is listed in the side panel.
5. Zoom out with the mouse wheel to find the next tile.

When all scenarios are marked, click **Download scenarios**. The file `tutorial_scenarios.geojson` is saved.

<video src="../assets/tutorial/builder-scenarios.mp4" autoplay loop muted playsinline aria-label="Zooming in, marking the cells of a tile, and downloading the scenarios"></video>

!!! tip "Mark only what you are sure of"
    In the web app, volunteers move on when their taps match your answers, or after they tap **Show answer**, which appears after two taps ([source](https://github.com/mapswipe/mapswipe-web/blob/main/src/components/LocateFeaturesProjectTutorial.vue)). Leave out tiles where you are unsure whether something is the object.

??? note "Change or remove a scenario"
    Click a scenario in the list to open it again. **Remove scenario** deletes the open scenario. Changing the **Sub-grid** clears the answers of every scenario.

??? note "Projects without Multiple Features"
    If the project leaves out **Multiple Features**, mark cells only as **Single Feature** (one click). The manager and the web app show this answer as **Feature Exists**. The manager rejects a file with Multiple Features answers for such a project ([source](https://github.com/mapswipe/manager-dashboard/blob/develop/app/views/EditTutorial/utils.ts)).

## 6. Upload the scenarios

1. Go back to the manager tab with the tutorial.
2. Scroll down to **Scenario Pages** and click **Select a file**.
3. Choose `tutorial_scenarios.geojson` from step 5.

One scenario page appears per tile, with the cell answers already set. The manager lists the cells as tasks, row by row from the top left ([source](https://github.com/mapswipe/manager-dashboard/blob/develop/app/utils/geo.ts)), and numbers them from 1 (observed in the manager). In a 4x4 sub-grid, the top row is tasks 1 to 4 and the bottom row is tasks 13 to 16.

<video src="../assets/tutorial/tutorial-upload.mp4" autoplay loop muted playsinline aria-label="Uploading the scenarios file"></video>

## 7. Write the messages of each scenario

Every scenario page has three messages: **Instruction**, **Hint** and **Success**. Each needs an icon, a title and a description ([source](https://github.com/mapswipe/manager-dashboard/blob/develop/app/views/EditTutorial/ScenarioPageInput/schema.ts)). The tutorial builder writes the texts for you.

1. In the tutorial builder, click **Texts for the manager** at the bottom of the side panel. In **Object volunteers look for**, replace `solar panels` with the object volunteers look for, for example `rooftop solar panels`. Click **Instruction**, **Hint** or **Success** to see its texts. You can edit them in the boxes. Typing a new object replaces the texts, including your edits.

    <video src="../assets/tutorial/builder-texts.mp4" autoplay loop muted playsinline aria-label="Typing the object and copying a text in the tutorial builder"></video>

2. In the manager, on the first scenario page, under **Instruction**, click **Select an icon** and click **Tap** (not **1-Tap**).
3. In the builder, click **Copy** next to the Instruction title. In the manager, click the title field and press ++ctrl+v++.
4. Do the same for the Instruction description.
5. Repeat steps 2 to 4 for **Hint** with the icon **Information**, and for **Success** with the icon **Check** (not **Checkmark**). The manager lists these icon names ([source](https://github.com/mapswipe/manager-dashboard/blob/develop/app/utils/icon.tsx)).
6. Repeat steps 2 to 5 for every scenario page.

| Message | Icon | When the web app shows it ([source](https://github.com/mapswipe/mapswipe-web/blob/main/src/components/LocateFeaturesProjectTutorial.vue)) |
|---|---|---|
| **Instruction** | **Tap** | When the scenario opens, before the first tap |
| **Hint** | **Information** | After the first tap, until all cells are right |
| **Success** | **Check** | When all cells are right |

The phone preview on the right shows the result, with the tile imagery under the cells. Click **Instruction**, **Hint** and **Success** under the preview to see each message. The icons are required ([source](https://github.com/mapswipe/manager-dashboard/blob/develop/app/views/EditTutorial/ScenarioPageInput/schema.ts)).

<video src="../assets/tutorial/tutorial-messages.mp4" autoplay loop muted playsinline aria-label="Choosing the icons and entering the messages of a scenario"></video>

??? note "Preview without imagery"
    When the phone preview shows the cells on a dark background, the reference project's tile URL usually doesn't send CORS headers (see the warning in [Add the area and imagery](create-a-project.md#8-add-the-area-and-imagery)). The tile URL and the reference project can't be changed later. Create the project again with the `api.imagery.hotosm.org` tile URL and make the tutorial from that project.

## 8. Save the tutorial

Click **Update tutorial** at the bottom of the page. The message **Tutorial updated successfully!** appears.

<video src="../assets/tutorial/tutorial-save.mp4" autoplay loop muted playsinline aria-label="Saving the tutorial"></video>

Continue with [Publish and check the project](publish.md).
