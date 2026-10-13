import GraphunePlugin from "@/main";
import { DEFAULT_SETTINGS } from "@/types/settings";
import { HeadingExplorerView, VIEW_TYPE_HEADING_EXPLORER } from "@/views/heading-explorer-view";
import { App, Notice, TFile } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServices, services } = vi.hoisted(() => {
	const serviceRegistry = {
		fileCreator: {},
		canvasOperator: {},
		canvasObserver: {
			getActiveCanvasView: vi.fn().mockReturnValue(null),
			getSelectedNodes: vi.fn().mockReturnValue([]),
		},
		backlinkWriter: {},
		quickCardCreator: {},
		edgeSync: {
			configurePersistentState: vi.fn(),
			onCanvasCreated: vi.fn().mockResolvedValue(undefined),
			onCanvasModified: vi.fn().mockResolvedValue(undefined),
			initializeFromVault: vi.fn().mockResolvedValue(undefined),
			initializeFromCanvas: vi.fn().mockResolvedValue(undefined),
			reset: vi.fn(),
			onCanvasDeleted: vi.fn().mockResolvedValue(undefined),
			renameCanvas: vi.fn().mockResolvedValue(undefined),
		},
		previewBridge: {},
	};
	return { createServices: vi.fn(() => serviceRegistry), services: serviceRegistry };
});

vi.mock("@/services/service-registry", () => ({ createServices }));

