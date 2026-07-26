# AiWorldEd User Guide

AiWorldEd is a visual editor for blocking out and building 3D game worlds. You can create ordinary meshes, construct architecture from solid brushes, cut and combine shapes, apply textures, and export the result as a GLB file for another 3D tool or game engine.

These guides explain the editor from a user's point of view. You do not need to know Three.js or understand how the editor is programmed.

## Start here

1. [Getting started](getting_started.md) — create, inspect, save, and export your first scene.
2. [Understanding the interface](understanding_the_interface.md) — learn what each area of the editor is for.
3. [Glyph reference](glyph_reference.md) — see every icon and learn what it does.
4. [Navigation](navigation.md) — move around the perspective, top, front, and side views.
5. [User input and shortcuts](user_input_and_shortcuts.md) — mouse controls, selection gestures, and the default keyboard map.

## Build and edit a world

- [Selecting and organizing objects](selecting_and_organizing.md)
- [Creating and transforming objects](creating_and_transforming.md)
- [Solid modeling and CSG](solid_modeling_and_csg.md)
- [Face editing and clipping](face_editing_and_clipping.md)
- [Textures and UV mapping](textures_and_uvs.md)
- [Precision tools and alignment](precision_tools.md)

## Projects and preferences

- [Saving, loading, importing, and exporting](files_import_and_export.md)
- [Settings and game profiles](settings_and_profiles.md)
- [Building and running from source](building_and_running.md)
- [Build command reference](build_command_reference.md)
- [Troubleshooting](troubleshooting.md)

## A useful way to think about the editor

AiWorldEd offers two complementary building styles:

- **Ordinary scene objects** are independent cubes, spheres, cylinders, planes, and terrain meshes. They are convenient for props, blockouts, standalone shapes, and mesh-to-mesh CSG.
- **Solid models** contain an ordered list of convex brushes. Each brush adds, removes, or limits volume as part of one continuously rebuilt architectural result. They are best suited to rooms, walls, doorways, corridors, and other level geometry.

You can use both styles in the same scene. If you are unsure which to choose, begin with ordinary primitives while learning the interface, then use a solid model when you want brush-based construction.
