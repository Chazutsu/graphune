import type { GraphuneSettings } from "@/types/settings";
import { createContentFingerprint } from "@/services/content-fingerprint";
import { withSourceKey } from "@/services/processing-state";
import { sanitizeFilename } from "@/utils/sanitize-filename";
import { TFile, type App } from "obsidian";

export interface ExtractionProvenance {
	sourceHeading?: string;
	canvasPath?: string;
}

export interface DistillationSource {
	/** Stable identity derived from path + subpath, or from the text fingerprint. */
	sourceKey?: string;
	path?: string;
	subpath?: string;
	text?: string;
	label: string;
}

export interface DistillationConnection {
	path: string;
	reason: string;
}

export class FileCreator {
	private app: App;
	private settings: GraphuneSettings;

	constructor(app: App, settings: GraphuneSettings) {
		this.app = app;
		this.settings = settings;
	}

	async createFile(
		headingText: string,
		content: string,
		sourceFile: TFile,
		provenance: ExtractionProvenance = {},
	): Promise<TFile> {
		const baseName = sanitizeFilename(this.settings.fileNamePrefix + headingText);
		const folder = this.resolveFolder(sourceFile);
		await this.ensureFolder(folder);
		const filePath = this.resolveUniqueFilePath(folder, baseName);
		const fileContent =
			provenance.sourceHeading || provenance.canvasPath
				? this.withProvenance(content, sourceFile, provenance)
				: content;
		return this.app.vault.create(filePath, fileContent);
	}

	async removeFile(file: TFile): Promise<void> {
		await this.app.vault.delete(file);
	}

	async createDistilledFile(
		title: string,
		body: string,
		sources: DistillationSource[],
		connection: DistillationConnection,
		canvasPath: string,
	): Promise<TFile> {
		const keyedSources = sources.map(withSourceKey);
		const baseName = sanitizeFilename(this.settings.fileNamePrefix + title);
		const firstSource = keyedSources
			.map((source) => source.path && this.app.vault.getAbstractFileByPath(source.path))
			.find((file): file is TFile => file instanceof TFile);
		const folder = this.settings.extractedFilesFolder || firstSource?.parent?.path || "";
		await this.ensureFolder(folder);
		const filePath = this.resolveUniqueFilePath(folder, baseName);
		const connectionTarget = connection.path.replace(/\.md$/u, "");
		const content = [
			"---",
			'graphune-state: "connected"',
			`graphune-canvas: ${JSON.stringify(canvasPath)}`,
			`graphune-sources: ${JSON.stringify(keyedSources)}`,
			`graphune-connections: ${JSON.stringify([connection])}`,
			`graphune-distilled-at: ${JSON.stringify(new Date().toISOString())}`,
			"---",
			"",
			`# ${title}`,
			"",
			body.trim(),
			"",
			"## Connection",
			"",
			`- [[${connectionTarget}]] — ${connection.reason.trim()}`,
			"",
		].join("\n");
		return this.app.vault.create(filePath, content);
	}

	private withProvenance(
		content: string,
		sourceFile: TFile,
		provenance: ExtractionProvenance,
	): string {
		const metadata = [
			"---",
			`heptabase-source: ${JSON.stringify(sourceFile.path)}`,
			...(provenance.sourceHeading
				? [
						`heptabase-source-heading: ${JSON.stringify(provenance.sourceHeading)}`,
						`heptabase-source-content-hash: ${JSON.stringify(createContentFingerprint(content))}`,
					]
				: []),
			...(provenance.canvasPath
				? [`heptabase-canvas: ${JSON.stringify(provenance.canvasPath)}`]
				: []),
			`heptabase-extracted-at: ${JSON.stringify(new Date().toISOString())}`,
			"---",
			"",
		].join("\n");

		return `${metadata}${content}`;
	}

	resolveUniqueFilePath(folder: string, baseName: string): string {
		let filePath = this.buildPath(folder, `${baseName}.md`);
		let suffix = 0;

		while (this.app.vault.getAbstractFileByPath(filePath) !== null) {
			suffix++;
			filePath = this.buildPath(folder, `${baseName}_${suffix}.md`);
		}

		return filePath;
	}

	private resolveFolder(sourceFile: TFile): string {
		if (this.settings.extractedFilesFolder) {
			return this.settings.extractedFilesFolder;
		}
		return sourceFile.parent?.path ?? "";
	}

	private async ensureFolder(folder: string): Promise<void> {
		if (!folder) {
			return;
		}
		const exists = await this.app.vault.adapter.exists(folder);
		if (!exists) {
			await this.app.vault.createFolder(folder);
		}
	}

	private buildPath(folder: string, fileName: string): string {
		return folder ? `${folder}/${fileName}` : fileName;
	}
}
