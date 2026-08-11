import * as THREE from 'three';

/** Session-wide spawn marker state for play mode. */
export class PlayerSpawnState {
  private hasPlacedSpawn: boolean;
  private readonly spawnFeetPosition: THREE.Vector3;
  private spawnYawRadians: number;

  /** Creates an empty spawn state with no placed figurine. */
  constructor() {
    this.hasPlacedSpawn = false;
    this.spawnFeetPosition = new THREE.Vector3();
    this.spawnYawRadians = 0;
  }

  /**
   * Returns whether a figurine spawn has been placed.
   *
   * @returns True when a spawn point is active.
   */
  hasSpawnPoint(): boolean {
    return this.hasPlacedSpawn;
  }

  /**
   * Copies the placed spawn feet position into the target vector.
   *
   * @param target Destination vector.
   * @returns The target vector, or null when no spawn is placed.
   */
  copySpawnFeetPositionTo(target: THREE.Vector3): THREE.Vector3 | null {
    if (!this.hasPlacedSpawn) {
      return null;
    }
    return target.copy(this.spawnFeetPosition);
  }

  /**
   * Returns the yaw stored with the spawn point.
   *
   * @returns Yaw in radians.
   */
  getSpawnYawRadians(): number {
    return this.spawnYawRadians;
  }

  /**
   * Stores a placed figurine spawn point.
   *
   * @param feetPosition World-space feet position.
   * @param yawRadians Facing yaw in radians.
   */
  placeSpawn(feetPosition: THREE.Vector3, yawRadians: number): void {
    this.spawnFeetPosition.copy(feetPosition);
    this.spawnYawRadians = yawRadians;
    this.hasPlacedSpawn = true;
  }

  /** Clears the placed figurine spawn point. */
  clearSpawn(): void {
    this.hasPlacedSpawn = false;
    this.spawnFeetPosition.set(0, 0, 0);
    this.spawnYawRadians = 0;
  }
}
