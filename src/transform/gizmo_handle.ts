import * as THREE from 'three';
import { GizmoAxis } from '../types/transform_mode.js';

/**
 * Represents a single interactive handle on a transform gizmo.
 * Stores axis, color, and the visual mesh used for rendering.
 */
let nextHandleId = 0;

/**
 * Returns the next unique handle identifier.
 * @returns A unique numeric ID for a new handle.
 */
function getNextHandleId(): number {
  return nextHandleId++;
}

export class GizmoHandle {
  private axis: GizmoAxis;
  private baseColor: number;
  private hoverColor: number;
  private visualMesh: THREE.Mesh;
  private isHovered: boolean;
  private handleId: number;

  /**
   * Creates a new gizmo handle with the given axis, color, and visual mesh.
   * @param axis The gizmo axis this handle represents.
   * @param color The base color of the handle.
   * @param visualMesh The Three.js mesh representing this handle visually.
   */
  constructor(axis: GizmoAxis, color: number, visualMesh: THREE.Mesh) {
    this.axis = axis;
    this.baseColor = color;
    this.hoverColor = 0xffffff;
    this.visualMesh = visualMesh;
    this.isHovered = false;
    this.handleId = getNextHandleId();
  }

  /**
   * Returns the gizmo axis associated with this handle.
   * @returns The axis enum value.
   */
  getAxis(): GizmoAxis {
    return this.axis;
  }

  /**
   * Returns the unique identifier for this handle.
   * @returns The handle ID for matching against cloned meshes.
   */
  getHandleId(): number {
    return this.handleId;
  }

  /**
   * Returns the base color of this handle.
   * @returns The hex color value.
   */
  getColor(): number {
    return this.baseColor;
  }

  /**
   * Returns the visual Three.js mesh of this handle.
   * @returns The mesh used for rendering and raycasting.
   */
  getVisualMesh(): THREE.Mesh {
    return this.visualMesh;
  }

  /**
   * Sets the base color of this handle and updates the mesh material.
   * @param color The new hex color value.
   */
  setColor(color: number): void {
    this.baseColor = color;
    this.updateMeshColor();
  }

  /**
   * Toggles the hover color state on or off.
   * @param isHovered Whether the handle is currently hovered.
   */
  setHoverColor(isHovered: boolean): void {
    this.isHovered = isHovered;
    this.updateMeshColor();
  }

  /**
   * Checks if this handle is currently in hover state.
   * @returns True if the handle is hovered, false otherwise.
   */
  isHoveredState(): boolean {
    return this.isHovered;
  }

  /**
   * Sets the hover color to use when the handle is hovered.
   * @param color The hover color hex value.
   */
  setHoverColorValue(color: number): void {
    this.hoverColor = color;
  }

  /**
   * Applies the correct color to the mesh material based on hover state.
   */
  private updateMeshColor(): void {
    const targetColor = this.isHovered ? this.hoverColor : this.baseColor;
    const material = this.visualMesh.material;
    if (material && !Array.isArray(material) && 'color' in material) {
      (material as THREE.MeshBasicMaterial).color.setHex(targetColor);
    }
  }
}
