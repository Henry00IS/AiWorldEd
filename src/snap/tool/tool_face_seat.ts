import { ToolFaceSession } from './tool_face_align.js';

/** Single-use tool that slides one face plane onto another. */
export class ToolFaceSeat extends ToolFaceSession {
  /** Creates a translation-only seat tool. */
  constructor() {
    super('seat');
  }
}
