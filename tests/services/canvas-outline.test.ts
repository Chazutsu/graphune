import { buildCanvasOutline, canvasNodeLabel } from "@/services/canvas-outline";
import type { CanvasNodeData } from "@/types/obsidian-canvas";
import { describe, expect, it } from "vitest";

const node = (overrides: Partial<CanvasNodeData>): CanvasNodeData => ({
	id: "node",
	type: "file",
	file: "notes/Card.md",
	x: 0,
	y: 0,
	width: 100,
	height: 80,
	...overrides,
});

describe("buildCanvasOutline", () => {
	it("中心点がSection内にあるカードを所属として空間順に並べる", () => {
		const group = node({
			id: "section",
			type: "group",
			label: "Research",
			x: 0,
			y: 0,
			width: 500,
			height: 400,
			color: "#88aaff",
			file: undefined,
		});
		const lower = node({ id: "lower", file: "Lower.md", x: 200, y: 200 });
		const upper = node({ id: "upper", file: "Upper.md", x: 100, y: 50 });
		const outside = node({ id: "outside", file: "Outside.md", x: 600, y: 0 });
		const outline = buildCanvasOutline([lower, outside, group, upper]);
		expect(outline.sections[0]).toMatchObject({
			id: "section",
			label: "Research",
			color: "#88aaff",
		});
		expect(outline.sections[0]?.members.map(({ id }) => id)).toEqual(["upper", "lower"]);
		expect(outline.ungrouped.map(({ id }) => id)).toEqual(["outside"]);
	});

	it("重なるSectionでは各Sectionの所属数へ含め、Section外へ重複させない", () => {
		const card = node({ id: "card", x: 50, y: 50 });
		const first = node({
			id: "a",
			type: "group",
			file: undefined,
			x: 0,
			y: 0,
			width: 300,
			height: 300,
		});
		const second = node({
			id: "b",
			type: "group",
			file: undefined,
			x: 20,
			y: 20,
			width: 300,
			height: 300,
		});
		const outline = buildCanvasOutline([card, first, second]);
		expect(outline.sections.map((section) => section.members.length)).toEqual([1, 1]);
		expect(outline.ungrouped).toEqual([]);
	});
});

describe("canvasNodeLabel", () => {
	it("カード種別ごとに短い目次名を返す", () => {
		expect(canvasNodeLabel(node({ file: "folder/Card.md" }))).toBe("Card");
		expect(
			canvasNodeLabel(node({ type: "text", file: undefined, text: "First line\nSecond" })),
		).toBe("First line");
		expect(
			canvasNodeLabel(node({ type: "link", file: undefined, url: "https://example.com" })),
		).toBe("https://example.com");
	});
});
