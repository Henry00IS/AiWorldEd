import { describe, expect, it } from 'vitest';
import { routeTexturePick } from '@/texture/layout/texture_pick_route.js';
import { getStateTexturePaint } from '@/texture/paint/state_texture_paint.js';
import type { HandlerComponentMeshOperations } from '@/edit/topology/handler_component_mesh_operations.js';
import type { ControllerTextureAssignment } from '@/texture/controller/controller_texture_assignment.js';
import type { TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';

/** Picked browser entry. */
const BRICK = { id: 'walls/brick.png', displayName: 'Brick' } as TextureBrowserEntry;

/**
 * Builds recording stand-ins for both paint paths.
 *
 * @param meshPicks Whether Edit Mode takes the pick.
 * @returns Stand-ins and the calls they saw.
 */
function standIns(meshPicks: boolean): {
  calls: string[];
  operations: HandlerComponentMeshOperations;
  assignment: ControllerTextureAssignment;
} {
  const calls: string[] = [];
  const operations = {
    takesTexturePicks: () => meshPicks,
    assignTextureToSelectedFaces: (id: string) => calls.push(`mesh:${id}`),
  } as unknown as HandlerComponentMeshOperations;
  const assignment = {
    onTextureSelected: (entry: TextureBrowserEntry) => calls.push(`object:${entry.id}`),
  } as unknown as ControllerTextureAssignment;
  return { calls, operations, assignment };
}

describe('routeTexturePick', () => {
  it('paints Edit Mode mesh faces and remembers the texture without touching object paint', () => {
    const { calls, operations, assignment } = standIns(true);
    routeTexturePick(BRICK, operations, assignment);
    expect(calls).toEqual(['mesh:walls/brick.png']);
    expect(getStateTexturePaint().getLastTextureId()).toBe('walls/brick.png');
    getStateTexturePaint().reset();
  });

  it('leaves solid faces and objects to the existing paint outside mesh Face mode', () => {
    const { calls, operations, assignment } = standIns(false);
    routeTexturePick(BRICK, operations, assignment);
    routeTexturePick(BRICK, null, assignment);
    expect(calls).toEqual(['object:walls/brick.png', 'object:walls/brick.png']);
  });
});
