import type { UvTransformMode } from '@/texture/interactive/uv_transform_mode.js';
import { UvTransformToolBase } from './uv_transform_tool_base.js';

/** Single-use UV rotate tool activated with R while Face Select is active. */
export class UvRotateTool extends UvTransformToolBase {
  /**
   * Returns the UV rotate mode.
   *
   * @returns Rotate mode.
   */
  protected override getUvTransformMode(): UvTransformMode {
    return 'rotate';
  }
}
