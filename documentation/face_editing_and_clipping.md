# Face Editing and Clipping

Face tools let you work with visible surface regions rather than whole objects. The Clip Plane tool cuts an object using a plane defined directly in the viewport.

## Enter Face Select

Press `Shift+Tab` or open the Tools palette and choose **Face Select**. The status bar changes to Face selection and reports how many faces are selected.

Click a surface to select its face region. Selection modifiers and drag selection can add more regions. Work from a clear view so you do not accidentally select a front-facing surface when you intended one behind it.

Press `Tab` to return to Object Select.

## Edit Mode vertices, edges, and faces

Press `Tab` on a selected mesh or solid brush to enter Edit Mode. `1`, `2`, and `3` switch Vertex, Edge, and Face select. The options bar also has Blender-style **Mesh**, **Vertex**, **Edge**, and **Face** menus for Knife, Loop Cut, Merge, and Dissolve.

- `K` starts the knife: click an edge to insert a vertex. The new point stays on the edge, so a convex brush stays convex.
- `Ctrl+R` starts Loop Cut: hover an edge, click to lock that belt, slide along the locked edge, then click or Enter to confirm. Loop cuts only insert vertices on the locked belt edges.
- `M` opens Merge (At Center, At First, At Last, By Distance).
- `Delete` or `X` dissolves the current component selection. Brushes refuse an edit that would drop below a tetrahedron. A brush that is non-convex, has two faces with the same outward normal, or has two vertices at the same position stays editable and is left out of solid compilation until a later edit makes it valid again. Duplicating that brush leaves the copy out of compilation as well.
- Yellow warning triangles mark distinct vertices that share a position. Merge By Distance welds the current vertex selection. With nothing selected, By Distance welds every coincident cluster in the edit session. Moving two vertices together does not auto-weld.

Press `Tab` again to return to Object Mode.

## Extrude selected faces

1. Enter Face Select.
2. Select one or more suitable coplanar face regions.
3. Press `Shift+E` or click the Extrude action in the Tools palette.
4. Drag to choose the extrusion depth.
5. Commit the interaction.

Extrusion creates new convex prism geometry while leaving the source geometry intact. This makes extrusion useful for adding ledges, panels, steps, or extensions without destroying the original object.

If extrusion is unavailable, confirm that at least one compatible face is selected and that Face Select is active.

## Clip Plane tool

The Clip Plane tool slices selected geometry along a plane established with three points.

1. Select the object you want to cut.
2. Open the Tools palette.
3. Choose **Clip Plane**.
4. Place three points in a viewport to define the cutting plane.
5. Inspect the preview to see which side will remain.
6. Choose **Flip**, **Clip**, or **Split**.

The clip actions remain disabled until a valid plane is ready.

### Clip actions

- **Flip** (`F`) swaps the side that will be kept.
- **Clip** (`Enter`) removes one side and retains the other.
- **Split** (`X`) creates separate results for both sides.
- **Escape** cancels the tool.

The `F` key normally frames the selection, but while Clip Plane is active it flips the plane instead.

## Placing a predictable plane

The three points define both the plane and its orientation. For a clean result:

- Place the points far enough apart to make the plane unambiguous.
- Use Top, Front, or Side view for axis-aligned cuts.
- Inspect the keep-side preview in Perspective before committing.
- Use Flip rather than replacing all three points when only the kept side is wrong.

## Face selection for texturing

Face selection is also the basis for per-face texture assignment and UV editing. Select the intended face regions first, then use the Texture Browser or UV Editor. See [Textures and UV mapping](textures_and_uvs.md).
