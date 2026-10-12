import { MESH_EDIT_WELD_EPSILON } from '@/edit/mesh/mesh_edit_weld.js';

/** Position merge and coincident-cluster radius used by topology operators. */
export const TOPOLOGY_VERTEX_EQUAL_EPSILON = MESH_EDIT_WELD_EPSILON;

/** Squared equal-epsilon for distance comparisons without a square root. */
export const TOPOLOGY_VERTEX_EQUAL_EPSILON_SQUARED = TOPOLOGY_VERTEX_EQUAL_EPSILON * TOPOLOGY_VERTEX_EQUAL_EPSILON;

/** Minimum edge-split parameter so the new vertex is not an existing endpoint. */
export const TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON = 1e-4;
