# Texture Painting

Paint straight onto solid brush surfaces: footsteps across a floor, grime in a corner, a stencilled sign on a wall. There are no UVs to unwrap and no texture sizes to pick. Painted detail always has the same sharpness, it follows its brush when the brush moves, and it survives every CSG change.

## Using It

1. In Object Mode, pick **Paint** on the viewport tool rail, after Face Select, Clip Plane and Grid. The **Paint** palette opens at the bottom of the viewport.
2. Drag across any solid surface to paint. The ring under the pointer shows the brush size and lies flat on the surface. A drag that starts off a surface begins painting as soon as it reaches one.
3. Choose a mode in the palette:
   - **Brush** paints with the chosen shape.
   - **Eraser** removes hand painting with the same shape.
   - **Pick Color** takes the color shown on the surface under the pointer. Hold **Alt** and click with any mode to pick for a moment.
4. Choose a shape: **Round** for soft or hard strokes, or a stamp: **Footsteps** (alternating left and right, turning to follow the stroke), **Paw Prints**, **Splat**, **Star** or **Heart**. **Stamp Image** stamps any texture from the texture browser, using its alpha as the shape.
5. Set **Size**, **Strength** and **Hardness**, and pick a color from the color field or the recent colors. **Stencil** masks every stroke with a texture tiled across the surface, one repeat per **Stencil Size**.
6. Each stroke is one undo step. **Clear Paint** removes all paint from the selected brushes, also as one undo step.

| Key              | Action                                        |
| ---------------- | --------------------------------------------- |
| `[` and `]`      | Smaller and larger brush                      |
| `Shift+[` / `]`  | Softer and harder edge                        |
| `B`, `E`         | Brush, Eraser                                 |
| `I` or Alt+Click | Pick Color                                    |
| `1` to `9`, `0`  | Strength 10 % to 90 %, and 100 %              |
| `Esc`            | Cancel the stroke in progress (while drawing) |

## Decal Volumes

**Add → Decal Volume** places a box that projects onto every brush surface inside it, straight down its own -Y axis. It is a modifier volume, so it moves, rotates, scales, duplicates, hides and saves like any other volume, and it follows its parent group.

| Setting     | Meaning                                                                           |
| ----------- | --------------------------------------------------------------------------------- |
| Texture     | Image projected by the volume; its alpha is the mask. Empty paints a plain color. |
| Color       | Tint multiplied into the image, or the plain color.                               |
| Blend Mode  | **Normal**, **Multiply**, **Add** or **Screen** (see below).                      |
| Opacity     | Strength of the whole layer.                                                      |
| Layer Order | Lower numbers are applied first. Hand painting is layer 0.                        |
| Edge Fade   | How softly the projection fades out toward the sides of the box.                  |
| Angle Fade  | Surfaces turned away from the projection fade out instead of smearing.            |

## Design

### Where Paint Lives

Paint belongs to the authored brush, never to the CSG fragments built from it. Every brush keeps a set of **stroke records**. A stroke is a list of **dabs**, and every dab is a small projector stored in the brush's own local space:

- its center,
- the direction it points into the surface,
- an up direction that orients stamps and stencils,
- a variant number counted along the whole stroke, which alternates left and right feet and varies splats.

The stroke header stores the tool (paint or erase), shape, stencil, color, opacity, hardness, radius and a per-brush order number. Records are the source of truth; pixels are only a cache.

This gives the important guarantees for free:

- **Moving, rotating or scaling a brush** moves the paint with it, because the dabs are in the brush's local space.
- **CSG cuts** never touch the records. The result mesh is rebuilt and its fragments simply sample the paint of the brush face they came from. A hole shows no paint; filling the hole again brings the paint back.
- **Editing the brush shape** (clip, vertex edits, resize) re-projects the same dabs onto the new faces. Faces are just receivers.
- **Duplicates and copies** carry their records, because records are part of the brush.

A stroke that crosses several brushes stores its dabs on each brush it reaches, so a footstep trail continues from one floor brush to the next and each part sticks to its own brush.

### Array and Mirror Copies

Copies made by array, mirror and other duplicating volumes have no paint of their own. A copy shows the paint of its authored brush through the copy's placement, so a mirror copy shows it mirrored. Painting on any copy stores the stroke on the authored brush, in the authored brush's space, and it appears on every copy at once. Changing the copy count, the offsets or the volume needs no repainting.

Nothing is split or counted per copy: two screws painted far apart on a floor are two dabs in the floor's space, and every copy maps its faces back through its own placement, so each copy shows both screws at the same spots. To make one copy look different, place a Decal Volume over it: decals project where each copy stands, so they reach only the copies inside the box.

