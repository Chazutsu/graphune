import { classifySourceKind, HeadingParser } from "@/services/heading-parser";
import { App, TFile } from "obsidian";
import { type Mock, beforeEach, describe, expect, it } from "vitest";

describe("classifySourceKind", () => {
	it.each([
		[
			"Clippings/Design systems.md",
			"Design systems",
			{ source: "https://example.com" },
			[],
			"clipping",
		],
		["Kindle/Thinking in Systems.md", "Thinking in Systems", {}, [], "kindle"],
		["Daily/2026-10-13.md", "2026-10-13", {}, [], "daily"],
		["Notes/Emergence.md", "Emergence", {}, ["concept"], "note"],
	] as const)("classifies %s as %s", (path, basename, frontmatter, tags, expected) => {
		expect(classifySourceKind(path, basename, frontmatter, tags)).toBe(expected);
	});

	it("prefers Kindle over a generic web source", () => {
		expect(
			classifySourceKind(
				"Readwise/Books/Designing Data-Intensive Applications.md",
				"Designing Data-Intensive Applications",
				{ source: "https://readwise.io/bookreview/1" },
				["kindle"],
			),
		).toBe("kindle");
	});
});

describe("HeadingParser", () => {
	let app: App;
	let parser: HeadingParser;

	beforeEach(() => {
		app = new App();
		parser = new HeadingParser(app);
	});

	describe("search", () => {
		it("lists note metadata immediately without reading content", () => {
			const file = new TFile("notes/immediate.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);

			const result = parser.list();

			expect(result[0]?.file).toBe(file);
			expect(result[0]?.excerpt).toBe("");
			expect(app.vault.cachedRead).not.toHaveBeenCalled();
		});

		it("returns all files for an empty query with excerpts", async () => {
			const file1 = new TFile("notes/with-content.md");
			const file2 = new TFile("notes/empty.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file1, file2]);
			(app.vault.cachedRead as Mock).mockImplementation((file: TFile) => {
				if (file.path === "notes/with-content.md") {
					return Promise.resolve("First line\nSecond line\nThird line");
				}
				return Promise.resolve("");
			});

			const result = await parser.search("");

			expect(result).toHaveLength(2);
			expect(result[0].file).toBe(file1);
			expect(result[0].excerpt).toBe("First line\nSecond line\nThird line");
			expect(result[1].file).toBe(file2);
			expect(result[1].excerpt).toBe("");
		});

		it("strips frontmatter from excerpt", async () => {
			const file = new TFile("notes/with-fm.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
			(app.vault.cachedRead as Mock).mockResolvedValue(
				"---\ntitle: Test\n---\nFirst body line\nSecond line",
			);

			const result = await parser.search("");

			expect(result).toHaveLength(1);
			expect(result[0].excerpt).toBe("First body line\nSecond line");
		});

		it("includes headings from the metadata cache", async () => {
			const file = new TFile("notes/with-headings.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
			(app.vault.cachedRead as Mock).mockResolvedValue("# Note\n\n## Setup\n\nBody");
			(app.metadataCache.getFileCache as Mock).mockReturnValue({
				headings: [
					{
						heading: "Setup",
						level: 2,
						position: {
							start: { line: 2, col: 0, offset: 8 },
							end: { line: 2, col: 7, offset: 15 },
						},
					},
				],
			});

			const result = await parser.search("");

			expect(result[0]?.headings).toHaveLength(1);
			expect(result[0]?.headings[0]?.heading).toBe("Setup");
		});

		it("includes normalized inline and frontmatter tags", async () => {
			const file = new TFile("research/paper.md");
			file.parent = { path: "research" } as never;
			file.stat.mtime = 42;
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
			(app.vault.cachedRead as Mock).mockResolvedValue("content");
			(app.metadataCache.getFileCache as Mock).mockReturnValue({
				tags: [{ tag: "#research" }],
				frontmatter: { tags: ["source", "#research"] },
			});

			const result = await parser.search("");

			expect(result[0]?.tags).toEqual(["research", "source"]);
			expect(result[0]?.folder).toBe("research");
			expect(result[0]?.modifiedTime).toBe(42);
		});

		it("preserves a single paragraph boundary in excerpt", async () => {
			const file = new TFile("notes/blanks.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
			(app.vault.cachedRead as Mock).mockResolvedValue("\n\nFirst\n\nSecond\n\nThird\n\nFourth");

			const result = await parser.search("");

			expect(result[0].excerpt).toBe("First\n\nSecond\n\nThird");
		});

		it("uses body copy instead of headings for the library excerpt", async () => {
			const file = new TFile("notes/structured.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
			(app.vault.cachedRead as Mock).mockResolvedValue(
				"# Note title\n\n## Context\n\nFirst body line\n\n### Detail\n\nSecond body line",
			);

			const result = await parser.search("");

			expect(result[0].excerpt).toBe("First body line\n\nSecond body line");
		});

		it("omits complete fenced code blocks from the library excerpt", async () => {
			const file = new TFile("notes/code.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
			(app.vault.cachedRead as Mock).mockResolvedValue(
				"Intro copy\n\n```bash\npnpm install\npnpm build\n```\n\nNext step\nFinal note",
			);

			const result = await parser.search("");

			expect(result[0].excerpt).toBe("Intro copy\n\nNext step\nFinal note");
		});

		it("does not leak an unterminated code fence into the excerpt", async () => {
			const file = new TFile("notes/broken-code.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
			(app.vault.cachedRead as Mock).mockResolvedValue(
				"Visible introduction\n\n~~~ts\nconst unfinished = true;",
			);

			const result = await parser.search("");

			expect(result[0].excerpt).toBe("Visible introduction");
		});

		it("does not match content that exists only inside a fenced code block", async () => {
			const file = new TFile("notes/code-only.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
			(app.vault.cachedRead as Mock).mockResolvedValue("Intro\n\n```ts\nsecretNeedle()\n```");

			const result = await parser.search("secretNeedle");

			expect(result).toEqual([]);
		});

		it("keeps nearby body copy when a search matches a heading", async () => {
			const file = new TFile("notes/structured.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
			(app.vault.cachedRead as Mock).mockResolvedValue(
				"Intro copy\n## Spatial context\nExplanation below the heading",
			);

			const result = await parser.search("spatial");

			expect(result[0].excerpt).toBe("Intro copy\n\nExplanation below the heading");
		});

		it("matches by file title (case insensitive)", async () => {
			const file1 = new TFile("notes/Hello.md");
			const file2 = new TFile("notes/world.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file1, file2]);
			(app.vault.cachedRead as Mock).mockResolvedValue("content");

			const result = await parser.search("hello");

			expect(result).toHaveLength(1);
			expect(result[0].file).toBe(file1);
		});

		it("matches by body content (case insensitive)", async () => {
			const file1 = new TFile("notes/alpha.md");
			const file2 = new TFile("notes/beta.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file1, file2]);

			(app.vault.cachedRead as Mock).mockImplementation((file: TFile) => {
				if (file.path === "notes/alpha.md") {
					return Promise.resolve("This note contains special keyword in the body.");
				}
				return Promise.resolve("Nothing relevant here.");
			});

			const result = await parser.search("special keyword");

			expect(result).toHaveLength(1);
			expect(result[0].file).toBe(file1);
		});

		it("reads indexed file content only once when matched by title", async () => {
			const file = new TFile("notes/matching-title.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
			(app.vault.cachedRead as Mock).mockResolvedValue("content");

			const result = await parser.search("matching");

			expect(result).toHaveLength(1);
			expect(app.vault.cachedRead).toHaveBeenCalledTimes(1);
		});

		it("returns empty array when nothing matches", async () => {
			const file = new TFile("notes/hello.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
			(app.vault.cachedRead as Mock).mockResolvedValue("some content");

			const result = await parser.search("xyz");

			expect(result).toEqual([]);
		});

		it("ignores surrounding whitespace in the query", async () => {
			const file = new TFile("notes/hello.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
			(app.vault.cachedRead as Mock).mockResolvedValue("content");

			const result = await parser.search("  ");

			expect(result).toHaveLength(1);
			expect(result[0]?.file).toBe(file);
		});

		it("returns excerpt from content when matched by body", async () => {
			const file = new TFile("notes/body-match.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
			(app.vault.cachedRead as Mock).mockResolvedValue("Line one\nLine two\nLine three\nLine four");

			const result = await parser.search("line two");

			expect(result).toHaveLength(1);
			expect(result[0].excerpt).toBe("Line one\nLine two\nLine three");
		});

		it("skips an unreadable file while returning other matches", async () => {
			const readable = new TFile("notes/readable.md");
			const unreadable = new TFile("notes/unreadable.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([readable, unreadable]);
			(app.vault.cachedRead as Mock).mockImplementation((file: TFile) =>
				file === unreadable ? Promise.reject(new Error("read failed")) : Promise.resolve("keyword"),
			);

			const result = await parser.search("keyword");

			expect(result).toHaveLength(1);
			expect(result[0]?.file).toBe(readable);
		});

		it("skips an unreadable file for an empty query", async () => {
			const readable = new TFile("notes/readable.md");
			const unreadable = new TFile("notes/unreadable.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([readable, unreadable]);
			(app.vault.cachedRead as Mock).mockImplementation((file: TFile) =>
				file === unreadable ? Promise.reject(new Error("read failed")) : Promise.resolve("content"),
			);

			const result = await parser.search("");

			expect(result).toHaveLength(1);
			expect(result[0]?.file).toBe(readable);
		});

		it("reuses indexed content until the file is invalidated", async () => {
			const file = new TFile("notes/indexed.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
			(app.vault.cachedRead as Mock).mockResolvedValue("alpha beta");

			await parser.search("");
			await parser.search("beta");
			expect(app.vault.cachedRead).toHaveBeenCalledTimes(1);

			parser.invalidate(file.path);
			await parser.search("beta");
			expect(app.vault.cachedRead).toHaveBeenCalledTimes(2);
		});

		it("shares an in-flight index read between concurrent searches", async () => {
			const file = new TFile("notes/concurrent.md");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
			(app.vault.cachedRead as Mock).mockResolvedValue("alpha beta");

			await Promise.all([parser.search(""), parser.search("beta")]);

			expect(app.vault.cachedRead).toHaveBeenCalledTimes(1);
		});

		it("evicts the least recently used entry when the index reaches its limit", async () => {
			parser = new HeadingParser(app, 2);
			const first = new TFile("notes/first.md");
			const second = new TFile("notes/second.md");
			const third = new TFile("notes/third.md");
			(app.vault.cachedRead as Mock).mockResolvedValue("content");

			(app.vault.getMarkdownFiles as Mock).mockReturnValue([first, second]);
			await parser.search("");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([second, third]);
			await parser.search("");
			(app.vault.getMarkdownFiles as Mock).mockReturnValue([first]);
			await parser.search("");

			expect(app.vault.cachedRead).toHaveBeenCalledTimes(4);
		});
	});
});
