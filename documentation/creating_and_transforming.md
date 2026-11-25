# Creating and Transforming Objects

AiWorldEd provides ordinary primitives for free-standing scene geometry and solid models for brush-based architecture.

## Create ordinary primitives

Open **Add > Geometry** in the top toolbar:

- **Cube** for blockouts, walls, platforms, and box-shaped props.
- **Sphere** for rounded volumes and placeholders.
- **Cylinder** for columns, pipes, and radial shapes.
- **Plane** for flat surfaces.
- **Terrain** for a generated landscape surface.

After creation, the object appears in all relevant views and in the hierarchy. Select it and press `F` if it is not immediately visible.

## Create terrain

Choose **Add > Terrain > Terrain** to create a procedural landscape. Terrain uses configurable dimensions, subdivisions, height scale, and a deterministic seed. A repeated seed with the same settings gives a repeatable shape.

## Create solid models

Choose **Add > Brushes > Solid Model** to create brush-based architecture.

Use terrain for broad layout and landscape blocking. Very dense terrain can be harder to edit and export, so begin with modest detail and add complexity only when the shape requires it.

## Transform modes

Open the Tools palette and choose Object Select to see the four transform choices.

### Bounds

Bounds mode (`T`) resizes from the faces of an oriented bounding box. It is often the most intuitive way to change architectural dimensions because you can pull one side without thinking in scale factors.

When a single object runs a Solid Script with **Has Edit Mode** on (as a generator or as a modifier), or is a built-in generator with edit tools, such as **Stairs** (handles for **Landing** and **Target Rise**), an **Edit** button sits at its center in Bounds. Click it without moving the mouse at all to edit its widgets in the scene; dragging over the button resizes or selects as usual. While editing, the rail shows **Generator**, the transform gizmos are hidden, and a still click only switches to another object with an edit mode. Drag a slider handle to change its input or setting: it snaps to the grid (hold `Shift` to turn snapping the other way), follows what the script allows, and one drag is one undo step; `Esc` during a drag takes it back. A dashed ruler runs from each handle's zero point to the handle, and the caption shows its value; click a handle without moving to type an exact value, then press `Enter` to write it (kept inside its limits, one undo step) or `Esc` to close the field. A script's **Path** inputs show as lines with a dot per point: click a point or a stretch to select it (`Shift` adds, `Ctrl` toggles, a drag on empty space box-selects), drag the selected points on the grid (`X`, `Y` or `Z` locks an axis, `Shift` turns snapping the other way), `Ctrl+Click` empty space to add a point and `Delete` to remove the selected ones; see [Paths](paths.md). `Esc` returns you to Bounds, and picking another tool leaves editing for that tool. To move the object, go back to Move or Bounds.

### Move

Move mode (`W`) shows the translation gizmo. Drag an axis for a single-axis move or an available plane/free handle for a broader move. Press `G` for a one-shot move of the selection.

### Rotate

Rotate mode (`E`) shows the rotation gizmo. Drag a ring to turn the selection around an axis. Press `R` for a one-shot rotate of the selection. Rotation values in the Properties panel are displayed in degrees.

### Scale

Scale mode (`P`) shows scale handles for changing size by a multiplier. Use it for proportional resizing or per-axis stretching. Press `S` for a one-shot scale of the selection. For exact wall dimensions, Bounds mode is often easier to predict.

## Global and Local transform space

- **Global** aligns the gizmo to the world's fixed X, Y, and Z directions.
- **Local** aligns the gizmo to the selected object's rotated axes.

Use Global for level layout and grid-aligned architecture. Use Local when moving or scaling an already rotated object along its own length or width.

## Edit exact values

Use Position, Rotation, and Scale in the Properties panel when exact values matter.

For multiple selected objects, a dash indicates mixed values. Replacing a mixed X value, for example, makes the X component common while leaving untouched Y and Z values as they were.

## Undo-friendly editing

Transforms and property changes participate in undo and redo. The bottom-left counters show how much history is available.

Use small, deliberate operations:

1. Select the intended object or group.
2. Confirm the active transform mode and space.
3. Perform one change.
4. Inspect it in more than one viewport.
5. Undo immediately if the result is wrong.

## Convex shape expectations

The editor favors convex geometry. When you need a concave architectural result, build it from several convex pieces, use solid brushes, or use CSG to remove space. This keeps editing and level-design geometry predictable.
