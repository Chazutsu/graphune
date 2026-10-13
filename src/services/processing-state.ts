import { createContentFingerprint } from "@/services/content-fingerprint";
import type { DistillationSource } from "@/services/file-creator";
import type { SearchResult } from "@/types/plugin";
import type { CanvasData, CanvasNodeData } from "@/types/obsidian-canvas";
import type { App } from "obsidian";

export type ProcessingState = "unprocessed" | "on-canvas" | "distilled" | "connected" | "completed";

const STATE_RANK: Record<ProcessingState, number> = {
	unprocessed: 0,
	"on-canvas": 1,
	distilled: 2,
	connected: 3,
	completed: 4,
};

export interface ProcessingStateEvidence {
	source: Pick<DistillationSource, "path" | "subpath" | "text">;
	state: Exclude<ProcessingState, "unprocessed">;
}

/** A source key is independent of Canvas node ids and UI remounts. */
export function createSourceKey(
	source: Pick<DistillationSource, "path" | "subpath" | "text">,
): string | null {
	if (source.path?.trim()) {
		const path = normalizePath(source.path);
		const subpath = normalizeSubpath(source.subpath);
		return `path:${path}${subpath}`;
	}
	if (source.text?.trim()) return `text:${createContentFingerprint(source.text)}`;
	return null;
}

export function withSourceKey(source: DistillationSource): DistillationSource {
	return { ...source, sourceKey: source.sourceKey ?? createSourceKey(source) ?? undefined };
}

export class ProcessingStateIndex {
	private readonly states = new Map<string, ProcessingState>();

	constructor(evidence: readonly ProcessingStateEvidence[] = []) {
		for (const item of evidence) this.record(item.source, item.state);
	}

	record(
		source: Pick<DistillationSource, "path" | "subpath" | "text">,
		state: Exclude<ProcessingState, "unprocessed">,
	): void {
		const key = createSourceKey(source);
		if (!key) return;
		const current = this.states.get(key) ?? "unprocessed";
		if (STATE_RANK[state] > STATE_RANK[current]) this.states.set(key, state);
	}

	stateOf(source: Pick<DistillationSource, "path" | "subpath" | "text">): ProcessingState {
		const key = createSourceKey(source);
		return key ? (this.states.get(key) ?? "unprocessed") : "unprocessed";
	}

	isUnprocessed(source: Pick<DistillationSource, "path" | "subpath" | "text">): boolean {
		return this.stateOf(source) === "unprocessed";
	}
}

export function buildProcessingStateIndex(
	app: App,
	canvasData?: Pick<CanvasData, "nodes"> | null,
): ProcessingStateIndex {
	const index = new ProcessingStateIndex();
	for (const node of canvasData?.nodes ?? []) {
		const source = sourceFromCanvasNode(node);
		if (source) index.record(source, "on-canvas");
	}

	for (const file of app.vault.getMarkdownFiles()) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) continue;
		const state = stateFromFrontmatter(frontmatter);
		for (const source of sourcesFromFrontmatter(frontmatter)) index.record(source, state);
	}
	return index;
}

/** Keeps only source cards that still contain at least one unprocessed unit. */
export function filterUnprocessedResults(
	results: readonly SearchResult[],
	index: ProcessingStateIndex,
): SearchResult[] {
	return results.flatMap((result) => {
		const fileSource = { path: result.file.path };
		if (!index.isUnprocessed(fileSource)) return [];
		if (result.headings.length === 0) return [result];
		const headings = result.headings.filter((heading) =>
			index.isUnprocessed({ path: result.file.path, subpath: `#${heading.heading}` }),
		);
		return headings.length > 0 ? [{ ...result, headings }] : [];
	});
}

function sourceFromCanvasNode(
	node: CanvasNodeData,
): Pick<DistillationSource, "path" | "subpath" | "text"> | null {
	if (node.type === "file" && node.file) return { path: node.file, subpath: node.subpath };
	if (node.type === "text" && node.text?.trim()) return { text: node.text };
	return null;
}

function sourcesFromFrontmatter(
	frontmatter: Record<string, unknown>,
): Pick<DistillationSource, "path" | "subpath" | "text">[] {
	const graphuneSources = frontmatter["graphune-sources"];
	const sources: Pick<DistillationSource, "path" | "subpath" | "text">[] = Array.isArray(
		graphuneSources,
	)
		? graphuneSources.filter(isSourceLike).map((source) => ({
				path: asString(source.path),
				subpath: asString(source.subpath),
				text: asString(source.text),
			}))
		: [];
	const extractedPath = asString(frontmatter["heptabase-source"]);
	if (extractedPath) {
		const heading = asString(frontmatter["heptabase-source-heading"]);
		sources.push({ path: extractedPath, subpath: heading ? `#${heading}` : undefined });
	}
	return sources;
}

function stateFromFrontmatter(
	frontmatter: Record<string, unknown>,
): Exclude<ProcessingState, "unprocessed" | "on-canvas"> {
	const state = asString(frontmatter["graphune-state"]);
	if (state === "completed") return "completed";
	if (state === "connected" || hasItems(frontmatter["graphune-connections"])) return "connected";
	return "distilled";
}

function normalizePath(path: string): string {
	return path.trim().replaceAll("\\", "/").replace(/^\.\//u, "").normalize("NFC");
}

function normalizeSubpath(subpath: string | undefined): string {
	if (!subpath?.trim()) return "";
	const normalized = subpath.trim().normalize("NFC");
	return normalized.startsWith("#") ? normalized : `#${normalized}`;
}

function isSourceLike(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function hasItems(value: unknown): boolean {
	return Array.isArray(value) && value.length > 0;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}
