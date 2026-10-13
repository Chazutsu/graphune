import { CanvasEventHandler } from "@/handlers/canvas-event-handler";
import { CommandHandler } from "@/handlers/command-handler";
import { DropHandler } from "@/handlers/drop-handler";
import { setLocale, t } from "@/i18n";
import { type Services, createServices } from "@/services/service-registry";
import { loadLegacyGraphuneData } from "@/services/legacy-settings-migration";
import type {
	EdgeSyncPersistentState,
	PendingCanvasDeletion,
	PendingConnectionRepair,
} from "@/services/edge-sync";
import { SettingTab } from "@/settings/setting-tab";
import { DEFAULT_SETTINGS, type GraphuneSettings } from "@/types/settings";
import { notifyError } from "@/utils/notify-error";
import { HeadingExplorerView, VIEW_TYPE_HEADING_EXPLORER } from "@/views/heading-explorer-view";
import { getLanguage, Plugin, TFile, type WorkspaceLeaf } from "obsidian";

type StoredGraphuneData = GraphuneSettings & {
	edgeSyncPendingDeletions?: PendingCanvasDeletion[];
	edgeSyncPendingRepairs?: PendingConnectionRepair[];
};

function reportEdgeSyncOperation(operation: Promise<void>): void {
	void operation.catch((error) => notifyError(t("notice.edgeSyncFailed"), error));
}

export default class GraphunePlugin extends Plugin {
	settings: GraphuneSettings = DEFAULT_SETTINGS;
	private services!: Services;
	private dropHandler!: DropHandler;
	private commandHandler!: CommandHandler;
	private canvasEventHandler!: CanvasEventHandler;
	private pendingEdgeDeletions: PendingCanvasDeletion[] = [];
	private pendingEdgeRepairs: PendingConnectionRepair[] = [];
	private pendingSettingsSave: StoredGraphuneData | null = null;
	private settingsSaveQueue: Promise<void> | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		const systemLocale = typeof getLanguage === "function" ? getLanguage() : navigator.language;
		setLocale(this.settings.language, systemLocale);
		this.initializeServices();
		this.services.edgeSync.configurePersistentState(
			this.edgeSyncPersistentState(),
			async (state) => {
				this.pendingEdgeDeletions = state.pendingDeletions;
				this.pendingEdgeRepairs = state.pendingRepairs;
				await this.saveSettings();
			},
		);
		this.registerEdgeSyncVaultEvents();

		this.registerView(VIEW_TYPE_HEADING_EXPLORER, (leaf: WorkspaceLeaf) => {
			return new HeadingExplorerView(
				leaf,
				this.app,
				this.settings,
				this.services.canvasOperator,
				this.services.canvasObserver,
			);
		});

		this.addRibbonIcon("list-tree", t("view.headingExplorer"), () => {
			this.activateView();
		});

		this.addSettingTab(
			new SettingTab(this.app, this, this.settings, (newSettings) => {
				const edgeSync = this.services.edgeSync;
				edgeSync.reset();
				this.settings = newSettings;
				this.initializeServices(edgeSync);
				this.updateHeadingExplorerViews();
				if (newSettings.enableEdgeSync) {
					void edgeSync
						.initializeFromVault()
						.then(() => this.initializeEdgeSync())
						.catch((error) => notifyError(t("notice.edgeSyncFailed"), error));
				}
				void this.saveSettings().catch((error) => notifyError(t("article.saveFailed"), error));
			}),
		);

		this.registerDomEvent(document, "drop", (evt: DragEvent) => {
			this.dropHandler.handleCanvasDrop(evt);
		});

		this.addCommand({
			id: "connect-selected-nodes",
			name: t("command.connect"),
			callback: () => {
				this.commandHandler.connectSelectedNodes();
			},
		});

		this.addCommand({
			id: "group-selected-nodes",
			name: t("command.group"),
			callback: () => {
				this.commandHandler.groupSelectedNodes();
			},
		});

		this.addCommand({
			id: "align-selected-nodes-left",
			name: t("command.alignLeft"),
			callback: () => this.commandHandler.alignSelectedNodesLeft(),
		});

		this.addCommand({
			id: "align-selected-nodes-top",
			name: t("command.alignTop"),
			callback: () => this.commandHandler.alignSelectedNodesTop(),
		});

