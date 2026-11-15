import { describe, expect, it } from 'vitest';
import { runEditMeshInstantCommand } from '@/edit/tool/edit_mesh_instant_command.js';
import type { HandlerComponentMeshOperations } from '@/edit/topology/handler_component_mesh_operations.js';

describe('runEditMeshInstantCommand', () => {
  it('subdivides the selected edges once and leaves interactive tools alone', () => {
    const calls: number[] = [];
    const operations = {
      subdivideSelectedEdges: (cuts: number) => {
        calls.push(cuts);
        return true;
      },
    } as unknown as HandlerComponentMeshOperations;
    expect(runEditMeshInstantCommand('subdivide_edges', operations)).toBe(true);
    expect(calls).toEqual([1]);
    expect(runEditMeshInstantCommand('extrude_faces', operations)).toBe(false);
    expect(runEditMeshInstantCommand('subdivide_edges', null)).toBe(true);
  });

  it('makes a face from the selection', () => {
    let made = 0;
    const operations = {
      makeFaceFromSelection: () => {
        made += 1;
        return true;
      },
    } as unknown as HandlerComponentMeshOperations;
    expect(runEditMeshInstantCommand('make_face', operations)).toBe(true);
    expect(made).toBe(1);
  });
});
