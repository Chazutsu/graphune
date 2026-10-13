import { CommandHandler } from "@/handlers/command-handler";
import type { CanvasObserver } from "@/services/canvas-observer";
import type { CanvasOperator } from "@/services/canvas-operator";
import type { CanvasNode, CanvasView } from "@/types/obsidian-canvas";
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
			tx: 0,
			ty: 0,
			tZoom: 1,
		},
		file: new TFile("test.canvas"),
	};
}

describe("CommandHandler", () => {
	let handler: CommandHandler;
	let settings: GraphuneSettings;
	let canvasObserver: CanvasObserver;
	let canvasOperator: CanvasOperator;
	let noticeSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		noticeSpy = vi.spyOn(obsidian, "Notice");
		settings = { ...DEFAULT_SETTINGS, defaultEdgeColor: "1", defaultEdgeLabel: "relates" };
		canvasObserver = {
			getActiveCanvasView: vi.fn().mockReturnValue(null),
			getSelectedNodes: vi.fn().mockReturnValue([]),
		} as unknown as CanvasObserver;
		canvasOperator = {
			addEdgeToCanvas: vi.fn(),
			addGroupToCanvas: vi.fn(),
			arrangeNodes: vi.fn().mockReturnValue(true),
		} as unknown as CanvasOperator;
		handler = new CommandHandler(settings, canvasObserver, canvasOperator);
	});

	afterEach(() => {
		noticeSpy.mockRestore();
	});

	describe("connectSelectedNodes", () => {
		it("shows notice when not exactly 2 nodes selected", () => {
			(canvasObserver.getSelectedNodes as Mock).mockReturnValue([]);
			handler.connectSelectedNodes();
			expect(noticeSpy).toHaveBeenCalledWith("Select exactly 2 nodes to connect");
		});

		it("shows notice when 1 node selected", () => {
			const node: CanvasNode = { id: "n1", x: 0, y: 0, width: 400, height: 300 };
			(canvasObserver.getSelectedNodes as Mock).mockReturnValue([node]);
			handler.connectSelectedNodes();
			expect(noticeSpy).toHaveBeenCalledWith("Select exactly 2 nodes to connect");
		});

		it("rejects a duplicated node selection", () => {
			const first: CanvasNode = { id: "n1", x: 0, y: 0, width: 400, height: 300 };
			const second: CanvasNode = { id: "n1", x: 500, y: 0, width: 400, height: 300 };
			(canvasObserver.getSelectedNodes as Mock).mockReturnValue([first, second]);

			handler.connectSelectedNodes();

			expect(noticeSpy).toHaveBeenCalledWith("Select two different nodes to connect");
			expect(canvasOperator.addEdgeToCanvas).not.toHaveBeenCalled();
		});

		it("does nothing when no active canvas", () => {
			const n1: CanvasNode = { id: "n1", x: 0, y: 0, width: 400, height: 300 };
			const n2: CanvasNode = { id: "n2", x: 500, y: 0, width: 400, height: 300 };
			(canvasObserver.getSelectedNodes as Mock).mockReturnValue([n1, n2]);
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(null);
			handler.connectSelectedNodes();
			expect(canvasOperator.addEdgeToCanvas).not.toHaveBeenCalled();
		});

		it("adds edge between 2 selected nodes", () => {
			const n1: CanvasNode = { id: "n1", x: 0, y: 0, width: 400, height: 300 };
			const n2: CanvasNode = { id: "n2", x: 500, y: 0, width: 400, height: 300 };
			(canvasObserver.getSelectedNodes as Mock).mockReturnValue([n1, n2]);
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			handler.connectSelectedNodes();

			expect(canvasOperator.addEdgeToCanvas).toHaveBeenCalledWith(canvasView.canvas, {
				fromNode: "n1",
				toNode: "n2",
				color: "1",
				label: "relates",
			});
		});

		it("passes undefined for empty edge color and label", () => {
			settings.defaultEdgeColor = "";
			settings.defaultEdgeLabel = "";
			handler = new CommandHandler(settings, canvasObserver, canvasOperator);

			const n1: CanvasNode = { id: "n1", x: 0, y: 0, width: 400, height: 300 };
			const n2: CanvasNode = { id: "n2", x: 500, y: 0, width: 400, height: 300 };
			(canvasObserver.getSelectedNodes as Mock).mockReturnValue([n1, n2]);
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			handler.connectSelectedNodes();

			expect(canvasOperator.addEdgeToCanvas).toHaveBeenCalledWith(canvasView.canvas, {
				fromNode: "n1",
				toNode: "n2",
				color: undefined,
				label: undefined,
			});
		});
	});

	describe("groupSelectedNodes", () => {
		it("shows notice when no nodes selected", () => {
			(canvasObserver.getSelectedNodes as Mock).mockReturnValue([]);
			handler.groupSelectedNodes();
			expect(noticeSpy).toHaveBeenCalledWith("Select at least 1 node to group");
		});

		it("does nothing when no active canvas", () => {
			const node: CanvasNode = { id: "n1", x: 0, y: 0, width: 400, height: 300 };
			(canvasObserver.getSelectedNodes as Mock).mockReturnValue([node]);
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(null);
			handler.groupSelectedNodes();
			expect(canvasOperator.addGroupToCanvas).not.toHaveBeenCalled();
		});

		it("groups selected nodes", () => {
			const node: CanvasNode = { id: "n1", x: 0, y: 0, width: 400, height: 300 };
			(canvasObserver.getSelectedNodes as Mock).mockReturnValue([node]);
			const canvasView = createMockCanvasView();
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			handler.groupSelectedNodes();

			expect(canvasOperator.addGroupToCanvas).toHaveBeenCalledWith(canvasView.canvas, [node]);
		});
	});

	describe("layout commands", () => {
		const nodes: CanvasNode[] = [
			{ id: "n1", x: 0, y: 0, width: 100, height: 100 },
			{ id: "n2", x: 200, y: 100, width: 100, height: 100 },
			{ id: "n3", x: 500, y: 300, width: 100, height: 100 },
		];

		it("requires two nodes for alignment", () => {
			(canvasObserver.getSelectedNodes as Mock).mockReturnValue(nodes.slice(0, 1));

			handler.alignSelectedNodesLeft();

			expect(noticeSpy).toHaveBeenCalledWith("Select at least 2 nodes to arrange");
			expect(canvasOperator.arrangeNodes).not.toHaveBeenCalled();
		});

		it("aligns selected nodes to the left", () => {
			const canvasView = createMockCanvasView();
			(canvasObserver.getSelectedNodes as Mock).mockReturnValue(nodes.slice(0, 2));
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			handler.alignSelectedNodesLeft();

			expect(canvasOperator.arrangeNodes).toHaveBeenCalledWith(
				canvasView.canvas,
				["n1", "n2"],
				"align-left",
			);
		});

		it("requires three nodes for distribution", () => {
			(canvasObserver.getSelectedNodes as Mock).mockReturnValue(nodes.slice(0, 2));

			handler.distributeSelectedNodesHorizontally();

			expect(noticeSpy).toHaveBeenCalledWith("Select at least 3 nodes to arrange");
			expect(canvasOperator.arrangeNodes).not.toHaveBeenCalled();
		});

		it("distributes selected nodes vertically", () => {
			const canvasView = createMockCanvasView();
			(canvasObserver.getSelectedNodes as Mock).mockReturnValue(nodes);
			(canvasObserver.getActiveCanvasView as Mock).mockReturnValue(canvasView);

			handler.distributeSelectedNodesVertically();

			expect(canvasOperator.arrangeNodes).toHaveBeenCalledWith(
				canvasView.canvas,
				["n1", "n2", "n3"],
				"distribute-vertical",
			);
		});
	});
});
