import type { UvTransformMode } from '@/texture/interactive/uv_transform_mode.js';
import { UvTransformToolBase } from './uv_transform_tool_base.js';

/** Single-use UV move tool activated with G while Face Select is active. */
export class UvMoveTool extends UvTransformToolBase {
  /**
   * Returns the UV move mode.
   *
   * @returns Move mode.
   */
  protected override getUvTransformMode(): UvTransformMode {
    return 'move';
  }
}
