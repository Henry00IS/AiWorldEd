import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EditorApiParts } from '@/ai/client/editor_api_parts.js';
import { mcpToolGroupsCreate } from '@/ai/client/tools/mcp_tool_groups.js';
import { svgPathCurve } from '@/ai/client/tools/geometry/svg/svg_path_curve.js';
import { MCP_SERVER_INSTRUCTIONS } from '@/ai/shared/mcp_instructions.js';
import { editorApiFixtureCreate } from '../helpers_editor_api.js';

const README = readFileSync('src/ai/README.md', 'utf8');

/**
 * Returns the fenced blocks of one language.
 *
 * @param language Fence language.
 * @returns Block bodies.
 */
function fencedBlocks(language: string): string[] {
  return [...README.matchAll(new RegExp('```' + language + '\\n([\\s\\S]*?)```', 'g'))].map((match) => match[1] ?? '');
}

describe('MCP documentation', () => {
  it('lists every tool in the README and names only existing tools in the server instructions', () => {
    const { host } = editorApiFixtureCreate();
    const groups = mcpToolGroupsCreate(new EditorApiParts(host));
    const names = groups.flatMap((group) => group.tools().map((tool) => tool.name));
    const categories = groups.map((group) => `${group.category}_`);
    for (const name of names) expect(README, name).toContain(`\`${name}\``);
    const mentioned = MCP_SERVER_INSTRUCTIONS.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
    for (const name of mentioned.filter((word) => categories.some((category) => word.startsWith(category))))
      expect(names, name).toContain(name);
  });

  it('builds every solid script example and parses every curve path example', () => {
    const examples = fencedBlocks('solid-script');
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      const lines = JSON.parse(example) as unknown;
      const result = editorApiFixtureCreate().api.invokeTool('geometry_script_build', { lines });
      expect(result.ok, result.message).toBe(true);
    }
    for (const path of fencedBlocks('svg-path')) expect(svgPathCurve(path.trim()).points.length).toBeGreaterThan(1);
  });
});
