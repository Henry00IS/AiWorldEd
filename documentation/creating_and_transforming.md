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