describe("GraphunePlugin lifecycle", () => {
	let app: App;
	let plugin: GraphunePlugin;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
		plugin = new GraphunePlugin(app);
		plugin.loadData = vi.fn().mockResolvedValue(null);
	});

	it("propagates settings and recreated services to an existing heading explorer", async () => {
		const view = new HeadingExplorerView({} as never, app, DEFAULT_SETTINGS);
		const updateContext = vi.spyOn(view, "updateContext");
		app.workspace.getLeavesOfType = vi
			.fn()
			.mockImplementation((type: string) =>
				type === VIEW_TYPE_HEADING_EXPLORER ? [{ view }] : [],
			);
		await plugin.onload();
		const settingTab = plugin.addSettingTab.mock.calls[0]?.[0] as unknown as {
			onSettingsChange: (settings: typeof DEFAULT_SETTINGS) => void;
		};
		const settings = { ...DEFAULT_SETTINGS, defaultNodeWidth: 650 };

		settingTab.onSettingsChange(settings);

		expect(updateContext).toHaveBeenCalledWith(
			settings,
			services.canvasOperator,
			services.canvasObserver,
		);
	});

	it("handles an edge sync rejection from the vault modify listener", async () => {
		plugin.loadData = vi.fn().mockResolvedValue({ enableEdgeSync: true });
		services.edgeSync.onCanvasModified.mockRejectedValueOnce(new Error("write failed"));
		await plugin.onload();
		const modifyRegistration = app.vault.on.mock.calls.find(([event]) => event === "modify");
		const listener = modifyRegistration?.[1] as ((file: TFile) => void) | undefined;

		listener?.(new TFile("board.canvas"));
		await vi.waitFor(() => {
			expect(Notice.lastInstance?.message).toBe("Edge sync failed: write failed");
		});
	});

	it("updates canvas snapshots on vault rename and delete", async () => {
		await plugin.onload();
		const createRegistration = app.vault.on.mock.calls.find(([event]) => event === "create");
		const renameRegistration = app.vault.on.mock.calls.find(([event]) => event === "rename");
		const deleteRegistration = app.vault.on.mock.calls.find(([event]) => event === "delete");
		const renameListener = renameRegistration?.[1] as
			| ((file: TFile, oldPath: string) => void)
			| undefined;
		const deleteListener = deleteRegistration?.[1] as ((file: TFile) => void) | undefined;
		const createListener = createRegistration?.[1] as ((file: TFile) => void) | undefined;

		createListener?.(new TFile("created.canvas"));
		renameListener?.(new TFile("new.canvas"), "old.canvas");
		deleteListener?.(new TFile("new.canvas"));
		renameListener?.(new TFile("archived.txt"), "archived.canvas");

		expect(services.edgeSync.onCanvasCreated).toHaveBeenCalledWith(
			expect.objectContaining({ path: "created.canvas" }),
		);
		expect(services.edgeSync.renameCanvas).toHaveBeenCalledWith("old.canvas", "new.canvas");
		await vi.waitFor(() => {
			expect(services.edgeSync.onCanvasDeleted).toHaveBeenCalledWith("new.canvas");
			expect(services.edgeSync.onCanvasDeleted).toHaveBeenCalledWith("archived.canvas");
		});
	});

	it("makes commands and canvas listeners available before the initial vault scan settles", async () => {
		let finishScan: (() => void) | undefined;
		services.edgeSync.initializeFromVault.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				finishScan = resolve;
			}),
		);

		const loading = plugin.onload();
		await vi.waitFor(() => {
			expect(services.edgeSync.initializeFromVault).toHaveBeenCalledOnce();
		});
		await loading;
		expect(plugin.addCommand).toHaveBeenCalled();

		const createRegistration = app.vault.on.mock.calls.find(([event]) => event === "create");
		const createListener = createRegistration?.[1] as ((file: TFile) => void) | undefined;
		expect(createListener).toBeDefined();

		const createdDuringScan = new TFile("during-startup.canvas");
		createListener?.(createdDuringScan);
		expect(services.edgeSync.onCanvasCreated).toHaveBeenCalledWith(createdDuringScan);

		finishScan?.();
	});

	it("reinitializes the serialized edge sync after settings recreate services", async () => {
		const canvasFile = new TFile("board.canvas");
		services.canvasObserver.getActiveCanvasView.mockReturnValue({ file: canvasFile });
		await plugin.onload();
		services.edgeSync.initializeFromCanvas.mockClear();

		const replacementEdgeSync = {
			onCanvasModified: vi.fn().mockResolvedValue(undefined),
			initializeFromVault: vi.fn().mockResolvedValue(undefined),
			initializeFromCanvas: vi.fn().mockResolvedValue(undefined),
			reset: vi.fn(),
		};
		const replacementServices = {
			...services,
			canvasObserver: {
				getActiveCanvasView: vi.fn().mockReturnValue({ file: canvasFile }),
				getSelectedNodes: vi.fn().mockReturnValue([]),
			},
			edgeSync: replacementEdgeSync,
		};
		createServices.mockReturnValueOnce(replacementServices);
		const settingTab = plugin.addSettingTab.mock.calls[0]?.[0] as unknown as {
			onSettingsChange: (settings: typeof DEFAULT_SETTINGS) => void;
		};

		settingTab.onSettingsChange({ ...DEFAULT_SETTINGS, defaultNodeWidth: 650 });

		expect(services.edgeSync.reset).toHaveBeenCalledOnce();
		await vi.waitFor(() =>
			expect(services.edgeSync.initializeFromCanvas).toHaveBeenCalledWith(canvasFile),
		);
		expect(replacementEdgeSync.initializeFromCanvas).not.toHaveBeenCalled();
	});

	it("reports edge sync initialization failures after settings recreate services", async () => {
		const canvasFile = new TFile("board.canvas");
		await plugin.onload();
		services.edgeSync.initializeFromCanvas.mockRejectedValueOnce(new Error("read failed"));
		const replacementServices = {
			...services,
			canvasObserver: {
				getActiveCanvasView: vi.fn().mockReturnValue({ file: canvasFile }),
				getSelectedNodes: vi.fn().mockReturnValue([]),
			},
			edgeSync: {
				onCanvasModified: vi.fn().mockResolvedValue(undefined),
				initializeFromVault: vi.fn().mockResolvedValue(undefined),
				initializeFromCanvas: vi.fn().mockResolvedValue(undefined),
				reset: vi.fn(),
			},
		};
		createServices.mockReturnValueOnce(replacementServices);
		const settingTab = plugin.addSettingTab.mock.calls[0]?.[0] as unknown as {
			onSettingsChange: (settings: typeof DEFAULT_SETTINGS) => void;
		};

		settingTab.onSettingsChange({ ...DEFAULT_SETTINGS, defaultNodeWidth: 650 });

		await vi.waitFor(() => {
			expect(Notice.lastInstance?.message).toBe("Edge sync failed: read failed");
		});
	});

	it("serializes settings writes and coalesces rapid updates to the latest snapshot", async () => {
		let releaseFirst!: () => void;
		const firstWrite = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		plugin.saveData = vi.fn().mockReturnValueOnce(firstWrite).mockResolvedValue(undefined);
		await plugin.onload();
		const settingTab = plugin.addSettingTab.mock.calls[0]?.[0] as unknown as {
			onSettingsChange: (settings: typeof DEFAULT_SETTINGS) => void;
		};

		settingTab.onSettingsChange({ ...DEFAULT_SETTINGS, defaultNodeWidth: 450 });
		settingTab.onSettingsChange({ ...DEFAULT_SETTINGS, defaultNodeWidth: 500 });
		settingTab.onSettingsChange({ ...DEFAULT_SETTINGS, defaultNodeWidth: 550 });

		expect(plugin.saveData).toHaveBeenCalledTimes(1);
		expect(plugin.saveData).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ defaultNodeWidth: 450 }),
		);
		releaseFirst();
		await vi.waitFor(() => expect(plugin.saveData).toHaveBeenCalledTimes(2));
		expect(plugin.saveData).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ defaultNodeWidth: 550 }),
		);
	});

	it("drains a pending settings write after the in-flight write fails", async () => {
		let rejectFirst!: (error: Error) => void;
		const firstWrite = new Promise<void>((_resolve, reject) => {
			rejectFirst = reject;
		});
		plugin.saveData = vi.fn().mockReturnValueOnce(firstWrite).mockResolvedValue(undefined);
		await plugin.onload();
		const settingTab = plugin.addSettingTab.mock.calls[0]?.[0] as unknown as {
			onSettingsChange: (settings: typeof DEFAULT_SETTINGS) => void;
		};

		settingTab.onSettingsChange({ ...DEFAULT_SETTINGS, defaultNodeWidth: 450 });
		settingTab.onSettingsChange({ ...DEFAULT_SETTINGS, defaultNodeWidth: 500 });
		expect(plugin.saveData).toHaveBeenCalledTimes(1);
		rejectFirst(new Error("disk full"));

		await vi.waitFor(() => expect(plugin.saveData).toHaveBeenCalledTimes(2));
		expect(plugin.saveData).toHaveBeenLastCalledWith(
			expect.objectContaining({ defaultNodeWidth: 500 }),
		);
		await vi.waitFor(() => expect(Notice.lastInstance?.message).toBe("Save failed: disk full"));
	});

	it("retains a failed settings snapshot for a later retry", async () => {
		plugin.saveData = vi.fn().mockRejectedValueOnce(new Error("offline"));
		await plugin.onload();
		const saveSettings = (
			plugin as unknown as { saveSettings: () => Promise<void> }
		).saveSettings.bind(plugin);

		await expect(saveSettings()).rejects.toThrow("offline");
		expect(
			(plugin as unknown as { pendingSettingsSave: typeof DEFAULT_SETTINGS | null })
				.pendingSettingsSave,
		).toEqual({
			...DEFAULT_SETTINGS,
			edgeSyncPendingDeletions: [],
			edgeSyncPendingRepairs: [],
		});

		plugin.saveData = vi.fn().mockResolvedValue(undefined);
		await saveSettings();
		expect(plugin.saveData).toHaveBeenCalledWith({
			...DEFAULT_SETTINGS,
			edgeSyncPendingDeletions: [],
			edgeSyncPendingRepairs: [],
		});
		expect(
			(plugin as unknown as { pendingSettingsSave: typeof DEFAULT_SETTINGS | null })
				.pendingSettingsSave,
		).toBeNull();
	});
});
