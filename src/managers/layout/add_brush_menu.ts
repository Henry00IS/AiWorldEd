import { Toolbar } from '../../ui/toolbar.js';

/** Brush creation callbacks exposed by the editor shell. */
export interface AddBrushActions {
  onAddCube: () => void;
  onAddSphere: () => void;
  onAddCylinder: () => void;
  onAddPlane: () => void;
  onAddTerrain: () => void;
  onAddSolidModel: () => void;
}

/** Adds the brush generator choices to a compact toolbar dropdown. */
export class AddBrushMenu {
  /**
   * Creates an Add menu bound to the supplied editor actions.
   *
   * @param toolbar Toolbar that receives the dropdown.
   * @param actions Brush creation callbacks.
   */
  addTo(toolbar: Toolbar, actions: AddBrushActions): void {
    toolbar.addDropdown('Add...', [
      { label: 'Cube', onClick: actions.onAddCube },
      { label: 'Sphere', onClick: actions.onAddSphere },
      { label: 'Cylinder', onClick: actions.onAddCylinder },
      { label: 'Plane', onClick: actions.onAddPlane },
      { label: 'Terrain', onClick: actions.onAddTerrain },
      { label: 'Solid Model', onClick: actions.onAddSolidModel },
    ]);
  }
}
