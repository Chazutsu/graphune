import { ContentExtractor } from "@/services/content-extractor";
import { createContentFingerprint } from "@/services/content-fingerprint";
import { TFile, type App } from "obsidian";

export type SourceChangeStatus = "not-tracked" | "unchanged" | "changed" | "unavailable";

function asString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export class SourceChangeDetector {
	private readonly extractor = new ContentExtractor();

	constructor(private readonly app: App) {}

	async getStatus(extractedFile: TFile): Promise<SourceChangeStatus> {
		const frontmatter = this.app.metadataCache.getFileCache(extractedFile)?.frontmatter;
		const sourcePath = asString(frontmatter?.["heptabase-source"]);
		const sourceHeading = asString(frontmatter?.["heptabase-source-heading"]);
		const expectedFingerprint = asString(frontmatter?.["heptabase-source-content-hash"]);

		if (!sourcePath || !sourceHeading || !expectedFingerprint) return "not-tracked";

		const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(sourceFile instanceof TFile)) return "unavailable";

		try {
			const content = await this.app.vault.cachedRead(sourceFile);
			const headings = this.app.metadataCache.getFileCache(sourceFile)?.headings ?? [];
			const candidates = headings.filter(
				(heading) => heading.heading.trim() === sourceHeading.trim(),
			);
			if (candidates.length === 0) return "changed";

			const stillMatches = candidates.some((heading) => {
				const section = this.extractor.extractContentWithHeading(
					content,
					heading.position.start.line,
					heading.level,
				);
				return createContentFingerprint(section) === expectedFingerprint;
			});
			return stillMatches ? "unchanged" : "changed";
		} catch {
			return "unavailable";
		}
	}
}