		this.addCommand({
			id: "distribute-selected-nodes-horizontally",
			name: t("command.distributeHorizontal"),
			callback: () => this.commandHandler.distributeSelectedNodesHorizontally(),
		});

		this.addCommand({
			id: "distribute-selected-nodes-vertically",
			name: t("command.distributeVertical"),
			callback: () => this.commandHandler.distributeSelectedNodesVertically(),
		});

		this.addCommand({
			id: "undo-last-canvas-change",
			name: t("command.undo"),
			callback: () => {
				this.commandHandler.undoLastCanvasChange();
			},
		});

		this.addCommand({
			id: "redo-last-canvas-change",
			name: t("command.redo"),
			callback: () => {
				this.commandHandler.redoLastCanvasChange();
			},
		});

		this.addCommand({
			id: "create-new-card",
			name: t("command.createCard"),
			callback: () => {
				this.canvasEventHandler.createNewCardInViewport();
			},
		});

		this.registerDomEvent(document, "dblclick", (evt: MouseEvent) => {
			this.canvasEventHandler.handleCanvasDblClick(evt);
		});

		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			if (!(evt.target instanceof Element) || !evt.target.closest(".canvas-node")) return;
			window.setTimeout(() => void this.openSelectedCanvasFile(), 0);
		});

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.initializeEdgeSync();
			}),
		);

		if (this.settings.enableEdgeSync) {
			reportEdgeSyncOperation(this.services.edgeSync.initializeFromVault());
		}
		this.initializeEdgeSync();
	}

	onunload(): void {
		this.services.edgeSync.reset();
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_HEADING_EXPLORER)) {
			leaf.detach();
		}
	}

	private registerEdgeSyncVaultEvents(): void {
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (
					this.settings.enableEdgeSync &&
					file instanceof TFile &&
					file.path.endsWith(".canvas")
				) {
					reportEdgeSyncOperation(this.services.edgeSync.onCanvasCreated(file));
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (
					this.settings.enableEdgeSync &&
					file instanceof TFile &&
					file.path.endsWith(".canvas")
				) {
					reportEdgeSyncOperation(this.services.edgeSync.onCanvasModified(file));
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (
					this.settings.enableEdgeSync &&
					file instanceof TFile &&
					file.path.endsWith(".canvas")
				) {
					reportEdgeSyncOperation(this.services.edgeSync.onCanvasDeleted(file.path));
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (
					!this.settings.enableEdgeSync ||
					!(file instanceof TFile) ||
					!oldPath.endsWith(".canvas")
				)
					return;
				reportEdgeSyncOperation(
					file.path.endsWith(".canvas")
						? this.services.edgeSync.renameCanvas(oldPath, file.path)
						: this.services.edgeSync.onCanvasDeleted(oldPath),
				);
			}),
		);
	}

	private initializeServices(edgeSync?: Services["edgeSync"]): void {
		this.services = createServices(this.app, this.settings);
		if (edgeSync) this.services.edgeSync = edgeSync;
		this.dropHandler = new DropHandler(
			this.app,
			this.settings,
			this.services.canvasObserver,
			this.services.canvasOperator,
			this.services.fileCreator,
			this.services.previewBridge,
		);
		this.commandHandler = new CommandHandler(
			this.settings,
			this.services.canvasObserver,
			this.services.canvasOperator,
		);
		this.canvasEventHandler = new CanvasEventHandler(
			this.settings,
			this.services.canvasObserver,
			this.services.quickCardCreator,
			(file) => this.openFileInArticle(file.path, true),
		);
	}

	private initializeEdgeSync(): void {
		const canvasView = this.services.canvasObserver.getActiveCanvasView();
		if (canvasView) {
			void this.services.edgeSync
				.initializeFromCanvas(canvasView.file)
				.catch((error) => notifyError(t("notice.edgeSyncFailed"), error));
		}
	}

	private updateHeadingExplorerViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_HEADING_EXPLORER)) {
			if (leaf.view instanceof HeadingExplorerView) {
				leaf.view.updateContext(
					this.settings,
					this.services.canvasOperator,
					this.services.canvasObserver,
				);
			}
		}
	}

	private async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_HEADING_EXPLORER);
		const first = existing[0];
		if (first) {
			this.app.workspace.revealLeaf(first);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_HEADING_EXPLORER,
				active: true,
			});
			this.app.workspace.revealLeaf(leaf);
		}
	}

	private async openSelectedCanvasFile(): Promise<void> {
		const selectedNodes = this.services.canvasObserver.getSelectedNodes();
		if (selectedNodes.length !== 1 || !selectedNodes[0]?.file) return;

		await this.openFileInArticle(selectedNodes[0].file.path, false);
	}

	private async openFileInArticle(filePath: string, focusTitle: boolean): Promise<void> {
		await this.activateView();
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_HEADING_EXPLORER)[0];
		const view = leaf?.view;
		if (view instanceof HeadingExplorerView) view.openFile(filePath, { focusTitle });
	}

	private async loadSettings(): Promise<void> {
		let data = (await this.loadData()) as Partial<StoredGraphuneData> | null;
		if (!data) {
			data = (await loadLegacyGraphuneData(
				this.app.vault.adapter,
				this.app.vault.configDir,
			)) as Partial<StoredGraphuneData> | null;
			if (data) await this.saveData(data);
		}
		const { edgeSyncPendingDeletions, edgeSyncPendingRepairs, ...settings } = data ?? {};
		this.pendingEdgeDeletions = normalizePendingDeletions(edgeSyncPendingDeletions);
		this.pendingEdgeRepairs = normalizePendingRepairs(edgeSyncPendingRepairs);
		this.settings = { ...DEFAULT_SETTINGS, ...settings };
	}

	private edgeSyncPersistentState(): EdgeSyncPersistentState {
		return {
			pendingDeletions: structuredClone(this.pendingEdgeDeletions),
			pendingRepairs: structuredClone(this.pendingEdgeRepairs),
		};
	}

	private async saveSettings(): Promise<void> {
		this.pendingSettingsSave = {
			...this.settings,
			edgeSyncPendingDeletions: structuredClone(this.pendingEdgeDeletions),
			edgeSyncPendingRepairs: structuredClone(this.pendingEdgeRepairs),
		};
		if (this.settingsSaveQueue) return this.settingsSaveQueue;

		const drain = async (): Promise<void> => {
			let firstError: unknown;
			while (this.pendingSettingsSave) {
				const settings = this.pendingSettingsSave;
				this.pendingSettingsSave = null;
				try {
					await this.saveData(settings);
				} catch (error) {
					firstError ??= error;
					if (!this.pendingSettingsSave) {
						this.pendingSettingsSave = settings;
						break;
					}
				}
			}
			if (firstError) throw firstError;
		};
		const queue = drain().finally(() => {
			if (this.settingsSaveQueue === queue) this.settingsSaveQueue = null;
		});
		this.settingsSaveQueue = queue;
		return queue;
	}
}

