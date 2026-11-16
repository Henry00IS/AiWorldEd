import { InputSelect } from '@/ui/input/input_select.js';
import { textureChoicesList } from '@/texture/library/texture_choices.js';

/** Choice value of Default: an empty id, the owner's own texture. */
const TEXTURE_SELECT_DEFAULT = 'default';

/** The shared texture picker: a Default entry, then every library texture. */
export interface TextureSelect {
  /** Select element. */
  element: HTMLSelectElement;
  /** Shows an id; an empty id shows Default. */
  write: (id: string) => void;
  /** Returns the picked id, its full library path; empty for Default. */
  read: () => string;
}

/**
 * Builds the texture picker inspectors and script windows share. It stores the
 * full library path of the picked texture, like brushes and meshes do.
 *
 * @param label Accessible name.
 * @param commit Runs with the picked id when the user picks one.
 * @returns Picker.
 */
export function textureSelectCreate(label: string, commit: (id: string) => void): TextureSelect {
  const input = new InputSelect([], label);
  const read = (): string => {
    const value = input.getValue();
    return value === TEXTURE_SELECT_DEFAULT ? '' : value;
  };
  input.bindCommit(() => commit(read()));
  const write = (id: string): void => {
    input.setChoices([{ value: TEXTURE_SELECT_DEFAULT, label: 'Default' }, ...textureChoicesList([id])]);
    input.setSharedValues([id === '' ? TEXTURE_SELECT_DEFAULT : id]);
  };
  return { element: input.getElement(), write, read };
}
