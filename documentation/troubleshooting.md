# Troubleshooting

Most apparent failures come from the current selection, active tool, locked state, browser permissions, or an operation that requires a more specific kind of geometry.

If you are compiling or packaging AiWorldEd from its source code, use [Building and running AiWorldEd](building_and_running.md) for build-specific setup and error guidance.

## I cannot find an object

1. Select it in the hierarchy.
2. Press `F`.
3. Restore its visibility if hidden.
4. Check all four views.
5. Inspect its Position values for an unexpectedly large coordinate.

## I cannot select an object

- Press `Tab` to return to Object Select.
- Check whether the object or its parent is locked.
- Select it by name in the hierarchy.
- Hide geometry blocking the view.
- Confirm that Clip Plane or another modal tool is not active; press `Escape`.

## A shortcut changes the wrong thing or does nothing

- Release the right mouse button after fly navigation.
- Unfocus any text or number field.
- Check the active tool in the Tools palette.
- Review customized bindings in Settings.
- Remember that Clip Plane reuses `F`, `Enter`, and `X`.
- Note that `Shift+Tab` enters Face Select while plain `Tab` returns to Object Select in the current defaults.

## Transforming affects only some selected objects

Some selected objects may be locked. The Properties panel and transform systems edit only eligible unlocked objects.

## An object moves along unexpected axes

Check whether **Global** or **Local** is active. A rotated object's local axes do not match the world grid.

For alignment, also check the status bar's Axis value. Press `A` until the intended All/X/Y/Z restriction appears.

## Snapping seems wrong

- Confirm Snap is on in the status bar.
- Check the current interval.
- Use `,` and `.` to choose a better interval.
- Remember that enabling snap does not automatically move existing off-grid objects onto the grid.

## CSG produces an unexpected shape

- Confirm the volumes overlap.
- Check brush operation and evaluation order.
- Review Inverted world.
- Extend cutter volumes clearly through the target.
- Avoid faces that are exactly coplanar when a small overlap expresses the intent better.
- Use Wireframe Overlay to inspect the operands.
- Undo, alter one condition, and retry.

## CSG menu items are disabled

The current selection is not compatible with direct mesh boolean operations. Return to Object Select and choose the required mesh operands. Solid-model brush operations are edited in the Solid Model section of Properties instead.

## Extrude is unavailable

- Enter Face Select with `Shift+Tab`.
- Select at least one valid face region.
- Confirm the source is compatible.
- Open the Tools palette and read its status message.

## Clip buttons are disabled

The clip plane is not ready. Select a target, activate Clip Plane, and place three valid points. The points must define an unambiguous plane.

## Textures are missing

- Reopen the Texture Browser folder.
- Grant folder permission.
- Confirm the image files are supported.
- Check whether the scene refers to textures from a folder that moved or was renamed.
- Inspect Material color if the image appears uniformly tinted.

## Texture scale changes when an object is resized

Review **Stretch Lock**:

- On: the existing mapping stretches with scale.
- Off: the editor attempts to preserve world-space tile density.

Review **Pos Lock** if movement or rotation causes unexpected sliding.

## Save, load, or folder access fails in a browser

Browser security can block filesystem access:

- Respond to the permission prompt.
- Allow downloads and file pickers for the site.
- Avoid a restricted embedded browser or private session.
- Use the standalone application when the browser cannot provide the needed access.

## Export has the wrong scale or orientation

1. Confirm that the destination application is using its normal glTF import workflow.
2. Do not add a manual import rotation or an extra profile conversion for GLB.
3. Test with an asymmetric textured object.

Do not solve a mirrored export by randomly applying negative scale or flattening transforms. Correct the profile or import settings and repeat the validation.

## Recovering from an unwanted edit

Use `Ctrl+Z` immediately. The status bar shows the number of available undo and redo operations. Save named milestones before large imports or CSG restructuring so you also have a file-level recovery point.
