import * as THREE from 'three';
import { resolveGeometrySourceType } from '@/texture/uv/geometry_source.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { getSolidGroupOperation, isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/** Icon configuration for different object types in the outliner. */
export interface ObjectIcon {
  /** The display character or emoji for the icon (unused when {@link cssDot}). */
  character: string;

  /** The CSS color string for the icon text or CSS dot fill. */
  color: string;

  /**
   * When true, render a geometry circle instead of a text glyph so operation
   * colors share identical vertical metrics.
   */
  cssDot?: boolean;

  /**
   * Extra downward pixels for a CSS brush dot. Warm red reads high on dark UI
   * (chromostereopsis); subtractive dots nudge down so they match green/blue.
   */
  cssDotNudgeYPx?: number;

  /**
   * Optional badge character drawn after the main icon (e.g. operation dot on a
   * CSG folder). Unused when {@link badgeCssDot} is set.
   */
  badgeCharacter?: string;

  /** CSS color for the badge glyph or CSS badge dot. */
  badgeColor?: string;

  /** When true, render the badge as a CSS circle (stable metrics). */
  badgeCssDot?: boolean;
}

/** Outliner green for additive solid brushes. */
const SOLID_ADDITIVE_COLOR = '#27ae60';

/** Outliner red for subtractive solid brushes / groups. */
const SOLID_SUBTRACTIVE_COLOR = '#c0392b';

/** Outliner blue for intersecting solid brushes / groups. */
const SOLID_INTERSECTING_COLOR = '#2980b9';

/** Yellow folder color for ordinary and additive CSG groups. */
const FOLDER_COLOR = '#e67e22';

/**
 * Maps Three.js object types to their corresponding icons for the outliner.
 * Provides consistent visual identification of object categories.
 */
export class FactoryObjectIcon {
  /**
   * Returns the icon configuration for a given Three.js object.
   *
   * @param obj The Three.js object to get the icon for.
   * @returns The icon configuration with character and color.
   */
  static getIcon(obj: THREE.Object3D): ObjectIcon {
    if (SolidModel.isSolidModelObject(obj)) {
      return this.getSolidModelIcon();
    }
    if (SolidBrushVisual.isBrushObject(obj)) {
      return this.getSolidBrushIcon(obj);
    }
    if (SolidModel.isResultMesh(obj)) {
      return this.getSolidResultIcon();
    }
    if (isSolidCsgGroup(obj)) {
      return this.getSolidCsgGroupIcon(obj);
    }
    if (obj instanceof THREE.Group) {
      return this.getGroupIcon();
    }
    if (obj instanceof THREE.Mesh) {
      if (obj.userData['isModifierVolume'] === true) return { character: '▣', color: '#e67e22' };
      return this.getMeshIcon(obj);
    }
    if (obj instanceof THREE.Light) {
      return this.getLightIcon(obj);
    }
    if (obj instanceof THREE.Camera) {
      return this.getCameraIcon();
    }
    return this.getGenericIcon();
  }

  /**
   * Determines the specific mesh icon based on geometry type.
   *
   * @param mesh The mesh to identify the icon for.
   * @returns The icon configuration for the mesh type.
   */
  private static getMeshIcon(mesh: THREE.Mesh): ObjectIcon {
    if (SolidBrushVisual.isBrushObject(mesh)) {
      return this.getSolidBrushIcon(mesh);
    }
    if (SolidModel.isResultMesh(mesh)) {
      return this.getSolidResultIcon();
    }
    const geometry = mesh.geometry;
    const sourceType = resolveGeometrySourceType(geometry);
    if (sourceType === 'box' || geometry instanceof THREE.BoxGeometry) {
      return this.getBoxIcon();
    }
    if (sourceType === 'sphere' || geometry instanceof THREE.SphereGeometry) {
      return this.getSphereIcon();
    }
    if (sourceType === 'plane' || geometry instanceof THREE.PlaneGeometry) {
      return this.getPlaneIcon();
    }
    if (sourceType === 'cylinder' || geometry instanceof THREE.CylinderGeometry) {
      return this.getCylinderIcon();
    }
    return this.getGenericMeshIcon();
  }

  /**
   * Determines the specific light icon based on light type.
   *
   * @param light The light object to identify the icon for.
   * @returns The icon configuration for the light type.
   */
  private static getLightIcon(light: THREE.Light): ObjectIcon {
    if (light instanceof THREE.DirectionalLight) {
      return this.getDirectionalLightIcon();
    }
    if (light instanceof THREE.PointLight) {
      return this.getPointLightIcon();
    }
    if (light instanceof THREE.SpotLight) {
      return this.getSpotLightIcon();
    }
    return this.getGenericLightIcon();
  }

