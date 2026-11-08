# Selecting and Organizing Objects

Selection determines what nearly every editing command will affect. The hierarchy determines how objects are named, grouped, parented, hidden, and protected.

## Object selection

Use Object Select when you want to transform complete objects or scene groups.

- Click an object to replace the selection.
- `Shift+click` adds another object.
- `Ctrl+click` toggles an object in or out.
- Drag across a viewport to select multiple visible objects.
- Click an item in the hierarchy when objects overlap or are difficult to reach.

Press `Tab` to return to Object Select from another selection tool. The status bar should read **Selection: Object**.

## Face selection

Use Face Select for surface-level work such as extrusion and per-face textures.

1. Press `Shift+Tab` or choose **Face Select** in the Tools panel.
2. Click a visible face.
3. Add more faces with selection modifiers or a drag selection.
4. Watch the face count in the status bar.

Face selection is separate from ordinary object selection. If an object command is unavailable, return to Object Select.

## Selecting through the hierarchy

The hierarchy is the safest way to select:

- Objects hidden behind other geometry.
- Groups and their children.
- Solid models and individual brushes.
- Items with similar silhouettes.

Expand a parent to see its children. A group selection may stand for the entire grouped structure, while selecting a child targets that item more narrowly.

## Rename objects

Double-click an object's name in the hierarchy, type a useful name, and commit it. Names such as `west_wall`, `door_cut`, and `spawn_platform` are easier to work with than a long list of generic cubes.

Renaming changes editor organization; it does not change geometry.

## Group and ungroup

To group:

1. Select two or more objects.
2. Choose **Edit > Group** or press `Shift+G`.

To remove a group while retaining its contents:

1. Select the group.
2. Choose **Edit > Ungroup** or press `Shift+U`.

Grouping is useful when several objects should move together or belong to one logical feature. Avoid grouping unrelated objects merely because they are currently near one another.

## Reparent with drag and drop

Drag an item in the hierarchy onto another suitable item to change its parent. Parenting affects hierarchy and can affect how transforms are inherited.

After reparenting, inspect the object in the viewports. The editor preserves the intended scene relationship, but a deeply nested hierarchy can make later transformations harder to reason about.

## Visibility

Temporarily hide distracting objects with their hierarchy visibility control or context action. This is useful for:

- Reaching geometry inside a room.
- Inspecting CSG results.
- Reducing visual clutter.
- Comparing alternate arrangements.

Hidden is not the same as deleted. Restore visibility from the hierarchy.

## Locking

Lock completed or reference objects so that normal edits do not move or alter them. Locked objects remain part of the scene, but editable selection operations filter them out.

If a multi-object change affects only part of the selection, check whether some items are locked.

## Duplicate and delete

- `Ctrl+D` duplicates the selection.
- Hold `Alt` while dragging a selected object with a viewport transform handle
  or bounds face to create a duplicate and move the copy in one gesture. The
  original stays in place and the new copy becomes selected.
- `Delete` removes the selection.
- The Edit menu and hierarchy context menu provide the same actions.

## Copy and paste

- `Ctrl+C` copies the selected objects to the clipboard, and `Ctrl+V` pastes
  them in place as new, selected objects. The Edit menu has Copy and Paste too.
- Brushes and generators only live inside a solid model. They paste where
  Duplicate would put a copy: in the solid model of the most recent selection,
  right after it under the same parent (the solid root or a CSG group). With no
  selection inside a model they go into the active model (a copied brush
  otherwise back into its own model), and with no model at all a new solid
  model is created for them in the same undo step. Meshes, groups, modifier
  volumes and whole solid models paste under the world. CSG groups inside a
  solid model cannot be copied; use Duplicate for them.
- The clipboard holds tagged JSON text, so you can paste into another editor
  window or another project. When the browser does not allow the system
  clipboard, the editor keeps its own copy.
- One paste is one undo step, and collaborators see the pasted objects.

### Modifiers and generator settings

- Every modifier and generator card's `...` menu has Copy and Paste settings.
  Copy carries the card's settings; Paste settings overrides every field of a
  card of the same kind with them (it is greyed out while this window holds a
  copy of another kind). Copy all modifiers copies settings too: Paste settings
  takes the first copied modifier of the card's kind.
- The volume's `...` menu has Copy all modifiers and Paste modifiers, which
  appends the copied modifiers to the selected volume or generator. Generators
  such as Column, Stairs and Arch are never pasted as modifiers.
- Each paste is one undo step.

Duplicate an object before experimenting with a destructive-looking shape change. If the result is unwanted, undo immediately with `Ctrl+Z`.
