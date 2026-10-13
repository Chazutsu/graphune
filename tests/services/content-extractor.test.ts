import fs from "node:fs";
import path from "node:path";
import { ContentExtractor } from "@/services/content-extractor";
import { describe, expect, it } from "vitest";

const sampleNote = fs.readFileSync(
	path.resolve(__dirname, "../mocks/fixtures/sample-note.md"),
	"utf-8",
);

describe("ContentExtractor", () => {
	const extractor = new ContentExtractor();

	describe("extractContent", () => {
		it("extracts content under H2 (First Section)", () => {
			const result = extractor.extractContent(sampleNote, 4, 2);
			expect(result).toBe(
				"Content of the first section.\nMore content here.\n\n### Subsection 1.1\n\nNested content under subsection.",
			);
		});

		it("extracts content of the last H2 (Third Section)", () => {
			const result = extractor.extractContent(sampleNote, 17, 2);
			expect(result).toBe("Final section content.\nWith multiple lines.\nAnd some more text.");
		});

		it("extracts content including nested headings (H3 under H2)", () => {
			const result = extractor.extractContent(sampleNote, 4, 2);
			expect(result).toContain("### Subsection 1.1");
			expect(result).toContain("Nested content under subsection.");
		});

		it("returns an empty string for empty headings (next heading immediately follows)", () => {
			const emptyHeadingContent = "## Empty Section\n## Next Section\n\nContent here.";
			const result = extractor.extractContent(emptyHeadingContent, 0, 2);
			expect(result).toBe("");
		});

		it("extracts content under H1 (up to the next H1, or end of file if none)", () => {
			const content = "# Title\n\nIntro text.\n\n# Another Title\n\nOther content.";
			const result = extractor.extractContent(content, 0, 1);
			expect(result).toBe("Intro text.");
		});

		it("extracts to end of file when there is no next H1", () => {
			const result = extractor.extractContent(sampleNote, 0, 1);
			expect(result).toContain("This is an introduction paragraph.");
			expect(result).toContain("## First Section");
			expect(result).toContain("And some more text.");
		});

		it("returns an empty string for non-existent line numbers", () => {
			const result = extractor.extractContent(sampleNote, 999, 2);
			expect(result).toBe("");
		});
	});

	describe("getSectionRange", () => {
		it("returns range for a normal H2 section", () => {
			const result = extractor.getSectionRange(sampleNote, 4, 2);
			expect(result).toEqual({ contentStart: 5, contentEnd: 13 });
		});

		it("returns range for the last section (ends at file end)", () => {
			const result = extractor.getSectionRange(sampleNote, 17, 2);
			const lineCount = sampleNote.split("\n").length;
			expect(result).toEqual({ contentStart: 18, contentEnd: lineCount });
		});

		it("returns empty range for a section immediately followed by another heading", () => {
			const content = "## Empty Section\n## Next Section\n\nContent here.";
			const result = extractor.getSectionRange(content, 0, 2);
			expect(result).toEqual({ contentStart: 1, contentEnd: 1 });
		});

		it("returns range for H1 section", () => {
			const content = "# Title\n\nIntro text.\n\n# Another Title\n\nOther content.";
			const result = extractor.getSectionRange(content, 0, 1);
			expect(result).toEqual({ contentStart: 1, contentEnd: 4 });
		});

		it("returns null for out-of-range line number", () => {
			const result = extractor.getSectionRange(sampleNote, 999, 2);
			expect(result).toBeNull();
		});

		it("returns null for negative line number", () => {
			const result = extractor.getSectionRange(sampleNote, -1, 2);
			expect(result).toBeNull();
		});

		it("returns range for H3 nested section", () => {
			const result = extractor.getSectionRange(sampleNote, 9, 3);
			expect(result).toEqual({ contentStart: 10, contentEnd: 13 });
		});

		it("handles Japanese headings", () => {
			const content = "## 日本語の見出し\n\n日本語の本文です。\n\n## 次のセクション";
			const result = extractor.getSectionRange(content, 0, 2);
			expect(result).toEqual({ contentStart: 1, contentEnd: 4 });
		});
	});

	describe("extractContentWithHeading", () => {
		it("extracts content including the heading line", () => {
			const result = extractor.extractContentWithHeading(sampleNote, 17, 2);
			expect(result).toBe(
				"## Third Section\n\nFinal section content.\nWith multiple lines.\nAnd some more text.",
			);
		});

		it("extracts content under H2 with heading (First Section)", () => {
			const result = extractor.extractContentWithHeading(sampleNote, 4, 2);
			expect(result).toBe(
				"## First Section\n\nContent of the first section.\nMore content here.\n\n### Subsection 1.1\n\nNested content under subsection.",
			);
		});

		it("returns an empty string for non-existent line numbers", () => {
			const result = extractor.extractContentWithHeading(sampleNote, 999, 2);
			expect(result).toBe("");
		});
	});

	describe("code block handling", () => {
		it("does not treat # inside code blocks as headings", () => {
			const content = [
				"## Real Heading",
				"",
				"Some text.",
				"",
				"```",
				"# This is not a heading",
				"## Neither is this",
				"```",
				"",
				"## Next Real Heading",
				"",
				"Next content.",
			].join("\n");

			const result = extractor.extractContent(content, 0, 2);
			expect(result).toContain("# This is not a heading");
			expect(result).toContain("## Neither is this");
			expect(result).not.toContain("Next content.");
		});

		it("handles nested code blocks (``` inside ````)", () => {
			const content = [
				"## Heading",
				"",
				"````",
				"```",
				"## Not a heading",
				"```",
				"````",
				"",
				"## Real Next Heading",
				"",
				"Content.",
			].join("\n");

			const result = extractor.extractContent(content, 0, 2);
			expect(result).toContain("## Not a heading");
			expect(result).not.toContain("Content.");
		});

		it("handles tilde code blocks (~~~)", () => {
			const content = [
				"## Heading",
				"",
				"~~~",
				"## Not a heading",
				"~~~",
				"",
				"## Real Next Heading",
			].join("\n");

			const result = extractor.extractContent(content, 0, 2);
			expect(result).toContain("## Not a heading");
		});

		it("handles code block with language specifier", () => {
			const content = [
				"## Heading",
				"",
				"```markdown",
				"# Title in code block",
				"```",
				"",
				"## Next Heading",
			].join("\n");

			const result = extractor.extractContent(content, 0, 2);
			expect(result).toContain("# Title in code block");
		});
	});

	describe("edge cases", () => {
		it("extractSectionTree returns empty headingText when headingLine has no heading pattern", () => {
			const content = "not a heading\nsome content\n## Next";
			const tree = extractor.extractSectionTree(content, 0, 1);
			expect(tree.headingText).toBe("");
		});

		it("does not close code block when fence line has trailing text", () => {
			const content = [
				"## Heading",
				"",
				"```",
				"## Not a heading",
				"``` some trailing text",
				"## Still inside code block",
				"```",
				"",
				"## Real Next Heading",
			].join("\n");

			const result = extractor.extractContent(content, 0, 2);
			expect(result).toContain("## Not a heading");
			expect(result).toContain("## Still inside code block");
			expect(result).not.toContain("Real Next Heading");
		});
	});

	describe("frontmatter handling", () => {
		it("skips frontmatter when extracting content", () => {
			const content = [
				"---",
				"title: My Note",
				"tags: [test]",
				"---",
				"",
				"## First Heading",
				"",
				"Content here.",
			].join("\n");

			const result = extractor.extractContent(content, 5, 2);
			expect(result).toBe("Content here.");
		});

		it("does not treat --- inside frontmatter as headings", () => {
			const content = ["---", "title: My Note", "---", "", "## Heading", "", "Content."].join("\n");

			const range = extractor.getSectionRange(content, 4, 2);
			expect(range).toEqual({ contentStart: 5, contentEnd: 7 });
		});

		it("handles content without frontmatter normally", () => {
			const content = "## Heading\n\nContent.";
			const result = extractor.extractContent(content, 0, 2);
			expect(result).toBe("Content.");
		});
	});

	describe("extractSectionTree", () => {
		it("builds a flat tree for a section without sub-headings", () => {
			const content = ["## Section A", "", "Content of A.", "", "## Section B"].join("\n");

			const tree = extractor.extractSectionTree(content, 0, 2);
			expect(tree.headingText).toBe("Section A");
			expect(tree.headingLevel).toBe(2);
			expect(tree.headingLine).toBe(0);
			expect(tree.content).toBe("\nContent of A.\n");
			expect(tree.children).toEqual([]);
		});

		it("builds a tree with H2 -> H3 -> H4 hierarchy", () => {
			const content = [
				"## Parent",
				"",
				"Parent content.",
				"",
				"### Child 1",
				"",
				"Child 1 content.",
				"",
				"#### Grandchild",
				"",
				"Grandchild content.",
				"",
				"### Child 2",
				"",
				"Child 2 content.",
				"",
				"## Next Section",
			].join("\n");

			const tree = extractor.extractSectionTree(content, 0, 2);
			expect(tree.headingText).toBe("Parent");
			expect(tree.content).toBe("\nParent content.\n");
			expect(tree.children).toHaveLength(2);

			const child1 = tree.children[0];
			expect(child1.headingText).toBe("Child 1");
			expect(child1.headingLevel).toBe(3);
			expect(child1.content).toBe("\nChild 1 content.\n");
			expect(child1.children).toHaveLength(1);

			const grandchild = child1.children[0];
			expect(grandchild.headingText).toBe("Grandchild");
			expect(grandchild.headingLevel).toBe(4);
			expect(grandchild.content).toBe("\nGrandchild content.\n");
			expect(grandchild.children).toEqual([]);

			const child2 = tree.children[1];
			expect(child2.headingText).toBe("Child 2");
			expect(child2.content).toBe("\nChild 2 content.\n");
			expect(child2.children).toEqual([]);
		});

		it("ignores code block headings in tree extraction", () => {
			const content = [
				"## Section",
				"",
				"```",
				"## Not a heading",
				"```",
				"",
				"Real content.",
				"",
				"## Next Section",
			].join("\n");

			const tree = extractor.extractSectionTree(content, 0, 2);
			expect(tree.children).toEqual([]);
			expect(tree.content).toContain("## Not a heading");
			expect(tree.content).toContain("Real content.");
		});

		it("returns empty children for leaf section", () => {
			const content = "### Leaf\n\nJust text.";
			const tree = extractor.extractSectionTree(content, 0, 3);
			expect(tree.headingText).toBe("Leaf");
			expect(tree.children).toEqual([]);
			expect(tree.content).toBe("\nJust text.");
		});

		it("handles section at end of file", () => {
			const content = ["## Section", "", "Content at end."].join("\n");

			const tree = extractor.extractSectionTree(content, 0, 2);
			expect(tree.headingText).toBe("Section");
			expect(tree.content).toBe("\nContent at end.");
			expect(tree.children).toEqual([]);
		});
	});
});
