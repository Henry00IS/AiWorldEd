import { describe, it, expect } from 'vitest';
import { isSkippedVolumeMaterial } from '@/io/vmf/policy_vmf_material.js';

describe('policy_vmf_material isSkippedVolumeMaterial', () => {
  it('skips collision-only clip volumes in any letter case or slash style', () => {
    for (const clipMaterial of ['TOOLS/TOOLSCLIP', 'tools/toolsplayerclip', 'tools\\toolsnpcclip']) {
      expect(isSkippedVolumeMaterial(clipMaterial)).toBe(true);
    }
  });

  it('keeps visible and nodraw brushes', () => {
    for (const keptMaterial of ['DEV/DEV_MEASUREGENERIC01', 'TOOLS/TOOLSNODRAW']) {
      expect(isSkippedVolumeMaterial(keptMaterial)).toBe(false);
    }
  });
});
