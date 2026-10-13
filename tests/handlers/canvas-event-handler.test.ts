import { CanvasEventHandler } from "@/handlers/canvas-event-handler";
import type { CanvasObserver } from "@/services/canvas-observer";
import type { QuickCardCreator } from "@/services/quick-card-creator";
import type { CanvasView } from "@/types/obsidian-canvas";
import { DEFAULT_SETTINGS, type GraphuneSettings } from "@/types/settings";
import * as obsidian from "obsidian";
import { TFile } from "obsidian";
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function createMockMouseEvent(overrides: Partial<MouseEvent> = {}): MouseEvent {
	const canvasWrapper = document.createElement("div");
	canvasWrapper.classList.add("canvas-wrapper");

	const target = document.createElement("div");
	canvasWrapper.appendChild(target);

	return {
		metaKey: true,
		ctrlKey: false,
		clientX: 100,
		clientY: 200,
		target,
		...overrides,
	} as unknown as MouseEvent;
}

describe("CanvasEventHandler", () => {
	let handler: CanvasEventHandler;
	let settings: GraphuneSettings;
	let canvasObserver: CanvasObserver;
	let quickCardCreator: QuickCardCreator;
	let noticeSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		noticeSpy = vi.spyOn(obsidian, "Notice");
		settings = { ...DEFAULT_SETTINGS };
		canvasObserver = {
			getActiveCanvasView: vi.fn().mockReturnValue(null),
		} as unknown as CanvasObserver;
		quickCardCreator = {
			createCardAtPosition: vi.fn().mockResolvedValue({
				file: new TFile("Untitled.md"),
				node: { id: "node-1", x: 0, y: 0, width: 400, height: 300 },
			}),
		} as unknown as QuickCardCreator;
		handler = new CanvasEventHandler(settings, canvasObserver, quickCardCreator);
	});

	afterEach(() => {
		noticeSpy.mockRestore();
		document.body.innerHTML = "";
	});

	describe("handleCanvasDblClick", () => {
		it("does nothing when neither metaKey nor ctrlKey is pressed", async () => {
			const evt = createMockMouseEvent({ metaKey: false, ctrlKey: false });
			await handler.handleCanvasDblClick(evt);
			expect(canvasObserver.getActiveCanvasView).not.toHaveBeenCalled();
		});

		it("does nothing when canvasView is null but target is in canvas-wrapper", async () => {
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(null);
			const evt = createMockMouseEvent();
			await handler.handleCanvasDblClick(evt);
			expect(quickCardCreator.createCardAtPosition).not.toHaveBeenCalled();
		});

		it("does nothing when target is not in canvas-wrapper", async () => {
			const target = document.createElement("div");
			const evt = {
				metaKey: true,
				ctrlKey: false,
				target,
			} as unknown as MouseEvent;
			await handler.handleCanvasDblClick(evt);
			expect(canvasObserver.getActiveCanvasView).not.toHaveBeenCalled();
		});

		it("does nothing when target is a canvas-node", async () => {
			const canvasWrapper = document.createElement("div");
			canvasWrapper.classList.add("canvas-wrapper");
			const canvasNode = document.createElement("div");
			canvasNode.classList.add("canvas-node");
			canvasWrapper.appendChild(canvasNode);
			const target = document.createElement("div");
			canvasNode.appendChild(target);

			const evt = {
				metaKey: true,
				ctrlKey: false,
				target,
			} as unknown as MouseEvent;
			await handler.handleCanvasDblClick(evt);
			expect(canvasObserver.getActiveCanvasView).not.toHaveBeenCalled();
		});

		it("creates card on canvas when metaKey + dblclick on empty canvas area", async () => {
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			const evt = createMockMouseEvent();
			await handler.handleCanvasDblClick(evt);

			expect(quickCardCreator.createCardAtPosition).toHaveBeenCalledWith(
				canvasView.canvas,
				canvasView.file,
				{ x: -100, y: 50 },
				"Untitled",
			);
		});

		it("creates card on canvas when ctrlKey + dblclick", async () => {
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			const evt = createMockMouseEvent({ metaKey: false, ctrlKey: true });
			await handler.handleCanvasDblClick(evt);

			expect(quickCardCreator.createCardAtPosition).toHaveBeenCalled();
		});

		it("opens the created card for editing", async () => {
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);
			const onCardCreated = vi.fn();
			handler = new CanvasEventHandler(settings, canvasObserver, quickCardCreator, onCardCreated);

			await handler.handleCanvasDblClick(createMockMouseEvent());

			expect(onCardCreated).toHaveBeenCalledWith(expect.objectContaining({ path: "Untitled.md" }));
		});

		it("keeps the created card when opening its editor fails", async () => {
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);
			handler = new CanvasEventHandler(settings, canvasObserver, quickCardCreator, () => {
				throw new Error("view failure");
			});

			await handler.handleCanvasDblClick(createMockMouseEvent());

			expect(noticeSpy).toHaveBeenCalledWith(
				"Card created, but the editor could not be opened: view failure",
			);
		});

		it("shows error notice when createCardAtPosition throws", async () => {
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);
			(quickCardCreator.createCardAtPosition as Mock).mockRejectedValue(new Error("card error"));

			const evt = createMockMouseEvent();
			await handler.handleCanvasDblClick(evt);

			expect(noticeSpy).toHaveBeenCalledWith("Failed to create card: card error");
		});
	});

	describe("createNewCardInViewport", () => {
		it("does nothing when no active canvas", async () => {
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(null);
			await handler.createNewCardInViewport();
			expect(quickCardCreator.createCardAtPosition).not.toHaveBeenCalled();
		});

		it("falls back to the origin when the Canvas element is unavailable", async () => {
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			await handler.createNewCardInViewport();

			expect(quickCardCreator.createCardAtPosition).toHaveBeenCalledWith(
				canvasView.canvas,
				canvasView.file,
				{ x: 0, y: 0 },
				"Untitled",
			);
		});

		it("creates a card centered in the visible Canvas", async () => {
			const canvasView = createMockCanvasView();
			canvasView.canvas.posFromEvt = vi.fn((event: MouseEvent | DragEvent) => ({
				x: event.clientX,
				y: event.clientY,
			}));
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);
			const activeLeaf = document.createElement("div");
			activeLeaf.className = "workspace-leaf mod-active";
			const wrapper = document.createElement("div");
			wrapper.className = "canvas-wrapper";
			wrapper.getBoundingClientRect = () =>
				({ left: 10, top: 20, width: 800, height: 600 }) as DOMRect;
			activeLeaf.appendChild(wrapper);
			document.body.appendChild(activeLeaf);

			await handler.createNewCardInViewport();

			expect(quickCardCreator.createCardAtPosition).toHaveBeenCalledWith(
				canvasView.canvas,
				canvasView.file,
				{ x: 210, y: 170 },
				"Untitled",
			);
		});

		it("shows error notice when createCardAtPosition throws", async () => {
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);
			(quickCardCreator.createCardAtPosition as Mock).mockRejectedValue(new Error("origin error"));

			await handler.createNewCardInViewport();

			expect(noticeSpy).toHaveBeenCalledWith("Failed to create card: origin error");
		});
	});
});
