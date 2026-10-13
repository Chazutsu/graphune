import { DropHandler } from "@/handlers/drop-handler";
import type { CanvasObserver } from "@/services/canvas-observer";
import type { CanvasOperator } from "@/services/canvas-operator";
import type { FileCreator } from "@/services/file-creator";
import type { PreviewBridge } from "@/services/preview-bridge";
import type { CanvasView } from "@/types/obsidian-canvas";
import { DEFAULT_SETTINGS, type GraphuneSettings } from "@/types/settings";
import * as obsidian from "obsidian";
import { App, TFile } from "obsidian";
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createMockDragEvent(data?: string): DragEvent {
	return {
		dataTransfer: data ? { getData: vi.fn().mockReturnValue(data) } : null,
		clientX: 100,
		clientY: 200,
	} as unknown as DragEvent;
}

function createMockCanvasView(): CanvasView {
	return {
		canvas: {
			getData: vi.fn().mockReturnValue({ nodes: [], edges: [] }),
			setData: vi.fn(),
			requestSave: vi.fn(),
			createFileNode: vi.fn(),
			selection: new Set(),
			posFromEvt: vi.fn().mockReturnValue({ x: 100, y: 200 }),
			tx: 0,
			ty: 0,
			tZoom: 1,
		},
		file: new TFile("test.canvas"),
	};
}

