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
  '2. Build shapes with geometry_script_build: a SolidScript is a list of block lines {command, values} (cube, cylinder, sphere, the generator shapes cone, capsule, torus, pipe, pyramid, prism, hollowBox, curvedStairs, column, stairs, arch and blastHole with the fields of those generators, polyhedron and polygon blocks of point lines, linear_extrude and rotate_extrude of square/circle/polygon, hull, minkowski, union, difference, intersection, transforms including mirror, resize and matrix, variables and lists, repeat, for_each, if, parts with use_part and return, function blocks run by call (values, result variable, return with a value, [local.name] variables), input settings with when_input_changes, when_button_pressed and when_baked handlers (set_input, show_message), list blocks (add_item, insert_item, remove_item, remove_value, find_item, sort_list, reverse_list, clear_variable, delete_variable), [persistent.name] values kept between runs, face blocks (select_faces, for_each_selected_face, for_each_vertex, for_each_edge, place_on_face, extrude_face, inset_face, bevel_edges, delete_faces), offset of outlines, and mesh blocks: mesh of vertex and face lines, mesh_shapes, subdivide, mesh_smooth, displace, extrude_faces, box_uvs, flip_faces), each block closed by its own end line. Field values are plain text without quotes: "1, 2, 3", [name] for variables, [=formula] for calculations. Scripts are Z-up in metres, with the origin at the centre of the generator and shapes centred on it by default. Read geometry_script_reference_get once first: it lists every command, its fields and defaults, what stops it and common mistakes. The result becomes brushes and CSG groups, plus regular mesh objects for mesh blocks, in one undo step, so no clipping planes or half-size math is needed. geometry_script_preview checks the lines first.',
  '3. Generators and modifiers (Cylinder, Sphere, Torus, Curved Stairs, Column, Arch and more; arrays, bevel, ...): modifier_kind_list with kindId shows every property with its tooltip, range and choices; modifier_generator_create and modifier_parameters_set build and tune them. A solidScript generator keeps a named SolidScript of the same block lines in the level; geometry_script_generator_set writes its lines and the values of its input lines, geometry_script_command_list lists the commands.',
  '4. Curves (column profiles and other curve properties): curve_get reads points and handles, curve_point_set and curve_segment_set fix single points and segments, curve_path_set accepts SVG path data.',
  '5. Textures: texture_list, texture_face_list for a brush, then texture_face_assign and texture_uv_set / texture_uv_align / texture_uv_scale / texture_uv_offset / texture_uv_rotate.',
  '6. Anything else a user clicks: editor_menu_list, then editor_menu_run.',
  '7. view_capture to look at the result. history_undo reverts any step.',
  '',
  'Every edit is one undo step and works the same in a shared multiplayer room as a user edit. A failed result with error "locked" or "busy" means another member is editing; try again or pick another object.',
].join('\n');
