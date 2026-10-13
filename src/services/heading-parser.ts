import type { ParsedHeading, SearchResult, SourceKind } from "@/types/plugin";
import type { App, TFile } from "obsidian";

const FRONTMATTER_PATTERN = /^---\n[\s\S]*?\n---\n?/;
const SEARCH_CONCURRENCY = 8;
const MAX_INDEX_ENTRIES = 500;

interface SearchIndexEntry {
	version: string;
	content: string;
	searchableLower: string;
	excerpt: string;
}

export interface SearchOutcome {
	results: SearchResult[];
	failedCount: number;
}

export class HeadingParser {
	private readonly index = new Map<string, SearchIndexEntry>();
	private readonly pending = new Map<
		string,
		{ version: string; promise: Promise<SearchIndexEntry> }
	>();

	constructor(
		private readonly app: App,
		private readonly maxIndexEntries = MAX_INDEX_ENTRIES,
	) {}

	invalidate(path?: string): void {
		if (path) {
			this.index.delete(path);
			this.pending.delete(path);
		} else {
			this.index.clear();
			this.pending.clear();
		}
	}

	list(): SearchResult[] {
		return this.app.vault
			.getMarkdownFiles()
			.map((file) => this.buildResult(file, this.index.get(file.path)?.excerpt ?? ""));
	}

	async search(query: string): Promise<SearchResult[]> {
		return (await this.searchDetailed(query)).results;
	}

	async searchDetailed(query: string): Promise<SearchOutcome> {
		const files = this.app.vault.getMarkdownFiles();
		const normalizedQuery = query.trim();
		const livePaths = new Set(files.map((file) => file.path));
		for (const path of this.index.keys()) {
			if (!livePaths.has(path)) this.index.delete(path);
		}

		let failedCount = 0;
		const matched = await mapWithConcurrency(
			files,
			SEARCH_CONCURRENCY,
			async (file: TFile): Promise<SearchResult | null> => {
				try {
					const entry = await this.getIndexEntry(file);
					if (normalizedQuery === "") return this.buildResult(file, entry.excerpt);
					const lowerQuery = normalizedQuery.toLocaleLowerCase();
					if (
						file.basename.toLocaleLowerCase().includes(lowerQuery) ||
						entry.searchableLower.includes(lowerQuery)
					) {
						return this.buildResult(file, this.extractExcerpt(entry.content, normalizedQuery));
					}
				} catch {
					// A single unreadable note must not break the entire library.
					failedCount += 1;
					return null;
				}

				return null;
			},
		);

		return {
			results: matched.filter((r): r is SearchResult => r !== null),
			failedCount,
		};
	}

	private getHeadings(file: TFile): ParsedHeading[] {
		return (this.app.metadataCache.getFileCache(file)?.headings ?? []).map((heading) => ({
			heading: heading.heading,
			level: heading.level,
			position: heading.position,
		}));
	}

	private buildResult(file: TFile, excerpt: string): SearchResult {
		return {
			file,
			excerpt,
			headings: this.getHeadings(file),
			sourceKind: this.getSourceKind(file),
			tags: this.getTags(file),
			folder: file.parent?.path || "/",
			modifiedTime: file.stat.mtime,
		};
	}

	private getSourceKind(file: TFile): SourceKind {
		const cache = this.app.metadataCache.getFileCache(file);
		return classifySourceKind(file.path, file.basename, cache?.frontmatter, this.getTags(file));
	}

