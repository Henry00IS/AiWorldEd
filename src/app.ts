import { ViewportLayoutManager } from './managers/viewport_layout_manager.js';

const editorContainer = document.getElementById('editor-container') as HTMLElement;
const layoutManager = new ViewportLayoutManager(editorContainer);
layoutManager.start();
console.log('AiWorldEd started');
