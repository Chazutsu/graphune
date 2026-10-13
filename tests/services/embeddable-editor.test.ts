// @vitest-environment jsdom

import { createEmbeddableEditor } from "@/services/embeddable-editor";
import { EditorView } from "@codemirror/view";
import { App } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface TestEditorInstance {
	editor: { cm: EditorView };
	owner: Record<string, unknown>;
}

const instances: TestEditorInstance[] = [];

class BaseEditor {
	editor = { cm: new EditorView() };
	editorEl = document.createElement("div");
	containerEl: HTMLElement;
	owner: Record<string, unknown> = {};
	_loaded = true;
	private cleanups: Array<() => void> = [];

	constructor(_app: App, container: HTMLElement) {
		this.containerEl = container;
		instances.push(this);
	}

	set = vi.fn();
	onUpdate = vi.fn();
	buildLocalExtensions = vi.fn(() => []);
	destroy = vi.fn();
	register = (cleanup: () => void) => this.cleanups.push(cleanup);
	unload = vi.fn(() => {
		if (!this._loaded) return;
		this._loaded = false;
		for (const cleanup of this.cleanups.splice(0).toReversed()) cleanup();
	});
}

class ConcreteEditor extends BaseEditor {}

function prepareApp(): {
	app: App;
	pushScope: ReturnType<typeof vi.fn>;
	popScope: ReturnType<typeof vi.fn>;
	setActiveLeaf: ReturnType<typeof vi.fn>;
} {
	const app = new App();
	const pushScope = vi.fn();
	const popScope = vi.fn();
	const setActiveLeaf = vi.fn();
	Object.assign(app, {
		keymap: { pushScope, popScope },
		embedRegistry: {
			embedByExtension: {
				md: () => ({
					editable: false,
					showEditor: vi.fn(),
					editMode: new ConcreteEditor(app, document.createElement("div")),
					unload: vi.fn(),
				}),
			},
		},
	});
	Object.assign(app.workspace, { activeEditor: null, setActiveLeaf });
	return { app, pushScope, popScope, setActiveLeaf };
}

describe("createEmbeddableEditor", () => {
	beforeEach(() => {
		instances.length = 0;
	});

	it("pushes one keymap scope per focus session and restores the previous editor on blur", () => {
		const { app, pushScope, popScope } = prepareApp();
		const previousEditor = { id: "previous" };
		Object.assign(app.workspace, { activeEditor: previousEditor });
		const handle = createEmbeddableEditor(app, document.createElement("div"));
		const instance = instances.at(-1)!;

		instance.editor.cm.contentDOM.dispatchEvent(new FocusEvent("focusin"));
		instance.editor.cm.contentDOM.dispatchEvent(new FocusEvent("focusin"));
		expect(pushScope).toHaveBeenCalledTimes(1);
		expect(app.workspace.activeEditor).toBe(instance.owner);

		instance.editor.cm.contentDOM.dispatchEvent(new FocusEvent("blur"));
		expect(popScope).toHaveBeenCalledTimes(1);
		expect(app.workspace.activeEditor).toBe(previousEditor);
		handle.destroy();
		expect(popScope).toHaveBeenCalledTimes(1);
	});

	it("does not clear an editor that became active before destruction", () => {
		const { app } = prepareApp();
		const handle = createEmbeddableEditor(app, document.createElement("div"));
		const instance = instances.at(-1)!;
		instance.editor.cm.contentDOM.dispatchEvent(new FocusEvent("focusin"));
		const otherEditor = { id: "other" };
		Object.assign(app.workspace, { activeEditor: otherEditor });

		handle.destroy();

		expect(app.workspace.activeEditor).toBe(otherEditor);
	});

	it("keeps the shared focus guard until the final editor is destroyed", () => {
		const { app, setActiveLeaf } = prepareApp();
		const first = createEmbeddableEditor(app, document.createElement("div"));
		const firstInstance = instances.at(-1)!;
		const second = createEmbeddableEditor(app, document.createElement("div"));
		const secondInstance = instances.at(-1)!;
		const guardedSetActiveLeaf = app.workspace.setActiveLeaf;
		firstInstance.editor.cm.contentDOM.dispatchEvent(new FocusEvent("focusin"));

		app.workspace.setActiveLeaf(null);
		expect(setActiveLeaf).not.toHaveBeenCalled();
		first.destroy();
		expect(app.workspace.setActiveLeaf).toBe(guardedSetActiveLeaf);

		secondInstance.editor.cm.contentDOM.dispatchEvent(new FocusEvent("blur"));
		app.workspace.setActiveLeaf(null);
		expect(setActiveLeaf).toHaveBeenCalledTimes(1);
		second.destroy();
		expect(app.workspace.setActiveLeaf).toBe(setActiveLeaf);
	});
});
