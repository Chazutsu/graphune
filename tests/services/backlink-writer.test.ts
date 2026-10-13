import { BacklinkWriter } from "@/services/backlink-writer";
import { App, TFile } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("BacklinkWriter", () => {
	let app: App;
	let writer: BacklinkWriter;

	beforeEach(() => {
		app = new App();
		writer = new BacklinkWriter(app);
	});

	describe("replaceSection", () => {
		it("replaces section body with backlink, keeping heading", async () => {
			const content =
				"## First Section\n\nContent of the first\nsection content.\n\n## Second Section\n\nOther content.";
			app.vault.read = vi.fn().mockResolvedValue(content);

			const sourceFile = new TFile("notes/source.md");
			await writer.replaceSection(sourceFile, 0, 2, "First Section");

			expect(app.vault.modify).toHaveBeenCalledWith(
				sourceFile,
				"## First Section\n\n[[First Section]]\n\n## Second Section\n\nOther content.",
			);
		});

		it("replaces last section body with backlink", async () => {
			const content =
				"## First Section\n\nSome content.\n\n## Last Section\n\nFinal content.\nMore lines.";
			app.vault.read = vi.fn().mockResolvedValue(content);

			const sourceFile = new TFile("notes/source.md");
			await writer.replaceSection(sourceFile, 4, 2, "Last Section");

			expect(app.vault.modify).toHaveBeenCalledWith(
				sourceFile,
				"## First Section\n\nSome content.\n\n## Last Section\n\n[[Last Section]]",
			);
		});

		it("replaces empty section body with backlink", async () => {
			const content = "## Empty Section\n## Next Section\n\nContent.";
			app.vault.read = vi.fn().mockResolvedValue(content);

			const sourceFile = new TFile("notes/source.md");
			await writer.replaceSection(sourceFile, 0, 2, "Empty Section");

			expect(app.vault.modify).toHaveBeenCalledWith(
				sourceFile,
				"## Empty Section\n\n[[Empty Section]]\n\n## Next Section\n\nContent.",
			);
		});

		it("handles nested headings (H3 under H2)", async () => {
			const content = "## Parent\n\nContent.\n\n### Child\n\nChild content.\n\n## Next";
			app.vault.read = vi.fn().mockResolvedValue(content);

			const sourceFile = new TFile("notes/source.md");
			await writer.replaceSection(sourceFile, 0, 2, "Parent");

			expect(app.vault.modify).toHaveBeenCalledWith(
				sourceFile,
				"## Parent\n\n[[Parent]]\n\n## Next",
			);
		});

		it("handles Japanese heading text", async () => {
			const content = "## 日本語の見出し\n\n日本語の本文です。\n\n## 次のセクション";
			app.vault.read = vi.fn().mockResolvedValue(content);

			const sourceFile = new TFile("notes/source.md");
			await writer.replaceSection(sourceFile, 0, 2, "日本語の見出し");

			expect(app.vault.modify).toHaveBeenCalledWith(
				sourceFile,
				"## 日本語の見出し\n\n[[日本語の見出し]]\n\n## 次のセクション",
			);
		});

		it("does nothing when heading line is out of range", async () => {
			const content = "## Section\n\nContent.";
			app.vault.read = vi.fn().mockResolvedValue(content);

			const sourceFile = new TFile("notes/source.md");
			await writer.replaceSection(sourceFile, 999, 2, "Section");

			expect(app.vault.modify).not.toHaveBeenCalled();
		});

		it("preserves a concurrent edit and relocates the anchored heading", async () => {
			const original = "## Target\n\nOld body\n\n## Next\n\nNext body";
			const current = "Concurrent preface\n\n## Target\n\nOld body\n\n## Next\n\nNext body";
			app.vault.read = vi.fn().mockResolvedValue(original);
			app.vault.process = vi.fn().mockImplementation(async (_file, transform) => {
				const result = transform(current);
				expect(result).toBe(
					"Concurrent preface\n\n## Target\n\n[[Target]]\n\n## Next\n\nNext body",
				);
			});

			await writer.replaceSection(new TFile("notes/source.md"), 0, 2, "Target");
			expect(app.vault.modify).not.toHaveBeenCalled();
		});

		it("allows a concurrent body edit while the unique heading remains at its original line", async () => {
			const original = "## Target\n\nOld body";
			const current = "## Target\n\nEdited body";
			app.vault.read = vi.fn().mockResolvedValue(original);
			app.vault.process = vi.fn().mockImplementation(async (_file, transform) => {
				expect(transform(current)).toBe("## Target\n\n[[Target]]");
			});

			await writer.replaceSection(new TFile("notes/source.md"), 0, 2, "Target");
		});

		it("aborts when a moved heading can no longer be resolved unambiguously", async () => {
			const original = "## Target\n\nOld body";
			const current = "Preface\n## Target\n\nOne\n## Target\n\nTwo";
			app.vault.read = vi.fn().mockResolvedValue(original);
			app.vault.process = vi.fn().mockImplementation(async (_file, transform) => {
				expect(transform(current)).toBe(current);
			});

			await writer.replaceSection(new TFile("notes/source.md"), 0, 2, "Target");
			expect(app.vault.modify).not.toHaveBeenCalled();
		});

		it("does not replace a remaining duplicate after the targeted heading is renamed", async () => {
			const original = "## Target\n\nBody A\n\n## Target\n\nBody B";
			const current = "## Renamed\n\nBody A\n\n## Target\n\nBody B";
			app.vault.read = vi.fn().mockResolvedValue(original);
			app.vault.process = vi.fn().mockImplementation(async (_file, transform) => {
				expect(transform(current)).toBe(current);
			});

			await writer.replaceSection(new TFile("notes/source.md"), 0, 2, "Target");
		});

		it("does not replace a newly created same-name heading after the unique target is renamed", async () => {
			const original = "## Target\n\nOriginal body\n\n## Next\n\nNext body";
			const current =
				"## Renamed\n\nOriginal body\n\n## Next\n\nNext body\n\n## Target\n\nNew body";
			app.vault.read = vi.fn().mockResolvedValue(original);
			app.vault.process = vi.fn().mockImplementation(async (_file, transform) => {
				expect(transform(current)).toBe(current);
			});

			await writer.replaceSection(new TFile("notes/source.md"), 0, 2, "Target");
		});
	});

	describe("appendLink", () => {
		it("appends link at end of section, keeping original content", async () => {
			const content =
				"## First Section\n\nContent of the first\nsection content.\n\n## Second Section\n\nOther content.";
			app.vault.read = vi.fn().mockResolvedValue(content);

			const sourceFile = new TFile("notes/source.md");
			await writer.appendLink(sourceFile, 0, 2, "First Section");

			expect(app.vault.modify).toHaveBeenCalledWith(
				sourceFile,
				"## First Section\n\nContent of the first\nsection content.\n\n> See also: [[First Section]]\n\n## Second Section\n\nOther content.",
			);
		});

		it("appends link at end of last section", async () => {
			const content =
				"## First Section\n\nSome content.\n\n## Last Section\n\nFinal content.\nMore lines.";
			app.vault.read = vi.fn().mockResolvedValue(content);

			const sourceFile = new TFile("notes/source.md");
			await writer.appendLink(sourceFile, 4, 2, "Last Section");

			expect(app.vault.modify).toHaveBeenCalledWith(
				sourceFile,
				"## First Section\n\nSome content.\n\n## Last Section\n\nFinal content.\nMore lines.\n\n> See also: [[Last Section]]",
			);
		});

		it("appends link to empty section", async () => {
			const content = "## Empty Section\n## Next Section\n\nContent.";
			app.vault.read = vi.fn().mockResolvedValue(content);

			const sourceFile = new TFile("notes/source.md");
			await writer.appendLink(sourceFile, 0, 2, "Empty Section");

			expect(app.vault.modify).toHaveBeenCalledWith(
				sourceFile,
				"## Empty Section\n\n> See also: [[Empty Section]]\n\n## Next Section\n\nContent.",
			);
		});

		it("does nothing when heading line is out of range", async () => {
			const content = "## Section\n\nContent.";
			app.vault.read = vi.fn().mockResolvedValue(content);

			const sourceFile = new TFile("notes/source.md");
			await writer.appendLink(sourceFile, 999, 2, "Section");

			expect(app.vault.modify).not.toHaveBeenCalled();
		});

		it("handles Japanese heading text", async () => {
			const content = "## 日本語の見出し\n\n日本語の本文です。\n\n## 次のセクション";
			app.vault.read = vi.fn().mockResolvedValue(content);

			const sourceFile = new TFile("notes/source.md");
			await writer.appendLink(sourceFile, 0, 2, "日本語の見出し");

			expect(app.vault.modify).toHaveBeenCalledWith(
				sourceFile,
				"## 日本語の見出し\n\n日本語の本文です。\n\n> See also: [[日本語の見出し]]\n\n## 次のセクション",
			);
		});

		it("appends against the latest content after a concurrent edit", async () => {
			const original = "## Target\n\nOld body";
			const current = "Added above\n\n## Target\n\nOld body";
			app.vault.read = vi.fn().mockResolvedValue(original);
			app.vault.process = vi.fn().mockImplementation(async (_file, transform) => {
				expect(transform(current)).toBe(
					"Added above\n\n## Target\n\nOld body\n\n> See also: [[Related]]",
				);
			});

			await writer.appendLink(new TFile("notes/source.md"), 0, 2, "Related");
		});

		it("appends after a concurrent body edit at the unique heading's original line", async () => {
			const original = "## Target\n\nOld body";
			const current = "## Target\n\nEdited body";
			app.vault.read = vi.fn().mockResolvedValue(original);
			app.vault.process = vi.fn().mockImplementation(async (_file, transform) => {
				expect(transform(current)).toBe("## Target\n\nEdited body\n\n> See also: [[Related]]");
			});

			await writer.appendLink(new TFile("notes/source.md"), 0, 2, "Related");
		});

		it("does not append to a remaining duplicate after the targeted heading is deleted", async () => {
			const original = "## Target\n\nBody A\n\n## Target\n\nBody B";
			const current = "Preface\n\n## Target\n\nBody B";
			app.vault.read = vi.fn().mockResolvedValue(original);
			app.vault.process = vi.fn().mockImplementation(async (_file, transform) => {
				expect(transform(current)).toBe(current);
			});

			await writer.appendLink(new TFile("notes/source.md"), 0, 2, "Related");
		});

		it("does not append to a newly created same-name heading after the unique target is deleted", async () => {
			const original = "## Target\n\nOriginal body\n\n## Next\n\nNext body";
			const current = "## Next\n\nNext body\n\n## Target\n\nNew body";
			app.vault.read = vi.fn().mockResolvedValue(original);
			app.vault.process = vi.fn().mockImplementation(async (_file, transform) => {
				expect(transform(current)).toBe(current);
			});

			await writer.appendLink(new TFile("notes/source.md"), 0, 2, "Related");
		});
	});

	describe("addConnection", () => {
		it("adds outgoing connection to empty frontmatter", async () => {
			const file = new TFile("notes/source.md");
			const captured: Record<string, unknown>[] = [];

			app.fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
					const fm: Record<string, unknown> = {};
					fn(fm);
					captured.push(fm);
				});

			await writer.addConnection(file, "NoteB", "->");

			expect(app.fileManager.processFrontMatter).toHaveBeenCalledWith(file, expect.any(Function));
			expect(captured[0]["connections-to"]).toEqual(["[[NoteB]]"]);
			expect(captured[0]["connections-from"]).toBeUndefined();
		});

		it("adds incoming connection to empty frontmatter", async () => {
			const file = new TFile("notes/target.md");
			const captured: Record<string, unknown>[] = [];

			app.fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
					const fm: Record<string, unknown> = {};
					fn(fm);
					captured.push(fm);
				});

			await writer.addConnection(file, "NoteA", "<-");

			expect(captured[0]["connections-from"]).toEqual(["[[NoteA]]"]);
			expect(captured[0]["connections-to"]).toBeUndefined();
		});

		it("appends to existing connections", async () => {
			const file = new TFile("notes/source.md");
			const captured: Record<string, unknown>[] = [];

			app.fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
					const fm: Record<string, unknown> = {
						"connections-to": ["[[NoteA]]"],
					};
					fn(fm);
					captured.push(fm);
				});

			await writer.addConnection(file, "NoteB", "->");

			expect(captured[0]["connections-to"]).toEqual(["[[NoteA]]", "[[NoteB]]"]);
		});

		it("normalizes a scalar connection before appending", async () => {
			const file = new TFile("notes/source.md");
			const fm: Record<string, unknown> = { "connections-to": "[[NoteA]]" };
			app.fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (_file: TFile, fn: (value: Record<string, unknown>) => void) =>
					fn(fm),
				);

			expect(await writer.addConnection(file, "NoteB", "->")).toBe(true);
			expect(fm["connections-to"]).toEqual(["[[NoteA]]", "[[NoteB]]"]);
		});

		it("normalizes a scalar duplicate without adding it twice", async () => {
			const file = new TFile("notes/source.md");
			const fm: Record<string, unknown> = { "connections-to": "[[NoteA]]" };
			app.fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (_file: TFile, fn: (value: Record<string, unknown>) => void) =>
					fn(fm),
				);

			expect(await writer.addConnection(file, "NoteA", "->")).toBe(true);
			expect(fm["connections-to"]).toEqual(["[[NoteA]]"]);
		});

		it.each([null, { link: "[[NoteA]]" }, ["[[NoteA]]", 1]])(
			"fails closed for an unsupported connection value: %j",
			async (unsupported) => {
				const file = new TFile("notes/source.md");
				const fm: Record<string, unknown> = { "connections-to": unsupported };
				app.fileManager.processFrontMatter = vi
					.fn()
					.mockImplementation(async (_file: TFile, fn: (value: Record<string, unknown>) => void) =>
						fn(fm),
					);

				expect(await writer.addConnection(file, "NoteB", "->")).toBe(false);
				expect(fm["connections-to"]).toBe(unsupported);
			},
		);

		it("skips duplicate connection", async () => {
			const file = new TFile("notes/source.md");
			const captured: Record<string, unknown>[] = [];

			app.fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
					const fm: Record<string, unknown> = {
						"connections-to": ["[[NoteB]]"],
					};
					fn(fm);
					captured.push(fm);
				});

			await writer.addConnection(file, "NoteB", "->");

			expect(captured[0]["connections-to"]).toEqual(["[[NoteB]]"]);
		});

		it("keeps separate keys for different directions", async () => {
			const file = new TFile("notes/source.md");
			const captured: Record<string, unknown>[] = [];

			app.fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
					const fm: Record<string, unknown> = {
						"connections-to": ["[[NoteB]]"],
					};
					fn(fm);
					captured.push(fm);
				});

			await writer.addConnection(file, "NoteB", "<-");

			expect(captured[0]["connections-to"]).toEqual(["[[NoteB]]"]);
			expect(captured[0]["connections-from"]).toEqual(["[[NoteB]]"]);
		});
	});

	describe("removeConnection", () => {
		it("removes a matching connection entry", async () => {
			const file = new TFile("notes/source.md");
			const captured: Record<string, unknown>[] = [];

			app.fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
					const fm: Record<string, unknown> = {
						"connections-to": ["[[NoteA]]", "[[NoteB]]"],
					};
					fn(fm);
					captured.push(fm);
				});

			await writer.removeConnection(file, "NoteA", "->");

			expect(captured[0]["connections-to"]).toEqual(["[[NoteB]]"]);
		});

		it("removes a matching scalar connection", async () => {
			const file = new TFile("notes/source.md");
			const fm: Record<string, unknown> = { "connections-to": "[[NoteA]]" };
			app.fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (_file: TFile, fn: (value: Record<string, unknown>) => void) =>
					fn(fm),
				);

			expect(await writer.removeConnection(file, "NoteA", "->")).toBe(true);
			expect(fm["connections-to"]).toBeUndefined();
		});

		it("normalizes a non-matching scalar when removing", async () => {
			const file = new TFile("notes/source.md");
			const fm: Record<string, unknown> = { "connections-to": "[[NoteA]]" };
			app.fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (_file: TFile, fn: (value: Record<string, unknown>) => void) =>
					fn(fm),
				);

			expect(await writer.removeConnection(file, "NoteB", "->")).toBe(true);
			expect(fm["connections-to"]).toEqual(["[[NoteA]]"]);
		});

		it("deletes key when last entry is removed", async () => {
			const file = new TFile("notes/source.md");
			const captured: Record<string, unknown>[] = [];

			app.fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
					const fm: Record<string, unknown> = {
						"connections-to": ["[[NoteA]]"],
					};
					fn(fm);
					captured.push(fm);
				});

			await writer.removeConnection(file, "NoteA", "->");

			expect(captured[0]["connections-to"]).toBeUndefined();
		});

		it("does nothing when entry not found", async () => {
			const file = new TFile("notes/source.md");
			const captured: Record<string, unknown>[] = [];

			app.fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
					const fm: Record<string, unknown> = {
						"connections-to": ["[[NoteA]]"],
					};
					fn(fm);
					captured.push(fm);
				});

			await writer.removeConnection(file, "NonExistent", "->");

			expect(captured[0]["connections-to"]).toEqual(["[[NoteA]]"]);
		});

		it("does nothing when key does not exist", async () => {
			const file = new TFile("notes/source.md");
			const captured: Record<string, unknown>[] = [];

			app.fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
					const fm: Record<string, unknown> = {};
					fn(fm);
					captured.push(fm);
				});

			await writer.removeConnection(file, "NoteA", "->");

			expect(captured[0]["connections-to"]).toBeUndefined();
		});

		it("only removes from the correct direction key", async () => {
			const file = new TFile("notes/source.md");
			const captured: Record<string, unknown>[] = [];

			app.fileManager.processFrontMatter = vi
				.fn()
				.mockImplementation(async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
					const fm: Record<string, unknown> = {
						"connections-to": ["[[NoteA]]"],
						"connections-from": ["[[NoteA]]"],
					};
					fn(fm);
					captured.push(fm);
				});

			await writer.removeConnection(file, "NoteA", "->");

			expect(captured[0]["connections-to"]).toBeUndefined();
			expect(captured[0]["connections-from"]).toEqual(["[[NoteA]]"]);
		});
	});
});
