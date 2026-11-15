import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EditorApiParts } from '@/ai/client/editor_api_parts.js';
import { McpToolsModifier } from '@/ai/client/tools/modifier/mcp_tools_modifier.js';
import { MODIFIER_GENERATOR_NODE_KINDS } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { editorApiFixtureCreate } from '../../helpers_editor_api.js';

/** Label of every generator kind. */
const labels = MODIFIER_GENERATOR_NODE_KINDS.map((kind) => modifierStackKindFind(kind)?.label ?? kind);

describe('generator names in the MCP', () => {
  it('names every generator kind in the group summary and the create tool', () => {
    const group = new McpToolsModifier(new EditorApiParts(editorApiFixtureCreate().host));
    const create = group.tools().find((tool) => tool.name === 'modifier_generator_create');
    for (const label of labels) {
      expect(group.summary, label).toContain(label);
      expect(create?.description, label).toContain(label);
    }
  });

  it('names every generator kind in the MCP README', () => {
    const readme = readFileSync('src/ai/README.md', 'utf8');
    for (const label of labels) expect(readme, label).toContain(label);
  });
});
