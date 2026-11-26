import { describe, expect, it } from 'vitest';
import {
  solidScriptCommandFind,
  solidScriptCommands,
  SOLID_SCRIPT_COMMAND_CATEGORIES,
} from '@/solid_script/commands/solid_script_command_catalog.js';

describe('Block palette categories', () => {
  it.each([
    ['line_path', 'Paths'],
    ['arc_path', 'Paths'],
    ['path_from_points', 'Paths'],
    ['set_handles', 'Paths'],
    ['sweep_along_path', 'Paths'],
    ['select_objects', 'Objects'],
    ['delete_objects', 'Objects'],
    ['select_edges', 'Edges'],
    ['bevel_edges', 'Edges'],
    ['select_vertices', 'Vertices'],
    ['set_positions', 'Vertices'],
    ['points_from_path', 'Points'],
    ['scatter_points', 'Points'],
    ['find_closest', 'Points'],
    ['raycast', 'Points'],
    ['find_at_uv', 'Points'],
    ['select_faces', 'Faces'],
    ['unwrap', 'UVs'],
    ['blur_data', 'Data'],
    ['rename_data', 'Data'],
    ['remove_data', 'Data'],
    ['make_dictionary', 'Dictionaries'],
    ['add_entry', 'Dictionaries'],
    ['remove_entry', 'Dictionaries'],
    ['merge_dictionary', 'Dictionaries'],
  ])('puts %s in %s', (id, category) => {
    expect(solidScriptCommandFind(id)?.category).toBe(category);
  });

  it('shows every declared group, and every group has a block in it', () => {
    expect(new Set(solidScriptCommands.map((command) => command.category))).toEqual(
      new Set(SOLID_SCRIPT_COMMAND_CATEGORIES),
    );
    expect(SOLID_SCRIPT_COMMAND_CATEGORIES.length).toBe(new Set(SOLID_SCRIPT_COMMAND_CATEGORIES).size);
  });

  it.each([
    ['sweep_along_path', 'the meshes it builds'],
    ['place_at_points', 'the objects it builds'],
    ['select_objects', undefined],
  ])('keeps the Into kind of %s apart from its palette group', (id, built) => {
    const into = solidScriptCommandFind(id)?.parameters.find((field) => field.key === 'into');
    expect(built === undefined ? into?.hint.includes('it builds') !== true : into?.hint.includes(built)).toBe(true);
  });
});
