import { ContentExtractor } from "@/services/content-extractor";
import type { App, TFile } from "obsidian";

const FRONTMATTER_KEY = {
	"->": "connections-to",
	"<-": "connections-from",
} as const;

const HEADING_PATTERN = /^(#{1,6}) (.+)$/;

interface HeadingAnchor {
	line: string;
	lineNumber: number;
	level: number;
	originalMatchCount: number;
	sectionFingerprint: string;
}

export class BacklinkWriter {
	private app: App;
	private extractor: ContentExtractor;

	constructor(app: App) {
		this.app = app;
		this.extractor = new ContentExtractor();
	}

	async replaceSection(
		sourceFile: TFile,
		headingLine: number,
		headingLevel: number,
		newFileName: string,
	): Promise<void> {
		const anchor = await this.captureHeading(sourceFile, headingLine, headingLevel);
		if (!anchor) return;

		await this.app.vault.process(sourceFile, (content) => {
			const currentHeadingLine = this.resolveHeading(content, anchor);
			if (currentHeadingLine === null) return content;
			const range = this.extractor.getSectionRange(content, currentHeadingLine, headingLevel);
			if (!range) return content;

			const lines = content.split("\n");
			const headingPart = lines.slice(0, currentHeadingLine + 1);
			const afterPart = lines.slice(range.contentEnd);
			const link = `[[${newFileName}]]`;

			return [...headingPart, "", link, "", ...afterPart]
				.join("\n")
				.replace(/\n{3,}/g, "\n\n")
				.trimEnd();
		});
	}

	async appendLink(
		sourceFile: TFile,
		headingLine: number,
		headingLevel: number,
		newFileName: string,
	): Promise<void> {
		const anchor = await this.captureHeading(sourceFile, headingLine, headingLevel);
		if (!anchor) return;

		await this.app.vault.process(sourceFile, (content) => {
			const currentHeadingLine = this.resolveHeading(content, anchor);
			if (currentHeadingLine === null) return content;
			const range = this.extractor.getSectionRange(content, currentHeadingLine, headingLevel);
			if (!range) return content;

			const lines = content.split("\n");
			const link = `> See also: [[${newFileName}]]`;
			const beforePart = lines.slice(0, range.contentEnd);
			const afterPart = lines.slice(range.contentEnd);

			return [...beforePart, "", link, "", ...afterPart]
				.join("\n")
				.replace(/\n{3,}/g, "\n\n")
				.trimEnd();
		});
	}

	private async captureHeading(
		file: TFile,
		lineNumber: number,
		level: number,
	): Promise<HeadingAnchor | null> {
		const content = await this.app.vault.read(file);
		const line = content.split("\n")[lineNumber];
		const match = line?.match(HEADING_PATTERN);
		if (!line || !match || match[1]?.length !== level) return null;
		const originalMatchCount = content.split("\n").filter((candidate) => candidate === line).length;
		const sectionFingerprint = this.getSectionFingerprint(content, lineNumber, level);
		if (sectionFingerprint === null) return null;
		return { line, lineNumber, level, originalMatchCount, sectionFingerprint };
	}

	private resolveHeading(content: string, anchor: HeadingAnchor): number | null {
		const lines = content.split("\n");
		if (anchor.originalMatchCount === 1 && lines[anchor.lineNumber] === anchor.line) {
			return anchor.lineNumber;
		}

		const candidates: number[] = [];
		for (let index = 0; index < lines.length; index++) {
			if (lines[index] !== anchor.line) continue;
			const match = lines[index]?.match(HEADING_PATTERN);
			if (match?.[1]?.length !== anchor.level) continue;
			if (this.getSectionFingerprint(content, index, anchor.level) === anchor.sectionFingerprint) {
				candidates.push(index);
			}
		}

		return candidates.length === 1 ? candidates[0]! : null;
	}

	private getSectionFingerprint(
		content: string,
		headingLine: number,
		headingLevel: number,
	): string | null {
		const range = this.extractor.getSectionRange(content, headingLine, headingLevel);
		if (!range) return null;
		return content.split("\n").slice(headingLine, range.contentEnd).join("\n");
	}

	async addConnection(file: TFile, target: string, direction: "->" | "<-"): Promise<boolean> {
		const key = FRONTMATTER_KEY[direction];
		const link = `[[${target}]]`;
		let changed = false;

		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (!isRecord(frontmatter)) return;
			const normalized = normalizeConnections(frontmatter[key]);
			if (normalized === null) return;
			const connections = normalized.values;

			if (connections.includes(link)) {
				if (normalized.wasScalar) {
					frontmatter[key] = connections;
					changed = true;
				}
				return;
			}

			connections.push(link);
			frontmatter[key] = connections;
			changed = true;
		});
		return changed;
	}

	async removeConnection(file: TFile, target: string, direction: "->" | "<-"): Promise<boolean> {
		const key = FRONTMATTER_KEY[direction];
		const link = `[[${target}]]`;
		let changed = false;

		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (!isRecord(frontmatter)) return;
			const normalized = normalizeConnections(frontmatter[key]);
			if (normalized === null || normalized.wasAbsent) return;
			const connections = normalized.values;
			const filtered = connections.filter((c) => c !== link);

			if (filtered.length === 0) {
				delete frontmatter[key];
				changed = true;
			} else if (filtered.length < connections.length) {
				frontmatter[key] = filtered;
				changed = true;
			} else if (normalized.wasScalar) {
				frontmatter[key] = connections;
				changed = true;
			}
		});
		return changed;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeConnections(
	value: unknown,
): { values: string[]; wasAbsent: boolean; wasScalar: boolean } | null {
	if (value === undefined) return { values: [], wasAbsent: true, wasScalar: false };
	if (typeof value === "string" && value.length > 0) {
		return { values: [value], wasAbsent: false, wasScalar: true };
	}
	if (Array.isArray(value) && value.every((entry): entry is string => typeof entry === "string")) {
		return { values: [...value], wasAbsent: false, wasScalar: false };
	}
	return null;
}
