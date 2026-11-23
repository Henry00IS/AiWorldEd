import { TransformMode } from '@/types/transform_mode.js';
import { BoxSelectTool } from './box_select_tool.js';
import { BoundsWidget } from '../widgets/bounds_widget.js';
import { widgetsClaimClickAt } from '../widgets/widget.js';
import { GeneratorEditButton } from '../widgets/generator_edit_button.js';
import { GeneratorTool } from './generator/generator_tool.js';

/**
 * Permanent bounds tool (Shape Editor-style tool + widget): object selection
 * via BoxSelectTool base, bounds gizmo owned by BoundsWidget only, and the Edit
 * button that enters the Generator tool for a selected generator.
 */
export class BoundsTool extends BoxSelectTool {
  private readonly boundsWidget: BoundsWidget;
  private readonly editButton: GeneratorEditButton;
  private readonly generatorTool: GeneratorTool;

  /** Creates a bounds tool. */
  constructor() {
    super();
    this.boundsWidget = new BoundsWidget();
    this.generatorTool = new GeneratorTool();
    this.editButton = new GeneratorEditButton(() => this.editGenerator());
  }

  /** Called when the tool is activated. */
  override onActivate(): void {
    super.onActivate();
    this.activateBoundsWidgetPath();
  }

  /** Called when the tool is deactivated. */
  override onDeactivate(): void {
    super.onDeactivate();
    this.editButton.hide();
  }

  /** Called when the tool is rendered. */
  override onRender(): void {
    super.onRender();
    this.updateBoundsWidgetVisibility();
  }

  /**
   * Selects on a click, except a click on the Edit button.
   *
   * @param button Mouse button index.
   */
  override onGlobalMouseUp(button: number): void {
    if (
      button === 0 &&
      this.editor &&
      widgetsClaimClickAt(this.editor.getWidgets(), this.editor.lastPointerClientX, this.editor.lastPointerClientY)
    ) {
      return;
    }
    super.onGlobalMouseUp(button);
  }

  /** Permanent path: bounds mode and BoundsWidget (Shape Editor AddWidget). */
  private activateBoundsWidgetPath(): void {
    const services = this.editor?.getServices();
    if (!services || !this.editor) {
      return;
    }
    services.setWidgetMode(TransformMode.BOUNDS);
    services.refreshGizmoPresentation();
    services.setStatusMessage('Bounds');
    this.editor.addWidget(this.boundsWidget);
    this.editor.addWidget(this.editButton);
    this.updateBoundsWidgetVisibility();
  }

  /** Shows the bounds widget when there is a selection. */
  private updateBoundsWidgetVisibility(): void {
    if (!this.editor) {
      return;
    }
    this.boundsWidget.visible = this.editor.selectedSegmentsCount > 0;
  }

  /** Enters the Generator tool while Bounds is still the active tool. */
  private editGenerator(): void {
    if (this.editor?.activeTool === this) this.editor.switchTool(this.generatorTool);
  }
}
