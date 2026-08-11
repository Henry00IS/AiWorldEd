import { audioContextHost } from '@/audio/context/audio_context_host.js';
import { audioSettings } from '@/audio/settings/audio_settings.js';
import { notificationFrameEvents } from './notification_frame_events.js';

/**
 * Global raise API for cheap editor frame events. Booleans gate channels;
 * optional floats carry pitch hints. Playback runs at end of frame.
 */
export class NotificationGlobal {
  /**
   * Marks that the selection moved with grid snapping during this frame
   * interval.
   *
   * @param stepLength World-space length of this snap step (for speed EMA).
   */
  static onSelectionMovedWithSnapping(stepLength = 1): void {
    this.raiseIfAudioEnabled(() => notificationFrameEvents.raiseSelectionMovedWithSnapping(stepLength));
  }

  /**
   * Marks that the selection was scaled with grid snapping during this frame
   * interval. Optional travel drives pitch the same way as bounds resize.
   *
   * @param travelDistance Absolute travel from drag start (scale snap steps
   *   from identity, or 0 for default pitch).
   */
  static onSelectionScaledWithSnapping(travelDistance = 0): void {
    this.raiseIfAudioEnabled(() => notificationFrameEvents.raiseSelectionScaledWithSnapping(travelDistance));
  }

  /**
   * Marks that the selection was resized with grid snapping (bounds face drag).
   * Shares the scale/resize pitch channel with gizmo scale.
   *
   * @param travelDistance Absolute face displacement so far (ruler distance).
   */
  static onSelectionResizedWithSnapping(travelDistance: number): void {
    this.raiseIfAudioEnabled(() => notificationFrameEvents.raiseSelectionResizedWithSnapping(travelDistance));
  }

  /**
   * Marks that the selection was rotated with angle snapping.
   *
   * @param stepRadians Absolute angle of this snap step in radians.
   */
  static onSelectionRotatedWithSnapping(stepRadians = 0.1): void {
    this.raiseIfAudioEnabled(() => notificationFrameEvents.raiseSelectionRotatedWithSnapping(stepRadians));
  }

  /**
   * Marks that a solid brush or CSG group operation changed (inspector, A-key
   * toggle, undo/redo, MCP).
   */
  static onSolidCsgOperationFlipped(): void {
    this.raiseIfAudioEnabled(() => notificationFrameEvents.raiseSolidCsgOperationFlipped());
  }

  /**
   * Marks that a player foot planted during locomotion this frame.
   *
   * @param worldX Foot world X.
   * @param worldY Foot world Y.
   * @param worldZ Foot world Z.
   * @param planarSpeed Body planar speed meters per second (pitch hint).
   */
  static onPlayerFootstep(worldX: number, worldY: number, worldZ: number, planarSpeed = 0): void {
    this.raiseIfAudioEnabled(() => notificationFrameEvents.raisePlayerFootstep(worldX, worldY, worldZ, planarSpeed));
  }

  /**
   * Unlocks audio on the user-gesture path and runs a raise when audio is on.
   *
   * @param raiseFlag Callback that sets the pending frame-event boolean.
   */
  private static raiseIfAudioEnabled(raiseFlag: () => void): void {
    if (!audioSettings.isEnabled()) {
      return;
    }
    audioContextHost.unlock();
    raiseFlag();
  }
}
