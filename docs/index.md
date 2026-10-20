# MapSwipe Locate tutorials

Step-by-step guides for creating a MapSwipe **Locate Objects** project, adding its tutorial, publishing it and downloading the results.

In a Locate Objects project, volunteers see one imagery tile at a time, split into a grid of 2x2, 4x4 or 8x8 cells. They tap each cell that contains the object the project asks for: once for one object, twice for several. The results record which cells of each tile hold the object, intended as training data for AI models such as fAIr ([source](https://github.com/mapswipe/mapswipe-docs/blob/main/docs/project_types/locate_objects.md)).

## The steps

1. [Create a Locate project](guides/create-a-project.md): basic details, imagery, area of interest, then processing. The [area helper](builder/area.html) gives the tile URL, the area of interest cut to the real imagery, and a cover image.
2. [Create the tutorial](guides/create-the-tutorial.md): pick example tiles with the [scenario builder](builder/index.html), mark the answers, and upload them.
3. [Publish and check the project](guides/publish.md): attach the tutorial, publish, and try it as a volunteer.
4. [Download the results](guides/download-results.md): where the exports appear and how to read them.

The [Banepa water tanks example](examples/banepa-water-tanks.md) lists every value used in these guides, with the files to download.

## Stage and production

MapSwipe runs two environments. Learn and test on stage first; volunteers only see production.

| | Manager dashboard | Where volunteers map |
|---|---|---|
| Stage (test) | <https://managers-stage.mapswipe.org/> | <https://web.mapswipe.org/dev/> |
| Production | <https://managers.mapswipe.org/> | <https://web.mapswipe.org/> |

The screenshots in these guides come from stage. The production manager has the same screens.

## Before you start

- A MapSwipe account with project manager rights. The manager login page says: "If you don't yet have access, please reach out to the MapSwipe community via Slack." Edit only projects you created.
- The image on <https://imagery.hotosm.org/browse> that volunteers will map. The [area helper](builder/area.html) makes the tile URL, the area of interest and a cover image from it.

!!! note "Project naming"
    Set the **Project topic** as `fAIrSwipe - Country - Org/Name - Feature`, for example `fAIrSwipe - Nepal - HOT - Water Tanks`.
