import { describe, expect, it } from 'vitest';
import { projectPathRelative } from '@/project/fs/project_path.js';

describe('projectPathRelative', () => {
  it('climbs out of the folder and down to the file', () => {
    expect(projectPathRelative('Assets/Models', 'Packages/p/AiWorldEd/Textures/a.png')).toBe(
      '../../Packages/p/AiWorldEd/Textures/a.png',
    );
    expect(projectPathRelative('AiWorldEd/Models', 'AiWorldEd/Textures/a.png')).toBe('../Textures/a.png');
    expect(projectPathRelative('AiWorldEd', 'AiWorldEd/Textures/a.png')).toBe('Textures/a.png');
    expect(projectPathRelative('', 'textures/a.png')).toBe('textures/a.png');
    expect(projectPathRelative('textures', 'textures/a.png')).toBe('a.png');
  });

  it('rejects paths that leave the root', () => {
    expect(() => projectPathRelative('../x', 'a.png')).toThrow();
  });
});
