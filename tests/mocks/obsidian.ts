import { vi } from "vitest";

export interface Pos {
	start: { line: number; col: number; offset: number };
	end: { line: number; col: number; offset: number };
}

export interface HeadingCache {
	heading: string;
	level: number;
	position: Pos;
}

export interface TagCache {
	tag: string;
}

export interface FrontMatterCache {
	position: Pos;
	[key: string]: unknown;
}

export interface CachedMetadata {
	headings?: HeadingCache[];
	tags?: TagCache[];
	frontmatter?: FrontMatterCache;
}

export const VIEW_TYPE_CANVAS = "canvas";
export const getLanguage = vi.fn(() => "en");
export const normalizePath = (path: string) => path.replaceAll(/\/{2,}/g, "/");

export class TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;
	parent: TFolder | null;
	stat: { ctime: number; mtime: number; size: number };

	constructor(path = "test.md") {
		this.path = path;
		this.name = path.split("/").pop() ?? path;
		this.basename = this.name.replace(/\.[^.]+$/, "");
		this.extension = this.name.split(".").pop() ?? "";
		this.parent = null;
		this.stat = { ctime: 0, mtime: 0, size: 0 };
	}
}

export class TFolder {
	path: string;
	name: string;
	children: (TFile | TFolder)[];

	constructor(path = "") {
		this.path = path;
		this.name = path.split("/").pop() ?? path;
		this.children = [];
	}
}

export class Vault {
	getAbstractFileByPath = vi.fn();
	getMarkdownFiles = vi.fn().mockReturnValue([]);
	getFiles = vi.fn().mockReturnValue([]);
	read = vi.fn().mockResolvedValue("");
	cachedRead = vi.fn().mockResolvedValue("");
	create = vi.fn().mockResolvedValue(new TFile());
	modify = vi.fn().mockResolvedValue(undefined);
	process = vi.fn().mockImplementation(async (_file: TFile, fn: (content: string) => string) => {
		const content = await this.read(_file);
		await this.modify(_file, fn(content));
	});
	delete = vi.fn().mockResolvedValue(undefined);
	createFolder = vi.fn().mockResolvedValue(undefined);
	on = vi.fn().mockReturnValue({ id: "vault-event-ref" });
	offref = vi.fn();
	adapter = {
		exists: vi.fn().mockResolvedValue(false),
		read: vi.fn().mockResolvedValue(""),
	};
	configDir = ".obsidian";
}

export class FileManager {
	processFrontMatter = vi
		.fn()
		.mockImplementation(
			async (_file: TFile, fn: (frontmatter: Record<string, unknown>) => void) => {
				const frontmatter: Record<string, unknown> = {};
				fn(frontmatter);
			},
		);
	renameFile = vi.fn().mockResolvedValue(undefined);
	trashFile = vi.fn().mockResolvedValue(undefined);
}

export class Workspace {
	getActiveViewOfType = vi.fn().mockReturnValue(null);
	getLeavesOfType = vi.fn().mockReturnValue([]);
	getMostRecentLeaf = vi.fn().mockReturnValue(null);
	on = vi.fn().mockReturnValue({ id: "workspace-event-ref" });
	offref = vi.fn();
	getRightLeaf = vi.fn().mockReturnValue({
		setViewState: vi.fn().mockResolvedValue(undefined),
	});
	revealLeaf = vi.fn();
	getLeaf = vi.fn().mockReturnValue({ openFile: vi.fn().mockResolvedValue(undefined) });
}

export class MarkdownView {
	file: TFile | null = null;
}

export class MetadataCache {
	resolvedLinks: Record<string, Record<string, number>> = {};
	getFileCache = vi.fn().mockReturnValue(null);
	on = vi.fn().mockReturnValue({ id: "metadata-event-ref" });
	offref = vi.fn();
}

export class App {
	vault: Vault;
	workspace: Workspace;
	metadataCache: MetadataCache;
	fileManager: FileManager;

	constructor() {
		this.vault = new Vault();
		this.workspace = new Workspace();
		this.metadataCache = new MetadataCache();
		this.fileManager = new FileManager();
	}
}

export class WorkspaceLeaf {
	setViewState = vi.fn().mockResolvedValue(undefined);
}

export abstract class Plugin {
	app: App;

	constructor(app?: App) {
		this.app = app ?? new App();
	}

