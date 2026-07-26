# Solid Modeling and CSG

Constructive solid geometry, or CSG, creates complex shapes by combining simple volumes. AiWorldEd supports both ordered solid-model brushes and direct boolean operations between ordinary meshes.

## Solid models versus mesh CSG

These features solve related but different problems.

- A **solid model** owns a sequence of brushes. Changing a brush operation or order automatically rebuilds the model result.
- The top-level **CSG menu** applies Union, Subtract, or Intersect directly to a compatible mesh selection.

Use a solid model for architecture you expect to keep revising. Use mesh CSG for a more direct one-off combination of separate objects.

## Create a solid model

1. Choose **Add > Solid Model**.
2. Select the new model in the hierarchy.
3. Open the Solid Model panel if it is not already visible.
4. Click **+ Box Brush** to add a brush.

The panel identifies the active model and reports its number of brushes. Brush operation details are edited in the Properties panel.

## Brush operations

Select a brush inside the solid model. The Solid Model section in Properties offers:

- **Additive**: contributes its volume to the result.
- **Subtractive**: removes its volume from the result.
- **Intersecting**: keeps volume according to the intersection stage of the ordered model.

A common doorway workflow is:

1. Create or size an additive brush as a wall.
2. Add another box brush.
3. Position the second brush through the wall where the opening belongs.
4. Set the second brush to Subtractive.

Move or resize either brush later and the compiled result updates.

## Brush order matters

Brushes are evaluated in order, so the same brushes can produce different results when reordered. The Solid Model properties include controls to move selected brushes toward the first or last evaluation position. You can also organize brushes through the hierarchy where supported.

When a result is surprising:

1. Identify which brush creates the base volume.
2. Identify which later brush adds, subtracts, or intersects it.
3. Inspect the order.
4. Move one brush at a time and watch the rebuild.

## Inverted world

The **Inverted world** option starts the CSG interpretation as filled space so subtractive brushes can carve rooms from it. This is useful for workflows where empty rooms and passages are cut out of an otherwise solid world.

Use it deliberately. A normal additive workflow begins with empty space and adds matter; an inverted workflow begins conceptually solid and removes navigable space.

## Direct mesh CSG

The **CSG** menu provides:

- **Union**: combine selected volumes.
- **Subtract**: remove one selected volume from another.
- **Intersect**: keep their shared volume.

The menu remains disabled unless the selection is compatible. Selection order can matter for non-commutative operations such as subtraction, so verify which object is acting as the base and undo if the operands were interpreted in the opposite order.

## Practical CSG habits

- Prefer simple, overlapping, closed volumes.
- Make cutters extend clearly through the target instead of ending exactly on a surface.
- Avoid nearly coplanar faces when a small offset will make the intent clearer.
- Save before a major restructuring pass.
- Use Wireframe or Wireframe Overlay to inspect overlaps.
- Keep brush names descriptive and order understandable.
- Build concave structures from convex brushes rather than forcing one complicated source mesh.

## When the result looks wrong

Check:

- Whether the selected brush has the intended operation.
- Whether the brushes actually overlap.
- Whether brush order matches the intended sequence.
- Whether Inverted world is appropriate.
- Whether you used solid-model operations or the separate mesh CSG menu.
- Whether a brush is hidden or locked.
