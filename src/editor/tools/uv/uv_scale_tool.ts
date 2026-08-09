import type { UvTransformMode } from '@/texture/interactive/uv_transform_mode.js';
import { UvTransformToolBase } from './uv_transform_tool_base.js';

/** Single-use UV scale tool activated with S while Face Select is active. */
export class UvScaleTool extends UvTransformToolBase {
  /**
   * Returns the UV scale mode.
   *
   * @returns Scale mode.
   */
  protected override getUvTransformMode(): UvTransformMode {
    return 'scale';
  }
}
