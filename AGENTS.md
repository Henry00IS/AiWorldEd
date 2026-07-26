# AI World Editor (AiWorldEd)

We use Three.js for rendering and math, no other third-party libraries.

This is a 3D map editor to build 3D worlds for video games.

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
