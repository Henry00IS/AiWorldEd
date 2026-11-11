import { describe, expect, it, vi } from 'vitest';
import { objMetaLine } from '@/io/obj/obj_meta.js';
import { exportTargetFind } from '@/io/export/export_targets.js';

vi.mock('@/application_identity.js', () => ({
  APPLICATION_DISPLAY_NAME: 'AI World Editor',
  APPLICATION_VERSION: '7.8.9-test',
}));

describe('objmeta generator', () => {
  it('names the running application version', () => {
    expect(objMetaLine(exportTargetFind('godot').space)).toContain('"generator":"AiWorldEd 7.8.9-test"');
  });
});
