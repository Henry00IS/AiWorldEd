# Settings and Game Profiles

Open Settings from the gear icon in the top toolbar. Settings are divided into user-facing categories, including View, Mouse, Keyboard, Games, and Update.

## View settings

The View tab controls presentation rather than scene content. Available preferences include:

- Theme.
- Interface brightness.
- Material Browser icon size.
- Renderer font size.
- Perspective orientation widget size (48–192 px).
- Number of visible viewport panes.
- Expanded toolbar button labels.

Increase icon or font size when controls are difficult to read. Reducing the viewport count can give one or two views more working space, while four views provide the strongest spatial cross-check.

Enable **Expanded toolbar button labels** when you want text-only action names
in the large toolbar state. Drag the toolbar's bottom edge to switch among
small 16 × 16 icons, medium 25 × 25 icons, and large labels. Disable the
setting if you prefer icons in the large state too.

## Mouse settings

The Mouse tab controls camera behavior:

- Look sensitivity.
- Invert look X or Y.
- Pan sensitivity.
- Invert pan X or Y.
- Fly movement speed.
- Movement sensitivity.
- Invert the mouse wheel.
- Alternate middle-mouse camera behavior.
- Move camera toward the cursor where supported.

Change one preference at a time and test it in both Perspective and an orthographic view.

## Keyboard settings

The Keyboard tab displays editable bindings for tool, selection, file, view, snapping, extrusion, and clipping actions.

When assigning a shortcut:

- Avoid conflicts between actions used in the same context.
- Remember that Clip Plane intentionally reuses keys such as `F`.
- Keep fly-navigation movement practical; right-mouse fly mode uses `WASD` plus `Q` and `E`.
- Use the displayed binding rather than assuming a guide's default after customization.

See [User input and shortcuts](user_input_and_shortcuts.md) for the default map.

## Game profiles

A game profile defines how authored editor space is converted for export. It includes:

- A profile name.
- Metric or imperial unit choices.
- A coordinate-space basis.
- Target-style right, up, and forward axes.

AiWorldEd's authored scene remains in its normal editor coordinate system and meters. The active profile drives viewport presentation and profile-aware OBJ and FBX export. GLB export follows canonical glTF coordinates and meters instead of applying the active profile's target transform.

Built-in or common profile intentions include Godot, Blender, Unity, and Unreal Engine. A custom profile is useful for an engine or pipeline with different axis and unit requirements.

## Units

Choose the unit that matches the destination pipeline:

- Meter-scale workflows suit Godot, Unity, Blender, and many general 3D pipelines.
- Centimeters are customary for Unreal Engine.
- Imperial units may suit a project authored around feet or inches.

Viewport measurements preserve physical size while changing their displayed unit. For example, one editor meter appears as 100 cm in a centimeter profile and 1000 mm in a millimeter profile. The orientation widget keeps X red, Y green, and Z blue while displaying the profile's signed axis labels.

Do not use unit conversion to compensate for an object that was modeled at the wrong relative size. First make the scene internally consistent, then choose the correct export unit.

## Coordinate space

The selected axes determine orientation and handedness. A valid profile needs mutually consistent right, up, and forward directions.

If you create a custom profile:

1. Confirm the target application's up axis.
2. Confirm its forward convention.
3. Confirm whether it is right- or left-handed.
4. Export a small asymmetric test.
5. Preserve the exported root transform during import.

## Update settings

The Update tab behaves differently by environment:

- In a supported standalone build, it can check for a published release and may offer installation.
- In a browser, it opens or references the release page because a web page cannot replace its own executable.

Automatic update checks are optional. Installation occurs only after you choose the install action in a supported standalone environment.
