# AI World Editor (AiWorldEd)

We use Three.js for rendering and math, no other third-party libraries.

This is a 3D map editor to build 3D worlds for video games.

## Unit testing requirement

Every new feature MUST have a properly documented unit test. This test must be
robust enough to stand the test of time (no hardcoded positions, rotations, they
must create what they need, test the result, check the result).

## After making changes

`npm run testrun` (vitest is used) must pass all checks.

`npm run build` must pass.

PowerShell is janky, use cmd.

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