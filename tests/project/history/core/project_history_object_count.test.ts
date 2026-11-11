import { describe, expect, it } from 'vitest';
import type { SceneJSON } from '@/io/scene/io_types.js';
import { projectHistoryObjectCount } from '@/project/history/core/project_history_object_count.js';

/**
 * Builds a scene object entry.
 *
 * @param uuid Id.
 * @param extra Fields to add.
 * @returns Entry.
 */
function object(uuid: string, extra: Record<string, unknown> = {}): SceneJSON['objects'][number] {
  const zero = { x: 0, y: 0, z: 0 };
  return {
    uuid,
    name: uuid,
    type: 'group',
    position: zero,
    rotation: zero,
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    parentId: null,
    ...extra,
  } as SceneJSON['objects'][number];
}

describe('projectHistoryObjectCount', () => {
  it('counts the scene objects and everything inside each solid model', () => {
    const brush = (id: string) => ({ id }) as unknown;
    const scene = {
      version: 1,
      objects: [
        object('light'),
        object('model', {
          solidModel: {
            brushes: [brush('b1'), brush('b2'), brush('b3')],
            hierarchy: [
              { kind: 'brush', brushId: 'b1' },
              {
                kind: 'group',
                id: 'g1',
                children: [
                  { kind: 'brush', brushId: 'b2' },
                  { kind: 'modifier', id: 'gen' },
                  { kind: 'group', id: 'g2', children: [{ kind: 'brush', brushId: 'b3' }, { kind: 'modifier', id: 'vol' }] },
                ],
              },
            ],
          },
        }),
      ],
    } as unknown as SceneJSON;
    expect(projectHistoryObjectCount(scene)).toBe(2 + 3 + 2 + 2);
  });

  it('counts the brushes of a model without a hierarchy', () => {
    const scene = { version: 1, objects: [object('model', { solidModel: { brushes: [{}, {}] } })] } as unknown as SceneJSON;
    expect(projectHistoryObjectCount(scene)).toBe(3);
  });
});
