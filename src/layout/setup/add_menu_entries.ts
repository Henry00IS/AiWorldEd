import type { ToolbarMenuEntry } from '@/ui/toolbar/toolbar.js';

/** Creation callbacks for each supported object type. */
export interface AddMenuActions {
  onAddCube: () => void;
  onAddSphere: () => void;
  onAddCylinder: () => void;
  onAddPlane: () => void;
  onAddTerrain: () => void;
  onAddSolidModel: () => void;
}

/**
 * Creates the ordinary geometry creation entries.
 *
 * @param actions Creation callbacks for supported geometry.
 * @returns Geometry creation menu entries.
 */
function createGeometryEntries(actions: AddMenuActions): ToolbarMenuEntry[] {
  return [
    { label: 'Cube', onClick: () => actions.onAddCube() },
    { label: 'Sphere', onClick: () => actions.onAddSphere() },
    { label: 'Cylinder', onClick: () => actions.onAddCylinder() },
    { label: 'Plane', onClick: () => actions.onAddPlane() },
  ];
}

/**
 * Creates the categorized entries shown under the editor's Add menu.
 *
 * @param actions Creation callbacks for each supported object type.
 * @returns Nested Add menu entries grouped by editor object category.
 */
export function createAddMenuEntries(actions: AddMenuActions): ToolbarMenuEntry[] {
  return [
    {
      kind: 'submenu',
      label: 'Geometry',
      children: createGeometryEntries(actions),
    },
    {
      kind: 'submenu',
      label: 'Terrain',
      children: [{ label: 'Terrain', onClick: () => actions.onAddTerrain() }],
    },
    {
      kind: 'submenu',
      label: 'Brushes',
      children: [{ label: 'Solid Model', onClick: () => actions.onAddSolidModel() }],
    },
  ];
}
