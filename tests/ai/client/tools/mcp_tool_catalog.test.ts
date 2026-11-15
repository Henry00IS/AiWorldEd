import { describe, it, expect } from 'vitest';
import { editorApiFixtureCreate } from '../helpers_editor_api.js';

/** Pattern of a tool name: lowercase words joined by underscores. */
const MCP_TOOL_NAME_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

/** Verbs that end a tool name; the category and subject come first. */
const MCP_TOOL_VERBS = new Set([
  'get',
  'list',
  'find',
  'describe',
  'validate',
  'preview',
  'query',
  'explain',
  'measure',
  'calculate',
  'add',
  'create',
  'build',
  'duplicate',
  'mirror',
  'flip',
  'set',
  'align',
  'rotate',
  'rename',
  'clip',
  'split',
  'reorder',
  'relative',
  'delete',
  'remove',
  'move',
  'reset',
  'run',
  'assign',
  'undo',
  'redo',
  'place',
  'cut',
  'capture',
  'reparent',
  'ungroup',
  'insert',
  'enter',
  'exit',
  'apply',
  'fit',
  'offset',
  'scale',
  'select',
  'dissolve',
  'merge',
  'inset',
  'extrude',
  'bake',
  'fill',
  'paste',
  'copy',
  'toggle',
]);

/** Contract tests for the MCP tool catalog: naming, order and documentation. */
describe('McpToolCatalog', () => {
  it('names every tool category first and verb last, unique and prefixed by its group', () => {
    const catalog = editorApiFixtureCreate().api.catalogGet();
    const names = new Set<string>();
    for (const group of catalog.groupsList()) {
      for (const tool of group.tools()) {
        expect(tool.name, tool.name).toMatch(MCP_TOOL_NAME_PATTERN);
        expect(tool.name.startsWith(`${group.category}_`), tool.name).toBe(true);
        expect(MCP_TOOL_VERBS.has(tool.name.split('_').at(-1) ?? ''), tool.name).toBe(true);
        expect(names.has(tool.name), tool.name).toBe(false);
        names.add(tool.name);
      }
    }
  });

  it('lists tools grouped by category with each category appearing once', () => {
    const tools = editorApiFixtureCreate().api.catalogGet().groupsList();
    const categories = tools.map((group) => group.category);
    expect(new Set(categories).size).toBe(categories.length);
  });

  it('documents every tool and every argument', () => {
    for (const tool of editorApiFixtureCreate().api.toolsList()) {
      expect(tool.description.length, tool.name).toBeGreaterThan(20);
      expect(tool.inputSchema['type'], tool.name).toBe('object');
      const properties = (tool.inputSchema['properties'] ?? {}) as Record<string, Record<string, unknown>>;
      for (const [key, schema] of Object.entries(properties)) {
        expect(typeof schema['description'], `${tool.name}.${key}`).toBe('string');
      }
    }
  });

  it('marks reads as non-mutating so they skip the collaboration guard', () => {
    const { api } = editorApiFixtureCreate();
    for (const name of ['editor_context_get', 'brush_get', 'brush_find', 'space_solid_point_explain', 'view_capture'])
      expect(api.toolMutates(name), name).toBe(false);
    for (const name of ['brush_box_add', 'brush_transform_set', 'history_undo', 'selection_set'])
      expect(api.toolMutates(name), name).toBe(true);
    expect(api.toolMutates('unknown_tool_get')).toBe(true);
  });

  it('answers unknown tools with a failure naming tools/list', () => {
    const result = editorApiFixtureCreate().api.invokeTool('brush_teleport');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('tools/list');
  });
});
