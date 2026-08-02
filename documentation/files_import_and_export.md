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

GLB is a compact glTF model file for Blender, Godot, Unity, Unreal Engine, and other 3D applications. Export always uses canonical glTF coordinates: right-handed, Y-up, forward `-Z`, and meters. The active game profile does not add an axis or unit transform to GLB files.

Import the GLB using the destination application's normal glTF workflow. The destination importer is responsible for converting canonical glTF coordinates into its engine coordinate system.

## Export OBJ and FBX

OBJ and FBX exports also use the active game profile selected in **Settings > Games**. Changing the selected profile changes the exported unit scale and coordinate basis without changing the editable scene.

OBJ has no transform hierarchy, so its profile conversion is baked into vertex positions and normals. Reflected coordinate spaces automatically reverse triangle winding so the transformed normals and front faces remain consistent.

FBX writes the profile's up, forward, right, handedness-related signs, and file-unit scale into `GlobalSettings`. Profile axis and unit conversion is baked into the detached export geometry and local node transforms, so the exported root does not carry an extra reflected rotation or negative scale. Preserve the exported hierarchy when importing into the target application.

## Target application notes

- **Godot:** use the right-handed Y-up profile and preserve the imported hierarchy.
- **Blender:** use the Blender profile when you want Z-up conversion and preserve the node hierarchy.
- **Unity:** use the meter-oriented profile and preserve the exported hierarchy without adding an import rotation.
- **Unreal Engine:** use the normal glTF Content Browser import workflow. Unreal converts the canonical glTF Y-up, meter-based asset into its left-handed, Z-up, centimeter-based coordinate system. Do not add a manual import rotation.
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
