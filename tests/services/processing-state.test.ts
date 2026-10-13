import {
	buildProcessingStateIndex,
	createSourceKey,
	filterUnprocessedResults,
	ProcessingStateIndex,
} from "@/services/processing-state";
import type { SearchResult } from "@/types/plugin";
import { App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";

describe("processing state", () => {
	it("creates stable path/subpath and text fingerprint keys", () => {
		expect(createSourceKey({ path: "./Inbox\\Book.md", subpath: "Quote" })).toBe(
			"path:Inbox/Book.md#Quote",
		);
		expect(createSourceKey({ text: "  same text\r\n" })).toBe(
			createSourceKey({ text: "same text\n" }),
		);
	});

	it("keeps the most advanced state for the same source", () => {
		const index = new ProcessingStateIndex();
		index.record({ path: "Inbox/Clip.md", subpath: "#Claim" }, "on-canvas");
		index.record({ path: "Inbox/Clip.md", subpath: "Claim" }, "connected");
		index.record({ path: "Inbox/Clip.md", subpath: "#Claim" }, "distilled");
		expect(index.stateOf({ path: "Inbox/Clip.md", subpath: "#Claim" })).toBe("connected");
	});

	it("derives Canvas and distilled states from authoritative data", () => {
		const app = new App();
		const distilled = new TFile("Notes/Insight.md");
		app.vault.getMarkdownFiles = vi.fn().mockReturnValue([distilled]);
		app.metadataCache.getFileCache = vi.fn().mockReturnValue({
			frontmatter: {
				"graphune-state": "connected",
				"graphune-sources": [{ path: "Inbox/Clip.md", subpath: "#Claim" }, { text: "Loose quote" }],
			},
		});
		const index = buildProcessingStateIndex(app as never, {
			nodes: [
				{
					id: "canvas-source",
					type: "file",
					file: "Inbox/Other.md",
					x: 0,
					y: 0,
					width: 100,
					height: 100,
				},
			],
		});
		expect(index.stateOf({ path: "Inbox/Clip.md", subpath: "#Claim" })).toBe("connected");
		expect(index.stateOf({ text: "Loose quote" })).toBe("connected");
		expect(index.stateOf({ path: "Inbox/Other.md" })).toBe("on-canvas");
	});

	it("removes processed headings and cards from the unprocessed list", () => {
		const file = new TFile("Inbox/Article.md");
		const result: SearchResult = {
			file,
			excerpt: "",
			sourceKind: "clipping",
			headings: [
				{ heading: "Used", level: 2, position: position(1) },
				{ heading: "Fresh", level: 2, position: position(4) },
			],
		};
		const index = new ProcessingStateIndex([
			{ source: { path: file.path, subpath: "#Used" }, state: "distilled" },
		]);
		expect(
			filterUnprocessedResults([result], index)[0]?.headings.map((item) => item.heading),
		).toEqual(["Fresh"]);

		index.record({ path: file.path }, "completed");
		expect(filterUnprocessedResults([result], index)).toEqual([]);
	});
});

function position(line: number) {
	return {
		start: { line, col: 0, offset: line },
		end: { line, col: 4, offset: line + 4 },
	};
}
