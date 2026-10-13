import { CanvasOperator } from "@/services/canvas-operator";
import { CanvasHistory } from "@/services/canvas-history";
import type { Canvas, CanvasData, CanvasNode } from "@/types/obsidian-canvas";
import { DEFAULT_SETTINGS } from "@/types/settings";
import { App, TFile } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createMockCanvas(): Canvas {
	return {
		createFileNode: vi
			.fn()
			.mockReturnValue({ id: "new-node", x: 100, y: 200, width: 400, height: 300 }),
		getData: vi.fn().mockReturnValue({ nodes: [], edges: [] }),
		setData: vi.fn(),
		requestSave: vi.fn(),
	};
}

function createMockCanvasNoApi(): Canvas {
	return {
		createFileNode: undefined as never,
		getData: vi.fn().mockReturnValue({ nodes: [], edges: [] }),
		setData: vi.fn(),
		requestSave: vi.fn(),
	};
}

function createLayoutCanvas(): Canvas {
	let data: CanvasData = {
		nodes: [
			{ id: "a", type: "text", x: 100, y: 50, width: 100, height: 80 },
			{ id: "b", type: "text", x: 350, y: 200, width: 200, height: 100 },
			{ id: "c", type: "text", x: 800, y: 500, width: 100, height: 120 },
			{ id: "untouched", type: "text", x: 42, y: 43, width: 50, height: 50 },
		],
		edges: [],
	};
	return {
		...createMockCanvas(),
		getData: vi.fn(() => data),
		setData: vi.fn((next: CanvasData) => {
			data = next;
		}),
	};
}

