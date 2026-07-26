# Saving, Loading, Importing, and Exporting

AiWorldEd distinguishes between an editable scene project and a model exported for another application.

## Save a scene

Choose **File > Save** or press `Ctrl+S`.

The scene format is the working project. It preserves editor-specific information such as:

- Object hierarchy and names.
- Geometry and transforms.
- Material and texture assignments.
- Solid models, brushes, operations, and ordering.
- UV data and other editing state needed to reconstruct the world.

The status bar displays the last saved filename when available.

## Load a scene

Choose **File > Load** or press `Ctrl+O`, then choose a previously saved AiWorldEd scene.

Loading replaces the active editing context with the loaded project. Save current work first if you may need it later.

After loading:

1. Inspect the hierarchy.
2. Frame a known object.
3. Check texture availability.
4. Confirm the active game profile before the next export.

## Import a VMF map

Choose **File > Import VMF…** and select a Valve Map Format file. Import converts supported brush geometry and surface information into AiWorldEd's scene.

Large maps may show an import progress overlay. After import, review:

- Overall scale and orientation.
- Brush validity and CSG results.
- Materials that could not be matched to local images.
- Surface alignment.
- Hierarchy naming and organization.

VMF and AiWorldEd do not share an identical internal representation, so treat import as the start of a verification pass, not as proof that every source detail translated perfectly.

## Export GLB

Choose **File > Export GLB** or press `Ctrl+Shift+E`.

GLB is a compact glTF model file for Blender, Godot, Unity, Unreal Engine, and other 3D applications. Export uses the active game profile to convert units and axes.

The export places coordinate conversion on a root node. Preserve that node hierarchy and root transform when importing the GLB. This is especially important for left-handed targets such as Unity and Unreal, where the root can contain a reflection.

## Target application notes

- **Godot:** use the right-handed Y-up profile and preserve the imported root transform.
- **Blender:** use the Blender profile when you want Z-up conversion and preserve the node hierarchy.
- **Unity:** preserve the mirrored root transform. Do not casually bake it into mesh data.
- **Unreal Engine:** use the centimeter-oriented profile and preserve the mirrored root transform.
- **Custom:** verify the selected right, up, and forward axes and the resulting handedness.

## Validate an export

Before exporting an entire production level, make a small asymmetric test:

1. Include an object with a clear front, top, and right side.
2. Apply a directional or asymmetric texture.
3. Place it away from the origin.
4. Export using the intended profile.
5. Import it into the target application without flattening the root hierarchy.
6. Check position, scale, front-face visibility, normals, texture orientation, and collision.

An asymmetric test reveals mirrored axes and reversed orientation far more clearly than a centered cube.

## Browser permissions

Browser builds use browser file and folder access. If saving or loading fails:

- Allow the browser's file picker and download prompts.
- Grant folder permission for texture browsing.
- Avoid private browsing modes that discard permissions aggressively.
- Try the standalone application if browser security policy blocks a required workflow.
