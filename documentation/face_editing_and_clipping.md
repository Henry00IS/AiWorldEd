# Face Editing and Clipping

Face tools let you work with visible surface regions rather than whole objects. The Clip Plane tool cuts an object using a plane defined directly in the viewport.

## Enter Face Select

Press `Shift+Tab` or open the Tools palette and choose **Face Select**. The status bar changes to Face selection and reports how many faces are selected.

Click a surface to select its face region. Selection modifiers and drag selection can add more regions. Work from a clear view so you do not accidentally select a front-facing surface when you intended one behind it.

Press `Tab` to return to Object Select.

## Edit Mode vertices, edges, and faces

Press `Tab` on a selected mesh or solid brush to enter Edit Mode. `1`, `2`, and `3` switch Vertex, Edge, and Face select. The options bar has four menus, and every tool appears in exactly one of them:

| Menu       | Tools                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mesh**   | Knife Topology Tool (`K`), Make Face, Fill Holes, Delete (`Backspace`), Dissolve (`Delete`)                                                                                                                              |
| **Vertex** | Merge Vertices (`M`), Connect Vertices (`J`), Smooth Vertices                                                                                                                                                            |
| **Edge**   | Loop Cut (`Ctrl+R`), Subdivide Edges, Bevel Edges (`Ctrl+B`), Extrude Edges (`E`), Bridge Edge Loops, Rotate Edges, Collapse Edges                                                                                       |
| **Face**   | Extrude Faces (`E`), Extrude Faces Individually, Inset Faces (`I`), Solidify, Shrink / Fatten, Duplicate Faces (`Shift+D`), Split Faces (`Y`), Flip Faces, Triangulate Faces, Poke Faces, Join Triangles, Assign Texture |

- `K` starts the knife: click an edge to insert a vertex. The new point stays on the edge, so a convex brush stays convex. Afterwards the new vertex is selected in Vertex select, or the two halves of the cut edge in Edge select, ready to move.
- `Ctrl+R` starts Loop Cut: hover an edge, click to lock that belt, slide along the locked edge, then click or Enter to confirm. Loop cuts only insert vertices on the locked belt edges.
- `M` opens Merge (At Center, At First, At Last, By Distance).
- `Delete` dissolves the current component selection and joins the surrounding faces; `Backspace` or `X` deletes it together with the faces that use it. Brushes refuse an edit that would drop below a tetrahedron. A brush that is non-convex, has two faces with the same outward normal, or has two vertices at the same position stays editable and is left out of solid compilation until a later edit makes it valid again. Duplicating that brush leaves the copy out of compilation as well.
- Yellow warning triangles mark distinct vertices that share a position. Merge By Distance welds the current vertex selection. With nothing selected, By Distance welds every coincident cluster in the edit session. Moving two vertices together does not auto-weld.

Press `Tab` again to return to Object Mode.

## Modelling mesh detail in Edit Mode

These tools work on meshes. A convex solid brush cannot hold the faces they add, so they leave brushes unchanged and say so in the status bar. Each tool is one undo step and keeps working in a shared room.

- **Extrude Faces** (`E`, Face select): pull the selected faces out along their normal. Move the pointer to set the distance, or type a number (a minus sign pushes the faces into the mesh to cut a pocket). Distances snap to the grid; hold `Shift` to invert snapping. Click or `Enter` confirms, `Escape` or right click cancels. Faces that touch move together with walls only around the outside; **Extrude Faces Individually** gives each face its own walls. The extruded faces stay selected, so `S` scales them straight away, for example to taper a pocket.
- **Bevel Edges** (`Ctrl+B`, Edge select): cut the selected edges off with a flat chamfer. Move the pointer away from the edges to widen it, or type a width; snapping and confirming work as for Extrude Faces. Edges must lie between two faces and must not touch each other; the edges of each chamfer stay selected.
- **Extrude Edges** (`E`, Edge select): pull open border edges, such as the rim of a hole, straight out of their faces into a new strip. Distance, typing and snapping work as for Extrude Faces, and the new outer edges stay selected so you can press `E` again or move them.
- **Inset Faces** (`I`, Face select): shrink the selected faces inside their outline and ring them with new faces. Move the pointer to set the thickness, press `Tab` to switch to the depth (drag along the normal, or type a value; negative sinks the faces), and press `I` to toggle between one inset around the whole region and one per face. Typing, snapping and confirming work as for Extrude Faces.
- **Solidify** (Face select): give loose faces, such as a single panel whose outline touches no other face, a thickness so they become a closed slab. Move the pointer or type the thickness like Extrude Faces; a negative value grows the slab behind the faces. The slab follows the faces' averaged normal, so it suits flat panels best.
- **Shrink / Fatten** (Face select): move every corner of the selected faces along the averaged normal of the selected faces around it, so a surface swells out or sinks in without new faces. Move the pointer or type a distance like Extrude Faces; a negative value shrinks. The faces stay selected.
- **Duplicate Faces** (`Shift+D`, Face select): copy the selected faces onto their own vertices and select the copy, ready to move, extrude or scale.
- **Split Faces** (`Y`, Face select): detach the selected faces from the rest of the mesh without copying them, so they can be moved, solidified or extruded on their own; the edges they shared with the rest become open borders on both sides.
- **Flip Faces** (Face select): turn the selected faces to face the other way, for example after building a face from the wrong side.
- **Triangulate Faces** and **Poke Faces** (Face select): split the selected faces into triangles, along their outline or fanned around a new center vertex. Every piece stays selected.
- **Join Triangles** (Face select): join flat pairs of selected triangles into quads, squarest pairs first, for example to clean up an imported model before extruding or cutting loops.
- **Assign Texture** (Face select): paint the selected mesh faces with a texture. Clicking a texture in the Texture Browser while in Face mode on a mesh does the same; the menu entry uses the texture picked last. Each face keeps its UVs, every texture on the mesh becomes its own material, and exports write one material per texture on a single mesh. Solid faces keep their own face tool.
- **Connect Vertices** (`J`, Vertex select): cut the faces between the selected vertices with new edges, for example from one edge midpoint to another.
- **Smooth Vertices** (Vertex select): move the selected vertices half way towards the average of their edge neighbours to even out bumps and spacing; run it again to smooth further.
- **Subdivide Edges** (Edge select): split each selected edge in half and select the halves. Run it again for finer cuts.
- **Bridge Edge Loops** (Edge select): join two selected edge loops, or two open runs of edges with the same count, with a strip of faces. Corners are matched to their closest partner.
- **Rotate Edges** (Edge select): turn each selected edge between two faces one corner onward inside their shared outline, for example to flip the diagonal between two triangles; the turned edges stay selected. A turn that would fold a face over is skipped.
- **Collapse Edges** (Edge select): merge each run of connected selected edges into one vertex at its middle; faces that shrink below three corners are removed. The selection is cleared afterwards.
- **Make Face** (Vertex or Edge select): fill a face through the selected vertices or the ends of the selected edges, for example to close a hole after deleting faces. The new face is wound to match its neighbours and takes their texture.
- **Fill Holes** (Vertex or Edge select): close every hole whose rim touches the selection with one new face, wound and textured like its neighbours; select one rim vertex, or the rim with Select Loop. Holes that meet at a vertex are left open.

## Extrude selected faces into a new brush

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
