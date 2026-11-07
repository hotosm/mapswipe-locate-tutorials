---
icon: lucide/list-checks
---

# Check that your object fits

Locate Objects shows volunteers one tile at a time, split into cells, and records which cells hold the object ([source](https://github.com/mapswipe/mapswipe-docs/blob/main/docs/project_types/locate_objects.md)). Read this page before you create a project.

## Questions about your object

1. Is it one kind of object?
2. Can a volunteer tell from one cell whether it's there?
3. Does one object cover only a few cells? Check the **Volunteer view** in the [area finder](../builder/area.html).
4. Is the question only "is it there?", without "which kind is it?"
5. Can you see it from above? A state such as illegal or abandoned can't be seen.

If every answer is yes, the object fits. If not, find it below.

## Fit by kind of object

### Good fit

Separate objects, such as solar panels, water tanks, boats, piles of waste, single trees and potholes. The marked cells show where each one is.

### Partial fit

Areas, such as green spaces, tree groups and ponds. The marked cells show roughly where an area is, without its edge, so trace the edges in [OpenStreetMap](training-data/openstreetmap.md).

### Poor fit

Lines, types, or two objects in one project. The answers are No, Single Feature and Multiple Features ([source](https://github.com/mapswipe/manager-dashboard/blob/develop/app/views/EditProject/UpdateProjectForm/LocateObjectProjectSpecifics/index.tsx)), so they record which cells hold an object, without its kind. Ask about one object per project, add types as an attribute, and map lines in [OpenStreetMap](training-data/openstreetmap.md#roads-and-drains).

## Recommendations by object

The label column starts with the `object_name`, singular and lower case. Small objects need sharp imagery, so check a few tiles in the **Volunteer view** first.

| Object | Ask volunteers about | Label |
|---|---|---|
| Solar panels (good) | Solar panels | `solar panel`: one box per array of touching panels |
| Fishing boats (good) | Fishing boats | `fishing boat`: one box per boat |
| Water tanks (good) | Water tanks | `water tank`: one box per tank |
| Potholes (good) | Potholes | `pothole`: one box per pothole or damaged patch |
| Solid waste (good) | Piles of solid waste | `solid waste`: one box per pile |
| Landfills (partial) | Piles of solid waste | `solid waste`: one box per pile |
| Buildings (good) | Buildings | `building`: one outline per building |
| Roof material (poor) | Buildings | `building`: one outline, with `roof:material` |
| Building damage (poor) | Buildings | `building`: one outline, with `damage` |
| Temporary shelters (good) | Temporary shelters | `temporary shelter`: one box per shelter |
| Informal settlements (partial) | Buildings | `building`: one outline per building |
| Single trees (good) | Trees | `tree`: one outline, with `natural: tree` |
| Tree groups (partial) | Trees | `tree`: one outline, with `natural: tree_group` |
| Green spaces (partial) | Green spaces | `green space`: traced in OpenStreetMap |
| Ponds (partial) | Ponds | `pond`: traced in OpenStreetMap |
| Disease vector sites (poor) | Standing water, or tyres, one per project | `standing water` or `tyre`: one box each |
| Bins, benches, streetlights (poor) | One per project | `bin`, `bench` or `streetlight`: one box each |
| Two objects at once (poor) | One per project | One `object_name` per project |
| Drainage and flooding (poor) | Blocked drains, or standing water | `blocked drain` or `standing water`: one box each; drain lines from OpenStreetMap |
| Roads (poor) | Potholes | `pothole`: one box each; road lines from OpenStreetMap |

[What to deliver](what-to-deliver.md#examples) shows examples of each label.

## Name the project

Spell **fAIrSwipe** exactly as in the [naming rule](../index.md#before-you-start), then continue with [Create a Locate project](create-a-project.md).
