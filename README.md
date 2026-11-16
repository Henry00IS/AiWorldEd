# AiWorldEd: 3D Level Editor in Your Browser

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)
[![Three.js](https://img.shields.io/badge/Three.js-0.185-blue.svg)](https://threejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Vitest-4.1-green.svg)](https://vitest.dev/)

Build game levels fast with brushes, Constructive Solid Geometry and precision tools. No install, no sign-up: it runs entirely in your browser.

### [▶ OPEN THE EDITOR ONLINE](https://Henry00IS.github.io/AiWorldEd/)

[![From an empty editor to a playable room](https://raw.githubusercontent.com/wiki/Henry00IS/AiWorldEd/images/getting-started.gif)](https://Henry00IS.github.io/AiWorldEd/)

> AiWorldEd is created and maintained entirely by AI (Grok 4.5 and Qwen 3.6) under human guidance. No human has manually edited the source code.

## Constructive Solid Geometry

Carve rooms, doors and windows out of solid space. Brushes rebuild live as you move them.

![Carving with a subtractive brush](https://raw.githubusercontent.com/wiki/Henry00IS/AiWorldEd/images/solid-model-subtract.gif)

Combine any two meshes with **Union**, **Subtract** and **Intersect**.

![Subtracting a sphere from a cube](https://raw.githubusercontent.com/wiki/Henry00IS/AiWorldEd/images/csg-subtract.gif)

## Stairs, Arches and Columns in One Click

Pick a shape under **Add Shape**: cylinders, spheres, pipes, stairs, curved stairs, arches, columns and more, all adjustable live.

![Adding stairs](https://raw.githubusercontent.com/wiki/Henry00IS/AiWorldEd/images/stairs-generator.gif)
![Adding an arch](https://raw.githubusercontent.com/wiki/Henry00IS/AiWorldEd/images/arch-generator.gif)
![Adding a column](https://raw.githubusercontent.com/wiki/Henry00IS/AiWorldEd/images/column-generator.gif)

## Blow It Up

Punch jagged or brick-edged holes through walls with **Blast Hole**, then shatter content into pieces that fly apart with real physics.

![Blasting a hole into a wall](https://raw.githubusercontent.com/wiki/Henry00IS/AiWorldEd/images/blast-hole.gif)
![Shattering with Physics Shatter](https://raw.githubusercontent.com/wiki/Henry00IS/AiWorldEd/images/physics-shatter.gif)

## Shape Anything

Extrude faces, slice with a clip plane, or model vertices, edges and faces directly with bevel, inset, loop cut, knife and more.

![Extruding a face](https://raw.githubusercontent.com/wiki/Henry00IS/AiWorldEd/images/face-extrude.gif)
![Clipping a cube](https://raw.githubusercontent.com/wiki/Henry00IS/AiWorldEd/images/clip-plane.gif)

## Texture in Seconds

Open your project folder and click a texture to paint it onto faces. Fine-tune with the UV Editor.

![Applying textures](https://raw.githubusercontent.com/wiki/Henry00IS/AiWorldEd/images/texture-browser.gif)

## Also Included

- **Play mode**: press `Space` to walk through your level and throw tennis balls, soccer balls and paper planes.
- **Primitives and terrain** for quick blockouts.
- **Modifiers**: bevel, array, mirror, shear, physics shatter and more, on a volume or a single brush.
- **Real-time collaboration**: build the same level together.
- **MCP server**: let AI tools such as Grok Build look at and edit your level.
- **Import and export**: import VMF, OBJ, FBX and GLB; export FBX, glTF, GLB and OBJ, ready for Godot, Unity, Blender and Unreal Engine.
- **Desktop app** for Windows, Linux and macOS on the [Releases page](https://github.com/Henry00IS/AiWorldEd/releases).

## Learn It in Minutes

The **[Wiki](https://github.com/Henry00IS/AiWorldEd/wiki)** has a short, visual guide for every tool. Start with **[Getting Started](https://github.com/Henry00IS/AiWorldEd/wiki/Getting-Started)** or the **[Keyboard Shortcuts](https://github.com/Henry00IS/AiWorldEd/wiki/Keyboard-Shortcuts)**.

## Run It Locally

```bash
bun install
bun run dev
```

## Support:

Feel free to [join my Discord server](https://discord.gg/sKEvrBwHtq) and let's talk about it.

[![Join my Discord server](https://dcbadge.limes.pink/api/server/sKEvrBwHtq)](https://discord.gg/sKEvrBwHtq)

If you found this editor useful, please consider making a donation or supporting me on Patreon. Your donations are a tremendous encouragement for the continued development and support of this package. 😁

[![Support me on Patreon](https://raw.githubusercontent.com/wiki/Henry00IS/DynamicLighting/images/badges/patreon.svg)](https://patreon.com/henrydejongh) [![Support me on Ko-fi](https://raw.githubusercontent.com/wiki/Henry00IS/DynamicLighting/images/badges/kofi.svg)](https://ko-fi.com/henry00) [![Support me on PayPal](https://raw.githubusercontent.com/wiki/Henry00IS/DynamicLighting/images/badges/paypal.svg)](https://paypal.me/henrydejongh)

## License

MIT, see [LICENSE.md](LICENSE.md).
