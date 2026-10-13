import { filterAndSortLibraryResults } from "@/services/library-results";
import type { SearchResult } from "@/types/plugin";
import { TFile } from "obsidian";
import { describe, expect, it } from "vitest";

function result(
	path: string,
	options: { tags?: string[]; folder?: string; modifiedTime?: number } = {},
): SearchResult {
	return {
		file: new TFile(path),
		excerpt: "",
		headings: [],
		...options,
	};
}

const results = [
	result("inbox/Zebra.md", { tags: ["idea"], folder: "inbox", modifiedTime: 20 }),
	result("research/Alpha.md", {
		tags: ["idea", "research"],
		folder: "research",
		modifiedTime: 30,
	}),
	result("research/Middle.md", { tags: ["research"], folder: "research", modifiedTime: 10 }),
];

describe("filterAndSortLibraryResults", () => {
	it("combines tag and folder filters", () => {
		const filtered = filterAndSortLibraryResults(results, {
			tag: "idea",
			folder: "research",
			sort: "updated",
		});

		expect(filtered.map(({ file }) => file.basename)).toEqual(["Alpha"]);
	});

	it("sorts by update time without mutating input", () => {
		const sorted = filterAndSortLibraryResults(results, { tag: "", folder: "", sort: "updated" });

		expect(sorted.map(({ file }) => file.basename)).toEqual(["Alpha", "Zebra", "Middle"]);
		expect(results.map(({ file }) => file.basename)).toEqual(["Zebra", "Alpha", "Middle"]);
	});

	it("sorts titles in both directions", () => {
		expect(
			filterAndSortLibraryResults(results, { tag: "", folder: "", sort: "title-asc" }).map(
				({ file }) => file.basename,
			),
		).toEqual(["Alpha", "Middle", "Zebra"]);
		expect(
			filterAndSortLibraryResults(results, { tag: "", folder: "", sort: "title-desc" }).map(
				({ file }) => file.basename,
			),
		).toEqual(["Zebra", "Middle", "Alpha"]);
	});
});
