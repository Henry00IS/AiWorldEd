import * as THREE from 'three';

/**
 * Directional key light locked to a camera so illumination always comes
 * from the current view direction (headlight).
 */
export class CameraHeadlight {
  private light: THREE.DirectionalLight;
  private camera: THREE.Camera | null;

  /**
   * Creates a directional light that will be attached to a camera.
   * @param color The light color as a hex number.
   * @param intensity The light intensity.
   */
  constructor(color: number, intensity: number) {
    this.light = new THREE.DirectionalLight(color, intensity);
    this.camera = null;
    this.configureLocalHeadlightPose();
  }

  /**
   * Places the light at the camera origin aiming down the camera look axis.
   * Local -Z is the Three.js camera forward direction.
   */
  private configureLocalHeadlightPose(): void {
    this.light.position.set(0, 0, 0);
    this.light.target.position.set(0, 0, -1);
  }

  /**
   * Parents the light and its target under the camera so they follow rotation.
   * Adds the camera to the scene when it is not already in the graph.
   * @param scene The scene that owns the camera and light hierarchy.
   * @param camera The camera the light should follow.
   */
  attachToCamera(scene: THREE.Scene, camera: THREE.Camera): void {
    this.detachFromCurrentCamera();
    this.camera = camera;
    if (camera.parent !== scene) {
      scene.add(camera);
    }
    camera.add(this.light);
    camera.add(this.light.target);
    this.configureLocalHeadlightPose();
  }

  /**
   * Removes the light from the previously attached camera if any.
   */
  private detachFromCurrentCamera(): void {
    if (!this.camera) return;
    this.camera.remove(this.light);
    this.camera.remove(this.light.target);
    this.camera = null;
  }

  /**
   * Returns the directional light instance.
   * @returns The Three.js directional light.
   */
  getLight(): THREE.DirectionalLight {
    return this.light;
  }

  /**
   * Returns the world-space direction the light currently shines toward.
   * @returns A normalized direction vector from light to target.
   */
  getWorldShineDirection(): THREE.Vector3 {
    this.light.updateMatrixWorld(true);
    this.light.target.updateMatrixWorld(true);
    const lightPosition = new THREE.Vector3();
    const targetPosition = new THREE.Vector3();
    this.light.getWorldPosition(lightPosition);
    this.light.target.getWorldPosition(targetPosition);
    return targetPosition.sub(lightPosition).normalize();
  }
}
