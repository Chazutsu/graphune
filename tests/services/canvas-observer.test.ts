import { CanvasObserver } from "@/services/canvas-observer";
import type { Canvas, CanvasNode, CanvasView } from "@/types/obsidian-canvas";
import { App, TFile } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createMockCanvasView(selectedNodes: CanvasNode[] = []): CanvasView {
	const canvas: Canvas = {
		getData: vi.fn().mockReturnValue({ nodes: [], edges: [] }),
		setData: vi.fn(),
		requestSave: vi.fn(),
		createFileNode: vi.fn(),
		selection: new Set(selectedNodes),
	};
	return {
		canvas,
		file: new TFile("test.canvas"),
	};
}

function createMockNode(id: string, x = 0, y = 0): CanvasNode {
	return { id, x, y, width: 400, height: 300 };
}

describe("CanvasObserver", () => {
	let app: App;
	let observer: CanvasObserver;

	beforeEach(() => {
		app = new App();
		observer = new CanvasObserver(app);
	});

	describe("getActiveCanvasView", () => {
		it("returns null when no canvas is open", () => {
			app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);
			expect(observer.getActiveCanvasView()).toBeNull();
		});

		it("returns null when view has no canvas property", () => {
			app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: {} }]);
			expect(observer.getActiveCanvasView()).toBeNull();
		});

		it("returns the canvas view when canvas is open", () => {
			const canvasView = createMockCanvasView();
			app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);

			const result = observer.getActiveCanvasView();
			expect(result).toBe(canvasView);
		});

		it("returns the most recently active Canvas when several are open", () => {
			const first = { view: createMockCanvasView() };
			const second = { view: createMockCanvasView() };
			app.workspace.getLeavesOfType = vi.fn().mockReturnValue([first, second]);
			app.workspace.getMostRecentLeaf = vi.fn().mockReturnValue(second);

			expect(observer.getActiveCanvasView()).toBe(second.view);
		});

		it("does not guess a target when several Canvases are open without recent activity", () => {
			app.workspace.getLeavesOfType = vi
				.fn()
				.mockReturnValue([{ view: createMockCanvasView() }, { view: createMockCanvasView() }]);

			expect(observer.getActiveCanvasView()).toBeNull();
		});
	});

	describe("getSelectedNodes", () => {
		it("returns empty array when no canvas is open", () => {
			app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);
			expect(observer.getSelectedNodes()).toEqual([]);
		});

		it("returns empty array when no nodes are selected", () => {
			const canvasView = createMockCanvasView([]);
			app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);

			expect(observer.getSelectedNodes()).toEqual([]);
		});

		it("returns selected nodes", () => {
			const node1 = createMockNode("node-1", 0, 0);
			const node2 = createMockNode("node-2", 500, 0);
			const canvasView = createMockCanvasView([node1, node2]);
			app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);

			const selected = observer.getSelectedNodes();
			expect(selected).toHaveLength(2);
			expect(selected).toContain(node1);
			expect(selected).toContain(node2);
		});
	});

	describe("getSelectedNodes returns empty when selection is undefined", () => {
		it("handles canvas without selection property", () => {
			const canvas: Canvas = {
				getData: vi.fn().mockReturnValue({ nodes: [], edges: [] }),
				setData: vi.fn(),
				requestSave: vi.fn(),
				createFileNode: vi.fn(),
			};
			const canvasView: CanvasView = {
				canvas,
				file: new TFile("test.canvas"),
			};
			app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);

			expect(observer.getSelectedNodes()).toEqual([]);
		});
	});
});
