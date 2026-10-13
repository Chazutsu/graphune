import { EdgeSync } from "@/services/edge-sync";
import type { CanvasData, CanvasEdgeData, CanvasNodeData } from "@/types/obsidian-canvas";
import { App, FileManager, TFile, Vault } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

function makeNode(id: string, file?: string): CanvasNodeData {
	return {
		id,
		type: file ? "file" : "text",
		file,
		x: 0,
		y: 0,
		width: 400,
		height: 300,
	};
}

function makeEdge(id: string, fromNode: string, toNode: string, label?: string): CanvasEdgeData {
	return {
		id,
		fromNode,
		fromSide: "right",
		toNode,
		toSide: "left",
		toEnd: "arrow",
		label,
	};
}

function makeNodeMap(nodes: CanvasNodeData[]): Map<string, CanvasNodeData> {
	return new Map(nodes.map((n) => [n.id, n]));
}

describe("EdgeSync", () => {
	let app: App;
	let vault: Vault;
	let fileManager: FileManager;
	let edgeSync: EdgeSync;

	beforeEach(() => {
		app = new App();
		vault = app.vault;
		fileManager = app.fileManager;
		edgeSync = new EdgeSync(app);
	});

	describe("diffEdges", () => {
		it("detects newly added edges", () => {
			edgeSync.setSnapshot([makeEdge("e1", "n1", "n2")], makeNodeMap([]));

			const current = [makeEdge("e1", "n1", "n2"), makeEdge("e2", "n3", "n4")];
			const added = edgeSync.diffEdges(current);

			expect(added).toHaveLength(1);
			expect(added[0].id).toBe("e2");
		});

		it("returns empty array when no edges added", () => {
			edgeSync.setSnapshot([makeEdge("e1", "n1", "n2")], makeNodeMap([]));

			const current = [makeEdge("e1", "n1", "n2")];
			const added = edgeSync.diffEdges(current);

			expect(added).toHaveLength(0);
		});

		it("returns empty array when edges removed (not added)", () => {
			edgeSync.setSnapshot(
				[makeEdge("e1", "n1", "n2"), makeEdge("e2", "n3", "n4")],
				makeNodeMap([]),
			);

			const current = [makeEdge("e1", "n1", "n2")];
			const added = edgeSync.diffEdges(current);

			expect(added).toHaveLength(0);
		});

		it("detects multiple added edges", () => {
			edgeSync.setSnapshot([], makeNodeMap([]));

			const current = [makeEdge("e1", "n1", "n2"), makeEdge("e2", "n3", "n4")];
			const added = edgeSync.diffEdges(current);

			expect(added).toHaveLength(2);
		});
	});

	describe("diffRemovedEdges", () => {
		it("detects removed edges", () => {
			edgeSync.setSnapshot(
				[makeEdge("e1", "n1", "n2"), makeEdge("e2", "n3", "n4")],
				makeNodeMap([]),
			);

			const current = [makeEdge("e1", "n1", "n2")];
			const removed = edgeSync.diffRemovedEdges(current);

			expect(removed).toHaveLength(1);
			expect(removed[0].id).toBe("e2");
		});

		it("returns empty array when no edges removed", () => {
			edgeSync.setSnapshot([makeEdge("e1", "n1", "n2")], makeNodeMap([]));

			const current = [makeEdge("e1", "n1", "n2")];
			const removed = edgeSync.diffRemovedEdges(current);

			expect(removed).toHaveLength(0);
		});

		it("detects all edges removed", () => {
			edgeSync.setSnapshot(
				[makeEdge("e1", "n1", "n2"), makeEdge("e2", "n3", "n4")],
				makeNodeMap([]),
			);

			const removed = edgeSync.diffRemovedEdges([]);

			expect(removed).toHaveLength(2);
		});
	});

	describe("processNewEdge", () => {
		it("does not mutate backlinks when persisting the repair intent fails", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			vault.getAbstractFileByPath = vi.fn((path: string) =>
				path === sourceFile.path ? sourceFile : path === targetFile.path ? targetFile : null,
			);
			edgeSync.configurePersistentState({ pendingDeletions: [], pendingRepairs: [] }, async () => {
				throw new Error("settings unavailable");
			});

			await expect(edgeSync.processNewEdge(edge, { nodes, edges: [edge] })).rejects.toThrow(
				"settings unavailable",
			);

			expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
		});

		it("persists a rollback repair when both the second write and compensation fail", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			vault.getAbstractFileByPath = vi.fn((path: string) =>
				path === sourceFile.path ? sourceFile : path === targetFile.path ? targetFile : null,
			);
			const persisted: Array<ReturnType<EdgeSync["pendingRepairSnapshot"]>> = [];
			edgeSync.configurePersistentState(
				{ pendingDeletions: [], pendingRepairs: [] },
				async (state) => {
					persisted.push(structuredClone(state.pendingRepairs));
				},
			);
			let call = 0;
			fileManager.processFrontMatter = vi.fn(async (_file, update) => {
				call += 1;
				if (call === 2) throw new Error("second write failed");
				if (call === 3) throw new Error("compensation failed");
				update({});
			});

			await expect(edgeSync.processNewEdge(edge, { nodes, edges: [edge] })).rejects.toThrow(
				"Edge backlink compensation failed",
			);

			const durableRepair = persisted.at(-1) ?? [];
			expect(durableRepair).toEqual([
				expect.objectContaining({
					connection: { from: sourceFile.path, to: targetFile.path },
					mode: "add",
					phase: "rollback",
				}),
			]);

			const restarted = new EdgeSync(app);
			const afterRestart: Array<ReturnType<EdgeSync["pendingRepairSnapshot"]>> = [];
			restarted.configurePersistentState(
				{ pendingDeletions: [], pendingRepairs: durableRepair },
				async (state) => afterRestart.push(structuredClone(state.pendingRepairs)),
			);
			vault.getFiles = vi.fn().mockReturnValue([]);
			fileManager.processFrontMatter = vi.fn(async (_file, update) => update({}));

			await restarted.initializeFromVault();

			expect(restarted.pendingRepairSnapshot()).toEqual([]);
			expect(afterRestart.at(-1)).toEqual([]);
			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(2);
		});

		it("compensates the first backlink when the second write fails", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			vault.getAbstractFileByPath = vi.fn((path: string) =>
				path === sourceFile.path ? sourceFile : path === targetFile.path ? targetFile : null,
			);
			const frontmatters = new Map<TFile, Record<string, unknown>>();
			let call = 0;
			fileManager.processFrontMatter = vi.fn(async (file, update) => {
				call += 1;
				if (call === 2) throw new Error("second write failed");
				const frontmatter = frontmatters.get(file) ?? {};
				update(frontmatter);
				frontmatters.set(file, frontmatter);
			});

			await expect(edgeSync.processNewEdge(edge, { nodes, edges: [edge] })).rejects.toThrow(
				"second write failed",
			);

			expect(frontmatters.get(targetFile)?.["connections-from"]).toBeUndefined();
			expect(frontmatters.get(sourceFile)?.["connections-to"]).toBeUndefined();
			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(3);
		});

		it("compensates both backlinks when the generation changes after the first write", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			vault.getAbstractFileByPath = vi.fn((path: string) =>
				path === sourceFile.path ? sourceFile : path === targetFile.path ? targetFile : null,
			);
			const frontmatters = new Map<TFile, Record<string, unknown>>();
			let call = 0;
			fileManager.processFrontMatter = vi.fn(async (file, update) => {
				const frontmatter = frontmatters.get(file) ?? {};
				update(frontmatter);
				frontmatters.set(file, frontmatter);
				call += 1;
				if (call === 1) edgeSync.reset();
			});

			await edgeSync.processNewEdge(edge, { nodes, edges: [edge] });

			expect(frontmatters.get(targetFile)?.["connections-from"]).toBeUndefined();
			expect(frontmatters.get(sourceFile)?.["connections-to"]).toBeUndefined();
			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(4);
		});

		it("calls processFrontMatter for both files", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");

			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			vault.getAbstractFileByPath = vi.fn().mockImplementation((path: string) => {
				if (path === "notes/a.md") return sourceFile;
				if (path === "notes/b.md") return targetFile;
				return null;
			});

			await edgeSync.processNewEdge(edge, { nodes, edges: [edge] });

			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(2);
			expect(fileManager.processFrontMatter).toHaveBeenCalledWith(targetFile, expect.any(Function));
			expect(fileManager.processFrontMatter).toHaveBeenCalledWith(sourceFile, expect.any(Function));
		});

		it("writes correct frontmatter keys for both files", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");

			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			vault.getAbstractFileByPath = vi.fn().mockImplementation((path: string) => {
				if (path === "notes/a.md") return sourceFile;
				if (path === "notes/b.md") return targetFile;
				return null;
			});

			const captured: Array<{ file: TFile; fm: Record<string, unknown> }> = [];
			fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (file: TFile, fn: (fm: Record<string, unknown>) => void) => {
					const fm: Record<string, unknown> = {};
					fn(fm);
					captured.push({ file, fm });
				});

			await edgeSync.processNewEdge(edge, { nodes, edges: [edge] });

			expect(captured).toHaveLength(2);
			const targetFm = captured.find((c) => c.file === targetFile);
			const sourceFm = captured.find((c) => c.file === sourceFile);
			expect(targetFm?.fm["connections-from"]).toEqual(["[[notes/a]]"]);
			expect(sourceFm?.fm["connections-to"]).toEqual(["[[notes/b]]"]);
		});

		it("uses full vault paths when basenames collide", async () => {
			const nodes = [makeNode("n1", "projects/a.md"), makeNode("n2", "archive/topic.md")];
			const edge = makeEdge("e1", "n1", "n2");
			const sourceFile = new TFile("projects/a.md");
			const targetFile = new TFile("archive/topic.md");
			vault.getAbstractFileByPath = vi
				.fn()
				.mockImplementation((path: string) =>
					path === sourceFile.path ? sourceFile : path === targetFile.path ? targetFile : null,
				);
			const frontmatters = new Map<TFile, Record<string, unknown>>();
			fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (file: TFile, fn: (fm: Record<string, unknown>) => void) => {
					const fm = frontmatters.get(file) ?? {};
					fn(fm);
					frontmatters.set(file, fm);
				});

			await edgeSync.processNewEdge(edge, { nodes, edges: [edge] });

			expect(frontmatters.get(sourceFile)?.["connections-to"]).toEqual(["[[archive/topic]]"]);
			expect(frontmatters.get(targetFile)?.["connections-from"]).toEqual(["[[projects/a]]"]);
		});

		it("skips non-file nodes", async () => {
			const nodes = [makeNode("n1"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");

			await edgeSync.processNewEdge(edge, { nodes, edges: [edge] });

			expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
		});

		it("skips when toNode is a text node", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2")];
			const edge = makeEdge("e1", "n1", "n2");

			await edgeSync.processNewEdge(edge, { nodes, edges: [edge] });

			expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
		});

		it("skips when target file not found in vault", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");

			vault.getAbstractFileByPath = vi.fn().mockReturnValue(null);

			await edgeSync.processNewEdge(edge, { nodes, edges: [edge] });

			expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
		});
	});

	describe("processRemovedEdge", () => {
		it("restores the first backlink when the second removal fails", async () => {
			const nodes = [makeNode("n1", "a.md"), makeNode("n2", "b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			edgeSync.setSnapshot([edge], makeNodeMap(nodes));
			const sourceFile = new TFile("a.md");
			const targetFile = new TFile("b.md");
			vault.getAbstractFileByPath = vi.fn((path: string) =>
				path === sourceFile.path ? sourceFile : path === targetFile.path ? targetFile : null,
			);
			const frontmatters = new Map<TFile, Record<string, unknown>>([
				[sourceFile, { "connections-to": ["[[b]]"] }],
				[targetFile, { "connections-from": ["[[a]]"] }],
			]);
			let call = 0;
			fileManager.processFrontMatter = vi.fn(async (file, update) => {
				call += 1;
				if (call === 2) throw new Error("second removal failed");
				const frontmatter = frontmatters.get(file) ?? {};
				update(frontmatter);
				frontmatters.set(file, frontmatter);
			});

			await expect(edgeSync.processRemovedEdge(edge, [])).rejects.toThrow("second removal failed");

			expect(frontmatters.get(targetFile)?.["connections-from"]).toEqual(["[[a]]"]);
			expect(frontmatters.get(sourceFile)?.["connections-to"]).toEqual(["[[b]]"]);
			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(3);
		});

		it("calls processFrontMatter for both files on removal", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			edgeSync.setSnapshot([edge], makeNodeMap(nodes));

			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			vault.getAbstractFileByPath = vi.fn().mockImplementation((path: string) => {
				if (path === "notes/a.md") return sourceFile;
				if (path === "notes/b.md") return targetFile;
				return null;
			});

			await edgeSync.processRemovedEdge(edge, []);

			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(2);
			expect(fileManager.processFrontMatter).toHaveBeenCalledWith(sourceFile, expect.any(Function));
			expect(fileManager.processFrontMatter).toHaveBeenCalledWith(targetFile, expect.any(Function));
		});

		it("skips removal when another edge exists between same pair", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge1 = makeEdge("e1", "n1", "n2");
			const edge2 = makeEdge("e2", "n1", "n2");
			edgeSync.setSnapshot([edge1, edge2], makeNodeMap(nodes));

			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			vault.getAbstractFileByPath = vi.fn().mockImplementation((path: string) => {
				if (path === "notes/a.md") return sourceFile;
				if (path === "notes/b.md") return targetFile;
				return null;
			});

			await edgeSync.processRemovedEdge(edge1, [edge2]);

			expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
		});

		it("removes a directed connection when only its reverse remains", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge1 = makeEdge("e1", "n1", "n2");
			const reverseEdge = makeEdge("e2", "n2", "n1");
			edgeSync.setSnapshot([edge1, reverseEdge], makeNodeMap(nodes));

			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			vault.getAbstractFileByPath = vi.fn().mockImplementation((path: string) => {
				if (path === "notes/a.md") return sourceFile;
				if (path === "notes/b.md") return targetFile;
				return null;
			});

			await edgeSync.processRemovedEdge(edge1, [reverseEdge]);

			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(2);
		});

		it("removes connection when source is TFile but target is not", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			edgeSync.setSnapshot([edge], makeNodeMap(nodes));

			const sourceFile = new TFile("notes/a.md");
			vault.getAbstractFileByPath = vi.fn().mockImplementation((path: string) => {
				if (path === "notes/a.md") return sourceFile;
				return null;
			});

			await edgeSync.processRemovedEdge(edge, []);

			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
			expect(fileManager.processFrontMatter).toHaveBeenCalledWith(sourceFile, expect.any(Function));
		});

		it("removes connection when target is TFile but source is not", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			edgeSync.setSnapshot([edge], makeNodeMap(nodes));

			const targetFile = new TFile("notes/b.md");
			vault.getAbstractFileByPath = vi.fn().mockImplementation((path: string) => {
				if (path === "notes/b.md") return targetFile;
				return null;
			});

			await edgeSync.processRemovedEdge(edge, []);

			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
			expect(fileManager.processFrontMatter).toHaveBeenCalledWith(targetFile, expect.any(Function));
		});

		it("does not remove an ambiguous legacy basename backlink", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "one/topic.md")];
			const edge = makeEdge("e1", "n1", "n2");
			edgeSync.setSnapshot([edge], makeNodeMap(nodes));
			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("one/topic.md");
			const collidingFile = new TFile("two/topic.md");
			vault.getMarkdownFiles = vi.fn().mockReturnValue([sourceFile, targetFile, collidingFile]);
			vault.getAbstractFileByPath = vi.fn((path: string) => {
				if (path === sourceFile.path) return sourceFile;
				if (path === targetFile.path) return targetFile;
				return null;
			});
			const frontmatters = new Map<TFile, Record<string, unknown>>([
				[sourceFile, { "connections-to": ["[[topic]]"] }],
				[targetFile, { "connections-from": ["[[a]]"] }],
			]);
			fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (file: TFile, fn: (fm: Record<string, unknown>) => void) => {
					const fm = frontmatters.get(file) ?? {};
					fn(fm);
					frontmatters.set(file, fm);
				});

			await edgeSync.processRemovedEdge(edge, []);

			expect(frontmatters.get(sourceFile)?.["connections-to"]).toEqual(["[[topic]]"]);
		});

		it("skips when node files cannot be resolved", async () => {
			const nodes = [makeNode("n1"), makeNode("n2")];
			const edge = makeEdge("e1", "n1", "n2");
			edgeSync.setSnapshot([edge], makeNodeMap(nodes));

			await edgeSync.processRemovedEdge(edge, []);

			expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
		});
	});

	describe("onCanvasModified", () => {
		it("detects a deletion on the first modify after the vault index is initialized", async () => {
			const canvasFile = new TFile("first-delete.canvas");
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			vault.getFiles = vi.fn().mockReturnValue([canvasFile]);
			vault.getAbstractFileByPath = vi.fn((path: string) =>
				path === sourceFile.path ? sourceFile : path === targetFile.path ? targetFile : null,
			);
			vault.read = vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify({ nodes, edges: [edge] }))
				.mockResolvedValueOnce(JSON.stringify({ nodes, edges: [] }));

			await edgeSync.initializeFromVault();
			await edgeSync.onCanvasModified(canvasFile);

			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(2);
		});

		it("ignores non-.canvas files", async () => {
			const file = new TFile("notes/test.md");
			await edgeSync.onCanvasModified(file);

			expect(vault.read).not.toHaveBeenCalled();
		});

		it("processes new edges from .canvas file", async () => {
			const canvasFile = new TFile("test.canvas");
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const canvasData: CanvasData = {
				nodes,
				edges: [makeEdge("e1", "n1", "n2")],
			};

			vault.read = vi.fn().mockResolvedValue(JSON.stringify(canvasData));

			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			vault.getAbstractFileByPath = vi.fn().mockImplementation((path: string) => {
				if (path === "notes/a.md") return sourceFile;
				if (path === "notes/b.md") return targetFile;
				return null;
			});

			edgeSync.setSnapshot([], makeNodeMap([]));

			await edgeSync.onCanvasModified(canvasFile);

			expect(fileManager.processFrontMatter).toHaveBeenCalled();
		});

		it("processes removed edges from .canvas file", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const initialEdge = makeEdge("e1", "n1", "n2");

			const canvasFile = new TFile("test.canvas");
			const canvasData: CanvasData = { nodes, edges: [initialEdge] };

			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			vault.getAbstractFileByPath = vi.fn().mockImplementation((path: string) => {
				if (path === "notes/a.md") return sourceFile;
				if (path === "notes/b.md") return targetFile;
				return null;
			});
			vault.read = vi.fn().mockResolvedValue(JSON.stringify(canvasData));
			await edgeSync.initializeFromCanvas(canvasFile);
			vault.read = vi.fn().mockResolvedValue(JSON.stringify({ nodes, edges: [] }));
			await edgeSync.onCanvasModified(canvasFile);

			expect(fileManager.processFrontMatter).toHaveBeenCalled();
		});

		it("keeps snapshots isolated between canvas files", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			const firstCanvas = new TFile("first.canvas");
			const secondCanvas = new TFile("second.canvas");
			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			vault.getAbstractFileByPath = vi.fn().mockImplementation((path: string) => {
				if (path === sourceFile.path) return sourceFile;
				if (path === targetFile.path) return targetFile;
				return null;
			});
			vault.read = vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify({ nodes, edges: [edge] }))
				.mockResolvedValueOnce(JSON.stringify({ nodes, edges: [edge] }))
				.mockResolvedValueOnce(JSON.stringify({ nodes, edges: [edge] }))
				.mockResolvedValueOnce(JSON.stringify({ nodes, edges: [] }));

			await edgeSync.initializeFromCanvas(firstCanvas);
			await edgeSync.initializeFromCanvas(secondCanvas);
			await edgeSync.onCanvasModified(firstCanvas);
			await edgeSync.onCanvasModified(secondCanvas);

			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(2);
		});

		it("replaces backlinks when an edge keeps its id but changes endpoints", async () => {
			const canvasFile = new TFile("board.canvas");
			const oldNodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const newNodes = [...oldNodes, makeNode("n3", "notes/c.md")];
			const oldEdge = makeEdge("e1", "n1", "n2");
			const newEdge = makeEdge("e1", "n1", "n3");
			const files = new Map(
				["notes/a.md", "notes/b.md", "notes/c.md"].map((path) => [path, new TFile(path)]),
			);
			vault.getAbstractFileByPath = vi.fn((path: string) => files.get(path) ?? null);
			vault.getMarkdownFiles = vi.fn().mockReturnValue([...files.values()]);
			vault.getFiles = vi.fn().mockReturnValue([canvasFile]);
			vault.read = vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify({ nodes: oldNodes, edges: [oldEdge] }))
				.mockResolvedValueOnce(JSON.stringify({ nodes: newNodes, edges: [newEdge] }));
			const frontmatters = new Map<TFile, Record<string, unknown>>([
				[files.get("notes/a.md")!, { "connections-to": ["[[b]]"] }],
				[files.get("notes/b.md")!, { "connections-from": ["[[a]]"] }],
			]);
			fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (file: TFile, fn: (fm: Record<string, unknown>) => void) => {
					const fm = frontmatters.get(file) ?? {};
					fn(fm);
					frontmatters.set(file, fm);
				});

			await edgeSync.initializeFromCanvas(canvasFile);
			await edgeSync.onCanvasModified(canvasFile);

			expect(frontmatters.get(files.get("notes/a.md")!)?.["connections-to"]).toEqual([
				"[[notes/c]]",
			]);
			expect(frontmatters.get(files.get("notes/b.md")!)?.["connections-from"]).toBeUndefined();
			expect(frontmatters.get(files.get("notes/c.md")!)?.["connections-from"]).toEqual([
				"[[notes/a]]",
			]);
		});

		it("replaces backlinks when a node file changes without changing edge ids", async () => {
			const canvasFile = new TFile("board.canvas");
			const edge = makeEdge("e1", "n1", "n2");
			const oldNodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const newNodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/c.md")];
			const files = new Map(
				["notes/a.md", "notes/b.md", "notes/c.md"].map((path) => [path, new TFile(path)]),
			);
			vault.getAbstractFileByPath = vi.fn((path: string) => files.get(path) ?? null);
			vault.getFiles = vi.fn().mockReturnValue([canvasFile]);
			vault.read = vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify({ nodes: oldNodes, edges: [edge] }))
				.mockResolvedValueOnce(JSON.stringify({ nodes: newNodes, edges: [edge] }));

			await edgeSync.initializeFromCanvas(canvasFile);
			await edgeSync.onCanvasModified(canvasFile);

			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(4);
		});

		it("retains backlinks while another canvas still has the same connection", async () => {
			const firstCanvas = new TFile("first.canvas");
			const secondCanvas = new TFile("second.canvas");
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			vault.getFiles = vi.fn().mockReturnValue([firstCanvas, secondCanvas]);
			vault.read = vi.fn().mockImplementation(async (file: TFile) => {
				if (file === firstCanvas) return JSON.stringify({ nodes, edges: [] });
				return JSON.stringify({ nodes, edges: [edge] });
			});
			edgeSync.setSnapshot([edge], makeNodeMap(nodes));
			await edgeSync.initializeFromCanvas(secondCanvas);
			// Restore the first canvas snapshot after initializing the other canvas.
			vault.read = vi.fn().mockResolvedValueOnce(JSON.stringify({ nodes, edges: [edge] }));
			await edgeSync.initializeFromCanvas(firstCanvas);
			vault.read = vi.fn().mockImplementation(async (file: TFile) => {
				if (file === firstCanvas) return JSON.stringify({ nodes, edges: [] });
				return JSON.stringify({ nodes, edges: [edge] });
			});
			fileManager.processFrontMatter.mockClear();

			await edgeSync.onCanvasModified(firstCanvas);

			expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
		});

		it("uses the initialized index instead of rereading every Canvas on edge removal", async () => {
			const firstCanvas = new TFile("first.canvas");
			const secondCanvas = new TFile("second.canvas");
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			vault.getFiles = vi.fn().mockReturnValue([firstCanvas, secondCanvas]);
			vault.read = vi.fn().mockResolvedValue(JSON.stringify({ nodes, edges: [edge] }));

			await edgeSync.initializeFromVault();
			vault.read = vi.fn().mockResolvedValue(JSON.stringify({ nodes, edges: [] }));
			await edgeSync.onCanvasModified(firstCanvas);

			expect(vault.read).toHaveBeenCalledTimes(1);
			expect(vault.read).toHaveBeenCalledWith(firstCanvas);
			expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
		});

		it.each(["read", "parse"] as const)(
			"defers deletion when another canvas has a %s failure",
			async (failure) => {
				const currentCanvas = new TFile("current.canvas");
				const otherCanvas = new TFile("other.canvas");
				const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
				const edge = makeEdge("e1", "n1", "n2");
				const sourceFile = new TFile("notes/a.md");
				const targetFile = new TFile("notes/b.md");
				vault.getAbstractFileByPath = vi.fn((path: string) => {
					if (path === sourceFile.path) return sourceFile;
					if (path === targetFile.path) return targetFile;
					return null;
				});
				vault.getFiles = vi.fn().mockReturnValue([currentCanvas, otherCanvas]);
				vault.read = vi.fn().mockResolvedValue(JSON.stringify({ nodes, edges: [edge] }));
				await edgeSync.initializeFromCanvas(currentCanvas);
				vault.read = vi.fn().mockImplementation(async (file: TFile) => {
					if (file === currentCanvas) return JSON.stringify({ nodes, edges: [] });
					if (failure === "read") throw new Error("unavailable");
					return "invalid json";
				});

				await expect(edgeSync.onCanvasModified(currentCanvas)).resolves.toBeUndefined();
				expect(fileManager.processFrontMatter).not.toHaveBeenCalled();

				vault.read = vi.fn().mockImplementation(async (file: TFile) => {
					if (file === currentCanvas) return JSON.stringify({ nodes, edges: [] });
					return JSON.stringify({ nodes: [], edges: [] });
				});
				await expect(edgeSync.onCanvasModified(currentCanvas)).resolves.toBeUndefined();
				expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(2);
			},
		);

		it("isolates a corrupt Canvas, keeps valid additions live, and removes once after repair", async () => {
			const healthyCanvas = new TFile("healthy.canvas");
			const corruptCanvas = new TFile("corrupt.canvas");
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			const contents = new Map<TFile, string>([
				[healthyCanvas, JSON.stringify({ nodes, edges: [] })],
				[corruptCanvas, "invalid json"],
			]);
			vault.getFiles = vi.fn().mockReturnValue([healthyCanvas, corruptCanvas]);
			vault.read = vi.fn(async (file: TFile) => contents.get(file) ?? "");
			vault.getAbstractFileByPath = vi.fn((path: string) =>
				path === sourceFile.path ? sourceFile : path === targetFile.path ? targetFile : null,
			);
			const persisted: Array<ReturnType<EdgeSync["pendingDeletionSnapshot"]>> = [];
			edgeSync.configurePersistentState(
				{ pendingDeletions: [], pendingRepairs: [] },
				async (state) => persisted.push(structuredClone(state.pendingDeletions)),
			);

			await expect(edgeSync.initializeFromVault()).resolves.toBeUndefined();

			contents.set(healthyCanvas, JSON.stringify({ nodes, edges: [edge] }));
			await edgeSync.onCanvasModified(healthyCanvas);
			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(2);

			contents.set(healthyCanvas, JSON.stringify({ nodes, edges: [] }));
			await edgeSync.onCanvasModified(healthyCanvas);
			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(2);
			expect(edgeSync.pendingDeletionSnapshot()).toEqual([
				expect.objectContaining({
					canvasPath: healthyCanvas.path,
					connections: [{ from: sourceFile.path, to: targetFile.path }],
				}),
			]);
			expect(persisted.at(-1)).toHaveLength(1);

			contents.set(corruptCanvas, JSON.stringify({ nodes: [], edges: [] }));
			await edgeSync.onCanvasModified(corruptCanvas);
			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(4);
			expect(edgeSync.pendingDeletionSnapshot()).toEqual([]);

			await edgeSync.onCanvasModified(corruptCanvas);
			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(4);
		});
	});

	describe("onCanvasDeleted", () => {
		it("discards a persisted tombstone when a recreated Canvas owns the connection after restart", async () => {
			const canvasFile = new TFile("same.canvas");
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			const persistedStates: Array<ReturnType<EdgeSync["pendingDeletionSnapshot"]>> = [];
			vault.getFiles = vi.fn().mockReturnValue([canvasFile]);
			vault.read = vi.fn().mockResolvedValue(JSON.stringify({ nodes, edges: [edge] }));
			edgeSync.configurePersistentState(
				{
					pendingDeletions: [
						{
							canvasPath: canvasFile.path,
							fingerprint: "deleted-version",
							connections: [{ from: "notes/a.md", to: "notes/b.md" }],
						},
					],
					pendingRepairs: [],
				},
				async (state) => persistedStates.push(structuredClone(state.pendingDeletions)),
			);

			await edgeSync.initializeFromVault();

			expect(edgeSync.pendingDeletionSnapshot()).toEqual([]);
			expect(persistedStates.at(-1)).toEqual([]);
			expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
		});

		it("does not let a pending tombstone remove a recreated Canvas at the same path", async () => {
			const canvasFile = new TFile("same.canvas");
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			vault.getFiles = vi.fn().mockReturnValue([canvasFile]);
			vault.getAbstractFileByPath = vi.fn((path: string) =>
				path === sourceFile.path ? sourceFile : path === targetFile.path ? targetFile : null,
			);
			vault.read = vi.fn().mockResolvedValue(JSON.stringify({ nodes, edges: [edge] }));
			edgeSync.configurePersistentState(
				{ pendingDeletions: [], pendingRepairs: [] },
				async () => {},
			);
			await edgeSync.initializeFromVault();
			fileManager.processFrontMatter = vi.fn().mockRejectedValue(new Error("offline"));

			await expect(edgeSync.onCanvasDeleted(canvasFile.path)).rejects.toThrow("offline");
			expect(edgeSync.pendingDeletionSnapshot()).toHaveLength(1);
			const frontmatters = new Map<TFile, Record<string, unknown>>();
			fileManager.processFrontMatter = vi.fn(async (file, update) => {
				const frontmatter = frontmatters.get(file) ?? {};
				update(frontmatter);
				frontmatters.set(file, frontmatter);
			});

			await edgeSync.onCanvasCreated(canvasFile);

			expect(edgeSync.pendingDeletionSnapshot()).toEqual([]);
			expect(frontmatters.get(targetFile)?.["connections-from"]).toEqual(["[[notes/a]]"]);
			expect(frontmatters.get(sourceFile)?.["connections-to"]).toEqual(["[[notes/b]]"]);
			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(2);
		});

		it("serializes a content-bearing create behind initialization and indexes its connection", async () => {
			const initialCanvas = new TFile("initial.canvas");
			const createdCanvas = new TFile("created.canvas");
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			let releaseInitial!: () => void;
			const initialRead = new Promise<void>((resolve) => {
				releaseInitial = resolve;
			});
			vault.getFiles = vi.fn().mockReturnValue([initialCanvas]);
			vault.getAbstractFileByPath = vi.fn((path: string) =>
				path === sourceFile.path ? sourceFile : path === targetFile.path ? targetFile : null,
			);
			vault.read = vi.fn(async (file: TFile) => {
				if (file === initialCanvas) {
					await initialRead;
					return JSON.stringify({ nodes, edges: [edge] });
				}
				return JSON.stringify({ nodes, edges: [edge] });
			});

			const initializing = edgeSync.initializeFromVault();
			const creating = edgeSync.onCanvasCreated(createdCanvas);
			releaseInitial();
			await Promise.all([initializing, creating]);
			fileManager.processFrontMatter.mockClear();

			await edgeSync.onCanvasDeleted(initialCanvas.path);

			expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
			expect(vault.read).toHaveBeenNthCalledWith(1, initialCanvas);
			expect(vault.read).toHaveBeenNthCalledWith(2, createdCanvas);
		});

		it("keeps backlinks while another Canvas contains the same connection", async () => {
			const firstCanvas = new TFile("first.canvas");
			const secondCanvas = new TFile("second.canvas");
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			vault.getFiles = vi.fn().mockReturnValue([firstCanvas, secondCanvas]);
			vault.read = vi.fn().mockResolvedValue(JSON.stringify({ nodes, edges: [edge] }));

			await edgeSync.initializeFromVault();
			await edgeSync.onCanvasDeleted(firstCanvas.path);

			expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
		});

		it("removes backlinks when the deleted Canvas was the final owner", async () => {
			const canvasFile = new TFile("only.canvas");
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			vault.getFiles = vi.fn().mockReturnValue([canvasFile]);
			vault.getAbstractFileByPath = vi.fn((path: string) =>
				path === sourceFile.path ? sourceFile : path === targetFile.path ? targetFile : null,
			);
			vault.read = vi.fn().mockResolvedValue(JSON.stringify({ nodes, edges: [edge] }));

			await edgeSync.initializeFromVault();
			await edgeSync.onCanvasDeleted(canvasFile.path);

			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(2);
		});

		it("persists partial deletion cleanup and retries it after restart", async () => {
			const canvasFile = new TFile("deleted.canvas");
			const nodes = [
				makeNode("n1", "notes/a.md"),
				makeNode("n2", "notes/b.md"),
				makeNode("n3", "notes/c.md"),
				makeNode("n4", "notes/d.md"),
			];
			const edges = [makeEdge("e1", "n1", "n2"), makeEdge("e2", "n3", "n4")];
			const noteFiles = new Map(
				["notes/a.md", "notes/b.md", "notes/c.md", "notes/d.md"].map((path) => [
					path,
					new TFile(path),
				]),
			);
			vault.getFiles = vi.fn().mockReturnValue([canvasFile]);
			vault.getAbstractFileByPath = vi.fn((path: string) => noteFiles.get(path) ?? null);
			vault.read = vi.fn().mockResolvedValue(JSON.stringify({ nodes, edges }));
			const persisted: Array<ReturnType<EdgeSync["pendingDeletionSnapshot"]>> = [];
			edgeSync.configurePersistentState(
				{ pendingDeletions: [], pendingRepairs: [] },
				async (state) => {
					persisted.push(structuredClone(state.pendingDeletions));
				},
			);
			await edgeSync.initializeFromVault();
			let mutation = 0;
			fileManager.processFrontMatter = vi.fn(async (_file, update) => {
				mutation += 1;
				if (mutation === 3) throw new Error("iCloud write failed");
				update({
					"connections-to": ["[[notes/b]]", "[[notes/d]]"],
					"connections-from": ["[[notes/a]]", "[[notes/c]]"],
				});
			});

			await expect(edgeSync.onCanvasDeleted(canvasFile.path)).rejects.toThrow(
				"iCloud write failed",
			);
			const durablePending = persisted.at(-1) ?? [];
			expect(durablePending).toEqual([
				{
					canvasPath: canvasFile.path,
					fingerprint: expect.any(String),
					connections: [{ from: "notes/c.md", to: "notes/d.md" }],
				},
			]);

			const restarted = new EdgeSync(app);
			const afterRestart: Array<ReturnType<EdgeSync["pendingDeletionSnapshot"]>> = [];
			restarted.configurePersistentState(
				{ pendingDeletions: durablePending, pendingRepairs: [] },
				async (state) => {
					afterRestart.push(structuredClone(state.pendingDeletions));
				},
			);
			vault.getFiles = vi.fn().mockReturnValue([]);
			fileManager.processFrontMatter = vi.fn(async (_file, update) =>
				update({
					"connections-to": ["[[notes/d]]"],
					"connections-from": ["[[notes/c]]"],
				}),
			);

			await restarted.initializeFromVault();

			expect(restarted.pendingDeletionSnapshot()).toEqual([]);
			expect(afterRestart.at(-1)).toEqual([]);
			expect(fileManager.processFrontMatter).toHaveBeenCalledTimes(2);
		});
	});

	describe("onCanvasModified - invalid JSON", () => {
		it("returns early when canvas file contains invalid JSON", async () => {
			const canvasFile = new TFile("test.canvas");
			vault.read = vi.fn().mockResolvedValue("not valid json");
			await edgeSync.onCanvasModified(canvasFile);
			expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
		});

		it("returns early when nodes or edges are missing", async () => {
			const canvasFile = new TFile("test.canvas");
			vault.read = vi.fn().mockResolvedValue(JSON.stringify({ nodes: [] }));

			await expect(edgeSync.onCanvasModified(canvasFile)).resolves.toBeUndefined();
			expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
		});
	});

	describe("processNewEdge - source file not in vault", () => {
		it("skips when source file not found in vault", async () => {
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			const targetFile = new TFile("notes/b.md");
			vault.getAbstractFileByPath = vi.fn().mockImplementation((path: string) => {
				if (path === "notes/b.md") return targetFile;
				return null;
			});
			await edgeSync.processNewEdge(edge, { nodes, edges: [edge] });
			expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
		});
	});

	describe("initializeFromCanvas", () => {
		it("sets snapshot from canvas data", async () => {
			const canvasFile = new TFile("test.canvas");
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const canvasData: CanvasData = {
				nodes,
				edges: [makeEdge("e1", "n1", "n2"), makeEdge("e2", "n3", "n4")],
			};

			vault.read = vi.fn().mockResolvedValue(JSON.stringify(canvasData));

			await edgeSync.initializeFromCanvas(canvasFile);

			const added = edgeSync.diffEdges(canvasData.edges);
			expect(added).toHaveLength(0);
		});
	});

	describe("initializeFromCanvas - invalid JSON", () => {
		it("returns early when canvas file contains invalid JSON", async () => {
			const canvasFile = new TFile("test.canvas");
			vault.read = vi.fn().mockResolvedValue("not valid json");
			await edgeSync.initializeFromCanvas(canvasFile);
			const added = edgeSync.diffEdges([makeEdge("e1", "n1", "n2")]);
			expect(added).toHaveLength(1);
		});
	});

	describe("initializeFromVault concurrency", () => {
		it("reads at most four Canvas files concurrently", async () => {
			const canvasFiles = Array.from({ length: 8 }, (_, index) => new TFile(`${index}.canvas`));
			vault.getFiles = vi.fn().mockReturnValue(canvasFiles);
			const releases: Array<() => void> = [];
			let active = 0;
			let peak = 0;
			vault.read = vi.fn(async () => {
				active += 1;
				peak = Math.max(peak, active);
				await new Promise<void>((resolve) => releases.push(resolve));
				active -= 1;
				return JSON.stringify({ nodes: [], edges: [] });
			});

			const initializing = edgeSync.initializeFromVault();
			await vi.waitFor(() => expect(vault.read).toHaveBeenCalledTimes(4));
			expect(peak).toBe(4);
			releases.splice(0).forEach((release) => release());
			await vi.waitFor(() => expect(vault.read).toHaveBeenCalledTimes(8));
			releases.splice(0).forEach((release) => release());
			await initializing;

			expect(vault.read).toHaveBeenCalledTimes(8);
			expect(peak).toBe(4);
		});

		it("does not start queued reads after reset", async () => {
			const canvasFiles = Array.from({ length: 8 }, (_, index) => new TFile(`${index}.canvas`));
			vault.getFiles = vi.fn().mockReturnValue(canvasFiles);
			const releases: Array<() => void> = [];
			vault.read = vi.fn(
				() =>
					new Promise<string>((resolve) =>
						releases.push(() => resolve(JSON.stringify({ nodes: [], edges: [] }))),
					),
			);

			const initializing = edgeSync.initializeFromVault();
			await vi.waitFor(() => expect(vault.read).toHaveBeenCalledTimes(4));
			edgeSync.reset();
			releases.forEach((release) => release());
			await initializing;

			expect(vault.read).toHaveBeenCalledTimes(4);
		});
	});

	describe("reset", () => {
		it("clears the snapshot", () => {
			edgeSync.setSnapshot([makeEdge("e1", "n1", "n2")], makeNodeMap([]));
			edgeSync.reset();

			const added = edgeSync.diffEdges([makeEdge("e1", "n1", "n2")]);
			expect(added).toHaveLength(1);
		});

		it("invalidates in-flight work and serializes the next initialization", async () => {
			const canvasFile = new TFile("board.canvas");
			const nodes = [makeNode("n1", "notes/a.md"), makeNode("n2", "notes/b.md")];
			const edge = makeEdge("e1", "n1", "n2");
			const sourceFile = new TFile("notes/a.md");
			const targetFile = new TFile("notes/b.md");
			vault.getAbstractFileByPath = vi.fn((path: string) => {
				if (path === sourceFile.path) return sourceFile;
				if (path === targetFile.path) return targetFile;
				return null;
			});
			let releaseRead!: (value: string) => void;
			const slowRead = new Promise<string>((resolve) => {
				releaseRead = resolve;
			});
			vault.read = vi
				.fn()
				.mockReturnValueOnce(slowRead)
				.mockResolvedValueOnce(JSON.stringify({ nodes, edges: [] }));

			const staleModification = edgeSync.onCanvasModified(canvasFile);
			await vi.waitFor(() => expect(vault.read).toHaveBeenCalledTimes(1));
			edgeSync.reset();
			const initialization = edgeSync.initializeFromCanvas(canvasFile);
			expect(vault.read).toHaveBeenCalledTimes(1);

			releaseRead(JSON.stringify({ nodes, edges: [edge] }));
			await staleModification;
			await initialization;

			expect(vault.read).toHaveBeenCalledTimes(2);
			expect(fileManager.processFrontMatter).not.toHaveBeenCalled();
			expect(edgeSync.diffEdges([edge])).toEqual([edge]);
		});
	});
});