describe("CanvasOperator", () => {
	let app: App;
	let operator: CanvasOperator;

	beforeEach(() => {
		app = new App();
		operator = new CanvasOperator(app, DEFAULT_SETTINGS);
	});

	describe("addNodeToCanvas - when createFileNode is available", () => {
		it("calls createFileNode with correct parameters", () => {
			const canvas = createMockCanvas();
			const file = new TFile("notes/test.md");

			operator.addNodeToCanvas(canvas, file, { x: 100, y: 200 });

			expect(canvas.createFileNode).toHaveBeenCalledWith({
				file,
				pos: { x: 100, y: 200 },
				size: {
					width: DEFAULT_SETTINGS.defaultNodeWidth,
					height: DEFAULT_SETTINGS.defaultNodeHeight,
				},
				save: true,
			});
		});

		it("returns a CanvasNode", () => {
			const canvas = createMockCanvas();
			const file = new TFile("notes/test.md");

			const result = operator.addNodeToCanvas(canvas, file, { x: 100, y: 200 });

			expect(result).not.toBeNull();
			expect(result?.id).toBe("new-node");
			expect(result?.x).toBe(100);
			expect(result?.y).toBe(200);
		});

		it("snapshots mutable Canvas data before the native API changes it", () => {
			const data: CanvasData = { nodes: [], edges: [] };
			const canvas = createMockCanvas();
			vi.mocked(canvas.getData).mockReturnValue(data);
			vi.mocked(canvas.createFileNode).mockImplementation(() => {
				data.nodes.push({
					id: "new-node",
					type: "file",
					file: "notes/test.md",
					x: 100,
					y: 200,
					width: 400,
					height: 300,
				});
				return { id: "new-node", x: 100, y: 200, width: 400, height: 300 };
			});
			const history = new CanvasHistory();
			const record = vi.spyOn(history, "record");
			const operatorWithHistory = new CanvasOperator(app, DEFAULT_SETTINGS, history);

			operatorWithHistory.addNodeToCanvas(canvas, new TFile("notes/test.md"), { x: 100, y: 200 });

			expect(record.mock.calls[0]?.[1].nodes).toHaveLength(0);
			expect(record.mock.calls[0]?.[2].nodes).toHaveLength(1);
		});
	});

	describe("addNodeToCanvas - when createFileNode is undefined (fallback)", () => {
		it("skips malformed Canvas data without throwing or saving", () => {
			const canvas = createMockCanvasNoApi();
			vi.mocked(canvas.getData).mockReturnValue({ nodes: undefined as never, edges: [] });
			const file = new TFile("notes/malformed.md");

			expect(() => operator.addNodeToCanvas(canvas, file, { x: 0, y: 0 })).not.toThrow();
			expect(operator.addNodeToCanvas(canvas, file, { x: 0, y: 0 })).toBeNull();
			expect(canvas.setData).not.toHaveBeenCalled();
			expect(canvas.requestSave).not.toHaveBeenCalled();
		});

		it("uses getData/setData/requestSave for JSON manipulation", () => {
			const canvas = createMockCanvasNoApi();
			const file = new TFile("notes/fallback.md");

			operator.addNodeToCanvas(canvas, file, { x: 300, y: 400 });

			expect(canvas.getData).toHaveBeenCalled();
			expect(canvas.setData).toHaveBeenCalled();
			expect(canvas.requestSave).toHaveBeenCalled();
		});

		it("adds correct node data", () => {
			const canvas = createMockCanvasNoApi();
			const file = new TFile("notes/fallback.md");

			operator.addNodeToCanvas(canvas, file, { x: 300, y: 400 });

			const setDataCall = vi.mocked(canvas.setData).mock.calls[0][0];
			expect(setDataCall.nodes).toHaveLength(1);

			const node = setDataCall.nodes[0];
			expect(node.type).toBe("file");
			expect(node.file).toBe("notes/fallback.md");
			expect(node.x).toBe(300);
			expect(node.y).toBe(400);
			expect(node.width).toBe(DEFAULT_SETTINGS.defaultNodeWidth);
			expect(node.height).toBe(DEFAULT_SETTINGS.defaultNodeHeight);
			expect(node.id).toMatch(/^[0-9a-f]{16}$/);
		});

		it("returns a CanvasNode-compatible object", () => {
			const canvas = createMockCanvasNoApi();
			const file = new TFile("notes/fallback.md");

			const result = operator.addNodeToCanvas(canvas, file, { x: 300, y: 400 });

			expect(result).not.toBeNull();
			expect(result?.x).toBe(300);
			expect(result?.y).toBe(400);
			expect(result?.width).toBe(DEFAULT_SETTINGS.defaultNodeWidth);
			expect(result?.height).toBe(DEFAULT_SETTINGS.defaultNodeHeight);
			expect(result?.id).toMatch(/^[0-9a-f]{16}$/);
		});

		it("preserves existing nodes while adding a new node", () => {
			const existingData: CanvasData = {
				nodes: [
					{ id: "existing", type: "text", text: "hello", x: 0, y: 0, width: 200, height: 100 },
				],
				edges: [],
			};
			const canvas = createMockCanvasNoApi();
			vi.mocked(canvas.getData).mockReturnValue(existingData);
			const file = new TFile("notes/new.md");

			operator.addNodeToCanvas(canvas, file, { x: 500, y: 500 });

			const setDataCall = vi.mocked(canvas.setData).mock.calls[0][0];
			expect(setDataCall.nodes).toHaveLength(2);
			expect(setDataCall.nodes[0].id).toBe("existing");
			expect(setDataCall.nodes[1].file).toBe("notes/new.md");
		});
	});

	describe("addNodeToCanvas - with subpath (reference mode)", () => {
		it("uses JSON manipulation instead of createFileNode when subpath is provided", () => {
			const canvas = createMockCanvas();
			const file = new TFile("notes/test.md");

			operator.addNodeToCanvas(canvas, file, { x: 100, y: 200 }, "#Section A");

			expect(canvas.createFileNode).not.toHaveBeenCalled();
			expect(canvas.getData).toHaveBeenCalled();
			expect(canvas.setData).toHaveBeenCalled();
			expect(canvas.requestSave).toHaveBeenCalled();
		});

		it("includes subpath in node data", () => {
			const canvas = createMockCanvas();
			vi.mocked(canvas.getData).mockReturnValue({ nodes: [], edges: [] });
			const file = new TFile("notes/test.md");

			operator.addNodeToCanvas(canvas, file, { x: 100, y: 200 }, "#Section A");

			const setDataCall = vi.mocked(canvas.setData).mock.calls[0][0];
			expect(setDataCall.nodes).toHaveLength(1);

			const node = setDataCall.nodes[0];
			expect(node.type).toBe("file");
			expect(node.file).toBe("notes/test.md");
			expect(node.subpath).toBe("#Section A");
			expect(node.x).toBe(100);
			expect(node.y).toBe(200);
		});

		it("returns a CanvasNode-compatible object", () => {
			const canvas = createMockCanvas();
			vi.mocked(canvas.getData).mockReturnValue({ nodes: [], edges: [] });
			const file = new TFile("notes/test.md");

			const result = operator.addNodeToCanvas(canvas, file, { x: 100, y: 200 }, "#Section A");

			expect(result).not.toBeNull();
			expect(result?.x).toBe(100);
			expect(result?.y).toBe(200);
			expect(result?.id).toMatch(/^[0-9a-f]{16}$/);
		});

		it("does not use createFileNode even when it is available", () => {
			const canvas = createMockCanvas();
			vi.mocked(canvas.getData).mockReturnValue({ nodes: [], edges: [] });
			const file = new TFile("notes/test.md");

			operator.addNodeToCanvas(canvas, file, { x: 0, y: 0 }, "#Heading");

			expect(canvas.createFileNode).not.toHaveBeenCalled();
		});
	});

	describe("arrangeNodes", () => {
		it("aligns selected nodes to the left edge", () => {
			const canvas = createLayoutCanvas();

			const changed = operator.arrangeNodes(canvas, ["a", "b", "c"], "align-left");

			expect(changed).toBe(true);
			const data = vi.mocked(canvas.setData).mock.calls[0][0];
			expect(data.nodes.slice(0, 3).map((node) => node.x)).toEqual([100, 100, 100]);
			expect(data.nodes[3]).toMatchObject({ x: 42, y: 43 });
			expect(canvas.requestSave).toHaveBeenCalledOnce();
		});

		it("aligns selected nodes to the top edge", () => {
			const canvas = createLayoutCanvas();

			operator.arrangeNodes(canvas, ["a", "b"], "align-top");

			const data = vi.mocked(canvas.setData).mock.calls[0][0];
			expect(data.nodes.slice(0, 2).map((node) => node.y)).toEqual([50, 50]);
		});

		it("distributes nodes with equal horizontal gaps while preserving outer edges", () => {
			const canvas = createLayoutCanvas();

			operator.arrangeNodes(canvas, ["a", "b", "c"], "distribute-horizontal");

			const data = vi.mocked(canvas.setData).mock.calls[0][0];
			expect(data.nodes.slice(0, 3).map((node) => node.x)).toEqual([100, 400, 800]);
			const firstGap = data.nodes[1]!.x - (data.nodes[0]!.x + data.nodes[0]!.width);
			const secondGap = data.nodes[2]!.x - (data.nodes[1]!.x + data.nodes[1]!.width);
			expect(firstGap).toBe(secondGap);
		});

		it("distributes nodes with equal vertical gaps while preserving outer edges", () => {
			const canvas = createLayoutCanvas();

			operator.arrangeNodes(canvas, ["a", "b", "c"], "distribute-vertical");

			const data = vi.mocked(canvas.setData).mock.calls[0][0];
			const firstGap = data.nodes[1]!.y - (data.nodes[0]!.y + data.nodes[0]!.height);
			const secondGap = data.nodes[2]!.y - (data.nodes[1]!.y + data.nodes[1]!.height);
			expect(firstGap).toBe(secondGap);
			expect(data.nodes[0]!.y).toBe(50);
			expect(data.nodes[2]!.y + data.nodes[2]!.height).toBe(620);
		});

		it("does not save when nodes are already arranged", () => {
			const canvas = createLayoutCanvas();
			canvas.getData().nodes[1]!.x = 400;

			const changed = operator.arrangeNodes(canvas, ["a", "b", "c"], "distribute-horizontal");

			expect(changed).toBe(false);
			expect(canvas.setData).not.toHaveBeenCalled();
			expect(canvas.requestSave).not.toHaveBeenCalled();
		});

		it("rejects an incomplete selection", () => {
			const canvas = createLayoutCanvas();

			const changed = operator.arrangeNodes(
				canvas,
				["a", "missing", "also-missing"],
				"distribute-horizontal",
			);

			expect(changed).toBe(false);
			expect(canvas.setData).not.toHaveBeenCalled();
		});

		it("records layout changes in Canvas history", () => {
			const canvas = createLayoutCanvas();

			operator.arrangeNodes(canvas, ["a", "b"], "align-left");
			const undone = operator.undo(canvas);

			expect(undone).toBe(true);
			const restored = vi.mocked(canvas.setData).mock.calls[1][0];
			expect(restored.nodes.slice(0, 2).map((node) => node.x)).toEqual([100, 350]);
		});
	});

	describe("addNodeViaJson", () => {
		it("returns an explicit invalid-json result", async () => {
			const canvasFile = new TFile("canvas/invalid.canvas");
			const file = new TFile("notes/node.md");
			app.vault.read = vi.fn().mockResolvedValue("not valid json");
			app.vault.modify = vi.fn().mockResolvedValue(undefined);

			await expect(operator.addNodeViaJson(canvasFile, file, { x: 0, y: 0 })).resolves.toEqual({
				status: "invalid",
				reason: "invalid-json",
			});
		});

		it("returns an explicit invalid-shape result", async () => {
			const canvasFile = new TFile("canvas/malformed.canvas");
			const file = new TFile("notes/node.md");
			app.vault.read = vi.fn().mockResolvedValue(JSON.stringify({ nodes: [] }));
			app.vault.modify = vi.fn().mockResolvedValue(undefined);

			await expect(operator.addNodeViaJson(canvasFile, file, { x: 0, y: 0 })).resolves.toEqual({
				status: "invalid",
				reason: "invalid-shape",
			});
		});

		it("reads JSON, parses, adds node, and writes back", async () => {
			const canvasFile = new TFile("canvas/test.canvas");
			const file = new TFile("notes/via-json.md");
			const emptyData: CanvasData = { nodes: [], edges: [] };
			app.vault.read = vi.fn().mockResolvedValue(JSON.stringify(emptyData));
			app.vault.modify = vi.fn().mockResolvedValue(undefined);

			await operator.addNodeViaJson(canvasFile, file, { x: 150, y: 250 });

			expect(app.vault.read).toHaveBeenCalledWith(canvasFile);
			expect(app.vault.modify).toHaveBeenCalled();

			const modifyCall = vi.mocked(app.vault.modify).mock.calls[0];
			const savedData: CanvasData = JSON.parse(modifyCall[1] as string);
			expect(savedData.nodes).toHaveLength(1);

			const node = savedData.nodes[0];
			expect(node.type).toBe("file");
			expect(node.file).toBe("notes/via-json.md");
			expect(node.x).toBe(150);
			expect(node.y).toBe(250);
			expect(node.width).toBe(DEFAULT_SETTINGS.defaultNodeWidth);
			expect(node.height).toBe(DEFAULT_SETTINGS.defaultNodeHeight);
			expect(node.id).toMatch(/^[0-9a-f]{16}$/);
		});

		it("preserves existing nodes while adding a new node", async () => {
			const canvasFile = new TFile("canvas/test.canvas");
			const file = new TFile("notes/additional.md");
			const existingData: CanvasData = {
				nodes: [
					{
						id: "abc123",
						type: "file",
						file: "old.md",
						x: 0,
						y: 0,
						width: 400,
						height: 300,
					},
				],
				edges: [
					{
						id: "edge1",
						fromNode: "abc123",
						fromSide: "right",
						toNode: "xyz",
						toSide: "left",
					},
				],
			};
			app.vault.read = vi.fn().mockResolvedValue(JSON.stringify(existingData));
			app.vault.modify = vi.fn().mockResolvedValue(undefined);

			await operator.addNodeViaJson(canvasFile, file, { x: 500, y: 0 });

			const modifyCall = vi.mocked(app.vault.modify).mock.calls[0];
			const savedData: CanvasData = JSON.parse(modifyCall[1] as string);
			expect(savedData.nodes).toHaveLength(2);
			expect(savedData.nodes[0].id).toBe("abc123");
			expect(savedData.nodes[1].file).toBe("notes/additional.md");
			expect(savedData.edges).toHaveLength(1);
		});

		it("includes subpath in node data when provided", async () => {
			const canvasFile = new TFile("canvas/test.canvas");
			const file = new TFile("notes/via-json.md");
			const emptyData: CanvasData = { nodes: [], edges: [] };
			app.vault.read = vi.fn().mockResolvedValue(JSON.stringify(emptyData));
			app.vault.modify = vi.fn().mockResolvedValue(undefined);

			await operator.addNodeViaJson(canvasFile, file, { x: 150, y: 250 }, "#Section B");

			const modifyCall = vi.mocked(app.vault.modify).mock.calls[0];
			const savedData: CanvasData = JSON.parse(modifyCall[1] as string);
			expect(savedData.nodes).toHaveLength(1);

			const node = savedData.nodes[0];
			expect(node.subpath).toBe("#Section B");
			expect(node.file).toBe("notes/via-json.md");
		});

		it("does not include subpath when not provided", async () => {
			const canvasFile = new TFile("canvas/test.canvas");
			const file = new TFile("notes/no-subpath.md");
			const emptyData: CanvasData = { nodes: [], edges: [] };
			app.vault.read = vi.fn().mockResolvedValue(JSON.stringify(emptyData));
			app.vault.modify = vi.fn().mockResolvedValue(undefined);

			await operator.addNodeViaJson(canvasFile, file, { x: 0, y: 0 });

			const modifyCall = vi.mocked(app.vault.modify).mock.calls[0];
			const savedData: CanvasData = JSON.parse(modifyCall[1] as string);
			expect(savedData.nodes[0].subpath).toBeUndefined();
		});

		it("writes JSON back with tab indentation", async () => {
			const canvasFile = new TFile("canvas/test.canvas");
			const file = new TFile("notes/formatted.md");
			const emptyData: CanvasData = { nodes: [], edges: [] };
			app.vault.read = vi.fn().mockResolvedValue(JSON.stringify(emptyData));
			app.vault.modify = vi.fn().mockResolvedValue(undefined);

			await operator.addNodeViaJson(canvasFile, file, { x: 0, y: 0 });

			const modifyCall = vi.mocked(app.vault.modify).mock.calls[0];
			const rawJson = modifyCall[1] as string;
			expect(rawJson).toContain("\t");
		});

		it("mutates the latest content supplied by vault.process", async () => {
			const canvasFile = new TFile("canvas/concurrent.canvas");
			const file = new TFile("notes/new.md");
			const latest: CanvasData = {
				nodes: [{ id: "external", type: "text", x: 1, y: 2, width: 3, height: 4 }],
				edges: [],
			};
			app.vault.read = vi.fn().mockResolvedValue(JSON.stringify({ nodes: [], edges: [] }));
			app.vault.process = vi.fn().mockImplementation(async (_file, mutate) => {
				const next = mutate(JSON.stringify(latest));
				await app.vault.modify(canvasFile, next);
			});

			await operator.addNodeViaJson(canvasFile, file, { x: 50, y: 60 });

			const savedData: CanvasData = JSON.parse(vi.mocked(app.vault.modify).mock.calls[0]![1]);
			expect(savedData.nodes.map((node) => node.id)).toContain("external");
			expect(savedData.nodes).toHaveLength(2);
			expect(app.vault.read).not.toHaveBeenCalled();
		});

		it("does not add the same file node at the same position twice", async () => {
			const canvasFile = new TFile("canvas/duplicate.canvas");
			const file = new TFile("notes/same.md");
			app.vault.read = vi.fn().mockResolvedValue(
				JSON.stringify({
					nodes: [
						{
							id: "existing",
							type: "file",
							file: file.path,
							x: 10,
							y: 20,
							width: 400,
							height: 300,
						},
					],
					edges: [],
				}),
			);

			await expect(operator.addNodeViaJson(canvasFile, file, { x: 10, y: 20 })).resolves.toEqual({
				status: "unchanged",
				reason: "duplicate-node",
			});
			const savedData: CanvasData = JSON.parse(vi.mocked(app.vault.modify).mock.calls[0]![1]);
			expect(savedData.nodes).toHaveLength(1);
		});
	});

	describe("addEdgeToCanvas", () => {
		it("does not create a self-loop edge", () => {
			const canvas = createMockCanvas();

			expect(operator.addEdgeToCanvas(canvas, { fromNode: "node-a", toNode: "node-a" })).toBe(
				false,
			);
			expect(canvas.getData).not.toHaveBeenCalled();
		});
		it("does not create an edge to a missing node", () => {
			const canvas = createMockCanvas();
			vi.mocked(canvas.getData).mockReturnValue({
				nodes: [{ id: "node-a", type: "text", x: 0, y: 0, width: 10, height: 10 }],
				edges: [],
			});

			expect(operator.addEdgeToCanvas(canvas, { fromNode: "node-a", toNode: "missing" })).toBe(
				false,
			);
			expect(canvas.setData).not.toHaveBeenCalled();
		});
		it("does not create a duplicate directed edge", () => {
			const canvas = createMockCanvas();
			vi.mocked(canvas.getData).mockReturnValue({
				nodes: [
					{ id: "node-a", type: "text", x: 0, y: 0, width: 10, height: 10 },
					{ id: "node-b", type: "text", x: 20, y: 0, width: 10, height: 10 },
				],
				edges: [
					{
						id: "existing",
						fromNode: "node-a",
						fromSide: "right",
						toNode: "node-b",
						toSide: "left",
					},
				],
			});

			expect(operator.addEdgeToCanvas(canvas, { fromNode: "node-a", toNode: "node-b" })).toBe(
				false,
			);
			expect(canvas.setData).not.toHaveBeenCalled();
		});

		it("adds an edge via JSON manipulation", () => {
			const canvas = createMockCanvas();
			vi.mocked(canvas.getData).mockReturnValue({
				nodes: [
					{ id: "node-a", type: "text", x: 0, y: 0, width: 10, height: 10 },
					{ id: "node-b", type: "text", x: 20, y: 0, width: 10, height: 10 },
				],
				edges: [],
			});

			operator.addEdgeToCanvas(canvas, {
				fromNode: "node-a",
				toNode: "node-b",
			});

			expect(canvas.setData).toHaveBeenCalled();
			expect(canvas.requestSave).toHaveBeenCalled();

			const setDataCall = vi.mocked(canvas.setData).mock.calls[0][0];
			expect(setDataCall.edges).toHaveLength(1);

			const edge = setDataCall.edges[0];
			expect(edge.fromNode).toBe("node-a");
			expect(edge.toNode).toBe("node-b");
			expect(edge.fromSide).toBe("right");
			expect(edge.toSide).toBe("left");
			expect(edge.toEnd).toBe("arrow");
			expect(edge.id).toMatch(/^[0-9a-f]{16}$/);
		});

		it("applies custom color and label", () => {
			const canvas = createMockCanvas();
			vi.mocked(canvas.getData).mockReturnValue({
				nodes: [
					{ id: "node-a", type: "text", x: 0, y: 0, width: 10, height: 10 },
					{ id: "node-b", type: "text", x: 20, y: 0, width: 10, height: 10 },
				],
				edges: [],
			});

			operator.addEdgeToCanvas(canvas, {
				fromNode: "node-a",
				toNode: "node-b",
				color: "1",
				label: "relates to",
			});

			const setDataCall = vi.mocked(canvas.setData).mock.calls[0][0];
			const edge = setDataCall.edges[0];
			expect(edge.color).toBe("1");
			expect(edge.label).toBe("relates to");
		});

		it("preserves existing edges", () => {
			const canvas = createMockCanvas();
			vi.mocked(canvas.getData).mockReturnValue({
				nodes: [
					{ id: "a", type: "text", x: 0, y: 0, width: 10, height: 10 },
					{ id: "b", type: "text", x: 20, y: 0, width: 10, height: 10 },
					{ id: "c", type: "text", x: 40, y: 0, width: 10, height: 10 },
					{ id: "d", type: "text", x: 60, y: 0, width: 10, height: 10 },
				],
				edges: [
					{
						id: "existing-edge",
						fromNode: "a",
						fromSide: "right",
						toNode: "b",
						toSide: "left",
					},
				],
			});

			operator.addEdgeToCanvas(canvas, {
				fromNode: "c",
				toNode: "d",
			});

			const setDataCall = vi.mocked(canvas.setData).mock.calls[0][0];
			expect(setDataCall.edges).toHaveLength(2);
			expect(setDataCall.edges[0].id).toBe("existing-edge");
		});
	});

	describe("addEdgeViaJson", () => {
		it("does not write a self-loop edge", async () => {
			const canvasFile = new TFile("canvas/self-loop.canvas");

			await expect(
				operator.addEdgeViaJson(canvasFile, { fromNode: "node-a", toNode: "node-a" }),
			).resolves.toEqual({ status: "unchanged", reason: "self-loop" });
			expect(app.vault.read).not.toHaveBeenCalled();
			expect(app.vault.process).not.toHaveBeenCalled();
		});
		it("does not write an edge to a missing node", async () => {
			const canvasFile = new TFile("canvas/missing-node.canvas");
			app.vault.read = vi.fn().mockResolvedValue(
				JSON.stringify({
					nodes: [{ id: "node-1", type: "text", x: 0, y: 0, width: 10, height: 10 }],
					edges: [],
				}),
			);
			app.vault.modify = vi.fn().mockResolvedValue(undefined);

			await operator.addEdgeViaJson(canvasFile, { fromNode: "node-1", toNode: "missing" });
			expect(app.vault.process).toHaveBeenCalledWith(canvasFile, expect.any(Function));
		});
		it("does not write a duplicate directed edge", async () => {
			const canvasFile = new TFile("canvas/existing.canvas");
			app.vault.read = vi.fn().mockResolvedValue(
				JSON.stringify({
					nodes: [
						{ id: "node-1", type: "text", x: 0, y: 0, width: 10, height: 10 },
						{ id: "node-2", type: "text", x: 20, y: 0, width: 10, height: 10 },
					],
					edges: [
						{
							id: "existing",
							fromNode: "node-1",
							fromSide: "right",
							toNode: "node-2",
							toSide: "left",
						},
					],
				}),
			);
			app.vault.modify = vi.fn().mockResolvedValue(undefined);

			await expect(
				operator.addEdgeViaJson(canvasFile, { fromNode: "node-1", toNode: "node-2" }),
			).resolves.toEqual({ status: "unchanged", reason: "duplicate-edge" });
			const savedData: CanvasData = JSON.parse(vi.mocked(app.vault.modify).mock.calls[0]![1]);
			expect(savedData.edges).toHaveLength(1);
		});

		it("returns an explicit invalid-json result", async () => {
			const canvasFile = new TFile("canvas/invalid.canvas");
			app.vault.read = vi.fn().mockResolvedValue("not valid json");
			app.vault.modify = vi.fn().mockResolvedValue(undefined);

			await expect(
				operator.addEdgeViaJson(canvasFile, { fromNode: "a", toNode: "b" }),
			).resolves.toEqual({ status: "invalid", reason: "invalid-json" });
		});

		it("returns an explicit invalid-shape result", async () => {
			const canvasFile = new TFile("canvas/malformed.canvas");
			app.vault.read = vi.fn().mockResolvedValue(JSON.stringify({ nodes: [] }));
			app.vault.modify = vi.fn().mockResolvedValue(undefined);

			await expect(
				operator.addEdgeViaJson(canvasFile, { fromNode: "a", toNode: "b" }),
			).resolves.toEqual({ status: "invalid", reason: "invalid-shape" });
		});

		it("reads JSON, adds edge, and writes back", async () => {
			const canvasFile = new TFile("canvas/test.canvas");
			const emptyData = {
				nodes: [
					{ id: "node-1", type: "text", x: 0, y: 0, width: 10, height: 10 },
					{ id: "node-2", type: "text", x: 20, y: 0, width: 10, height: 10 },
				],
				edges: [],
			};
			app.vault.read = vi.fn().mockResolvedValue(JSON.stringify(emptyData));
			app.vault.modify = vi.fn().mockResolvedValue(undefined);

			await operator.addEdgeViaJson(canvasFile, {
				fromNode: "node-1",
				toNode: "node-2",
			});

			expect(app.vault.read).toHaveBeenCalledWith(canvasFile);
			expect(app.vault.modify).toHaveBeenCalled();

			const modifyCall = vi.mocked(app.vault.modify).mock.calls[0];
			const savedData = JSON.parse(modifyCall[1] as string);
			expect(savedData.edges).toHaveLength(1);
			expect(savedData.edges[0].fromNode).toBe("node-1");
			expect(savedData.edges[0].toNode).toBe("node-2");
			expect(savedData.edges[0].toEnd).toBe("arrow");
		});
	});

	describe("addGroupToCanvas", () => {
		const GROUP_PADDING = 20;

		it("adds a group node encompassing the selected nodes", () => {
			const canvas = createMockCanvas();
			vi.mocked(canvas.getData).mockReturnValue({ nodes: [], edges: [] });

			const nodes: CanvasNode[] = [
				{ id: "a", x: 0, y: 0, width: 400, height: 300 },
				{ id: "b", x: 500, y: 100, width: 400, height: 300 },
			];

			operator.addGroupToCanvas(canvas, nodes);

			expect(canvas.setData).toHaveBeenCalled();
			expect(canvas.requestSave).toHaveBeenCalled();

			const setDataCall = vi.mocked(canvas.setData).mock.calls[0][0];
			expect(setDataCall.nodes).toHaveLength(1);

			const group = setDataCall.nodes[0];
			expect(group.type).toBe("group");
			expect(group.x).toBe(0 - GROUP_PADDING);
			expect(group.y).toBe(0 - GROUP_PADDING);
			expect(group.width).toBe(900 + GROUP_PADDING * 2);
			expect(group.height).toBe(400 + GROUP_PADDING * 2);
			expect(group.id).toMatch(/^[0-9a-f]{16}$/);
		});

		it("adds a group with a label", () => {
			const canvas = createMockCanvas();
			vi.mocked(canvas.getData).mockReturnValue({ nodes: [], edges: [] });

			const nodes: CanvasNode[] = [{ id: "a", x: 100, y: 100, width: 200, height: 200 }];

			operator.addGroupToCanvas(canvas, nodes, "My Section");

			const setDataCall = vi.mocked(canvas.setData).mock.calls[0][0];
			const group = setDataCall.nodes[0];
			expect(group.label).toBe("My Section");
		});

		it("does nothing when no nodes are provided", () => {
			const canvas = createMockCanvas();

			operator.addGroupToCanvas(canvas, []);

			expect(canvas.setData).not.toHaveBeenCalled();
		});

		it("handles single node correctly", () => {
			const canvas = createMockCanvas();
			vi.mocked(canvas.getData).mockReturnValue({ nodes: [], edges: [] });

			const nodes: CanvasNode[] = [{ id: "a", x: 50, y: 75, width: 400, height: 300 }];

			operator.addGroupToCanvas(canvas, nodes);

			const setDataCall = vi.mocked(canvas.setData).mock.calls[0][0];
			const group = setDataCall.nodes[0];
			expect(group.x).toBe(50 - GROUP_PADDING);
			expect(group.y).toBe(75 - GROUP_PADDING);
			expect(group.width).toBe(400 + GROUP_PADDING * 2);
			expect(group.height).toBe(300 + GROUP_PADDING * 2);
		});

		it("preserves existing nodes", () => {
			const canvas = createMockCanvas();
			vi.mocked(canvas.getData).mockReturnValue({
				nodes: [{ id: "existing", type: "text", text: "hi", x: 0, y: 0, width: 100, height: 50 }],
				edges: [],
			});

			const nodes: CanvasNode[] = [{ id: "a", x: 0, y: 0, width: 200, height: 200 }];

			operator.addGroupToCanvas(canvas, nodes);

			const setDataCall = vi.mocked(canvas.setData).mock.calls[0][0];
			expect(setDataCall.nodes).toHaveLength(2);
			expect(setDataCall.nodes[0].id).toBe("existing");
		});
	});

	describe("replaceNodesWithFile", () => {
		it("replaces source materials once and preserves external relationships", () => {
			const canvas = createMockCanvas();
			vi.mocked(canvas.getData).mockReturnValue({
				nodes: [
					{ id: "source-a", type: "text", text: "A", x: 0, y: 0, width: 200, height: 100 },
					{ id: "source-b", type: "file", file: "B.md", x: 300, y: 0, width: 200, height: 100 },
					{
						id: "context",
						type: "file",
						file: "Context.md",
						x: 600,
						y: 0,
						width: 200,
						height: 100,
					},
				],
				edges: [
					{ id: "internal", fromNode: "source-a", toNode: "source-b" },
					{ id: "external", fromNode: "source-b", toNode: "context", label: "supports" },
				],
			} as never);
			const file = new TFile("Knowledge/Distilled.md");

			const replacement = operator.replaceNodesWithFile(canvas, ["source-a", "source-b"], file);

			expect(replacement?.file).toBe(file);
			const data = vi.mocked(canvas.setData).mock.calls[0][0];
			expect(data.nodes.map((node) => node.id)).not.toContain("source-a");
			expect(data.nodes.map((node) => node.id)).not.toContain("source-b");
			const distilled = data.nodes.find((node) => node.file === file.path)!;
			expect(distilled).toBeDefined();
			expect(data.edges).toEqual([
				expect.objectContaining({
					fromNode: distilled.id,
					toNode: "context",
					label: "supports",
				}),
			]);
		});

		it("rolls back an uncommitted replacement without discarding concurrent Canvas changes", () => {
			const canvas = createMockCanvas();
			let data: CanvasData = {
				nodes: [
					{ id: "source-a", type: "text" as const, text: "A", x: 0, y: 0, width: 200, height: 100 },
					{
						id: "source-b",
						type: "text" as const,
						text: "B",
						x: 300,
						y: 0,
						width: 200,
						height: 100,
					},
				],
				edges: [],
			};
			vi.mocked(canvas.getData).mockImplementation(() => structuredClone(data));
			vi.mocked(canvas.setData).mockImplementation((next) => {
				data = structuredClone(next);
			});
			const transaction = operator.replaceNodesWithFileTransaction(
				canvas,
				["source-a", "source-b"],
				new TFile("Knowledge/Distilled.md"),
			);
			expect(transaction).not.toBeNull();
			data.nodes.push({
				id: "concurrent",
				type: "text",
				text: "Keep me",
				x: 600,
				y: 0,
				width: 200,
				height: 100,
			});

			expect(transaction?.rollback()).toBe(true);
			expect(data.nodes.map((node) => node.id)).toEqual(["source-a", "source-b", "concurrent"]);
			expect(operator.undo(canvas)).toBe(false);
		});
	});

	describe("edge cases", () => {
		it("fallback works with empty canvas data", () => {
			const canvas = createMockCanvasNoApi();
			vi.mocked(canvas.getData).mockReturnValue({ nodes: [], edges: [] });
			const file = new TFile("notes/empty-canvas.md");

			const result = operator.addNodeToCanvas(canvas, file, { x: 0, y: 0 });

			expect(result).not.toBeNull();
			const setDataCall = vi.mocked(canvas.setData).mock.calls[0][0];
			expect(setDataCall.nodes).toHaveLength(1);
			expect(setDataCall.edges).toHaveLength(0);
		});
	});
});
