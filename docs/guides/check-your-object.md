---
icon: lucide/list-checks
---

# Check that your object fits

Read this page before you create a project. Locate Objects shows volunteers one tile at a time, split into cells, and records which cells hold the object ([source](https://github.com/mapswipe/mapswipe-docs/blob/main/docs/project_types/locate_objects.md)). Some objects suit that well, some partly, and some poorly.

The groups below are recommendations, based on how Locate Objects records answers and on the objects of fAIrSwipe projects on stage and production.

## Quick check

Answer these four questions for your object:

1. Is it one kind of object?
2. Can a volunteer tell from one cell whether it's there?
3. Does one object fit within a few cells at the project zoom? The [area finder](../builder/area.html) shows this in the **Volunteer view**.
4. Is the question only "is it there?", without "which kind is it?"

When all four answers are yes, the object fits. Otherwise, look it up in the table below.

## Three groups

| Fit | Examples | Why | What to do |
|---|---|---|---|
| **Good fit**: separate objects you can point at | Rooftop solar panels, rooftop water tanks, satellite dishes, fishing boats, swimming pools, piles of solid waste, zebra crossings, potholes and other road surface damage | Each object covers part of a tile, so the marked cells show where it is. The auto labeller can draw a box around each one. | Follow the guides as written. |
| **Partial fit**: areas with soft edges | Trees and green spaces, water bodies, landfills, cemeteries | The marked cells show where the area is. The cells follow the grid, so they leave out the exact edge. | Create the project to find the areas, then label them with **Outlines** in the [auto labeller](training-data/auto-labeller.md), or trace them in [OpenStreetMap](training-data/openstreetmap.md). |
| **Poor fit**: lines, kinds, or two objects at once | Roads for highway segmentation, rivers, drainage lines; roof type or material, damage level; "water tanks and satellite dishes" in one project | A line crosses many cells, and the answers record which cells it touches without its path or width. The answers are No, Single Feature and Multiple Features ([source](https://github.com/mapswipe/manager-dashboard/blob/develop/app/views/EditProject/UpdateProjectForm/LocateObjectProjectSpecifics/index.tsx)), so they leave out which kind of object a cell holds, and which of two objects it is. | Narrow the question: one project per object, or one project per roof type. For lines, map them in [OpenStreetMap](training-data/openstreetmap.md). |

## Narrow the question

A narrower question often turns a poor fit into a good one:

| Too broad | Narrower |
|---|---|
| Water tanks and satellite dishes | Rooftop water tanks, then a second project for satellite dishes |
| Solid waste and blocked drainage | Piles of solid waste |
| Roof types | Metal roofs, then a second project for each other type |
| Road condition | Potholes |

## Name the project

Spell **fAIrSwipe** exactly as in the [naming rule](../index.md#before-you-start), so the projects are easy to find in the manager and on the MapSwipe website.

Then continue with [Create a Locate project](create-a-project.md).
