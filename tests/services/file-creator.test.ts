import { FileCreator } from "@/services/file-creator";
import type { GraphuneSettings } from "@/types/settings";
import { App, TFile, TFolder } from "obsidian";
import { type Mock, beforeEach, describe, expect, it } from "vitest";

describe("FileCreator", () => {
	let app: App;
	let settings: GraphuneSettings;
	let creator: FileCreator;
	let sourceFile: TFile;

	beforeEach(() => {
		app = new App();
		settings = {
			extractedFilesFolder: "",
			defaultNodeWidth: 400,
			defaultNodeHeight: 300,
			fileNamePrefix: "",
			defaultEdgeColor: "",
			defaultEdgeLabel: "",
			enableEdgeSync: true,
			quickCardDefaultTitle: "Untitled",
			showPreviewBeforeCreate: false,
		};
		creator = new FileCreator(app, settings);
		sourceFile = new TFile("notes/source.md");
		sourceFile.parent = new TFolder("notes");
	});

	describe("createFile", () => {
		it("creates with a sanitized filename", async () => {
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(null);
			(app.vault.adapter.exists as Mock).mockResolvedValue(true);
			(app.vault.create as Mock).mockResolvedValue(new TFile("notes/HeadingNameTest.md"));

			await creator.createFile("Heading/Name:Test?", "content", sourceFile);

			expect(app.vault.create).toHaveBeenCalledWith("notes/HeadingNameTest.md", "content");
		});

		it("calls vault.create with correct path and content", async () => {
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(null);
			(app.vault.adapter.exists as Mock).mockResolvedValue(true);
			(app.vault.create as Mock).mockResolvedValue(new TFile("notes/My Heading.md"));

			const result = await creator.createFile("My Heading", "Some content", sourceFile);

			expect(app.vault.create).toHaveBeenCalledWith("notes/My Heading.md", "Some content");
			expect(result.basename).toBe("My Heading");
		});

		it("adds provenance to an extracted card", async () => {
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(null);
			(app.vault.adapter.exists as Mock).mockResolvedValue(true);

			await creator.createFile("Concept", "# Concept\nBody", sourceFile, {
				sourceHeading: "Source section",
				canvasPath: "maps/research.canvas",
			});

			const content = (app.vault.create as Mock).mock.calls[0]?.[1] as string;
			expect(content).toContain('heptabase-source: "notes/source.md"');
			expect(content).toContain('heptabase-source-heading: "Source section"');
			expect(content).toContain('heptabase-source-content-hash: "fnv1a32:');
			expect(content).toContain('heptabase-canvas: "maps/research.canvas"');
			expect(content).toContain("heptabase-extracted-at:");
			expect(content).toContain("---\n# Concept\nBody");
		});
	});

	describe("createDistilledFile", () => {
		it("requires provenance and a reasoned existing-context connection in the note", async () => {
			(app.vault.getAbstractFileByPath as Mock).mockImplementation((path: string) =>
				path === sourceFile.path ? sourceFile : null,
			);
			(app.vault.adapter.exists as Mock).mockResolvedValue(true);
			(app.vault.create as Mock).mockResolvedValue(new TFile("notes/Spatial memory.md"));

			await creator.createDistilledFile(
				"Spatial memory",
				"A durable claim in my own words.",
				[
					{ path: sourceFile.path, subpath: "#Evidence", label: "Evidence" },
					{ text: "A contrasting observation", label: "Daily observation" },
				],
				{ path: "Knowledge/Memory.md", reason: "Explains why retrieval needs context" },
				"maps/research.canvas",
			);

			const content = (app.vault.create as Mock).mock.calls[0]?.[1] as string;
			expect(content).toContain('graphune-state: "connected"');
			expect(content).toContain('graphune-canvas: "maps/research.canvas"');
			expect(content).toContain('"sourceKey":"path:notes/source.md#Evidence"');
			expect(content).toContain('"sourceKey":"text:fnv1a32:');
			expect(content).toContain('"subpath":"#Evidence"');
			expect(content).toContain("# Spatial memory");
			expect(content).toContain("[[Knowledge/Memory]] — Explains why retrieval needs context");
		});
	});

	describe("sequential suffix on name collision", () => {
		it("retries with _1 when getAbstractFileByPath returns non-null", async () => {
			(app.vault.getAbstractFileByPath as Mock)
				.mockReturnValueOnce(new TFile("notes/My Heading.md"))
				.mockReturnValueOnce(null);
			(app.vault.adapter.exists as Mock).mockResolvedValue(true);
			(app.vault.create as Mock).mockResolvedValue(new TFile("notes/My Heading_1.md"));

			const result = await creator.createFile("My Heading", "content", sourceFile);

			expect(app.vault.create).toHaveBeenCalledWith("notes/My Heading_1.md", "content");
			expect(result.basename).toBe("My Heading_1");
		});

		it("creates with _2 when both original and _1 already exist", async () => {
			(app.vault.getAbstractFileByPath as Mock)
				.mockReturnValueOnce(new TFile("notes/My Heading.md"))
				.mockReturnValueOnce(new TFile("notes/My Heading_1.md"))
				.mockReturnValueOnce(null);
			(app.vault.adapter.exists as Mock).mockResolvedValue(true);
			(app.vault.create as Mock).mockResolvedValue(new TFile("notes/My Heading_2.md"));

			const result = await creator.createFile("My Heading", "content", sourceFile);

			expect(app.vault.create).toHaveBeenCalledWith("notes/My Heading_2.md", "content");
			expect(result.basename).toBe("My Heading_2");
		});
	});

	describe("automatic folder creation", () => {
		it("creates the folder when extractedFilesFolder is set and folder does not exist", async () => {
			settings.extractedFilesFolder = "extracted";
			creator = new FileCreator(app, settings);
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(null);
			(app.vault.adapter.exists as Mock).mockResolvedValue(false);
			(app.vault.create as Mock).mockResolvedValue(new TFile("extracted/My Heading.md"));

			await creator.createFile("My Heading", "content", sourceFile);

			expect(app.vault.createFolder).toHaveBeenCalledWith("extracted");
			expect(app.vault.create).toHaveBeenCalledWith("extracted/My Heading.md", "content");
		});

		it("does not call createFolder when folder already exists", async () => {
			settings.extractedFilesFolder = "extracted";
			creator = new FileCreator(app, settings);
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(null);
			(app.vault.adapter.exists as Mock).mockResolvedValue(true);
			(app.vault.create as Mock).mockResolvedValue(new TFile("extracted/My Heading.md"));

			await creator.createFile("My Heading", "content", sourceFile);

			expect(app.vault.createFolder).not.toHaveBeenCalled();
		});
	});

	describe("with prefix", () => {
		it("includes fileNamePrefix in the filename", async () => {
			settings.fileNamePrefix = "Extract - ";
			creator = new FileCreator(app, settings);
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(null);
			(app.vault.adapter.exists as Mock).mockResolvedValue(true);
			(app.vault.create as Mock).mockResolvedValue(new TFile("notes/Extract - My Heading.md"));

			const result = await creator.createFile("My Heading", "content", sourceFile);

			expect(app.vault.create).toHaveBeenCalledWith("notes/Extract - My Heading.md", "content");
			expect(result.basename).toBe("Extract - My Heading");
		});
	});

	describe("same folder as source file", () => {
		it("uses sourceFile.parent path when extractedFilesFolder is empty", async () => {
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(null);
			(app.vault.adapter.exists as Mock).mockResolvedValue(true);
			(app.vault.create as Mock).mockResolvedValue(new TFile("notes/Title.md"));

			const result = await creator.createFile("Title", "content", sourceFile);

			expect(app.vault.create).toHaveBeenCalledWith("notes/Title.md", "content");
			expect(result.basename).toBe("Title");
		});
	});

	describe("root folder", () => {
		it("creates at root when sourceFile.parent is null", async () => {
			const rootFile = new TFile("root-note.md");
			rootFile.parent = null;
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(null);
			(app.vault.adapter.exists as Mock).mockResolvedValue(true);
			(app.vault.create as Mock).mockResolvedValue(new TFile("Title.md"));

			const result = await creator.createFile("Title", "content", rootFile);

			expect(app.vault.create).toHaveBeenCalledWith("Title.md", "content");
			expect(result.basename).toBe("Title");
		});
	});

	describe("resolveUniqueFilePath", () => {
		it("returns the path as-is when there is no collision", () => {
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(null);

			const result = creator.resolveUniqueFilePath("notes", "Title");

			expect(result).toBe("notes/Title.md");
		});

		it("returns a path with sequential suffix when there is a collision", () => {
			(app.vault.getAbstractFileByPath as Mock)
				.mockReturnValueOnce(new TFile("notes/Title.md"))
				.mockReturnValueOnce(null);

			const result = creator.resolveUniqueFilePath("notes", "Title");

			expect(result).toBe("notes/Title_1.md");
		});

		it("returns only the filename when folder is an empty string", () => {
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(null);

			const result = creator.resolveUniqueFilePath("", "Title");

			expect(result).toBe("Title.md");
		});
	});
});
