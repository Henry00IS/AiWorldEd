/**
 * Edit Mode modelling commands that menus and shortcuts start through one
 * channel: interactive tools and instant operations alike.
 */
export type EditMeshToolCommand =
  | 'extrude_faces'
  | 'extrude_faces_individual'
  | 'inset_faces'
  | 'subdivide_edges'
  | 'make_face'
  | 'connect_vertices'
  | 'bridge_edge_loops'
  | 'extrude_edges'
  | 'flip_faces'
  | 'duplicate_faces'
  | 'bevel_edges'
  | 'triangulate_faces'
  | 'poke_faces'
  | 'join_triangles';
