# Understanding the Interface

The editor is arranged so that scene-wide actions stay at the top, visual work happens in the center, object structure and precise values stay on the right, and live feedback stays along the bottom.

## Top toolbar

The toolbar contains menus followed by quick-access controls.

### Menus

- **File** saves and loads AiWorldEd scenes, imports VMF maps, and exports GLB models.
- **Edit** deletes, duplicates, groups, and ungroups the selection.
- **Add Brush** creates cubes, spheres, cylinders, planes, terrain, and solid
  models from one compact menu. Open it, then select the brush type you want.
  The new object is created using the current placement context and selected.
- **CSG** performs Union, Subtract, or Intersect on suitable selected meshes.
- **Align** moves the selection to the origin, grid center, or another object.

A disabled menu item means the current selection does not meet that action's requirements. For example, mesh CSG requires a compatible selection.
An open menu appears over the viewport so every option remains visible and
clickable, including when the toolbar is set to its smallest size.

### Quick controls

After the menus are:

- Undo and redo.
- Snap toggle and smaller/larger snap interval controls.
- **Global** and **Local** transform-space choices.
- **Pos Lock** and **Stretch Lock** texture behavior controls.
- Buttons that open the UV Editor, Texture Browser, Tools palette, Solid Model panel, Settings, and About dialog.
- A book-shaped **Documentation** button that opens this user guide in a separate browser tab.

Hover over an icon to display its name. An orange-highlighted control is active.
See the [Glyph reference](glyph_reference.md) for numbered visual examples and a description of every icon.
Drag the bottom edge of the toolbar up or down to resize it. It snaps to three
states: small, medium, and large. Small uses compact 16 × 16 icons. Medium is
the default and uses 25 × 25 icons. Both states fit closely around their
controls instead of reserving an unused row. When **Settings > View > User
Interface > Expanded toolbar button labels** is enabled, large replaces the
quick-access icons with their action names. Disable that setting to retain
icons in the large state.

## The four viewports

The center is divided into Top, Front, Side, and Perspective views. Each viewport has a small header containing:

- The view name.
- Solid, Wireframe, and Flat shading buttons.
- A Fit button that frames the selection in that view.

The keyboard shading shortcuts also include a fourth Wireframe Overlay mode. Shading changes how you inspect the scene; it does not change exported material data.

The orthographic views are valuable for alignment and exact silhouette work because they remove perspective distortion. The Perspective view is better for judging space, depth, and the experience of moving through the level.

## Scene hierarchy

The hierarchy, often called an outliner, shows how scene objects are organized. It is more than a list:

- Click an item to select it.
- Expand or collapse groups and solid models.
- Drag objects to change their parent.
- Toggle visibility to temporarily hide geometry.
- Toggle locking to protect an object from edits.
- Double-click a name to rename it.
- Right-click for object actions such as duplicate, delete, group, or ungroup.
- Use the square-corners button in any viewport toolbar to maximize Top, Front,
  Side, or Perspective. Press it again to restore your previous pane layout.

Selecting a parent can represent a larger hierarchy. Be aware of this before deleting or transforming a group.

## Properties panel

The Properties panel shows values for the current object selection. Its general sections are Position, Rotation, Scale, and Material.

For a multi-selection:

- A shared value is displayed normally.
- A differing value is displayed as a dash.
- Entering a replacement changes that axis or property across the editable selection.

Locked objects are not edited. When a solid model or one of its brushes is selected, an additional Solid Model section appears with brush operations and model-specific controls.

## Floating panels

Floating panels open above the workspace and can be repositioned by dragging their title bar.

- **Tools** switches between Object Select, Face Select, and Clip Plane, then shows actions relevant to that tool.
- **UV Editor** controls surface alignment, scale, offset, and rotation.
- **Texture Browser** opens a local image folder and displays usable textures.
- **Solid Model** shows the active model and provides a quick **+ Box Brush** action.

Close a panel with its `×` button. Closing a panel does not delete scene data or cancel edits already applied.

## Status bar

The bottom bar is the quickest way to confirm the editor's state. It reports:

- Available undo and redo counts.
- Recent action or error feedback.
- Object or face selection mode.
- Active transform mode.
- Whether snapping is enabled and its interval.
- Current alignment axis restriction.
- Current shading mode.
- Last saved filename when available.

If an action appears to do nothing, check this bar first. It often explains that the wrong selection type is active, no suitable object is selected, or another tool owns the current input.
