# Getting Started

This walkthrough introduces the complete basic workflow: add an object, inspect it, move it, save the editable scene, and export a model.

## Open the editor

AiWorldEd may run in a browser or as a standalone desktop application. The editing workspace is the same in both versions. A browser may ask for permission when you open a texture folder or save a file; approve the request if you want the editor to access that location.

When the editor opens, you will see four views:

- **Top** looks down on the X–Z ground plane.
- **Front** looks at the X–Y plane.
- **Side** looks at the Y–Z plane.
- **Perspective** is the free-moving 3D view.

The scene hierarchy and object properties appear to the right. The status bar along the bottom reports the active mode, snapping, selection type, and recent actions.

## Add your first object

1. Open **Add** in the top toolbar.
2. Choose **Cube**.
3. Look for the new cube in the viewports and in the scene hierarchy.

The toolbar also contains icon buttons for common object types. Hover over an unfamiliar icon to read its name.

New objects are placed using the editor's current placement context. If an object is outside the part of the scene you are viewing, select it in the hierarchy and press `F` to frame it.

## Select and inspect it

Click the cube in any viewport, or click its name in the hierarchy. Selected geometry is shown with the editor's orange selection styling.

The Properties panel displays:

- **Position**, which controls location.
- **Rotation**, shown in degrees.
- **Scale**, which controls size relative to the original shape.
- **Material**, which changes the object's tint.

Click a section heading to collapse or reopen it. Change a numeric field and commit the value to apply it. If several selected objects have different values, the field displays a dash; entering a number applies that axis to all editable selected objects.

## Move and resize it

1. Press `W` for the Move tool.
2. Drag a colored axis handle to move along one axis.
3. Press `T` for Bounds mode.
4. Drag a bounds face to resize the object from that side.

The common axis colors are:

- Red: X
- Green: Y
- Blue: Z

Snapping is enabled by default. Use the **Snap** button to toggle it, and use the `−` and `+` controls to change the interval. The bottom status bar shows the current interval.

If an edit does not look right, press `Ctrl+Z`. Use `Ctrl+Y` or `Ctrl+Shift+Z` to redo it.

## Look around the scene

In the Perspective view:

- Hold the right mouse button and move the mouse to look around.
- While holding the right mouse button, use `W`, `A`, `S`, and `D` to fly horizontally and `Q` and `E` to move down and up.
- Hold `Shift` while flying to move faster.
- Drag with the middle mouse button to pan.
- Use the mouse wheel to move forward or backward.

In the Top, Front, or Side view:

- Drag with the right mouse button to pan.
- Use the mouse wheel to zoom.

Press `F` to frame the current selection in the active view. Press `Shift+F` to fit all viewports.

## Save the editable project

Choose **File > Save** or press `Ctrl+S`. The scene file preserves editor information needed to continue working, including transforms, geometry, textures, hierarchy, and solid-model data.

Treat the saved scene as your editable source project. Save regularly, especially before a large CSG operation, import, or restructuring pass.

## Export a model

Choose **File > Export GLB** or press `Ctrl+Shift+E`. GLB is the model file intended for Blender and game engines. It uses canonical glTF coordinates and meters; the active game profile remains available for profile-aware OBJ and FBX exports.

Saving and exporting serve different purposes:

- **Save** creates a project that AiWorldEd can reopen for editing.
- **Export GLB** creates an asset for another application.

Before relying on an export in production, read [Saving, loading, importing, and exporting](files_import_and_export.md) and [Settings and game profiles](settings_and_profiles.md).

## What to learn next

- Learn every workspace area in [Understanding the interface](understanding_the_interface.md).
- Build rooms and openings with [Solid modeling and CSG](solid_modeling_and_csg.md).
- Add surface detail with [Textures and UV mapping](textures_and_uvs.md).
