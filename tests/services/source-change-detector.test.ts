import { createContentFingerprint } from "@/services/content-fingerprint";
import { SourceChangeDetector } from "@/services/source-change-detector";
import { App, TFile } from "obsidian";
import { type Mock, beforeEach, describe, expect, it } from "vitest";

describe("SourceChangeDetector", () => {
	let app: App;
	let extractedFile: TFile;
	let sourceFile: TFile;

	beforeEach(() => {
		app = new App();
		extractedFile = new TFile("cards/source-section.md");
		sourceFile = new TFile("notes/source.md");
	});

	function mockTrackedCard(originalSection: string): void {
		(app.metadataCache.getFileCache as Mock).mockImplementation((file: TFile) => {
			if (file.path === extractedFile.path) {
				return {
					frontmatter: {
						"heptabase-source": sourceFile.path,
						"heptabase-source-heading": "Source",
						"heptabase-source-content-hash": createContentFingerprint(originalSection),
					},
				};
			}
			return {
				headings: [
					{
						heading: "Source",
						level: 2,
						position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0 } },
					},
				],
			};
		});
		(app.vault.getAbstractFileByPath as Mock).mockReturnValue(sourceFile);
	}

	it("does not warn for legacy cards without a fingerprint", async () => {
		(app.metadataCache.getFileCache as Mock).mockReturnValue({
			frontmatter: {
				"heptabase-source": sourceFile.path,
				"heptabase-source-heading": "Source",
			},
		});

		await expect(new SourceChangeDetector(app).getStatus(extractedFile)).resolves.toBe(
			"not-tracked",
		);
	});

	it("reports unchanged when the source section still matches", async () => {
		mockTrackedCard("## Source\nBody");
		(app.vault.cachedRead as Mock).mockResolvedValue("## Source\nBody\n\n## Next\nOther");

		await expect(new SourceChangeDetector(app).getStatus(extractedFile)).resolves.toBe("unchanged");
	});

	it("reports changed without overwriting the extracted card", async () => {
		mockTrackedCard("## Source\nBefore");
		(app.vault.cachedRead as Mock).mockResolvedValue("## Source\nAfter");

		await expect(new SourceChangeDetector(app).getStatus(extractedFile)).resolves.toBe("changed");
		expect(app.vault.modify).not.toHaveBeenCalled();
	});

	it("does not report a change when the source cannot be read", async () => {
		mockTrackedCard("## Source\nBody");
		(app.vault.cachedRead as Mock).mockRejectedValue(new Error("offline"));

		await expect(new SourceChangeDetector(app).getStatus(extractedFile)).resolves.toBe(
			"unavailable",
		);
	});
});
