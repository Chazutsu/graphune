import { EditorSelection, type Extension, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import type { App, MarkdownFileInfo, Scope } from "obsidian";

// --- Internal Obsidian type declarations ---
// These use non-public APIs; may break on Obsidian updates.

interface InternalWidgetEditorView {
	editable: boolean;
	showEditor: () => void;
	editMode: unknown;
	unload: () => void;
}

interface ScrollableMarkdownEditorInstance {
	editor: {
		cm: EditorView;
	};
	editorEl: HTMLElement;
	set: (value: string) => void;
	onUpdate: (update: unknown, changed: boolean) => void;
	buildLocalExtensions: () => Extension[];
	destroy: () => void;
	unload: () => void;
	_loaded: boolean;
	owner: Record<string, unknown>;
	register: (uninstaller: () => void) => void;
	containerEl: HTMLElement;
}

type ScrollableMarkdownEditorConstructor = new (
	app: App,
	container: HTMLElement,
	options: Record<string, unknown>,
) => ScrollableMarkdownEditorInstance;

interface WorkspaceFocusGuard {
	original: (...args: unknown[]) => unknown;
	wrapper: (...args: unknown[]) => unknown;
	instances: Set<ScrollableMarkdownEditorInstance>;
	focusedInstances: Set<ScrollableMarkdownEditorInstance>;
}

const workspaceFocusGuards = new WeakMap<object, WorkspaceFocusGuard>();

interface WorkspaceFocusRegistration {
	setFocused: (focused: boolean) => void;
	unregister: () => void;
}

function registerWorkspaceFocusGuard(
	app: App,
	instance: ScrollableMarkdownEditorInstance,
): WorkspaceFocusRegistration {
	const workspace = app.workspace as unknown as Record<string, unknown>;
	let guard = workspaceFocusGuards.get(app.workspace);
	if (!guard) {
		const original = workspace.setActiveLeaf;
		if (typeof original !== "function") {
			return { setFocused: () => {}, unregister: () => {} };
		}
		guard = {
			original: original as (...args: unknown[]) => unknown,
			wrapper: () => undefined,
			instances: new Set(),
			focusedInstances: new Set(),
		};
		const currentGuard = guard;
		guard.wrapper = (...args: unknown[]) => {
			if (currentGuard.focusedInstances.size > 0) return;
			return currentGuard.original.call(app.workspace, ...args);
		};
		workspace.setActiveLeaf = guard.wrapper;
		workspaceFocusGuards.set(app.workspace, guard);
	}

	guard.instances.add(instance);
	let registered = true;
	return {
		setFocused: (focused) => {
			if (!registered) return;
			if (focused) guard!.focusedInstances.add(instance);
			else guard!.focusedInstances.delete(instance);
		},
		unregister: () => {
			if (!registered) return;
			registered = false;
			guard!.focusedInstances.delete(instance);
			guard!.instances.delete(instance);
			if (guard!.instances.size > 0) return;
			if (workspace.setActiveLeaf === guard!.wrapper) workspace.setActiveLeaf = guard!.original;
			workspaceFocusGuards.delete(app.workspace);
		},
	};
}

// --- Prototype resolution ---

let EditorPrototype: ScrollableMarkdownEditorConstructor | null = null;

function resolveEditorPrototype(app: App): ScrollableMarkdownEditorConstructor {
	if (EditorPrototype) {
		return EditorPrototype;
	}

	// @ts-expect-error — accessing internal Obsidian API
	const embedFn = app.embedRegistry?.embedByExtension?.md;
	if (typeof embedFn !== "function") {
		throw new Error("Obsidian's Markdown editor API is unavailable");
	}

	let widgetEditorView: InternalWidgetEditorView | null = null;
	try {
		const resolvedView = embedFn(
			{ app, containerEl: document.createElement("div") },
			null,
			"",
		) as InternalWidgetEditorView;
		widgetEditorView = resolvedView;
		resolvedView.editable = true;
		resolvedView.showEditor();
		const parentPrototype = Object.getPrototypeOf(resolvedView.editMode);
		const prototype = parentPrototype && Object.getPrototypeOf(parentPrototype);
		if (!prototype || typeof prototype.constructor !== "function") {
			throw new Error("Obsidian's Markdown editor prototype could not be resolved");
		}
		EditorPrototype = prototype.constructor as ScrollableMarkdownEditorConstructor;
	} catch (error) {
		throw new Error("Failed to initialize the embedded Markdown editor", { cause: error });
	} finally {
		widgetEditorView?.unload();
	}

	return EditorPrototype;
}

// --- Public API ---

export interface EmbeddableEditorOptions {
	value?: string;
	placeholder?: string;
	cls?: string;
	cursorLocation?: { anchor: number; head: number };
	onBlur?: (editor: EmbeddableEditorHandle) => void;
	onChange?: (editor: EmbeddableEditorHandle) => void;
}

export interface EmbeddableEditorHandle {
	readonly value: string;
	set: (content: string) => void;
	readonly cm: EditorView;
	destroy: () => void;
}

export function createEmbeddableEditor(
	app: App,
	container: HTMLElement,
	options: EmbeddableEditorOptions = {},
): EmbeddableEditorHandle {
	const Ctor = resolveEditorPrototype(app);

	const instance = new Ctor(app, container, {
		app,
		onMarkdownScroll: () => {},
		getMode: () => "source",
	});

	instance.owner.editMode = instance;
	instance.owner.editor = instance.editor;

	if (options.value) {
		instance.set(options.value);
	}

	// Guard workspace focus with one shared patch, even when several editors coexist.
	const workspaceFocus = registerWorkspaceFocusGuard(app, instance);
	instance.register(workspaceFocus.unregister);

	// Override buildLocalExtensions to add our extensions
	const originalBuild = instance.buildLocalExtensions.bind(instance);
	instance.buildLocalExtensions = (): Extension[] => {
		const extensions = originalBuild();

		if (options.placeholder) {
			extensions.push(cmPlaceholder(options.placeholder));
		}

		extensions.push(
			Prec.highest(
				keymap.of([
					{
						key: "Escape",
						run: () => {
							instance.editor.cm.contentDOM.blur();
							return true;
						},
						preventDefault: true,
					},
				]),
			),
		);

		return extensions;
	};

	// Set up change handler
	if (options.onChange) {
		const changeCallback = options.onChange;
		const originalOnUpdate = instance.onUpdate.bind(instance);
		instance.onUpdate = (update: unknown, changed: boolean) => {
			originalOnUpdate(update, changed);
			if (changed) {
				changeCallback(handle);
			}
		};
	}

	// Focus management
	const appScope = app.keymap;
	const editorOwner = instance.owner as unknown as MarkdownFileInfo;
	let previousActiveEditor: MarkdownFileInfo | null = null;
	let scopeActive = false;
	const activate = (): void => {
		workspaceFocus.setFocused(true);
		if (!scopeActive) {
			appScope?.pushScope?.(instance as unknown as Scope);
			scopeActive = true;
		}
		if (app.workspace.activeEditor !== editorOwner) {
			previousActiveEditor = app.workspace.activeEditor;
			app.workspace.activeEditor = editorOwner;
		}
	};
	const deactivate = (): void => {
		workspaceFocus.setFocused(false);
		if (scopeActive) {
			appScope?.popScope?.(instance as unknown as Scope);
			scopeActive = false;
		}
		if (app.workspace.activeEditor === editorOwner) {
			app.workspace.activeEditor = previousActiveEditor;
		}
		previousActiveEditor = null;
	};
	const handleBlur = (): void => {
		deactivate();
		if (instance._loaded) options.onBlur?.(handle);
	};
	instance.editor.cm.contentDOM.addEventListener("focusin", activate);
	instance.editor.cm.contentDOM.addEventListener("blur", handleBlur);
	instance.register(() => {
		instance.editor.cm.contentDOM.removeEventListener("focusin", activate);
		instance.editor.cm.contentDOM.removeEventListener("blur", handleBlur);
		deactivate();
	});

	if (options.cls) {
		instance.editorEl.classList.add(options.cls);
	}

	if (options.cursorLocation) {
		instance.editor.cm.dispatch({
			selection: EditorSelection.range(options.cursorLocation.anchor, options.cursorLocation.head),
		});
	}

	const handle: EmbeddableEditorHandle = {
		get value() {
			return instance.editor.cm.state.doc.toString();
		},
		set(content: string) {
			instance.set(content);
		},
		get cm() {
			return instance.editor.cm;
		},
		destroy() {
			if (instance._loaded) {
				instance.unload();
			}
			deactivate();
			container.innerHTML = "";
		},
	};

	return handle;
}
