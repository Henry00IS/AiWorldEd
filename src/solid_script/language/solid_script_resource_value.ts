import { pathAssetScriptPath } from '@/path/model/path_asset_script.js';
import {
  solidScriptResourceCurveRead,
  solidScriptResourceFind,
  type SolidScriptResource,
} from '@/solid_script/document/solid_script_resource.js';
import { SolidScriptCurveValue } from './solid_script_curve_value.js';
import type { SolidScriptPath } from './solid_script_path_model.js';
import type { SolidScriptPathElement, SolidScriptValue } from './solid_script_value.js';

/** Makes the run's own Path element for a path resource. */
export type SolidScriptResourcePathMake = (path: SolidScriptPath<number[]>, name: string) => SolidScriptPathElement;

/**
 * The resources one run reads as $Resource.Name: each read once and kept, so
 * the run works on its own copy and the stored resource never changes.
 */
export class SolidScriptResourceValues {
  private readonly read = new Map<string, SolidScriptValue>();

  /**
   * @param resources Resources of the script.
   * @param pathMake Makes a Path element of the run.
   */
  constructor(
    private readonly resources: readonly SolidScriptResource[],
    private readonly pathMake: SolidScriptResourcePathMake,
  ) {}

  /**
   * Reads a resource by name: a Texture as its id, a Curve as a Curve and a
   * Path as a Path.
   *
   * @param name Name after $Resource., in any case.
   * @returns Value.
   */
  value(name: string): SolidScriptValue {
    const key = name.toLowerCase();
    if (this.read.has(key)) return this.read.get(key);
    const resource = solidScriptResourceFind(this.resources, name);
    if (!resource)
      throw new Error(
        `there is no resource [$Resource.${name}]; add it in the Resources tab${this.resources.length > 0 ? `, or use one of ${this.resources.map((entry) => entry.name).join(', ')}` : ''}`,
      );
    const value = this.make(resource);
    this.read.set(key, value);
    return value;
  }

  /**
   * Turns one resource into the value a script reads.
   *
   * @param resource Resource.
   * @returns Value.
   */
  private make(resource: SolidScriptResource): SolidScriptValue {
    if (resource.kind === 'Texture') return resource.texture;
    if (resource.kind === 'Path') return this.pathMake(pathAssetScriptPath(resource.path), resource.name);
    const curve = solidScriptResourceCurveRead(resource);
    if (!curve) throw new Error(`the curve of [$Resource.${resource.name}] could not be read`);
    return new SolidScriptCurveValue(curve);
  }
}
