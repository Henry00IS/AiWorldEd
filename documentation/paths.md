# Paths

A **Path** is a line of points you draw in the scene: the bottom corners of a room, the centre of a road, the run of a staircase. A SolidScript generator reads it through a **Path** input, so one script can follow any shape you trace.

## Add a Path to a script

1. Open the script editor of a SolidScript generator and add an **Input** line with **Type** `Path`, such as `Input Wall (Path)`.
2. Use it like any other path: `Sweep Along Path Along [Wall]`, `Resample [Wall]`, or any line that takes a Path.

Adding a Path input turns on **Has Edit Mode** for the script, so its points can be reached in the scene. A new Path is a straight line two metres long.

The **Baseboard** example (Examples window, Basics) traces three walls of a room and sweeps a moulding along them.

## Draw and edit in the scene

Select the object and click **Edit** at its centre, or use the Generator tool. Every Path input of the object is drawn as a line with a dot on each point.

- **Click** a point or the line of a stretch to select it, as in the curve editor. The inspector then shows the selected points' positions, one row per axis, or the selected stretches' settings.
- **Shift+Click** adds to the selection and **Ctrl+Click** a point or line toggles it. **Drag** on empty space to box-select points; with Shift the box adds, with Ctrl it toggles.
- **Drag** a selected point to move every selected point together. They move on the grid plane that faces the camera most: level in the Top view, upright in the Front and Side views, and snap to the grid while grid snapping is on. Hold **Shift** while dragging to turn snapping the other way; pressing or letting go of it takes effect at once. Press **X**, **Y** or **Z** during a drag to move only along that axis, the same key again frees it. The axes follow the Global or Local transform space, as the move gizmo does. One drag is one undo step.
- **Ctrl+Click** on empty space adds a point after the last selected one (or after the last point when none is selected), on the same plane and snapped to the grid. Click corner after corner to trace a room.
- **Delete** removes the selected points; a Path always keeps two points.
- **Esc** takes back a drag in progress, then clears the selection, then returns to Bounds.
- A Bezier or Quadratic stretch shows its handles while it or its first point is selected; drag them like points.

With several points or stretches selected, the inspector shows what they share and a dash where they differ; typing a value sets it on all of them.

Every change goes through the generator's input values, so it can be undone and redone, and it reaches everyone in an online session like any other setting.

## Stretch kinds

Each stretch runs from a point to the next and has its own kind, set in the inspector while it or its first point is selected:

| Kind          | Shape                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Straight**  | A straight line.                                                                                                                                         |
| **Quadratic** | Bends toward one **Control** handle, stored as an offset from the middle of the stretch.                                                                 |
| **Bezier**    | Leaves its start toward **Out** and comes into its end from **In**, each an offset from its point.                                                       |
| **Smooth**    | Runs through its neighbours like a rope, with no handles to set.                                                                                         |
| **Arc**       | An exact circular arc of **Arc Degrees** (1 to 359; negative bends the other way) turning about **Arc Axis** (Up, 0, 1, 0, by default, so it lies flat). |

An Arc is a true circle: the points a script reads lie on the circle itself, sampled finely enough for a smooth sweep. Handles are offsets, so a curved stretch keeps its shape when you move its points. **Closed** joins the last point back to the first.

## Save and reuse a Path

A Path is stored with the generator, so saving it as a file is optional. The inspector row of a Path input has:

- **Save Path**: downloads the path as a `.aipath` file.
- **Open Path**: reads a `.aipath` file into the input.

You can also drag a `.aipath` file from the project browser or from the desktop onto the row. A file that is not a path, or holds fewer than two points, shows why it was not opened.
