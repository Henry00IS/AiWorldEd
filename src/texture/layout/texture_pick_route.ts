import type { HandlerComponentMeshOperations } from '@/edit/topology/handler_component_mesh_operations.js';
import type { ControllerTextureAssignment } from '@/texture/controller/controller_texture_assignment.js';
import type { TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { getStateTexturePaint } from '@/texture/paint/state_texture_paint.js';

/**
 * Sends a texture picked in the browser to the paint that owns it: Edit Mode
 * mesh faces in Face mode, otherwise solid faces, brushes and objects. The two
 * paths share nothing but the remembered texture.
 *
 * @param entry Picked browser entry.
 * @param meshOperations Mesh operations of the open edit session, if any.
 * @param assignment Solid face, brush and object paint.
 */
export function routeTexturePick(
  entry: TextureBrowserEntry,
  meshOperations: HandlerComponentMeshOperations | null,
  assignment: ControllerTextureAssignment,
): void {
  if (meshOperations?.takesTexturePicks() !== true) {
    assignment.onTextureSelected(entry);
    return;
  }
  getStateTexturePaint().setLastTextureId(entry.id);
  meshOperations.assignTextureToSelectedFaces(entry.id);
}
