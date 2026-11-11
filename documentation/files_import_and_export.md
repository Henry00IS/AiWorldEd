# Saving, Loading, Importing, and Exporting

AiWorldEd distinguishes between an editable scene project and a model exported for another application.

## Save a scene

Choose **File > Save** or press `Ctrl+S`.

Levels are saved as `<name>.aiworld` files, anywhere you like: inside the project folder, on the desktop, or on a USB stick. **File > Save** writes back to the `.aiworld` file you opened (where the browser can write files); a level opened from a `.json` file asks where to save it, suggesting `<name>.aiworld`, and the `.json` file is left as it was. **Save As** asks where to save. Curves are saved as `<name>.aicurve`; older `.curve` and `.json` curve files still load.

An `.aiworld` file is a zip archive:

- `world.json`: the level.
- `thumbnail.webp`: a 256 by 256 preview of the level, written on every save. Older files have no thumbnail.
- `textures/<sha256>.<ext>` and `textures/<sha256>.json`: each texture the level uses that is not a file of the project, such as an image from an imported GLB or FBX model, with its name.

Textures of the project are not copied into the file: the level names them by their path in the project, so open the project folder to see them. Each save writes the file anew with only the textures the level still uses. A level file can hold up to 4 GB; a level that would be larger is not saved (the file on disk stays as it was), and a dialog explains how to make it smaller: remove embedded textures you no longer need or that are very large, save textures as files in the project folder instead of embedding them, or lower the resolution of large textures. Older levels that are plain JSON (`.aiworld` or `.json`) still open; saving them writes the zip format.

The scene format is the working project. It preserves editor-specific information such as:

- Object hierarchy and names.
- Geometry and transforms.
- Material and texture assignments.
- Solid models, brushes, operations, and ordering.
- UV data and other editing state needed to reconstruct the world.

The status bar displays the last saved filename when available.

## Load a scene

Choose **File > Load** or press `Ctrl+O`, then choose a previously saved AiWorldEd level (`.aiworld`, or `.json` from older versions).

Opening reads the level and the names of its textures; the images stay in the file until something shows them, so even a large level opens quickly. If the file is replaced, moved or deleted outside the editor while it is open, its textures can no longer be read: the status bar says so, and opening the file again shows them.

Loading replaces the active editing context with the loaded project. Save current work first if you may need it later.

After loading:

1. Inspect the hierarchy.
2. Frame a known object.
3. Check texture availability.
4. Check the Target Program in the Export dialog before the next export.

## Import a VMF map

Choose **File > Import VMF…** and select a Valve Map Format file. Import converts supported brush geometry and surface information into AiWorldEd's scene.

Large maps may show an import progress overlay. After import, review:

- Overall scale and orientation.
- Brush validity and CSG results.
- Materials that could not be matched to local images.
- Surface alignment.
- Hierarchy naming and organization.

VMF and AiWorldEd do not share an identical internal representation, so treat import as the start of a verification pass, not as proof that every source detail translated perfectly.

## Import an OBJ