	private getTags(file: TFile): string[] {
		const cache = this.app.metadataCache.getFileCache(file);
		const inlineTags = (cache?.tags ?? []).map(({ tag }) => tag.replace(/^#/, ""));
		const frontmatterTags = normalizeTags(cache?.frontmatter?.tags);
		return [...new Set([...inlineTags, ...frontmatterTags])].toSorted((a, b) => a.localeCompare(b));
	}

	private async getIndexEntry(file: TFile): Promise<SearchIndexEntry> {
		const version = `${file.stat.mtime}:${file.stat.size}`;
		const cached = this.index.get(file.path);
		if (cached?.version === version) {
			this.index.delete(file.path);
			this.index.set(file.path, cached);
			return cached;
		}
		const pending = this.pending.get(file.path);
		if (pending?.version === version) return pending.promise;

		const promise = this.app.vault.cachedRead(file).then((content) => {
			const searchableContent = prepareExcerptContent(content);
			return {
				version,
				content,
				searchableLower: searchableContent.toLocaleLowerCase(),
				excerpt: this.extractExcerpt(content),
			};
		});
		const request = { version, promise };
		this.pending.set(file.path, request);
		try {
			const entry = await promise;
			if (this.pending.get(file.path) === request) {
				this.index.delete(file.path);
				this.index.set(file.path, entry);
				while (this.index.size > this.maxIndexEntries) {
					const oldestPath = this.index.keys().next().value;
					if (oldestPath === undefined) break;
					this.index.delete(oldestPath);
				}
			}
			return entry;
		} finally {
			if (this.pending.get(file.path) === request) this.pending.delete(file.path);
		}
	}

	private extractExcerpt(content: string, query?: string): string {
		const lines = prepareExcerptContent(content).split("\n");
		const contentIndices = lines
			.map((line, index) => (isExcerptLine(line) && line.trim() ? index : -1))
			.filter((index) => index >= 0);
		if (contentIndices.length === 0) return "";

		let selectedIndices = contentIndices.slice(0, 3);
		if (query) {
			const lowerQuery = query.toLowerCase();
			const matchIndex = lines.findIndex((line) => line.toLowerCase().includes(lowerQuery));
			if (matchIndex >= 0) {
				const contentPosition = contentIndices.indexOf(matchIndex);
				if (contentPosition >= 0) {
					const start = Math.max(0, Math.min(contentPosition - 1, contentIndices.length - 3));
					selectedIndices = contentIndices.slice(start, start + 3);
				} else {
					const before = contentIndices.filter((index) => index < matchIndex).slice(-1);
					const after = contentIndices.filter((index) => index > matchIndex).slice(0, 2);
					selectedIndices = [...before, ...after];
				}
			}
		}

		return formatExcerpt(lines, selectedIndices);
	}
}

export function classifySourceKind(
	path: string,
	basename: string,
	frontmatter: Record<string, unknown> | undefined,
	tags: readonly string[],
): SourceKind {
	const signals = [path, ...tags, ...frontmatterSignals(frontmatter)].join(" ").toLocaleLowerCase();
	if (/(^|[\s/_-])(kindle|readwise[\s/_-]*book|book[\s/_-]*highlight)([\s/_-]|$)/.test(signals)) {
		return "kindle";
	}
	if (
		/^\d{4}-\d{2}-\d{2}(?:[ _-].*)?$/.test(basename) ||
		/(^|[\s/_-])(daily|journal)([\s/_-]|$)/.test(signals)
	) {
		return "daily";
	}
	if (
		/(^|[\s/_-])(clipping|clipper|web[\s/_-]*clip|readwise[\s/_-]*article|article)([\s/_-]|$)/.test(
			signals,
		) ||
		hasWebSource(frontmatter)
	) {
		return "clipping";
	}
	return "note";
}

function frontmatterSignals(frontmatter: Record<string, unknown> | undefined): string[] {
	if (!frontmatter) return [];
	return Object.entries(frontmatter).flatMap(([key, value]) => {
		if (typeof value === "string") return [key, value];
		if (Array.isArray(value))
			return [key, ...value.filter((item): item is string => typeof item === "string")];
		return [key];
	});
}

function hasWebSource(frontmatter: Record<string, unknown> | undefined): boolean {
	if (!frontmatter) return false;
	return ["source", "source_url", "url", "original_url"].some((key) => {
		const value = frontmatter[key];
		return typeof value === "string" && /^https?:\/\//i.test(value);
	});
}

function prepareExcerptContent(content: string): string {
	return removeFencedCodeBlocks(content.replace(FRONTMATTER_PATTERN, ""));
}

function formatExcerpt(lines: string[], selectedIndices: number[]): string {
	if (selectedIndices.length === 0) return "";
	const selected = new Set(selectedIndices);
	const output: string[] = [];
	const start = selectedIndices[0]!;
	const end = selectedIndices[selectedIndices.length - 1]!;

	for (let index = start; index <= end; index++) {
		const line = lines[index]!;
		if (selected.has(index)) {
			output.push(line.trimEnd());
		} else if ((!line.trim() || !isExcerptLine(line)) && output.at(-1) !== "") {
			output.push("");
		}
	}

	while (output.at(-1) === "") output.pop();
	return output.join("\n");
}

function removeFencedCodeBlocks(content: string): string {
	const keptLines: string[] = [];
	let closingFence: RegExp | null = null;

	for (const line of content.split("\n")) {
		if (closingFence) {
			if (closingFence.test(line)) closingFence = null;
			continue;
		}

		const opening = line.match(/^\s*(`{3,}|~{3,})/);
		if (opening?.[1]) {
			const marker = opening[1][0]!;
			closingFence = new RegExp(`^\\s*${escapeRegExp(marker)}{${opening[1].length},}\\s*$`);
			continue;
		}

		keptLines.push(line);
	}

	return keptLines.join("\n");
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isExcerptLine(line: string): boolean {
	return !/^#{1,6}\s+/.test(line.trimStart());
}

function normalizeTags(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.filter((tag): tag is string => typeof tag === "string")
			.map(cleanTag)
			.filter(Boolean);
	}
	if (typeof value === "string") {
		return value.split(/[ ,]+/).map(cleanTag).filter(Boolean);
	}
	return [];
}

function cleanTag(tag: string): string {
	return tag.trim().replace(/^#/, "");
}

async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	mapper: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = Array.from({ length: items.length });
	let nextIndex = 0;
	const worker = async (): Promise<void> => {
		while (nextIndex < items.length) {
			const index = nextIndex++;
			results[index] = await mapper(items[index]!);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}