function normalizePendingDeletions(value: unknown): PendingCanvasDeletion[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((candidate) => {
		if (!candidate || typeof candidate !== "object") return [];
		const canvasPath = Reflect.get(candidate, "canvasPath");
		const connections = Reflect.get(candidate, "connections");
		if (typeof canvasPath !== "string" || !Array.isArray(connections)) return [];
		const validConnections = connections.flatMap((connection) => {
			if (!connection || typeof connection !== "object") return [];
			const from = Reflect.get(connection, "from");
			const to = Reflect.get(connection, "to");
			return typeof from === "string" && typeof to === "string" ? [{ from, to }] : [];
		});
		const fingerprint = Reflect.get(candidate, "fingerprint");
		return validConnections.length > 0
			? [
					{
						canvasPath,
						fingerprint: typeof fingerprint === "string" ? fingerprint : "",
						connections: validConnections,
					},
				]
			: [];
	});
}

function normalizePendingRepairs(value: unknown): PendingConnectionRepair[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((candidate) => {
		if (!candidate || typeof candidate !== "object") return [];
		const id = Reflect.get(candidate, "id");
		const connection = Reflect.get(candidate, "connection");
		const mode = Reflect.get(candidate, "mode");
		const phase = Reflect.get(candidate, "phase");
		if (
			typeof id !== "string" ||
			!connection ||
			typeof connection !== "object" ||
			(mode !== "add" && mode !== "remove") ||
			(phase !== "apply" && phase !== "rollback")
		)
			return [];
		const from = Reflect.get(connection, "from");
		const to = Reflect.get(connection, "to");
		return typeof from === "string" && typeof to === "string"
			? [{ id, connection: { from, to }, mode, phase }]
			: [];
	});
}