While no decal reaches a copy or its authored brush, the copy draws from the authored brush's atlas tiles and costs no texture memory. A copy that a decal reaches bakes its own tiles from the same strokes plus its decals.

### How a Dab Lands on a Face

For a texel on a face, its brush-local point is projected into the dab's frame (right, up, forward). The shape mask is read at the right and up coordinates divided by the radius. The mask is multiplied by two falloffs:

- a depth falloff, so faces far behind the dab are not painted;
- a facing falloff, so walls next to a painted floor stay clean, and a stamp never smears across a surface turned away from it.

Because this is computed in 3D, one dab paints continuously across neighboring coplanar faces of different brushes.

### Constant Texel Density

Every face gets a **canvas**: a 2D frame on its plane, built from the face normal in brush-local space. The frame is orthonormal and right-handed, so stamps are never mirrored. Canvas texels are a fixed **128 per meter**. A face never needs a size or a resolution: its canvas is unbounded and sparse.

### The Atlas: Fixed Tiles in Pages

The canvas is cut into **tiles** of 62 × 62 texels. Only tiles that paint actually reaches are allocated. Each tile occupies a **72 × 72 slot** in an atlas **page** of 1024 × 1024 (14 × 14 = 196 slots).

### Gutters and Mipmaps

Around its 62 × 62 content, every slot has a **5-texel gutter**. The gutter is never empty and never a fill color: the tile is rasterized over a window that starts 5 texels before its content, so the gutter holds the real paint of the canvas just past the tile's edge (the content of the neighbouring tile, decals included), computed from the same records. Where the canvas has no paint, the gutter holds "no paint" (A = 1, B = 0), exactly like the canvas there.

The gutter is kept correct after every change: a stroke or decal change re-rasterizes every tile whose window it touches, gutters included. A dab next to a tile edge therefore also rewrites the neighbour's gutter, even when the dab does not reach the neighbour's content.

The atlas pages have mipmaps, generated on the GPU after each upload, with trilinear filtering. The overlay shader picks the mip level itself and never samples coarser than **level 3** (16 texels per meter). The slot layout is sized for that cap:

- Slots are 72 texels, a multiple of 2³, so every level-3 mip texel averages texels of a single slot only.
- A bilinear tap at level 3 reaches half a level-3 texel (4 texels) past the content edge, which stays within the 5-texel gutter. The extra texel is for the lower levels' rounding.

So no mip level that is drawn ever mixes in a neighbouring slot.

The overlay samples the atlas at a point its triangle actually covers (centroid interpolation). With multisampling, a pixel on the edge of a small tile piece would otherwise run the shader at its center, outside the piece, and read atlas coordinates extrapolated several texels past the slot when seen from far away or at a grazing angle. The mip level itself is computed from ordinary (smooth) coordinates. Beyond the distance where level 3 is reached (about 60 m at 1080p with a 60° field of view), paint stays at level 3. Anisotropic filtering stays off, because its long footprint could reach past the gutter.

Because every allocation has the same size, the allocator is a free list:

- **Allocate** takes the lowest free slot, so pages fill from the front.
- **Free** returns a slot as soon as a tile has no paint left (fully erased, stroke undone, brush deleted, face hidden by CSG).
- **Grow**: when every page is full, a new page is added. There is no limit besides memory.
- **Compact**: when the slots in use would fit in fewer pages, tiles from the last pages move into free slots on earlier pages, and empty trailing pages are released.

The atlas is rebuilt from the records whenever needed and is never saved, so it can change its layout at any time.

### Paint as Two Maps

All blend modes used here are affine in the base color `c`, per channel:

| Mode     | Result            | A (multiplier) | B (offset) |
| -------- | ----------------- | -------------- | ---------- |
| Normal   | `c·(1−a) + p·a`   | `1−a`          | `p·a`      |
| Multiply | `c·(1−a + a·p)`   | `1−a+a·p`      | `0`        |
| Add      | `c + p·a`         | `1`            | `p·a`      |
| Screen   | `c + (p·a)·(1−c)` | `1−p·a`        | `p·a`      |

Applying `(A₁, B₁)` then `(A₂, B₂)` gives `(A₂A₁, A₂B₁ + B₂)`. So hand painting and every decal layer, in layer order, collapse into just two maps per texel: `final = base·A + B`. Each atlas page stores A in its left half and B in its right half. All math happens in display (sRGB) space, which is how images and color pickers behave.

Hand painting is first rasterized as a normal paint layer (color and coverage, with the eraser removing coverage), then turned into `(1−a, p·a)` and composed with the decal layers.

### Drawing It

