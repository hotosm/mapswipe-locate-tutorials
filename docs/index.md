---
icon: lucide/house
---

# MapSwipe Locate tutorials

Step-by-step guides for creating a MapSwipe **Locate Objects** project, adding its tutorial, publishing it and downloading the results.

In a Locate Objects project, volunteers see one imagery tile at a time, split into a grid of 2x2, 4x4 or 8x8 cells. They tap each cell that contains the object the project asks for: once for one object, twice for several. The results record which cells of each tile hold the object, intended as training data for AI models such as fAIr ([source](https://github.com/mapswipe/mapswipe-docs/blob/main/docs/project_types/locate_objects.md)).

<div class="grid cards" markdown>

-   :lucide-book-open: **[Guides](guides/index.md)**

    Create a project, build its tutorial, publish it, and get the results into QGIS.

-   :lucide-wrench: **[Helpers](helpers/index.md)**

    Prepare the area, the tutorial and merged imagery, and clean up the results, with one-click sample data.

-   :lucide-droplets: **[Example: water tanks in Banepa](examples/banepa-water-tanks.md)**

    Every value used in the guides, with the files to download.

</div>

## Stage and production

MapSwipe runs two environments. Learn and test on stage first; volunteers only see production.

| | Manager dashboard | Where volunteers map |
|---|---|---|
| Stage (test) | <https://managers-stage.mapswipe.org/> | <https://web.mapswipe.org/dev/> |
| Production | <https://managers.mapswipe.org/> | <https://web.mapswipe.org/> |

The screenshots in these guides come from stage. The production manager has the same screens.

## Before you start

- A MapSwipe account with project manager rights. The manager login page says: "If you don't yet have access, please reach out to the MapSwipe community via Slack." Edit only projects you created.
- The image on <https://imagery.hotosm.org/browse> that volunteers will map. The [area finder](builder/area.html) makes the tile URL, the area of interest and a cover image from it.

!!! note "Project naming"
    Set the **Project topic** as `fAIrSwipe - Country - Org/Name - Feature`, for example `fAIrSwipe - Nepal - HOT - Water Tanks`.
