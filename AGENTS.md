# AI World Editor (AiWorldEd)

We use Three.js for rendering and math, no other third-party libraries.

This is a 3D map editor to build 3D worlds for video games.

## Locally installed Three.js skills

Use the relevant skills below whenever a task falls within their scope. Complex
rendering work may require several skills together; for example, an imported
animated character may need loaders, animation, materials, textures, and
lighting.

### `threejs-fundamentals`

Use for core Three.js scene structure: scenes, perspective and orthographic
cameras, WebGL renderer configuration, render loops, `Object3D` hierarchies,
transforms, coordinate systems, and foundational math. Start with this skill
when creating or restructuring viewports, cameras, scene graphs, or renderer
lifecycle behavior.

### `threejs-geometry`

Use when creating or modifying built-in geometry, `BufferGeometry`, vertex
attributes, indices, normals, groups, instancing, merging, or procedural mesh
data. It is the primary guide for shape construction, geometry processing,
memory disposal, and keeping custom geometry valid and efficient.

### `threejs-materials`

Use when selecting, configuring, cloning, or disposing Three.js materials,
including basic, Lambert, Phong, standard PBR, physical, normal, depth, and
custom-facing material behaviors. Apply it when implementing surface
appearance, transparency, blending, sidedness, material sharing, or
multi-material geometry groups.

### `threejs-textures`

Use for image, canvas, video, data, compressed, cube, HDR, and render-target
textures as well as UV channels and texture transforms. Consult it for color
spaces, wrapping, filtering, mipmaps, environment maps, texture memory, atlases,
and preserving correct visual quality and performance.

### `threejs-lighting`

Use when adding or tuning ambient, hemisphere, directional, point, spot, or
rect-area lights and when configuring shadows. It covers physically plausible
lighting, shadow-camera setup, helpers, environment illumination, and balancing
visual quality against rendering cost.

### `threejs-loaders`

Use for asynchronous loading of GLTF/GLB models, textures, HDR environments,
Draco or Meshopt-compressed assets, KTX2 textures, OBJ/MTL files, and other
supported resources. Follow it when coordinating loading state, progress,
errors, caching, decoder setup, or cleanup of loaded assets.

### `threejs-interaction`

Use for pointer and touch input that interacts with 3D content, including
raycasting, picking, hover, click, drag, object manipulation, and camera
controls. It is also relevant to coordinate conversion between screen, NDC,
world, and local space and to making interaction performant in dense scenes.

### `threejs-animation`

Use for procedural motion, keyframe tracks, `AnimationClip`,
`AnimationMixer`, skeletal animation, morph targets, playback control, and
animation blending. Apply it when playing imported GLTF animations, attaching
objects to bones, crossfading actions, or updating time-based motion in the
render loop.

### `threejs-postprocessing`

Use when building an `EffectComposer` pipeline or adding full-screen rendering
effects such as bloom, anti-aliasing, outlines, depth of field, ambient
occlusion, color correction, or custom shader passes. It should guide render
target sizing, pass ordering, depth dependencies, resizing, cleanup, and
performance tradeoffs.

### `threejs-shaders`

Use for GLSL vertex and fragment shaders, `ShaderMaterial`,
`RawShaderMaterial`, uniforms, varyings, custom attributes, and extensions to
built-in materials through `onBeforeCompile`. Consult it for procedural visual
effects, GPU vertex animation, custom lighting or texture sampling, shader
debugging, and avoiding costly shader patterns.

## Unit testing requirement

Every new feature MUST have a properly documented unit test. This test must be
robust enough to stand the test of time (no hardcoded positions, rotations, they
must create what they need, test the result, check the result).

## After making changes

`bun run testrun` (vitest is used) must pass all checks.

`bun run build` must pass.

PowerShell is janky, use cmd.

## User documentation requirement

Every source code change MUST include a review and update of the user
documentation in `documentation/`. Keep the documentation synchronized with the
current interface, behavior, workflows, settings, supported file formats, and
default input bindings. Do not leave documentation updates for a later change.

Write documentation for people using AiWorldEd, not for people maintaining its
source code. Explain what users can accomplish, when they would use a feature,
how to complete the task step by step, what result to expect, and how to recover
from common mistakes. Introduce specialized terms in plain language before
using them. Do not describe implementation details, internal class names, source
files, algorithms, or architecture unless that knowledge is necessary for a
user to make a correct decision.

Keep documentation in Markdown and organize it by user-facing category and
workflow. Use `documentation/README.md` as the entry point and link each guide
from it. Prefer several focused guides such as Getting Started, Understanding
the Interface, User Input, Navigation, Modeling, Texturing, Import and Export,
Settings, and Troubleshooting. Do not create one monolithic documentation file.
When a topic becomes difficult to scan, split it into a clearly named
snake_case Markdown file and update all relevant links.

Documentation must be in-depth and task-oriented. Include prerequisites,
selection or mode requirements, exact visible control names, default shortcuts,
ordered procedures, expected outcomes, important interactions with other
features, limitations users need to understand, and troubleshooting guidance
where relevant. Cross-link related guides instead of duplicating large
sections. Verify instructions against the current source and ensure every local
Markdown link resolves before finishing the change.

## Coding Style

Use many classes in many files. Do not let files grow more than 1000 lines. When
this limit is exceeded, stop and separate the file into more classes and files.

Prefer many small functions over large functions. Functions may at most be 20
lines of code. Every function must have a documentation comment complete with
argument documentation. Do not write inline comments, instead, use verbose
variable names and function names to convey intent.

Keep in mind that future agents must be able to find functions and systems fast.
Use a good directory structure and class names and separate things into many
files.

You should name your file and folder in snake_case instead of camelCase or PascalCase.

## Coordinates

The main difference you will find when working between ThreeJS and Unity is the
coordinate systems are different: ThreeJS uses right hand whereas Unity uses
left hand. But we want to be able to export maps to 3D models and Unity and
TrenchBroom and Blender. Keep this in mind.

## Theme

Use a similar dark mode theme that Blender uses. Orange selection, black
backgrounds, maybe a subtle gradient here and there to give the editor a very
dark blue vibe. But keep it modern and clean.

## Geometry

We keep meshes convex as that is easier to work with in level design.