The result mesh is not modified. Each painted solid model gets two overlay meshes in the shared scene, built from the result triangles that come from painted faces:

- Triangles are clipped to the tiles that are allocated, and each piece gets atlas coordinates directly.
- The first pass multiplies the color already on screen by A.
- The second pass adds B, scaled by the same studio lighting the surface uses.

The overlay is rebuilt when the result mesh changes or new tiles appear. During a stroke only the touched tiles are re-rasterized on the CPU and only their rows are uploaded to the GPU, so feedback is immediate.

### Undo

Each stroke is one command. Undo removes the stroke record from every brush it touched and redo puts the same record back, so the order never changes. **Clear Paint** on the selected brushes is one command too.

### Saving

Stroke records are saved with each brush in `world.json` inside the `.aiworld`, under `paint`. A stroke is a small object, and its dab array is packed as base64 (12 bytes of position, 6 bytes of directions and 1 variant byte per dab). Stencil and decal images are ordinary textures, so embedded textures travel inside the `.aiworld` as usual.

### Collaboration

Brushes are already synchronized by field-level edits. The `paint` record is keyed by stroke id, so adding or undoing a stroke sends only that one stroke, never pixels. Every member rasterizes the records locally and gets the same picture. Late joiners receive the records in the room snapshot. Locks work as for any brush edit.

### Export

Exporters (glTF, OBJ, FBX) see only the result mesh, so the paint and decals of each solid model are baked into one new image when it is exported:

1. Every result triangle that comes from a face with paint or decals joins that face's export chart: a rectangle on the face's paint canvas around everything of the face that survived CSG.
2. Only the painted parts of a face go into the image. Its painted texels are grouped into clusters (paint less than 4 texels apart belongs together), and each cluster gets a tight rectangle, a **patch**. Two screws painted far apart on one floor become two small patches, not one floor-sized rectangle. Patches merge whenever one rectangle around both costs less image area than two, counting each patch's margin and a fixed cost of 32 × 32 texels for its cuts. A face with more than 8 patches gets one patch around all its paint, and a patch that covers three quarters of its face takes the whole face.
3. Every patch texel samples the face's own texture through the face's UV mapping (so tiling and alignment are kept), multiplies the material color in, applies `base·A + B` from the same rasterizer the viewport uses, and is written into the image at the native 128 texels per meter.
4. The patches are shelf-packed with a 2-texel margin. If they do not fit in 4096 × 4096 pixels, all patches are scaled down evenly until they do.
5. The face's triangles are split along the patch edges. The parts inside a patch get UVs into the image and a copy of their material named `<material> Painted` whose map is the image (`<model>_painted`). The rest of the face keeps its material and UVs, and every vertex attribute of a split triangle is interpolated on the original triangle, so normals, colors and the original UVs carry over exactly. A cut vertex that lands inside an edge of a neighbouring triangle, in the same face or the next one, is added to that triangle too, so the export has no T-junctions and no cracks.

Unpainted faces keep their material and UVs, the live scene is never modified, and editor-only grid textures are not baked.

### Performance

- Paint never changes the CSG: painting, undoing, and moving, editing or hiding a decal never rebuild a solid or touch its result mesh. Decal Volumes do not count as volume changes for the CSG.
- A frame where nothing changed does no per-brush work: each brush costs one comparison of its paint revision. Brushes are baked again only when their paint or preview changed, when their model's result changed, or when a decal volume moved or was edited.
- A stroke in progress only costs the tiles under its newest dabs. The overlay is rebuilt only when tiles appear, move or disappear, and the facing of a brush's faces is reused until the model's result changes.
- Moving, editing, adding or removing a decal only revisits brushes that meet its old or new box, and only rebakes their tiles inside those boxes. A decal that touches nothing costs no paint work.
- A texture that is still loading is never painted as the loading checker. When it arrives, the brushes waiting for it are baked again on the next frame.
- A brush that waits for an image (a stamp or decal texture still loading or missing) is otherwise retried after 30 frames, then less and less often, up to every 960 frames.
- Rasterizing touches only the dabs whose bounds meet a tile, and only tiles that changed.
- GPU uploads are limited to the rows of the changed slots.
- Overlay geometry exists only where paint exists, and is rebuilt only when tiles appear, disappear or move.
- Records never change unless the user paints, so reloading a level rebuilds the same atlas deterministically.

## Limits

- Paint applies to solid brushes. Imported meshes and content meshes are not painted yet.
- Copies of brushes that a volume reshapes (bevel and similar) show no paint.
- Paint is filtered with mipmaps down to level 3 only, so very fine detail can still shimmer slightly beyond about 60 m.
