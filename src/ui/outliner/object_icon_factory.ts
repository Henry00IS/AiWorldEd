import * as THREE from 'three';

/**
 * Icon configuration for different object types in the outliner.
 */
export interface ObjectIcon {
  /** The display character or emoji for the icon. */
  character: string;

  /** The CSS color string for the icon text. */
  color: string;
}

/**
 * Maps Three.js object types to their corresponding icons for the outliner.
 * Provides consistent visual identification of object categories.
 */
export class ObjectIconFactory {

  /**
   * Returns the icon configuration for a given Three.js object.
   * @param obj The Three.js object to get the icon for.
   * @returns The icon configuration with character and color.
   */
  static getIcon(obj: THREE.Object3D): ObjectIcon {
    if (obj instanceof THREE.Group) {
      return this.getGroupIcon();
    }
    if (obj instanceof THREE.Mesh) {
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
   * @param mesh The mesh to identify the icon for.
   * @returns The icon configuration for the mesh type.
   */
  private static getMeshIcon(mesh: THREE.Mesh): ObjectIcon {
    const geometry = mesh.geometry;
    if (geometry instanceof THREE.BoxGeometry) {
      return this.getBoxIcon();
    }
    if (geometry instanceof THREE.SphereGeometry) {
      return this.getSphereIcon();
    }
    if (geometry instanceof THREE.PlaneGeometry) {
      return this.getPlaneIcon();
    }
    if (geometry instanceof THREE.CylinderGeometry) {
      return this.getCylinderIcon();
    }
    return this.getGenericMeshIcon();
  }

  /**
   * Determines the specific light icon based on light type.
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
   * @returns The group icon configuration.
   */
  private static getGroupIcon(): ObjectIcon {
    return { character: '📁', color: '#e67e22' };
  }

  /**
   * Returns the icon for a box mesh.
   * @returns The box icon configuration.
   */
  private static getBoxIcon(): ObjectIcon {
    return { character: '◼', color: '#3498db' };
  }

  /**
   * Returns the icon for a sphere mesh.
   * @returns The sphere icon configuration.
   */
  private static getSphereIcon(): ObjectIcon {
    return { character: '●', color: '#2ecc71' };
  }

  /**
   * Returns the icon for a plane mesh.
   * @returns The plane icon configuration.
   */
  private static getPlaneIcon(): ObjectIcon {
    return { character: '▭', color: '#9b59b6' };
  }

  /**
   * Returns the icon for a cylinder mesh.
   * @returns The cylinder icon configuration.
   */
  private static getCylinderIcon(): ObjectIcon {
    return { character: '⬡', color: '#1abc9c' };
  }

  /**
   * Returns the generic icon for unknown mesh types.
   * @returns The generic mesh icon configuration.
   */
  private static getGenericMeshIcon(): ObjectIcon {
    return { character: '◇', color: '#95a5a6' };
  }

  /**
   * Returns the icon for a directional light.
   * @returns The directional light icon configuration.
   */
  private static getDirectionalLightIcon(): ObjectIcon {
    return { character: '☀', color: '#f39c12' };
  }

  /**
   * Returns the icon for a point light.
   * @returns The point light icon configuration.
   */
  private static getPointLightIcon(): ObjectIcon {
    return { character: '✦', color: '#f1c40f' };
  }

  /**
   * Returns the icon for a spot light.
   * @returns The spot light icon configuration.
   */
  private static getSpotLightIcon(): ObjectIcon {
    return { character: '◎', color: '#e74c3c' };
  }

  /**
   * Returns the generic icon for unknown light types.
   * @returns The generic light icon configuration.
   */
  private static getGenericLightIcon(): ObjectIcon {
    return { character: '✧', color: '#f1c40f' };
  }

  /**
   * Returns the icon for a camera object.
   * @returns The camera icon configuration.
   */
  private static getCameraIcon(): ObjectIcon {
    return { character: '📷', color: '#e74c3c' };
  }

  /**
   * Returns the fallback icon for unrecognized object types.
   * @returns The generic icon configuration.
   */
  private static getGenericIcon(): ObjectIcon {
    return { character: '○', color: '#7f8c8d' };
  }
}
