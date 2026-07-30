import { createDefaultCoordinateSpace } from '../settings/coordinate_space_presets.js';
import type { CoordinateSpaceDefinition } from '../settings/coordinate_space_types.js';
import type { GameProfile } from '../settings/settings_types.js';

/** Consumer capable of applying profile coordinate presentation. */
export interface CoordinatePresentationTarget {
  setCoordinateSpace(space: CoordinateSpaceDefinition): void;
}

/** Applies one active profile consistently to all presentation consumers. */
export class CoordinatePresentationController {
  private readonly targets: CoordinatePresentationTarget[];
  private currentSpace: CoordinateSpaceDefinition;

  /**
   * Creates a controller for viewport and transform presentation targets.
   *
   * @param targets Consumers updated together.
   */
  constructor(targets: CoordinatePresentationTarget[]) {
    this.targets = targets;
    this.currentSpace = createDefaultCoordinateSpace();
  }

  /**
   * Applies a game profile without changing authored scene data.
   *
   * @param profile Active game profile or null for editor defaults.
   */
  applyProfile(profile: GameProfile | null): void {
    this.currentSpace = { ...(profile?.coordinateSpace ?? createDefaultCoordinateSpace()) };
    this.targets.forEach((target) => target.setCoordinateSpace(this.currentSpace));
  }

  /**
   * Returns a cloned current presentation definition.
   *
   * @returns Current coordinate space.
   */
  getCoordinateSpace(): CoordinateSpaceDefinition {
    return { ...this.currentSpace };
  }
}
