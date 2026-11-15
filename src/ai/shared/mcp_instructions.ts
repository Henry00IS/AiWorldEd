/**
 * Server instructions sent with the MCP initialize answer: how the tools are
 * named and the shortest path to building something.
 */
export const MCP_SERVER_INSTRUCTIONS = [
  'AiWorldEd level editor. Coordinates: right-handed, Y up, meters, rotations in degrees.',
  '',
  'Tool names follow category_subject_verb (category first, verb last), e.g. brush_box_add, modifier_parameters_set. Tools are listed grouped by category; reads come before edits.',
  '',
  'Workflow:',
  '1. editor_context_get, then scene_hierarchy_get to see what exists.',
  '2. Build shapes with geometry_scad_build: an OpenSCAD subset (cube, cylinder, polyhedron, hull, translate, rotate, scale, mirror, union, difference, intersection, for, variables and arithmetic). It turns into brushes and CSG groups, so no clipping planes or half-size math is needed.',
  '3. Generators and modifiers (stairs, arch, column, arrays, bevel, ...): modifier_kind_list shows every property with its tooltip, range and choices; modifier_parameters_set edits them.',
  '4. Curves (column profiles and other curve properties): curve_get reads points and handles, curve_point_set and friends fix single points, curve_path_set accepts an SVG path.',
  '5. Textures: texture_list, then texture_face_assign and uv_face_set on brush faces from brush_faces_get.',
  '6. view_capture to look at the result. history_undo reverts any step.',
  '',
  'Every edit is one undo step and works the same in a shared multiplayer room as a user edit. A failed result with error "locked" or "busy" means another member is editing; try again or pick another object.',
].join('\n');
