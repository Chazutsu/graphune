import { CanvasSearch } from "@/services/canvas-search";
import type { Canvas, CanvasNode, CanvasNodeData } from "@/types/obsidian-canvas";
import { describe, expect, it, vi } from "vitest";

const nodes: CanvasNodeData[] = [
	{
		id: "file-1",
		type: "file",
		file: "notes/Atomic Habits.md",
		x: 0,
		y: 0,
		width: 400,
		height: 300,
	},
	{
		id: "text-1",
		type: "text",
		text: "Make the cue obvious\nEnvironment shapes behavior.",
		x: 500,
		y: 0,
		width: 300,
		height: 200,
	},
	{
		id: "group-1",
		type: "group",
		label: "Identity-based habits",
		x: 0,
		y: 400,
		width: 900,
		height: 500,
	},
];

describe("CanvasSearch", () => {
	it("lists searchable Canvas objects", () => {
		const results = new CanvasSearch().search(nodes, "");

		expect(results.map((result) => result.label)).toEqual([
			"Atomic Habits",
			"Identity-based habits",
			"Make the cue obvious",
		]);
	});

	it("matches labels, paths, and text content without case sensitivity", () => {
		const search = new CanvasSearch();

		expect(search.search(nodes, "NOTES/").map((result) => result.id)).toEqual(["file-1"]);
		expect(search.search(nodes, "environment").map((result) => result.id)).toEqual(["text-1"]);
		expect(search.search(nodes, "identity").map((result) => result.id)).toEqual(["group-1"]);
	});

	it("selects and zooms to a result", () => {
		const runtimeNode: CanvasNode = { id: "file-1", x: 0, y: 0, width: 400, height: 300 };
		const canvas = {
			nodes: new Map([[runtimeNode.id, runtimeNode]]),
			selectOnly: vi.fn(),
			zoomToSelection: vi.fn(),
		} as unknown as Canvas;

		expect(new CanvasSearch().focus(canvas, runtimeNode.id)).toBe(true);
		expect(canvas.selectOnly).toHaveBeenCalledWith(runtimeNode);
		expect(canvas.zoomToSelection).toHaveBeenCalled();
	});

	it("does not mutate selection when runtime node APIs are unavailable", () => {
		const canvas = {} as Canvas;
		expect(new CanvasSearch().focus(canvas, "missing")).toBe(false);
	});
});
