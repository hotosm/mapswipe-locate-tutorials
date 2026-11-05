---
icon: lucide/house
---

# MapSwipe Locate tutorials

Step-by-step guides for creating a MapSwipe **Locate Objects** project, adding its tutorial, publishing it and downloading the results.

In a Locate Objects project, volunteers see one imagery tile at a time, split into a grid of 2x2, 4x4 or 8x8 cells. They tap each cell that contains the object the project asks for: once for one object, twice for several. The results record which cells of each tile hold the object, intended as training data for AI models such as fAIr ([source](https://github.com/mapswipe/mapswipe-docs/blob/main/docs/project_types/locate_objects.md)).

## When Locate Objects fits

Check this before you create a project. Locate Objects records which cells of each tile hold the object, so it fits objects that volunteers can spot from above, each one covering part of a tile. For example:

- rooftop solar panels
- zebra crossings
- piles of solid waste
- road surface damage, such as potholes

It fits poorly in two cases:

- **Line features**, such as roads for highway segmentation. A road crosses many cells, and the cell answers record which cells it touches without its path or width (inferred from the result format, [source](https://github.com/mapswipe/mapswipe-docs/blob/main/docs/project_types/locate_objects.md)).
- **Classification**, such as the type or material of each roof. The manager offers the answers No, Single Feature and Multiple Features ([source](https://github.com/mapswipe/mapswipe-docs/blob/main/docs/project_types/locate_objects.md)), and lets you drop Multiple Features ([source](https://github.com/mapswipe/manager-dashboard/blob/develop/app/views/EditProject/UpdateProjectForm/LocateObjectProjectSpecifics/index.tsx)). The results record whether the object is in a cell, and leave out which kind it is.

For these, narrow the question to one object volunteers can spot, for example one project for each roof type, or create the training data another way, for example by [mapping it in OpenStreetMap](guides/training-data/openstreetmap.md).

<div class="grid cards" markdown>

-   :lucide-book-open: **[Guides](guides/index.md)**

    Create a project, build its tutorial, publish it, get the results into QGIS, and create a training dataset.

-   :lucide-wrench: **[Helpers](helpers/index.md)**

    Prepare the area, the tutorial and merged imagery, and clean up the results, with one-click sample data.

-   :lucide-sun: **[Example: solar panels in Freetown](examples/freetown-solar-panels.md)**

    A finished project from the imagery to a training dataset, with the files to download.

</div>

## Stage and production

MapSwipe runs two environments. Volunteers map on production. Create and check every project on stage first, and create it on production once it works on stage.

| | Manager dashboard | Where volunteers map |
|---|---|---|
| Stage (test) | <https://managers-stage.mapswipe.org/> | <https://web.mapswipe.org/dev/> |
| Production | <https://managers.mapswipe.org/> | <https://web.mapswipe.org/> |

The screenshots in these guides come from stage. The production manager has the same screens.

## Before you start

- A MapSwipe account with project manager rights. The manager login page says: "If you don't yet have access, please reach out to the MapSwipe community via Slack." Edit only projects you created.
- The image on <https://imagery.hotosm.org/browse> that volunteers will map. The [area finder](builder/area.html) makes the tile URL, the area of interest and a cover image from it.

!!! note "Project naming"
    Set the **Project topic** as `fAIrSwipe - Country - Feature`, for example `fAIrSwipe - Sierra Leone - Solar Panels`.
