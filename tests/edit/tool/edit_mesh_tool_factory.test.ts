import { describe, expect, it } from 'vitest';
import { createEditMeshTool } from '@/edit/tool/edit_mesh_tool_factory.js';
import { EditFaceExtrudeTool } from '@/edit/tool/edit_face_extrude_tool.js';
import { EditFaceInsetTool } from '@/edit/tool/edit_face_inset_tool.js';
import { EditEdgeBevelTool } from '@/edit/tool/edit_edge_bevel_tool.js';

describe('createEditMeshTool', () => {
  it('builds the interactive tool for each drag command', () => {
    expect(createEditMeshTool('extrude_faces')).toBeInstanceOf(EditFaceExtrudeTool);
    expect(createEditMeshTool('extrude_edges')).toBeInstanceOf(EditFaceExtrudeTool);
    expect(createEditMeshTool('solidify_faces')).toBeInstanceOf(EditFaceExtrudeTool);
    expect(createEditMeshTool('inset_faces')).toBeInstanceOf(EditFaceInsetTool);
    expect(createEditMeshTool('bevel_edges')).toBeInstanceOf(EditEdgeBevelTool);
  });
});
