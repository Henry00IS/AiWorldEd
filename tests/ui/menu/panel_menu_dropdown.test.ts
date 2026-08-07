import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PanelMenu } from '@/ui/menu/panel_menu.js';
import { PanelMenuDropdown } from '@/ui/menu/panel_menu_dropdown.js';
import { MenuOutsidePointerClose } from '@/ui/menu/menu_outside_pointer_close.js';
import { appendMenuDropdownCaret } from '@/ui/menu/menu_dropdown_caret.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';

/** Minimal dropdown subclass for unit tests. */
class TestMenuDropdown extends PanelMenuDropdown {
  private chosen: string[];

  /**
   * Creates a test dropdown under a host.
   *
   * @param parentElement Host element.
   * @param chosen Array that receives chosen labels.
   */
  constructor(parentElement: HTMLElement, chosen: string[]) {
    super(parentElement);
    this.chosen = chosen;
    this.button.textContent = 'Test';
    this.appendCaret(this.button);
    this.styleTriggerButton();
    this.wrapper.appendChild(this.button);
    this.rebuildMenuPanel();
    parentElement.appendChild(this.wrapper);
  }

  /** Styles the trigger with a stable test attribute. */
  protected styleTriggerButton(): void {
    this.button.dataset['testTrigger'] = '1';
  }

  /** Builds a single action menu. */
  protected rebuildMenuPanel(): void {
    this.menuPanel?.dispose();
    this.menuPanel = new PanelMenu(
      [
        {
          kind: 'action',
          label: 'Pick Me',
          onClick: () => {
            this.closeMenu();
            this.chosen.push('Pick Me');
          },
        },
      ],
      () => this.closeMenu(),
      false,
      this.ownerDocument,
    );
    this.wrapper.appendChild(this.menuPanel.getElement());
  }
}

describe('PanelMenuDropdown', () => {
  let host: HTMLElement;

  beforeEach(() => {
    FloatingPanelStack.resetForTests();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    document.body.replaceChildren();
    FloatingPanelStack.resetForTests();
  });

  it('opens a PanelMenu and closes after an action', () => {
    const chosen: string[] = [];
    const dropdown = new TestMenuDropdown(host, chosen);
    const trigger = host.querySelector('button') as HTMLButtonElement;
    Object.defineProperty(trigger, 'getBoundingClientRect', {
      value: () => ({ left: 10, bottom: 40, top: 16, right: 80, width: 70, height: 24 }),
    });
    trigger.click();
    const panel = dropdown.getMenuPanel();
    expect(panel?.isOpen()).toBe(true);
    const action = Array.from(panel!.getElement().querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes('Pick Me'),
    ) as HTMLButtonElement;
    action.click();
    expect(chosen).toEqual(['Pick Me']);
    expect(panel?.isOpen()).toBe(false);
    dropdown.dispose();
  });

  it('appends a shared dropdown caret', () => {
    const button = document.createElement('button');
    const caret = appendMenuDropdownCaret(button);
    expect(caret.textContent).toBe('▾');
    expect(button.contains(caret)).toBe(true);
  });
});

describe('MenuOutsidePointerClose', () => {
  it('invokes onOutside when the press is outside all surfaces', () => {
    const inside = document.createElement('div');
    document.body.appendChild(inside);
    let closed = 0;
    const closer = new MenuOutsidePointerClose();
    closer.begin(
      window,
      (target) => MenuOutsidePointerClose.isTargetInsideSurfaces([inside], target),
      () => {
        closed += 1;
      },
    );
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    const event = new PointerEvent('pointerdown', { bubbles: true });
    Object.defineProperty(event, 'target', { value: outside });
    window.dispatchEvent(event);
    expect(closed).toBeGreaterThanOrEqual(1);
    closer.end();
    inside.remove();
    outside.remove();
  });
});
