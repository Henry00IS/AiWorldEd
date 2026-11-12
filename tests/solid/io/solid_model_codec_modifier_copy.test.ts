import { describe, expect, it } from 'vitest';
import { SolidModelCodec } from '@/solid/io/solid_model_codec.js';
import {
  stackUvFaceKey,
  stackUvFaceTriangles,
  stackUvFixtureMirror,
} from '../../modifier/stack/modifier_stack_uv_fixture.js';

describe('SolidModelCodec with modifier copies', () => {
  it('saving a solid with a mirror volume twice keeps the source brush face UVs byte-identical', () => {
    const fixture = stackUvFixtureMirror();
    expect(stackUvFaceTriangles(fixture.model, fixture.source.id, 0, true).length).toBeGreaterThan(0);
    const before = stackUvFaceKey(fixture.source);
    const first = JSON.stringify(SolidModelCodec.encode(fixture.model));
    fixture.model.markDirty();
    fixture.model.rebuild(true);
    const second = JSON.stringify(SolidModelCodec.encode(fixture.model));
    expect(stackUvFaceKey(fixture.source)).toBe(before);
    expect(second).toBe(first);
  });
});