describe("DropHandler", () => {
	let handler: DropHandler;
	let app: App;
	let settings: GraphuneSettings;
	let canvasObserver: CanvasObserver;
	let canvasOperator: CanvasOperator;
	let fileCreator: FileCreator;
	let noticeSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		noticeSpy = vi.spyOn(obsidian, "Notice");
		app = new App();
		settings = { ...DEFAULT_SETTINGS };
		canvasObserver = {
			getActiveCanvasView: vi.fn().mockReturnValue(null),
			getSelectedNodes: vi.fn().mockReturnValue([]),
		} as unknown as CanvasObserver;
		canvasOperator = {
			addNodeToCanvas: vi.fn(),
		} as unknown as CanvasOperator;
		fileCreator = {
			createFile: vi.fn().mockResolvedValue(new TFile("new-file.md")),
		} as unknown as FileCreator;

		handler = new DropHandler(app, settings, canvasObserver, canvasOperator, fileCreator);
	});

	afterEach(() => {
		noticeSpy.mockRestore();
	});

	it("does nothing when no dataTransfer data", async () => {
		const evt = createMockDragEvent();
		await handler.handleCanvasDrop(evt);
		expect(canvasObserver.getActiveCanvasView).not.toHaveBeenCalled();
	});

	it("does nothing when JSON is invalid", async () => {
		const evt = createMockDragEvent("not json");
		await handler.handleCanvasDrop(evt);
		expect(canvasObserver.getActiveCanvasView).not.toHaveBeenCalled();
	});

	it("does nothing for unknown drag type", async () => {
		const data = JSON.stringify({ type: "unknown" });
		const evt = createMockDragEvent(data);
		await handler.handleCanvasDrop(evt);
		expect(canvasObserver.getActiveCanvasView).not.toHaveBeenCalled();
	});

	it.each([
		JSON.stringify(null),
		JSON.stringify({ type: "note-drag" }),
		JSON.stringify({ type: "note-drag", filePath: 42 }),
		JSON.stringify({ type: "text-selection-drag", filePath: "note.md", selectedText: 42 }),
	])("rejects malformed drag payloads before accessing the canvas", async (data) => {
		await handler.handleCanvasDrop(createMockDragEvent(data));
		expect(canvasObserver.getActiveCanvasView).not.toHaveBeenCalled();
	});

	describe("note drop", () => {
		it("adds file node to canvas on note-drag", async () => {
			const file = new TFile("notes/test.md");
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(file);
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			const data = JSON.stringify({ type: "note-drag", filePath: "notes/test.md" });
			const evt = createMockDragEvent(data);
			await handler.handleCanvasDrop(evt);

			expect(canvasOperator.addNodeToCanvas).toHaveBeenCalledWith(canvasView.canvas, file, {
				x: 100,
				y: 200,
			});
		});

		it("shows notice when source file not found", async () => {
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(null);
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			const data = JSON.stringify({ type: "note-drag", filePath: "missing.md" });
			const evt = createMockDragEvent(data);
			await handler.handleCanvasDrop(evt);

			expect(canvasOperator.addNodeToCanvas).not.toHaveBeenCalled();
		});

		it("does nothing when no active canvas", async () => {
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(null);
			const data = JSON.stringify({ type: "note-drag", filePath: "test.md" });
			const evt = createMockDragEvent(data);
			await handler.handleCanvasDrop(evt);

			expect(canvasOperator.addNodeToCanvas).not.toHaveBeenCalled();
		});

		it("shows error notice when addNodeToCanvas throws", async () => {
			const file = new TFile("notes/test.md");
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(file);
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);
			(canvasOperator.addNodeToCanvas as Mock).mockImplementation(() => {
				throw new Error("canvas error");
			});

			const data = JSON.stringify({ type: "note-drag", filePath: "notes/test.md" });
			const evt = createMockDragEvent(data);
			await handler.handleCanvasDrop(evt);

			expect(noticeSpy).toHaveBeenCalledWith("Failed to add note: canvas error");
		});
	});

	describe("text-selection drop", () => {
		const textSelectionDragData = {
			type: "text-selection-drag",
			filePath: "notes/article.md",
			selectedText: "This is the selected paragraph text.",
			title: "Selected Text",
		};

		it("creates file and adds node to canvas", async () => {
			const sourceFile = new TFile("notes/article.md");
			const newFile = new TFile("Selected-Text.md");
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(sourceFile);
			(fileCreator.createFile as Mock).mockResolvedValue(newFile);
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			const evt = createMockDragEvent(JSON.stringify(textSelectionDragData));
			await handler.handleCanvasDrop(evt);

			expect(fileCreator.createFile).toHaveBeenCalledWith(
				"Selected Text",
				"This is the selected paragraph text.",
				sourceFile,
				{ canvasPath: "test.canvas", sourceHeading: undefined },
			);
			expect(canvasOperator.addNodeToCanvas).toHaveBeenCalledWith(canvasView.canvas, newFile, {
				x: 100,
				y: 200,
			});
		});

		it("shows notice on success", async () => {
			const sourceFile = new TFile("notes/article.md");
			const newFile = new TFile("Selected-Text.md");
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(sourceFile);
			(fileCreator.createFile as Mock).mockResolvedValue(newFile);
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			const evt = createMockDragEvent(JSON.stringify(textSelectionDragData));
			await handler.handleCanvasDrop(evt);

			expect(noticeSpy).toHaveBeenCalledWith('Created "Selected-Text" on Canvas');
		});

		it("does nothing when no active canvas", async () => {
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(null);
			const evt = createMockDragEvent(JSON.stringify(textSelectionDragData));
			await handler.handleCanvasDrop(evt);

			expect(fileCreator.createFile).not.toHaveBeenCalled();
		});

		it("shows Notice when source file is not TFile", async () => {
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(null);
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			const evt = createMockDragEvent(JSON.stringify(textSelectionDragData));
			await handler.handleCanvasDrop(evt);

			expect(noticeSpy).toHaveBeenCalledWith("Source file not found");
			expect(fileCreator.createFile).not.toHaveBeenCalled();
		});

		it("shows error notice when createFile throws", async () => {
			const sourceFile = new TFile("notes/article.md");
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(sourceFile);
			(fileCreator.createFile as Mock).mockRejectedValue(new Error("create error"));
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			const evt = createMockDragEvent(JSON.stringify(textSelectionDragData));
			await handler.handleCanvasDrop(evt);

			expect(noticeSpy).toHaveBeenCalledWith("Failed to create note: create error");
		});

		it("calls requestPreview when showPreviewBeforeCreate and previewBridge", async () => {
			const previewBridge = {
				requestPreview: vi.fn().mockReturnValue(true),
			} as unknown as PreviewBridge;
			settings.showPreviewBeforeCreate = true;
			handler = new DropHandler(
				app,
				settings,
				canvasObserver,
				canvasOperator,
				fileCreator,
				previewBridge,
			);

			const sourceFile = new TFile("notes/article.md");
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(sourceFile);
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			const evt = createMockDragEvent(JSON.stringify(textSelectionDragData));
			await handler.handleCanvasDrop(evt);

			expect(previewBridge.requestPreview as Mock).toHaveBeenCalledWith(
				[
					{
						title: "Selected Text",
						filePath: "notes/article.md",
					},
				],
				["This is the selected paragraph text."],
				expect.any(Function),
				expect.any(Function),
			);
			expect(fileCreator.createFile).not.toHaveBeenCalled();
		});

		it("preview onConfirm creates node", async () => {
			const previewBridge = {
				requestPreview: vi.fn().mockReturnValue(true),
			} as unknown as PreviewBridge;
			settings.showPreviewBeforeCreate = true;
			handler = new DropHandler(
				app,
				settings,
				canvasObserver,
				canvasOperator,
				fileCreator,
				previewBridge,
			);

			const sourceFile = new TFile("notes/article.md");
			const newFile = new TFile("Selected-Text.md");
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(sourceFile);
			(fileCreator.createFile as Mock).mockResolvedValue(newFile);
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			const evt = createMockDragEvent(JSON.stringify(textSelectionDragData));
			await handler.handleCanvasDrop(evt);

			const onConfirm = (previewBridge.requestPreview as Mock).mock.calls[0][2] as (
				indices: number[],
			) => Promise<void>;
			await onConfirm([0]);

			expect(fileCreator.createFile).toHaveBeenCalledWith(
				"Selected Text",
				"This is the selected paragraph text.",
				sourceFile,
				{ canvasPath: "test.canvas", sourceHeading: undefined },
			);
		});

		it("preview onConfirm with empty indices does nothing", async () => {
			const previewBridge = {
				requestPreview: vi.fn().mockReturnValue(true),
			} as unknown as PreviewBridge;
			settings.showPreviewBeforeCreate = true;
			handler = new DropHandler(
				app,
				settings,
				canvasObserver,
				canvasOperator,
				fileCreator,
				previewBridge,
			);

			const sourceFile = new TFile("notes/article.md");
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(sourceFile);
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			const evt = createMockDragEvent(JSON.stringify(textSelectionDragData));
			await handler.handleCanvasDrop(evt);

			const onConfirm = (previewBridge.requestPreview as Mock).mock.calls[0][2] as (
				indices: number[],
			) => Promise<void>;
			await onConfirm([]);

			expect(fileCreator.createFile).not.toHaveBeenCalled();
		});

		it("derives title from first line when title is empty", async () => {
			const data = {
				type: "text-selection-drag",
				filePath: "notes/article.md",
				selectedText: "First line of text\nSecond line",
				title: "",
			};
			const sourceFile = new TFile("notes/article.md");
			const newFile = new TFile("First-line-of-text.md");
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(sourceFile);
			(fileCreator.createFile as Mock).mockResolvedValue(newFile);
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			const evt = createMockDragEvent(JSON.stringify(data));
			await handler.handleCanvasDrop(evt);

			expect(fileCreator.createFile).toHaveBeenCalledWith(
				"First line of text",
				"First line of text\nSecond line",
				sourceFile,
				{ canvasPath: "test.canvas", sourceHeading: undefined },
			);
		});

		it("truncates long derived title to 50 characters", async () => {
			const longText = "A".repeat(80);
			const data = {
				type: "text-selection-drag",
				filePath: "notes/article.md",
				selectedText: longText,
				title: "",
			};
			const sourceFile = new TFile("notes/article.md");
			const newFile = new TFile("truncated.md");
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(sourceFile);
			(fileCreator.createFile as Mock).mockResolvedValue(newFile);
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			const evt = createMockDragEvent(JSON.stringify(data));
			await handler.handleCanvasDrop(evt);

			const calledTitle = (fileCreator.createFile as Mock).mock.calls[0][0] as string;
			expect(calledTitle.length).toBeLessThanOrEqual(50);
		});
	});

	describe("canvas coordinate conversion via posFromEvt", () => {
		it("delegates coordinate conversion to canvas.posFromEvt", async () => {
			const file = new TFile("notes/test.md");
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(file);
			const canvasView = createMockCanvasView();
			(canvasView.canvas.posFromEvt as Mock).mockReturnValue({ x: 42, y: 99 });
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			const data = JSON.stringify({ type: "note-drag", filePath: "notes/test.md" });
			const evt = createMockDragEvent(data);
			await handler.handleCanvasDrop(evt);

			expect(canvasView.canvas.posFromEvt).toHaveBeenCalledWith(evt);
			expect(canvasOperator.addNodeToCanvas).toHaveBeenCalledWith(canvasView.canvas, file, {
				x: 42,
				y: 99,
			});
		});
	});
});