  /**
   * Returns the icon for a group object.
   *
   * @returns The group icon configuration.
   */
  private static getGroupIcon(): ObjectIcon {
    return { character: '📁', color: FOLDER_COLOR };
  }

  /**
   * Returns the folder icon for a solid CSG group. Additive groups keep the
   * plain yellow folder; subtractive and intersecting groups add a colored
   * operation badge so the folder glyph stays yellow.
   *
   * @param group Solid CSG group.
   * @returns Folder icon with optional operation badge.
   */
  private static getSolidCsgGroupIcon(group: THREE.Object3D): ObjectIcon {
    const operation = getSolidGroupOperation(group);
    if (operation === SolidOperation.Additive) {
      return this.getGroupIcon();
    }
    return {
      character: '📁',
      color: FOLDER_COLOR,
      badgeCssDot: true,
      badgeColor: this.colorForSolidOperation(operation),
    };
  }

  /**
   * Returns the icon for a solid model root.
   *
   * @returns The solid model icon configuration.
   */
  private static getSolidModelIcon(): ObjectIcon {
    return { character: '▣', color: '#e86a17' };
  }

  /**
   * Returns the operation-colored dot for a solid brush volume.
   *
   * @param brush Brush preview object.
   * @returns Dot icon in green / red / blue by CSG operation.
   */
  private static getSolidBrushIcon(brush: THREE.Object3D): ObjectIcon {
    const operation = SolidBrushVisual.getOperation(brush);
    return {
      character: '',
      color: this.colorForSolidOperation(operation),
      cssDot: true,
      cssDotNudgeYPx: operation === SolidOperation.Subtractive ? 1 : 0,
    };
  }

  /**
   * Maps a solid CSG operation to an outliner CSS color.
   *
   * @param operation Additive, subtractive, or intersecting.
   * @returns CSS hex color string.
   */
  private static colorForSolidOperation(operation: SolidOperation): string {
    if (operation === SolidOperation.Subtractive) return SOLID_SUBTRACTIVE_COLOR;
    if (operation === SolidOperation.Intersecting) return SOLID_INTERSECTING_COLOR;
    return SOLID_ADDITIVE_COLOR;
  }

  /**
   * Returns the icon for a solid model compiled result mesh.
   *
   * @returns The solid result icon configuration.
   */
  private static getSolidResultIcon(): ObjectIcon {
    return { character: '▦', color: '#f5b041' };
  }

  /**
   * Returns the icon for a box mesh.
   *
   * @returns The box icon configuration.
   */
  private static getBoxIcon(): ObjectIcon {
    return { character: '◼', color: '#3498db' };
  }

  /**
   * Returns the icon for a sphere mesh.
   *
   * @returns The sphere icon configuration.
   */
  private static getSphereIcon(): ObjectIcon {
    return { character: '●', color: '#2ecc71' };
  }

  /**
   * Returns the icon for a plane mesh.
   *
   * @returns The plane icon configuration.
   */
  private static getPlaneIcon(): ObjectIcon {
    return { character: '▭', color: '#9b59b6' };
  }

  /**
   * Returns the icon for a cylinder mesh.
   *
   * @returns The cylinder icon configuration.
   */
  private static getCylinderIcon(): ObjectIcon {
    return { character: '⬡', color: '#1abc9c' };
  }

  /**
   * Returns the generic icon for unknown mesh types.
   *
   * @returns The generic mesh icon configuration.
   */
  private static getGenericMeshIcon(): ObjectIcon {
    return { character: '◇', color: '#95a5a6' };
  }

  /**
   * Returns the icon for a directional light.
   *
   * @returns The directional light icon configuration.
   */
  private static getDirectionalLightIcon(): ObjectIcon {
    return { character: '☀', color: '#f39c12' };
  }

  /**
   * Returns the icon for a point light.
   *
   * @returns The point light icon configuration.
   */
  private static getPointLightIcon(): ObjectIcon {
    return { character: '✦', color: '#f1c40f' };
  }

  /**
   * Returns the icon for a spot light.
   *
   * @returns The spot light icon configuration.
   */
  private static getSpotLightIcon(): ObjectIcon {
    return { character: '◎', color: '#e74c3c' };
  }

  /**
   * Returns the generic icon for unknown light types.
   *
   * @returns The generic light icon configuration.
   */
  private static getGenericLightIcon(): ObjectIcon {
    return { character: '✧', color: '#f1c40f' };
  }

  /**
   * Returns the icon for a camera object.
   *
   * @returns The camera icon configuration.
   */
  private static getCameraIcon(): ObjectIcon {
    return { character: '📷', color: '#e74c3c' };
  }

  /**
   * Returns the fallback icon for unrecognized object types.
   *
   * @returns The generic icon configuration.
   */
  private static getGenericIcon(): ObjectIcon {
    return { character: '○', color: '#7f8c8d' };
  }
}
