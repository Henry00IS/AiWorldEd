import type { Curve } from '@/curve/model/curve_model.js';
import {
  solidScriptResourceCurve,
  solidScriptResourceCurveRead,
  solidScriptResourceFind,
  solidScriptResourceNameFree,
  type SolidScriptResource,
  type SolidScriptResourceCurve,
} from '@/solid_script/document/solid_script_resource.js';
import { solidScriptInputResourceName } from '@/solid_script/language/solid_script_input_resource.js';
import { solidScriptResourceNameOfFile } from '@/solid_script/document/solid_script_resource_file.js';

/**
 * The curve resources an options window works on: the script's own, and the
 * ones its curve fields make or change. They reach the script when the window
 * is confirmed, and are dropped when it is cancelled.
 */
export class SolidScriptConfiguratorCurves {
  /** Resources of the script, with changes made in the window. */
  private resources: SolidScriptResource[];
  /** True once a curve field made or changed a resource. */
  private edited = false;

  /**
   * Starts from the resources of the script.
   *
   * @param resources Resources of the script.
   * @param extra Names of curve resources whose curves are not known, such as
   *   $Resources.Arch, for a field built without the script.
   */
  constructor(
    resources: readonly SolidScriptResource[],
    private readonly extra: readonly string[] = [],
  ) {
    this.resources = [...resources];
  }

  /**
   * Lists the curve resources as fields name them.
   *
   * @returns Names such as $Resources.Arch.
   */
  names(): string[] {
    const own = this.resources
      .filter((resource) => resource.kind === 'Curve')
      .map((resource) => `$Resources.${resource.name}`);
    const folded = new Set(own.map((name) => name.toLowerCase()));
    return [...own, ...this.extra.filter((name) => !folded.has(name.toLowerCase()))];
  }

  /**
   * Reads the curve of the resource field text names.
   *
   * @param text Field text, such as [$Resources.Arch].
   * @returns Curve, or null when the text names no curve resource.
   */
  curve(text: string): Curve | null {
    const resource = this.find(text);
    return resource ? solidScriptResourceCurveRead(resource) : null;
  }

  /**
   * Keeps a curve edited in a field: in the resource the field names, else in a
   * new resource named after the field.
   *
   * @param text Field text.
   * @param label Caption of the field, such as Profile.
   * @param curve Curve.
   * @returns Field text naming the resource, such as [$Resources.Profile].
   */
  write(text: string, label: string, curve: Curve): string {
    const found = this.find(text);
    const name = found?.name ?? solidScriptResourceNameFree(this.resources, solidScriptResourceNameOfFile(label));
    const resource = solidScriptResourceCurve(name, curve);
    this.resources = found
      ? this.resources.map((entry) => (entry === found ? resource : entry))
      : [...this.resources, resource];
    this.edited = true;
    return `[$Resources.${name}]`;
  }

  /**
   * Gives the resources to store with the script.
   *
   * @returns Resources, or null when no field changed any.
   */
  changed(): readonly SolidScriptResource[] | null {
    return this.edited ? this.resources : null;
  }

  /**
   * Finds the curve resource field text names.
   *
   * @param text Field text.
   * @returns Resource, or undefined.
   */
  private find(text: string): SolidScriptResourceCurve | undefined {
    const name = solidScriptInputResourceName(text);
    const resource = name === null ? undefined : solidScriptResourceFind(this.resources, name);
    return resource?.kind === 'Curve' ? resource : undefined;
  }
}