	loadData = vi.fn().mockResolvedValue(null);
	saveData = vi.fn().mockResolvedValue(undefined);
	addRibbonIcon = vi.fn();
	addCommand = vi.fn();
	registerView = vi.fn();
	addSettingTab = vi.fn();
	registerDomEvent = vi.fn();
	registerEvent = vi.fn();
}

export abstract class ItemView {
	private _containerEl: HTMLElement | null = null;
	leaf: WorkspaceLeaf;

	get containerEl(): HTMLElement {
		if (!this._containerEl) {
			this._containerEl = document.createElement("div");
			const header = document.createElement("div");
			const content = document.createElement("div");
			(content as HTMLElement & { empty: () => void }).empty = vi.fn();
			this._containerEl.appendChild(header);
			this._containerEl.appendChild(content);
		}
		return this._containerEl;
	}

	constructor(leaf?: WorkspaceLeaf) {
		this.leaf = leaf ?? new WorkspaceLeaf();
	}

	abstract getViewType(): string;
	abstract getDisplayText(): string;

	onOpen = vi.fn().mockResolvedValue(undefined);
	onClose = vi.fn().mockResolvedValue(undefined);
}

export const MarkdownRenderer = {
	render: vi.fn().mockResolvedValue(undefined),
};

export class Component {
	static lastInstance: Component | null = null;
	load = vi.fn();
	unload = vi.fn();

	constructor() {
		Component.lastInstance = this;
	}
}

export class Notice {
	static lastInstance: Notice | null = null;

	message: string;

	constructor(message: string) {
		this.message = message;
		Notice.lastInstance = this;
	}
}

export class MenuItem {
	setTitle = vi.fn().mockReturnThis();
	setIcon = vi.fn().mockReturnThis();
	onClick = vi.fn().mockReturnThis();
}

export class Menu {
	static lastInstance: Menu | null = null;

	items: MenuItem[] = [];
	addItem = vi.fn().mockImplementation((cb: (item: MenuItem) => void) => {
		const item = new MenuItem();
		this.items.push(item);
		cb(item);
		return this;
	});
	showAtMouseEvent = vi.fn();

	constructor() {
		Menu.lastInstance = this;
	}
}

export class PluginSettingTab {
	app: App;
	private _containerEl: unknown;

	get containerEl(): HTMLElement & {
		empty: () => void;
		createEl: (tag: string, attrs?: Record<string, string>) => HTMLElement;
	} {
		if (!this._containerEl) {
			const el = document.createElement("div") as HTMLElement & {
				empty: () => void;
				createEl: (tag: string, attrs?: Record<string, string>) => HTMLElement;
			};
			el.empty = vi.fn(() => {
				el.innerHTML = "";
			});
			el.createEl = vi.fn((tag: string, _attrs?: Record<string, string>) => {
				const child = document.createElement(tag);
				el.appendChild(child);
				return child;
			});
			this._containerEl = el;
		}
		return this._containerEl as HTMLElement & {
			empty: () => void;
			createEl: (tag: string, attrs?: Record<string, string>) => HTMLElement;
		};
	}

	constructor(app: App, _plugin?: unknown) {
		this.app = app;
	}
}

export class Setting {
	private el: HTMLElement;

	constructor(containerEl: HTMLElement) {
		this.el = containerEl;
	}

	setName = vi.fn().mockReturnThis();
	setHeading = vi.fn().mockReturnThis();
	setDesc = vi.fn().mockReturnThis();
	addText = vi.fn().mockImplementation((cb: (text: Setting) => void) => {
		cb(this);
		return this;
	});
	addToggle = vi.fn().mockImplementation((cb: (toggle: Setting) => void) => {
		cb(this);
		return this;
	});
	addSlider = vi.fn().mockImplementation((cb: (slider: Setting) => void) => {
		cb(this);
		return this;
	});
	addDropdown = vi.fn().mockImplementation((cb: (dropdown: Setting) => void) => {
		cb(this);
		return this;
	});
	addOption = vi.fn().mockReturnThis();
	setValue = vi.fn().mockReturnThis();
	setPlaceholder = vi.fn().mockReturnThis();
	onChange = vi.fn().mockReturnThis();
	setDynamicTooltip = vi.fn().mockReturnThis();
	setLimits = vi.fn().mockReturnThis();
}
