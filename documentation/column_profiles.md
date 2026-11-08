# Column sections and profile presets

## Sections and twist

- Depth / width is a generator-wide aspect ratio; Round becomes an oval.
- Select one segment or marquee-select points, then use Section to apply a type to every joining segment. S cycles Round, Square and Polygon. Graph bands are blue for square and gold for polygon, teal when the corners are cut or rounded; dashed bands indicate twist.
- Square and Polygon have **Corner** and **Corner sides**. Corner is how far each cut reaches along the two sides, as a fraction of half a side: 0 keeps sharp corners, 1 meets at the side middles. Corner sides is the number of faces across each corner, 1 to 8: 1 is a straight chamfer, more faces follow the bevel modifier's round profile, a circle arc touching both sides. A square with corner 1 and many sides approaches Round. Corner values stay when switching between Square and Polygon; Round drops them.
- A chamfer reaching 2 − √2 ≈ 0.59 of half a side makes a regular octagon (before aspect scaling). Aspect scales the corners too, so rectangle fillets are elliptical rather than independently circular.
- Polygon supports 3, 4, 5, 6, 8 and 12 faces. The common ring resolution rounds Sides up to a multiple of every section's corner count (4 whenever any non-round section is used), and to at least one ring point per corner face and side of every cut section. The supported combinations require at most 120 samples. Every corner of a cut section gets the same number of ring points: one per corner face and the rest along the side after it. Redundant collinear samples are removed when compiling actual brush geometry.
- Twist is degrees over each segment, accumulated from the bottom, bounded to ±1440 degrees. Sampling adds sub-rings at no more than 5 degrees per band. Inserting a point divides the original twist, deletion adds neighboring twists, and Mirror reverses handedness.
- Twisted bands use small **convex hull envelopes** of successive rotated rings. The planar triangular boundary is a controlled approximation of a swept twist, not an exact ruled/helical surface. Changing rotation prevents run merging. Twisted columns use a conservative radius fit within the bounds.
- Square and polygon sides and chamfer faces are flat by default. Their twisted versions use separate smoothing classes for each intrinsic face ribbon: smooth along the twist, hard across true corners. Round and rounded corners (two or more corner sides) use the existing max angle. Caps and untwisted flat sides remain flat. Bake and scene saves preserve smoothing classes.

## Curve editor presets, markers and grid

- The preset picker starts with **Reset to 1.0**, **Reset to 0.5** and **Reset to 0.0** in their own _New curve_ group: flat curves that start a new profile. Every curve editor offers them, whatever its field.
- Every preset has a plain object name and a tooltip, shown when hovering its entry and on the closed picker, with a sentence on where the shape comes from or is found and a level-design tip.
- **Base** and **Top** remember their place while switched off (the toolbar toggles and right-click on a marker switch them off), and switching one on restores it. Every preset stores its own base and top places, such as where a base block or a capital ends. Picking or arrow-browsing presets keeps which markers are on: with Top on, each preset you pick shows its top marker at that preset's place.
- The snap step starts at 0.01, the grid the presets are built on. The graph grid shows the snap step and every coarser decade (0.1 and 1), each fading in as its lines spread on screen, so lines are never closer than a few pixels. Both axes always use the same spacings, so every cell is a scaled copy of the unit square.

## UVs and convex runs

U measures actual polygon perimeter rather than angular slices, giving consistent density across unequal rectangle and corner edges. Stretch closes once; Tile closes an integer number of times. V follows continuous profile arc length. Twisted triangles match their mapped corner coordinates exactly. Untwisted tapered quads retain the existing affine, exact-at-mid-height mapping.

Wrapping one image around a square and a circle of the same half-width necessarily changes physical density by 4/π in the circular limit: their perimeters differ. Perimeter mapping cannot remove this geometric ratio while preserving one closed wrap (or integer repeats). It removes unequal-side distortion, not this unavoidable shape-to-shape ratio.

The convex-run optimization already existed, and regression measurements before and after this work agree:

| Profile               | Sampled solid bands | Actual convex brushes, before → after |
| --------------------- | ------------------: | ------------------------------------: |
| Henry's Example.curve |                  22 |                               13 → 13 |
| Outward cubic Bezier  |                   8 |                                 1 → 1 |
| Straight shaft        |                   4 |                                 1 → 1 |
| Inward waist          |                   2 |                                 2 → 2 |

The outward Bezier also merges to one brush for Square, Polygon and a square with rounded corners. Untwisted merged and unmerged side UVs are identical. Type/parameter changes split runs; fixed markers split them where height remapping introduces a non-convex bend. A 90-degree twist produces 18 convex sub-band brushes rather than incorrectly merging the non-convex swept solid.

## Persistence and verification

Section parameters and twist are stored in compact curve data and collaboration payloads; aspect belongs to the generator parameters. Authored generators/modifier volumes inside a solid-model hierarchy now survive that hierarchy snapshot in CSG order, with transforms and settings, instead of being silently dropped. Existing bevel-volume save loading is unchanged; no schema version or curve migration is introduced.

Tests cover all added profiles at non-unit aspect, common ring counts, convex twisted bands, UV seam/V continuity, hard-edge smoothing classes, curve editing, collaboration, scene save/load and bake. Browser acceptance covers marquee selection, all section choices, corner and numeric controls, native preset groups, textured profiles, and a baked single-brush wireframe-overlay view.

## Preset provenance

The grouped presets are original normalized profiles, not digitized plans, measured artifacts or historically exact reproductions; their tooltips give only general context. The two earlier softened furniture presets remain available. Generator bounds determine overall proportions. No source illustrations or plans are copied.

Terminology and form references checked:

- [Fine Woodworking, Elements of the Shaker Style](https://www.finewoodworking.com/membership/pdf/7527/011131079.pdf): simple square/turned tapers and swell tapers. The centered Shaker taper leg is **not** a traditional asymmetric inside-face taper.
- [Shackleton Fox, Turned Legs](https://www.shackletonfox.com/encyclopaedia/turned-legs/) and [Buffalo Architecture and History, Turning](https://buffaloah.com/f/glos/t/turn.html): cup-and-cover, ball-and-ring, baluster, bamboo, spool, steeple and trumpet vocabulary. The barley twist post combines a period-inspired silhouette with a stylized spiral, without attributing a particular historical object.
- [The Textbook of Architecture, Orders Compared](https://textbookofarchitecture.com/guide/orders-compared): Tuscan plain shafts and torus/plinth bases, Doric echinus, Ionic two-scotia bases and shaft diminution. Set height/diameter separately for order proportions. Doric and Ionic shafts deliberately omit flutes; no volutes, acanthus or complete capitals are implied.
- [UW–Madison Libraries, Arthur De Smet collection](https://search.library.wisc.edu/digital/ADeSmet): octagonal piers and molded bases in Decorated Gothic architecture. The pillar is simplified inspiration, not a surveyed pier.
- [Solomonic column](https://en.wikipedia.org/wiki/Solomonic_column): twisting shafts and furniture use. The twisted presets use convex polygonal approximations, not exact carved ornament.
- [Mark Baker, Rosewood Candlestick](https://woodworkersinstitute.com/how-to-make-a-rosewood-candlestick/) and [Popular Woodworking, Turned Table Lamp](https://www.popularwoodworking.live/article/turned-table-lamp/): bead/cove vocabulary, long coved stems and ogee lamp bases. All preset control points/proportions are original.
