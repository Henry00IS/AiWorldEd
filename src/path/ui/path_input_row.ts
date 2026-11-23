import type * as THREE from 'three';
import { pathEditSelected, pathEditSelectionListen } from '@/path/edit/path_edit_selection.js';
import { pathAssetDecode, pathAssetEncode, PATH_ASSET_DEFAULT, type PathAsset } from '@/path/model/path_asset.js';
import { pathReferenceEncode, pathReferenceRead } from '@/path/model/path_reference.js';
import { modifierStackUiRow, modifierStackUiText } from '@/modifier/stack/ui/modifier_stack_ui_style.js';
import { InputSelect, type InputSelectChoice } from '@/ui/input/input_select.js';
import { PATH_POINT_PANEL_NONE } from './path_point_panel.js';
import { PathField } from './path_field.js';

/** Value of the Follows choice that keeps a path of the input's own. */
const PATH_INPUT_ROW_OWN = '';

/** Where a path row's input lives. */
export interface PathInputRowPlace {
  /** Stack owner. */
  volume: THREE.Object3D;
  /** Id of the step the input belongs to. */
  stepId: string;
}

/** What a path row shows and whom it tells. */
export interface PathInputRowOptions {
  /** Name of the input. */
  name: string;
  /** Caption. */
  label: string;
  /** Row tooltip. */
  hint: string;
  /** Stores a new value as text. */
  commit: (text: string) => void;
  /** Returns where the input lives, or null. */
  placeOf: () => PathInputRowPlace | null;
  /**
   * Lists the Path objects the input may follow; absent for a path that never
   * follows one, such as a Path object's own.
   */
  scenePathsOf?: (place: PathInputRowPlace) => string[];
}

/**
 * Builds the inspector row of a path: its summary and file buttons, and the
 * settings of the point of this path selected in the scene, following the
 * selection while it is shown. A script's Path input also gets a Follows choice
 * that picks a Path object of the scene by name; while it follows one, its own
 * shape is kept aside and the path is edited on that object.
 *
 * @param options Row options.
 * @returns Row and how to show a value.
 */
export function pathInputRow(options: PathInputRowOptions): { element: HTMLElement; write: (text: string) => void } {
  let own: PathAsset = PATH_ASSET_DEFAULT;
  const field = new PathField({ label: options.label, onCommit: (path) => options.commit(pathAssetEncode(path)) });
  const element = document.createElement('div');
  element.dataset['solidScriptPath'] = options.name;
  const fieldRow = modifierStackUiRow(
    options.scenePathsOf ? 'Own Path' : options.label,
    field.getElement(),
    options.hint,
  );
  const follows = options.scenePathsOf ? pathInputRowFollows(options, () => own) : null;
  element.append(...(follows ? [follows.element] : []), fieldRow);
  const follow = (): void => {
    const picked = pathEditSelected();
    const mine = picked?.name === options.name && picked.stepId === options.placeOf()?.stepId;
    field.setSelected(mine ? picked : PATH_POINT_PANEL_NONE);
  };
  const stop = pathEditSelectionListen(() => (element.isConnected ? follow() : stop()));
  const write = (text: string): void => {
    const reference = pathReferenceRead(text);
    own = (reference ? reference.fallback : pathAssetDecode(text)) ?? PATH_ASSET_DEFAULT;
    follows?.write(reference?.scene ?? PATH_INPUT_ROW_OWN);
    fieldRow.style.display = reference ? 'none' : '';
    field.setText(pathAssetEncode(own));
    follow();
  };
  return { element, write };
}

/**
 * Builds the Follows choice of a script's Path input: Own Path, or a Path
 * object by name, rebuilt from the scene each time it is shown or opened, with
 * a line saying where the path is edited while it follows one.
 *
 * @param options Row options.
 * @param ownOf Returns the input's own shape, kept aside while following.
 * @returns Element and how to show the followed name.
 */
function pathInputRowFollows(
  options: PathInputRowOptions,
  ownOf: () => PathAsset,
): { element: HTMLElement; write: (scene: string) => void } {
  const select = new InputSelect([], `${options.label} Follows`);
  const note = modifierStackUiText('div', '', true);
  let shown = PATH_INPUT_ROW_OWN;
  const refresh = (): void => {
    const place = options.placeOf();
    select.setChoices(pathInputRowChoices(place ? (options.scenePathsOf?.(place) ?? []) : [], shown));
    select.setSharedValues([shown]);
    note.textContent =
      shown === PATH_INPUT_ROW_OWN ? '' : `Follows the Path object ${shown}: select it to edit the path.`;
    note.style.display = shown === PATH_INPUT_ROW_OWN ? 'none' : '';
  };
  select.getElement().addEventListener('mousedown', refresh);
  select.getElement().addEventListener('focus', refresh);
  select.bindCommit(() => {
    const scene = select.getValue();
    options.commit(scene === PATH_INPUT_ROW_OWN ? pathAssetEncode(ownOf()) : pathReferenceEncode(scene, ownOf()));
  });
  const element = document.createElement('div');
  element.dataset['pathFollows'] = options.name;
  element.append(
    modifierStackUiRow(
      options.label,
      select.getElement(),
      `${options.hint}. Follows a Path object of the scene by name, or keeps an Own Path`,
    ),
    note,
  );
  const write = (scene: string): void => {
    shown = scene;
    refresh();
  };
  return { element, write };
}

/**
 * Lists the Follows choices: Own Path, the Path objects of the scene, and the
 * name followed now when no Path object has it.
 *
 * @param names Names of the Path objects of the scene.
 * @param shown Name followed now, or empty for Own Path.
 * @returns Choices.
 */
function pathInputRowChoices(names: readonly string[], shown: string): InputSelectChoice[] {
  const missing = shown !== PATH_INPUT_ROW_OWN && !names.includes(shown) ? [shown] : [];
  return [
    { value: PATH_INPUT_ROW_OWN, label: 'Own Path' },
    ...names.map((name) => ({ value: name, label: name })),
    ...missing.map((name) => ({ value: name, label: `${name} (Missing)` })),
  ];
}
