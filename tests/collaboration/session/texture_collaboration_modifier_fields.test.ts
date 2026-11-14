import { describe, expect, it } from 'vitest';
import { texturesCollaborationCollect } from '@/collaboration/session/session_collaboration_textures.js';

describe('texture references in modifier stacks', () => {
  it('collects the image of a decal step and the texture of a generator step', () => {
    const ids = new Set<string>();
    texturesCollaborationCollect(
      {
        entry: {
          modifierStack: {
            modifiers: [
              { id: 'a', kind: 'decal', parameters: { texture: 'stain.png', opacity: 1 } },
              { id: 'b', kind: 'stairs', parameters: { texture: 'steps.png' } },
              { id: 'c', kind: 'decal', parameters: { texture: '' } },
            ],
          },
        },
      },
      ids,
    );
    expect([...ids].sort()).toEqual(['stain.png', 'steps.png']);
  });

  it('ignores texture-named values outside known modifier steps', () => {
    const ids = new Set<string>();
    texturesCollaborationCollect({ kind: 'unknown', parameters: { texture: 'x.png' }, texture: 'y.png' }, ids);
    expect(ids.size).toBe(0);
  });
});
