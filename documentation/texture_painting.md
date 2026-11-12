# Texture Painting

Paint straight onto solid brush surfaces: footsteps across a floor, grime in a corner, a stencilled sign on a wall. There are no UVs to unwrap and no texture sizes to pick. Painted detail always has the same sharpness, it follows its brush when the brush moves, and it survives every CSG change.

## Using It

1. In Object Mode, pick **Paint** on the viewport tool rail, after Face Select, Clip Plane and Grid. The **Paint** palette opens at the bottom of the window.
2. Drag across any solid surface to paint. The ring under the pointer shows the brush size, and it fills while you press.
3. Choose a tool in the palette:
   - **Brush** paints soft or hard round strokes.
   - **Eraser** removes paint.
   - **Stamp** prints one shape per click, or a trail of them while you drag. Footsteps alternate left and right and turn to follow the stroke.
   - **Picker** takes the color from the surface under the pointer. Hold **Alt** with any tool to pick for a moment.
4. Set **Size**, **Hardness**, **Opacity** and **Spacing**, and pick a color from the swatches or the color field. **Stencil** masks the brush with any texture from the texture browser.
5. Each stroke is one undo step.

| Key           | Action                               |
| ------------- | ------------------------------------ |
| `[` and `]`   | Smaller and larger brush             |
| `Shift+[`/`]` | Softer and harder brush              |
| `B`, `E`, `T` | Brush, Eraser, Stamp                 |
| `I` or `Alt`  | Picker                               |
| `X`           | Swap the color with the previous one |
| `Esc`         | Back to Object Select                |

## Decal Volumes

**Add → Decal Volume** places a box that projects onto every brush surface inside it, straight down its own -Y axis. It is a modifier volume, so it moves, rotates, scales, duplicates, hides and saves like any other volume, and it follows its parent group.

| Setting     | Meaning                                                                              |
| ----------- | ------------------------------------------------------------------------------------ |
| Texture     | Image projected by the volume; its alpha is the mask. Empty paints a plain color.    |
| Color       | Tint multiplied into the image, or the plain color.                                  |
| Blend Mode  | **Normal**, **Multiply**, **Add**, **Screen** or **Darken Only Shadow** (see below). |
| Opacity     | Strength of the whole layer.                                                         |
| Layer Order | Lower numbers are applied first. Hand painting is layer 0.                           |
| Edge Fade   | How softly the projection fades out toward the sides of the box.                     |
| Angle Fade  | Surfaces turned away from the projection fade out instead of smearing.               |

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

### How a Dab Lands on a Face

For a texel on a face, its brush-local point is projected into the dab's frame (right, up, forward). The shape mask is read at the right and up coordinates divided by the radius. The mask is multiplied by two falloffs:

- a depth falloff, so faces far behind the dab are not painted;
- a facing falloff, so walls next to a painted floor stay clean, and a stamp never smears across a surface turned away from it.

Because this is computed in 3D, one dab paints continuously across neighboring coplanar faces of different brushes.

### Constant Texel Density

Every face gets a **canvas**: a 2D frame on its plane, built from the face normal in brush-local space. The frame is orthonormal and right-handed, so stamps are never mirrored. Canvas texels are a fixed **128 per meter**. A face never needs a size or a resolution: its canvas is unbounded and sparse.

### The Atlas: Fixed Tiles in Pages

The canvas is cut into **tiles** of 62 × 62 texels. Only tiles that paint actually reaches are allocated. Each tile occupies a **64 × 64 slot** in an atlas **page** of 1024 × 1024 (256 slots). The extra 1-texel ring is a gutter that is rasterized from the same records as the tile itself, so linear filtering never shows seams between tiles.

Because every allocation has the same size, the allocator is a free list:

- **Allocate** takes the lowest free slot, so pages fill from the front.
- **Free** returns a slot as soon as a tile has no paint left (fully erased, stroke undone, brush deleted, face hidden by CSG).
- **Grow**: when every page is full, a new page is added. There is no limit besides memory.
- **Compact**: when the slots in use would fit in fewer pages, tiles from the last pages move into free slots on earlier pages, and empty trailing pages are released.

The atlas is rebuilt from the records whenever needed and is never saved, so it can change its layout at any time.

### Paint as Two Maps

All blend modes used here are affine in the base color `c`, per channel:

| Mode     | Result                     | A (multiplier) | B (offset) |
| -------- | -------------------------- | -------------- | ---------- |
| Normal   | `c·(1−a) + p·a`            | `1−a`          | `p·a`      |
| Multiply | `c·(1−a + a·p)`            | `1−a+a·p`      | `0`        |
| Add      | `c + p·a`                  | `1`            | `p·a`      |
| Screen   | `c + (p·a)·(1−c)`          | `1−p·a`        | `p·a`      |
| Darken   | `c·(1 − a·(1−p))` (shadow) | `1−a·(1−p)`    | `0`        |

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

Exporters see only the result mesh, so painted faces get a **copy** of their texture with the paint baked in:

1. The painted triangles of each brush face are grouped into an export chart covering their canvas bounds.
2. Every chart texel samples the face's own texture through its UV matrix (so tiling is respected), applies `base·A + B`, and is written into a new image.
3. Those triangles get UVs into that image and a new material named after the original texture.

Unpainted faces keep the original texture, which is never modified.

### Performance

- Rasterizing touches only the dabs whose bounds meet a tile, and only tiles that changed.
- GPU uploads are limited to the rows of the changed slots.
- Overlay geometry exists only where paint exists.
- Records never change unless the user paints, so reloading a level rebuilds the same atlas deterministically.

## Limits

- Paint applies to solid brushes. Imported meshes and content meshes are not painted yet.
- Copies made by array, mirror and other duplicating volumes show the paint of their source brush only on the source.
- Paint is not filtered for distance (no mipmaps), so very fine detail can shimmer when seen from far away.
