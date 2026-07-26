# Precision Tools and Alignment

Precision comes from combining orthographic views, grid snapping, transform space, numeric properties, and the Align menu.

## Grid snapping

The Snap control constrains compatible transforms to regular increments.

- Click **Snap** to toggle it.
- Click `−` or press `,` to choose a smaller/previous interval.
- Click `+` or press `.` to choose a larger/next interval.
- Use `Shift+,` or `Shift+.` to jump three interval steps.

The current state and interval appear in the status bar. Use a coarse interval for major blockout dimensions and a fine interval for trim or small offsets.

Snapping does not automatically repair objects that were already off-grid. Move or edit them after enabling the intended interval.

## Axis restriction for alignment

Press `A` to cycle the Align restriction through:

- **ALL**
- **X**
- **Y**
- **Z**

The active restriction appears in the status bar. This restriction determines which coordinates an alignment operation may change.

For example, select X before aligning to the origin when you want to center an object left-to-right without changing its height or depth.

## Align commands

The Align menu contains:

- **Origin** moves the allowed axes to the world origin. Default shortcut: `Alt+G`.
- **Grid Center** aligns to the relevant grid center.
- **To Object** aligns selected objects using another selected object as the reference.

When using To Object, make the reference selection deliberately and inspect the result in an orthographic view. If selection ordering produces the opposite relationship from what you intended, undo and select again.

## Global versus Local axes

Choose **Global** for world-aligned construction. Choose **Local** for transformations along an object's rotated axes.

Alignment restrictions refer to the current alignment behavior and status, while transform-space buttons govern gizmo orientation. Check both when an axis operation feels unexpected.

## Exact numeric edits

The Properties panel is the most direct way to enter exact Position, Rotation, and Scale values.

- Position uses the editor's current units.
- Rotation uses degrees.
- Scale is a multiplier.

For precise dimensions, Bounds resize with snapping can be more intuitive than calculating scale. For precise placement, enter Position directly.

## Use multiple views as a cross-check

Never judge a precision edit from only one view:

1. Align or transform in Top.
2. Check height in Front or Side.
3. Inspect depth and orientation in Perspective.
4. Use Wireframe Overlay if surfaces overlap closely.
