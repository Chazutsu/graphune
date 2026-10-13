import { CanvasHistory } from "@/services/canvas-history";
import type { Canvas, CanvasData } from "@/types/obsidian-canvas";
import { describe, expect, it, vi } from "vitest";

function createCanvas(): { canvas: Canvas; data: CanvasData } {
	const data: CanvasData = { nodes: [], edges: [] };
	const canvas = {
		getData: vi.fn(() => data),
		setData: vi.fn((next: CanvasData) => {
			data.nodes = next.nodes;
			data.edges = next.edges;
		}),
		requestSave: vi.fn(),
	} as unknown as Canvas;
	return { canvas, data };
}

function createTextNode(id: string) {
	return { id, type: "text" as const, x: 0, y: 0, width: 10, height: 10 };
}

describe("CanvasHistory", () => {
	it("returns false when there is no history", () => {
		const history = new CanvasHistory();
		const { canvas } = createCanvas();

		expect(history.undo(canvas)).toBe(false);
		expect(history.redo(canvas)).toBe(false);
	});

	it("does not record a no-op change", () => {
		const history = new CanvasHistory();
		const { canvas } = createCanvas();
		const snapshot = { nodes: [], edges: [] };

		history.record(canvas, snapshot, snapshot);

		expect(history.undo(canvas)).toBe(false);
	});

	it("undoes and redoes a change using cloned snapshots", () => {
		const history = new CanvasHistory();
		const { canvas, data } = createCanvas();
		const before = { nodes: [], edges: [] };
		const after = {
			nodes: [{ id: "node-1", type: "text" as const, x: 0, y: 0, width: 100, height: 80 }],
			edges: [],
		};

		history.record(canvas, before, after);
		data.nodes = structuredClone(after.nodes);
		expect(history.undo(canvas)).toBe(true);
		expect(data.nodes).toEqual([]);
		expect(history.redo(canvas)).toBe(true);
		expect(data.nodes[0]?.id).toBe("node-1");
		expect(canvas.requestSave).toHaveBeenCalledTimes(2);

		after.nodes[0]!.id = "mutated-after-record";
		expect(data.nodes[0]?.id).toBe("node-1");
	});

	it("publishes undo and redo availability changes", () => {
		const history = new CanvasHistory();
		const { canvas } = createCanvas();
		const states: { canUndo: boolean; canRedo: boolean }[] = [];
		const unsubscribe = history.subscribe(canvas, () => states.push(history.getState(canvas)));

		history.record(
			canvas,
			{ nodes: [], edges: [] },
			{ nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 10, height: 10 }], edges: [] },
		);
		history.undo(canvas);
		history.redo(canvas);
		unsubscribe();

		expect(states).toEqual([
			{ canUndo: true, canRedo: false },
			{ canUndo: false, canRedo: true },
			{ canUndo: true, canRedo: false },
		]);
	});

	it("discards redo history after a new change", () => {
		const history = new CanvasHistory();
		const { canvas } = createCanvas();

		history.record(
			canvas,
			{ nodes: [], edges: [] },
			{
				nodes: [],
				edges: [{ id: "edge-1", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left" }],
			},
		);
		expect(history.undo(canvas)).toBe(true);
		history.record(
			canvas,
			{ nodes: [], edges: [] },
			{ nodes: [{ id: "node-1", type: "text", x: 0, y: 0, width: 10, height: 10 }], edges: [] },
		);

		expect(history.redo(canvas)).toBe(false);
	});

	it("preserves unrelated Canvas changes when applying a history delta", () => {
		const history = new CanvasHistory();
		const { canvas, data } = createCanvas();
		history.record(
			canvas,
			{ nodes: [], edges: [] },
			{
				nodes: [{ id: "plugin-node", type: "text", x: 0, y: 0, width: 10, height: 10 }],
				edges: [],
			},
		);
		data.nodes = [
			{ id: "plugin-node", type: "text", x: 0, y: 0, width: 10, height: 10 },
			{ id: "native-node", type: "text", x: 20, y: 0, width: 10, height: 10 },
		];

		history.undo(canvas);

		expect(data.nodes.map((node) => node.id)).toEqual(["native-node"]);
	});

	it("does not undo an item changed after the recorded operation", () => {
		const history = new CanvasHistory();
		const { canvas, data } = createCanvas();
		const before = { nodes: [createTextNode("node")], edges: [] };
		const after = {
			nodes: [{ ...createTextNode("node"), x: 10 }],
			edges: [],
		};
		history.record(canvas, before, after);
		data.nodes = [{ ...createTextNode("node"), x: 20 }];

		history.undo(canvas);

		expect(data.nodes[0]?.x).toBe(20);
		expect(canvas.requestSave).not.toHaveBeenCalled();
	});

	it("undoes non-conflicting items while preserving conflicting items", () => {
		const history = new CanvasHistory();
		const { canvas, data } = createCanvas();
		const before = { nodes: [createTextNode("safe"), createTextNode("conflict")], edges: [] };
		const after = {
			nodes: [
				{ ...createTextNode("safe"), x: 10 },
				{ ...createTextNode("conflict"), x: 10 },
			],
			edges: [],
		};
		history.record(canvas, before, after);
		data.nodes = [after.nodes[0]!, { ...after.nodes[1]!, x: 20 }];

		history.undo(canvas);

		expect(data.nodes.map(({ id, x }) => ({ id, x }))).toEqual([
			{ id: "safe", x: 0 },
			{ id: "conflict", x: 20 },
		]);
	});

	it("does not remove a recorded addition that was subsequently edited", () => {
		const history = new CanvasHistory();
		const { canvas, data } = createCanvas();
		const after = { nodes: [createTextNode("added")], edges: [] };
		history.record(canvas, { nodes: [], edges: [] }, after);
		data.nodes = [{ ...after.nodes[0]!, x: 42 }];

		history.undo(canvas);

		expect(data.nodes).toEqual([{ ...createTextNode("added"), x: 42 }]);
	});

	it("restores a deleted node at its original stacking position", () => {
		const history = new CanvasHistory();
		const { canvas, data } = createCanvas();
		const before = {
			nodes: [createTextNode("back"), createTextNode("middle"), createTextNode("front")],
			edges: [],
		};
		const after = { nodes: [createTextNode("back"), createTextNode("front")], edges: [] };
		history.record(canvas, before, after);
		data.nodes = [...after.nodes, createTextNode("unrelated")];

		history.undo(canvas);

		expect(data.nodes.map(({ id }) => id)).toEqual(["back", "middle", "front", "unrelated"]);
	});

	it("restores several adjacent nodes in their original order", () => {
		const history = new CanvasHistory();
		const { canvas, data } = createCanvas();
		const before = {
			nodes: ["a", "b", "c", "d"].map(createTextNode),
			edges: [],
		};
		const after = { nodes: [createTextNode("a"), createTextNode("d")], edges: [] };
		history.record(canvas, before, after);
		data.nodes = [...after.nodes];

		history.undo(canvas);

		expect(data.nodes.map(({ id }) => id)).toEqual(["a", "b", "c", "d"]);
	});

	it("bounds memory usage to the latest 100 changes", () => {
		const history = new CanvasHistory();
		const { canvas } = createCanvas();

		for (let index = 0; index < 101; index += 1) {
			history.record(
				canvas,
				{ nodes: [], edges: [] },
				{
					nodes: [{ id: `node-${index}`, type: "text", x: 0, y: 0, width: 10, height: 10 }],
					edges: [],
				},
			);
		}

		let undoCount = 0;
		while (history.undo(canvas)) undoCount += 1;
		expect(undoCount).toBe(100);
	});
});
