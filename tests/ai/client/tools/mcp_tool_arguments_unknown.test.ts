import { describe, expect, it } from 'vitest';
import { editorApiFixtureCreate } from '../helpers_editor_api.js';

describe('unknown tool arguments', () => {
  it('refuses a misspelled argument and names the valid ones instead of ignoring it', () => {
    const { api } = editorApiFixtureCreate();
    const result = api.invokeTool('brush_find', { nameContainz: 'wall' });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Unknown argument nameContainz.*nameContains/);
  });
});
