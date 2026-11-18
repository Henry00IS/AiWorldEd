import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';

/** The only commands that may pick faces, edges or vertices themselves. */
const SOLID_SCRIPT_ELEMENT_PICKERS = new Set(['select_faces', 'select_edges', 'select_vertices']);

describe('no command picks elements on its own', () => {
  it('keeps Which filters on Select Faces, Select Edges and Select Vertices only', () => {
    const pickers = solidScriptCommands.filter((command) =>
      command.parameters.some((parameter) => parameter.key === 'which' || parameter.label === 'Which Faces'),
    );
    expect(pickers.map((command) => command.id).sort()).toEqual([...SOLID_SCRIPT_ELEMENT_PICKERS].sort());
    expect(solidScriptCommands.some((command) => command.id === 'extrude_faces')).toBe(false);
    const labels = solidScriptCommands.flatMap((command) =>
      command.parameters.filter((parameter) => parameter.label === 'Which Faces').map(() => command.id),
    );
    expect(labels).toEqual([]);
  });

  it('lets face and mesh tools read Of or $Selected, never a private element filter', () => {
    const operators = [
      'extrude_face',
      'inset_face',
      'bevel_edges',
      'delete_faces',
      'texture_faces',
      'box_uvs',
      'displace',
      'flip_faces',
      'subdivide',
      'mesh_smooth',
      'merge_by_distance',
    ];
    for (const id of operators) {
      const command = solidScriptCommands.find((entry) => entry.id === id);
      expect(command, id).toBeDefined();
      if (!command) continue;
      expect(
        command.parameters.some((parameter) => parameter.key === 'of'),
        id,
      ).toBe(true);
      expect(
        command.parameters.some((parameter) => parameter.key === 'which' || parameter.label === 'Which Faces'),
        id,
      ).toBe(false);
    }
  });
});