Choose **File > Import > Wavefront OBJ (.obj)…**, or open an `.obj` from the Project panel. OBJ files usually store no axes or units. A file that carries an [objmeta comment](#objmeta-comment), as every AiWorldEd export does, is read with the axes and unit it names. Otherwise the editor asks for the **Source Program** that wrote the file (Godot by default) and remembers the choice for the next file. An objmeta comment that is broken is ignored, and the Source Program is asked for instead.

FBX and glTF files name their own axes and units, so they need no choice.

## Export a model

Choose **File > Export…** or press `Ctrl+Shift+E`. The Export dialog asks for:

- **Target Program:** Godot (Default), Unity, Blender or Unreal Engine. It sets the axes and units of FBX and OBJ files; the scene itself is not changed. For another program, pick the target with the same axes and units. The row is hidden for glTF and GLB, which always hold meters with +Y up (every program converts them on import); switching back to FBX or OBJ shows it again with the same choice.
- **Format:** FBX (`.fbx`), glTF (`.gltf`), glTF Binary (`.glb`) or Wavefront OBJ (`.obj`).
- **Encoding** (FBX): Binary (Recommended) or ASCII. Some programs cannot read ASCII FBX.
- **Include Materials (.mtl)** (OBJ): writes the materials and their textures next to the `.obj`.
- **Textures:** see below.
- **Folder** and **File Name:** the extension is added for you. Letters, digits, `_`, `-` and `.` are allowed (spaces become `_`). The dialog asks before replacing a file. Browsers without a folder picker save the files to Downloads. The folder of the last export is chosen again the next time, also after a reload; if the browser forgot its permission, it asks again when you click **Export**.

The dialog remembers its choices; **Settings > Reset** clears them, except the last folder, which stays until another one is picked.

### Textures

- **Embedded:** the images are stored inside the model file (FBX, glTF; GLB always works this way). The default for FBX and glTF, except FBX for Unity. OBJ cannot embed images.
- **Copy Into Directory:** the images are written into the **Textures Folder** next to the model (`Textures` by default). The default for OBJ and for FBX exported for Unity. Leave the field blank to put them beside the model. The folder must stay inside the model's folder.

Textures keep their original PNG or JPEG bytes. Other image types are written as PNG.

Each texture is named after its original name (an imported texture's name, or a project texture's file name), with characters that file systems refuse replaced by `_`. A texture used several times is written once. When two textures share a name, ignoring case, the later ones get `_2`, `_3` and so on: `crate.png`, `crate_2.png`.

Level materials are written matte in every format: not metallic, fully rough and without specular highlights. glTF and GLB files state the missing specular with the `KHR_materials_specular` extension; programs that do not read it still get the full roughness.

### Axes and units

FBX and OBJ exports convert the scene itself instead of adding a root node: positions and geometry are converted, and every object keeps its own rotation and scale, so an unrotated object in the editor is unrotated in the target program.

Exported files hold the objects of the level at their top level, with no extra root node. Each solid model becomes one object named after it, with its transform; its mesh data (the glTF mesh, the FBX geometry, the OBJ object) has the same name.

Exported meshes are connected: in FBX, corners at the same position share one vertex, and in OBJ equal positions, UVs and normals are each written once, while normals and UVs stay per corner, so hard edges and UV seams are kept. A glTF vertex has a single normal and UV, so glTF meshes share only corners that are identical in all of them; to connect a glTF mesh across hard edges and seams in Blender, turn on **Merge Vertices** in its glTF importer.

Programs with a left-handed space (Unity, Unreal Engine) mirror one axis when they import FBX and OBJ files, so for those targets the file holds the scene turned to match, and the program's own mirror lands it exactly on the target axes: no mirrored objects, no inside-out faces. Objects keep their names and parents in FBX, and each material of the level is written once under its name. OBJ has no hierarchy; each object becomes its own mesh.

The FBX header names the axes the file's data is written in, so importers that read it keep the scene upright. OBJ files carry the same information in their objmeta comment, which other programs ignore. OBJ files for Blender are written +Y up, the way Blender's OBJ importer reads them with its default settings; in Unreal Engine, set the OBJ importer's up axis to Z.

In Unity, keep **Bake Axis Conversion** off in the model's import settings (the default). With it on, Unity turns the model half a turn about the up axis. **Convert Units** makes no difference, because the file declares meters; **Scale Factor** scales the model. Unity reads glTF files with the glTFast package.

### objmeta comment

OBJ and MTL files written by AiWorldEd start with a comment that states the axes and unit of the data:

```
# objmeta {"v":1,"up":"+y","forward":"+z","right":"-x","unit":1,"generator":"AiWorldEd 1.2.3"}
```

- **Keyword:** a comment line starting with `# objmeta ` followed by one JSON object. It may be any line of the comment and blank lines at the top of the file, before the first statement; readers use the first valid one.
- **`up`, `forward`, `right`:** the file axis (`+x`, `-x`, `+y`, `-y`, `+z` or `-z`) that points up, that the model's front faces, and that points to the model's own right. Unity mirrors one axis when it reads an OBJ file, so a Unity file says `"right":"-x"`, like a Godot file. Left-handed axes are valid too: the editor mirrors such a file back and reverses its faces.
- **`unit`:** meters per file unit, a positive number (`1` for meters, `0.01` for centimeters).
- **`generator`:** the program and version that wrote the file (optional, informational).
- **`v`:** format version, `1`. Readers ignore a comment of another version.
- Keys and axis values are lowercase, and readers ignore unknown keys. A comment that is not valid JSON, is longer than 4096 bytes, misses a key or uses an axis letter twice is ignored as a whole.

## Target program notes

- **Godot:** the default target: meters, +Y up.
- **Blender:** Z up. FBX, glTF and OBJ import upright with the default settings. OBJ files are written +Y up with the front on +Z, the axes Blender's OBJ importer expects (**Forward Axis** -Z, **Up Axis** Y); it converts them by setting each imported object's rotation to 90° on X, as it does for OBJ files Blender wrote itself. A Blender OBJ without an objmeta comment is read the same way when **Blender** is chosen as the Source Program. Blender reads binary FBX only.
- **Unity:** meters, +Y up. FBX for Unity copies its textures by default. For glTF, install glTFast. Unity shows embedded FBX textures only after **Materials > Extract Textures**.
- **Unreal Engine:** centimeters, Z up.

## Validate an export

Before exporting an entire production level, make a small asymmetric test:

1. Include an object with a clear front, top, and right side.
2. Apply a directional or asymmetric texture.
3. Place it away from the origin.
4. Export with the intended Target Program.
5. Import it into the target program.
6. Check position, scale, front-face visibility, normals, texture orientation, and collision.

An asymmetric test reveals mirrored axes and reversed orientation far more clearly than a centered cube.

## Browser permissions

Browser builds use browser file and folder access. If saving or loading fails:

- Allow the browser's file picker and download prompts.
- Grant folder permission for texture browsing.
- Avoid private browsing modes that discard permissions aggressively.
- Try the standalone application if browser security policy blocks a required workflow.
