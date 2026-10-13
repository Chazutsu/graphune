import type { CanvasNodeData, CanvasView } from "@/types/obsidian-canvas";
import type { CanvasOperator } from "@/services/canvas-operator";
import {
	FileCreator,
	type DistillationConnection,
	type DistillationSource,
} from "@/services/file-creator";
import { TFile, type App } from "obsidian";

export interface DistillationDraft {
	title: string;
	body: string;
	sources: DistillationSource[];
	connection: DistillationConnection;
}

export class DistillationService {
	constructor(
		private app: App,
		private fileCreator: FileCreator,
		private canvasOperator: CanvasOperator,
	) {}

	async distill(
		canvasView: CanvasView,
		nodeIds: string[],
		draft: DistillationDraft,
	): Promise<TFile> {
		validateDraft(nodeIds, draft);
		const file = await this.fileCreator.createDistilledFile(
			draft.title.trim(),
			draft.body.trim(),
			draft.sources,
			draft.connection,
			canvasView.file.path,
		);
		const replacement = this.canvasOperator.replaceNodesWithFileTransaction(
			canvasView.canvas,
			nodeIds,
			file,
		);
		if (!replacement) {
			await this.fileCreator.removeFile(file);
			throw new Error("Selected Canvas materials changed before distillation completed");
		}
		const sourceMutations: SourceMutation[] = [];
		try {
			await this.markSourcesProcessed(draft.sources, file.path, sourceMutations);
			replacement.commit();
			return file;
		} catch (error) {
			const rollbackErrors = await this.rollback(
				replacement.rollback,
				sourceMutations,
				file.path,
				file,
			);
			if (rollbackErrors.length > 0) {
				throw new AggregateError(
					rollbackErrors,
					"Distillation failed and rollback was incomplete",
					{
						cause: error,
					},
				);
			}
			throw error;
		}
	}

	private async markSourcesProcessed(
		sources: DistillationSource[],
		distilledPath: string,
		mutations: SourceMutation[],
	) {
		const paths = new Set(sources.flatMap((source) => (source.path ? [source.path] : [])));
		for (const path of paths) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) continue;
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				const hadValue = Object.prototype.hasOwnProperty.call(frontmatter, "graphune-processed-by");
				const previous = structuredClone(frontmatter["graphune-processed-by"]);
				const current = Array.isArray(frontmatter["graphune-processed-by"])
					? (frontmatter["graphune-processed-by"] as unknown[]).filter(
							(value): value is string => typeof value === "string",
						)
					: [];
				const next = [...new Set([...current, distilledPath])];
				mutations.push({ file, hadValue, previous, expected: next });
				frontmatter["graphune-processed-by"] = next;
			});
		}
	}

	private async rollback(
		rollbackCanvas: () => boolean,
		mutations: SourceMutation[],
		distilledPath: string,
		file: TFile,
	): Promise<unknown[]> {
		const errors: unknown[] = [];
		try {
			rollbackCanvas();
		} catch (error) {
			errors.push(error);
		}
		for (const mutation of mutations.toReversed()) {
			try {
				await this.app.fileManager.processFrontMatter(mutation.file, (frontmatter) => {
					const current = frontmatter["graphune-processed-by"];
					if (JSON.stringify(current) === JSON.stringify(mutation.expected)) {
						if (mutation.hadValue) frontmatter["graphune-processed-by"] = mutation.previous;
						else delete frontmatter["graphune-processed-by"];
						return;
					}
					if (Array.isArray(current)) {
						const remaining = current.filter((value) => value !== distilledPath);
						if (remaining.length > 0) frontmatter["graphune-processed-by"] = remaining;
						else delete frontmatter["graphune-processed-by"];
					}
				});
			} catch (error) {
				errors.push(error);
			}
		}
		try {
			await this.fileCreator.removeFile(file);
		} catch (error) {
			errors.push(error);
		}
		return errors;
	}
}

interface SourceMutation {
	file: TFile;
	hadValue: boolean;
	previous: unknown;
	expected: string[];
}

export function sourcesFromCanvasNodes(nodes: CanvasNodeData[]): DistillationSource[] {
	const sources: DistillationSource[] = [];
	for (const node of nodes) {
		if (node.type === "file" && node.file) {
			sources.push({ path: node.file, subpath: node.subpath, label: sourceLabel(node) });
		}
		if (node.type === "text" && node.text?.trim()) {
			sources.push({ text: node.text.trim(), label: sourceLabel(node) });
		}
	}
	return sources;
}

function sourceLabel(node: CanvasNodeData): string {
	return (
		node.label ||
		node.text?.split("\n", 1)[0] ||
		node.file?.split("/").pop()?.replace(/\.md$/u, "") ||
		"Untitled material"
	);
}

function validateDraft(nodeIds: string[], draft: DistillationDraft): void {
	if (nodeIds.length < 2 || draft.sources.length < 2)
		throw new Error("Select at least two materials");
	if (!draft.title.trim()) throw new Error("Title is required");
	if (!draft.body.trim()) throw new Error("Body is required");
	if (!draft.connection.path || !draft.connection.reason.trim()) {
		throw new Error("An existing context and relationship reason are required");
	}
}
