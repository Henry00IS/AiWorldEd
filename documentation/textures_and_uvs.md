# Textures and UV Mapping

Texturing has two parts: choosing an image and controlling how that image is placed on the selected surfaces.

## Open a texture folder

1. Open the **Texture Browser** from the top toolbar.
2. Click **Open Folder…**.
3. Choose a local folder containing supported image files.
4. Approve browser access if prompted.

The panel shows the folder name, texture thumbnails, and the number of textures found. Hovering a tile reveals its relative path. If no folder is open, the panel displays an empty-state message.

For manageable projects, keep related textures in a dedicated folder with clear filenames. The editor scans the selected folder and presents eligible images.

## Apply a texture

For an entire ordinary mesh:

1. Use Object Select.
2. Select the mesh.
3. Choose a texture in the Texture Browser.

For individual surfaces:

1. Enter Face Select with `Shift+Tab`.
2. Select one or more face regions.
3. Choose a texture in the Texture Browser.

Solid-model brushes retain per-face texture information through CSG rebuilding where the surface can be traced through the result.

## Open the UV Editor

Open the UV Editor from the toolbar or from the Face Select context in the Tools palette. The panel reports the number of selected face regions it can edit.

If it says **No surfaces selected**, enter Face Select and choose a surface first.

## Alignment presets

The icon strip offers:

- **Floor** for upward-facing horizontal surfaces.
- **Wall** for vertical surfaces.
- **Ceiling** for downward-facing horizontal surfaces.
- **Reset** to restore the default mapping.

These are quick starting orientations. Choose the closest surface type, then refine it with numeric values.

## Scale, offset, and rotation

- **Scale U** and **Scale V** control texture size or repetition along the two surface directions.
- **Offset U** and **Offset V** slide the image across the surface.
- **Rotation** turns the image on the surface in degrees.

Commit a changed field to apply it. When several surfaces are selected, the change applies across the target regions.

The U and V directions belong to the surface, not necessarily to world X and Y. If a texture moves in an unexpected screen direction, remember that you are editing the surface's own 2D coordinate system.

## UV smear

UV smear is an interactive adjustment workflow that transfers or drags texture placement directly across a mesh surface. Use it for visual matching when numeric offsets are less convenient.

For exact repeating architectural materials, the UV Editor's numeric controls are usually more predictable. For quickly lining up a visible feature, smear can be faster.

## Position Lock and Stretch Lock

The top toolbar separates two texture behaviors:

- **Pos Lock** controls whether UVs stick to the object as it moves or rotates. When it is off, the surface can slide through world-aligned texture space.
- **Stretch Lock** controls scaling behavior. When it is on, the existing UV layout stretches with the object; when it is off, the editor preserves tile density by rebaking the mapping.

Examples:

- Turn on Pos Lock when a painted sign or unique detail must remain attached while the object moves.
- Turn off Pos Lock for world-aligned walls whose pattern should stay anchored in the level.
- Turn on Stretch Lock when scaling should visibly stretch the image.
- Turn off Stretch Lock when bricks or tiles should remain roughly the same world size after resizing.

## Material color

The Material color in Properties tints a mesh. It is separate from the selected texture. A non-white tint can make the image appear darker or colored, so return the tint to white when you want the texture's original colors.

## Diagnosing texture problems

- **Texture is on the wrong faces:** return to Face Select and review the selected regions.
- **Texture is sideways:** use Floor, Wall, or Ceiling, then adjust Rotation.
- **Pattern size differs after scaling:** review Stretch Lock.
- **Texture slides or sticks unexpectedly during movement:** review Pos Lock.
- **Texture looks tinted:** inspect Material color.
- **Browser is empty:** confirm that folder permission was granted and that supported image files exist in the selected folder.
