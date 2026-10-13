import type { CanvasData } from "@/types/obsidian-canvas";
import { TFile, type App } from "obsidian";

const CANVAS_READ_CONCURRENCY = 4;

export interface KnowledgeReference {
	path: string;
	label: string;
}

export interface CanvasLocation extends KnowledgeReference {
	nodeId: string;
}

export type RelatedCandidateReason =
	| { type: "outlink" }
	| { type: "backlink" }
	| { type: "tag"; value: string }
	| { type: "heading"; value: string };

export interface RelatedCandidate extends KnowledgeReference {
	score: number;
	reasons: RelatedCandidateReason[];
}

export interface KnowledgeContext {
	backlinks: KnowledgeReference[];
	canvases: CanvasLocation[];
	canvasStatus: "fresh" | "stale" | "error";
	relatedCandidates: RelatedCandidate[];
	status: "loading" | "ready" | "error";
}

export class KnowledgeContextService {
	private readonly canvasCache = new Map<
		string,
		{ mtime: number; placements: { filePath: string; nodeId: string }[] }
	>();
	private readonly pendingCanvasReads = new Map<
		string,
		{ mtime: number; promise: Promise<{ filePath: string; nodeId: string }[]> }
	>();
	private readonly canvasesByNote = new Map<
		string,
		Map<string, { label: string; nodeIds: string[] }>
	>();
	private readonly canvasGenerations = new Map<string, number>();
	private activeCanvasReads = 0;
	private readonly queuedCanvasReads: Array<{ start: () => void }> = [];

	constructor(private readonly app: App) {}

	invalidateCanvas(path: string): void {
		this.canvasGenerations.set(path, (this.canvasGenerations.get(path) ?? 0) + 1);
		this.removeCanvasFromIndex(path);
		this.canvasCache.delete(path);
	}

	markCanvasStale(path: string): void {
		this.canvasGenerations.set(path, (this.canvasGenerations.get(path) ?? 0) + 1);
	}

	renameCanvas(oldPath: string, file: TFile): void {
		this.invalidateCanvas(oldPath);
		this.invalidateCanvas(file.path);
	}

	async getForFile(
		file: TFile,
		signal?: AbortSignal,
		excludedPaths: ReadonlySet<string> = new Set(),
	): Promise<KnowledgeContext> {
		throwIfAborted(signal);
		const backlinks = this.getBacklinks(file);
		const relatedCandidates = rankRelatedCandidates(this.app, file, excludedPaths);
		const { locations: canvases, status: canvasStatus } = await this.getCanvasLocations(
			file,
			signal,
		);
		return { backlinks, canvases, canvasStatus, relatedCandidates, status: "ready" };
	}

	private getBacklinks(file: TFile): KnowledgeReference[] {
		const resolvedLinks = this.app.metadataCache.resolvedLinks ?? {};
		const backlinks: KnowledgeReference[] = [];

		for (const [sourcePath, destinations] of Object.entries(resolvedLinks)) {
			if (!destinations[file.path]) continue;
			const source = this.app.vault.getAbstractFileByPath(sourcePath);
			if (source instanceof TFile) {
				backlinks.push({ path: source.path, label: source.basename });
			}
		}

		return backlinks.toSorted((a, b) => a.label.localeCompare(b.label));
	}

	private async getCanvasLocations(
		file: TFile,
		signal?: AbortSignal,
	): Promise<{ locations: CanvasLocation[]; status: KnowledgeContext["canvasStatus"] }> {
		const canvasFiles = this.app.vault
			.getFiles()
			.filter((candidate) => candidate.extension === "canvas");
		const livePaths = new Set(canvasFiles.map((canvasFile) => canvasFile.path));
		for (const cachedPath of this.canvasCache.keys()) {
			if (!livePaths.has(cachedPath)) this.invalidateCanvas(cachedPath);
		}
		let status: KnowledgeContext["canvasStatus"] = "fresh";
		const reportStatus = (next: KnowledgeContext["canvasStatus"]): void => {
			if (next === "error" || (next === "stale" && status === "fresh")) status = next;
		};
		await Promise.all(
			canvasFiles.map((canvasFile) => {
				const requestedMtime = canvasFile.stat.mtime;
				const requestedGeneration = this.canvasGenerations.get(canvasFile.path) ?? 0;
				return this.enqueueCanvasRead(async (): Promise<void> => {
					try {
						let cached = this.canvasCache.get(canvasFile.path);
						if (!cached || cached.mtime !== requestedMtime) {
							const placements = await this.readCanvasPlacements(canvasFile, requestedMtime);
							cached = { mtime: requestedMtime, placements };
							if (
								canvasFile.stat.mtime === requestedMtime &&
								(this.canvasGenerations.get(canvasFile.path) ?? 0) === requestedGeneration
							) {
								this.replaceCanvasInIndex(canvasFile, cached);
							} else {
								reportStatus(this.canvasCache.has(canvasFile.path) ? "stale" : "error");
							}
						}
					} catch {
						const current = this.canvasCache.get(canvasFile.path);
						reportStatus(current ? "stale" : "error");
					}
				}, signal);
			}),
		);
		throwIfAborted(signal);

		const canvasEntries = this.canvasesByNote.get(file.path);
		if (!canvasEntries) return { locations: [], status };
		const locations = Array.from(canvasEntries, ([path, entry]) =>
			entry.nodeIds.map((nodeId) => ({ path, label: entry.label, nodeId })),
		)
			.flat()
			.toSorted((a, b) => a.label.localeCompare(b.label));
		return { locations, status };
	}

	private replaceCanvasInIndex(
		canvasFile: TFile,
		cache: { mtime: number; placements: { filePath: string; nodeId: string }[] },
	): void {
		this.removeCanvasFromIndex(canvasFile.path);
		this.canvasCache.set(canvasFile.path, cache);
		const nodesByFile = new Map<string, string[]>();
		for (const placement of cache.placements) {
			const nodeIds = nodesByFile.get(placement.filePath) ?? [];
			nodeIds.push(placement.nodeId);
			nodesByFile.set(placement.filePath, nodeIds);
		}
		for (const [filePath, nodeIds] of nodesByFile) {
			const canvases =
				this.canvasesByNote.get(filePath) ??
				new Map<string, { label: string; nodeIds: string[] }>();
			canvases.set(canvasFile.path, { label: canvasFile.basename, nodeIds });
			this.canvasesByNote.set(filePath, canvases);
		}
	}

	private removeCanvasFromIndex(canvasPath: string): void {
		const cached = this.canvasCache.get(canvasPath);
		if (!cached) return;
		for (const filePath of new Set(cached.placements.map((placement) => placement.filePath))) {
			const canvases = this.canvasesByNote.get(filePath);
			canvases?.delete(canvasPath);
			if (canvases?.size === 0) this.canvasesByNote.delete(filePath);
		}
	}

	private async readCanvasPlacements(
		canvasFile: TFile,
		mtime: number,
	): Promise<{ filePath: string; nodeId: string }[]> {
		const pending = this.pendingCanvasReads.get(canvasFile.path);
		if (pending?.mtime === mtime) return pending.promise;

		const promise = this.app.vault.cachedRead(canvasFile).then((raw) => {
			const data = JSON.parse(raw) as CanvasData;
			if (!Array.isArray(data.nodes)) return [];
			return data.nodes
				.filter((node) => node.type === "file" && node.file)
				.map((node) => ({ filePath: node.file!, nodeId: node.id }));
		});
		const request = { mtime, promise };
		this.pendingCanvasReads.set(canvasFile.path, request);
		try {
			return await promise;
		} finally {
			if (this.pendingCanvasReads.get(canvasFile.path) === request) {
				this.pendingCanvasReads.delete(canvasFile.path);
			}
		}
	}

	private enqueueCanvasRead<T>(read: () => Promise<T>, signal?: AbortSignal): Promise<T> {
		if (signal?.aborted) return Promise.reject(abortError());

		return new Promise<T>((resolve, reject) => {
			let started = false;
			const job = {
				start: () => {
					started = true;
					signal?.removeEventListener("abort", onAbort);
					this.activeCanvasReads += 1;
					void Promise.resolve()
						.then(read)
						.then(resolve, reject)
						.finally(() => {
							this.activeCanvasReads -= 1;
							this.drainCanvasReads();
						});
				},
			};
			const onAbort = () => {
				if (started) return;
				const index = this.queuedCanvasReads.indexOf(job);
				if (index >= 0) this.queuedCanvasReads.splice(index, 1);
				reject(abortError());
			};
			signal?.addEventListener("abort", onAbort, { once: true });
			this.queuedCanvasReads.push(job);
			this.drainCanvasReads();
		});
	}

	private drainCanvasReads(): void {
		while (this.activeCanvasReads < CANVAS_READ_CONCURRENCY && this.queuedCanvasReads.length > 0) {
			this.queuedCanvasReads.shift()?.start();
		}
	}
}

export function rankRelatedCandidates(
	app: App,
	selected: TFile,
	excludedPaths: ReadonlySet<string> = new Set(),
): RelatedCandidate[] {
	const links = app.metadataCache.resolvedLinks ?? {};
	const selectedTags = metadataTags(app, selected);
	const selectedHeadings = metadataHeadings(app, selected);

	return app.vault
		.getMarkdownFiles()
		.filter((candidate) => candidate.path !== selected.path && !excludedPaths.has(candidate.path))
		.map((candidate): RelatedCandidate => {
			const reasons: RelatedCandidateReason[] = [];
			let score = 0;
			if (links[selected.path]?.[candidate.path]) {
				reasons.push({ type: "outlink" });
				score += 100;
			}
			if (links[candidate.path]?.[selected.path]) {
				reasons.push({ type: "backlink" });
				score += 90;
			}
			for (const tag of intersection(selectedTags, metadataTags(app, candidate))) {
				reasons.push({ type: "tag", value: tag });
				score += 15;
			}
			for (const heading of intersection(selectedHeadings, metadataHeadings(app, candidate))) {
				reasons.push({ type: "heading", value: heading });
				score += 5;
			}
			return { path: candidate.path, label: candidate.basename, score, reasons };
		})
		.filter((candidate) => candidate.score > 0)
		.toSorted((left, right) => right.score - left.score || left.path.localeCompare(right.path));
}

function metadataTags(app: App, file: TFile): string[] {
	const cache = app.metadataCache.getFileCache(file);
	const inline = (cache?.tags ?? []).map(({ tag }) => normalizeSignal(tag.replace(/^#/, "")));
	const raw = readUnknownProperty(cache?.frontmatter, "tags");
	const frontmatter = Array.isArray(raw)
		? raw.map(String)
		: typeof raw === "string"
			? raw.split(",")
			: [];
	return [...new Set([...inline, ...frontmatter.map(normalizeSignal)].filter(Boolean))].toSorted();
}

function metadataHeadings(app: App, file: TFile): string[] {
	return [
		...new Set(
			(app.metadataCache.getFileCache(file)?.headings ?? [])
				.map(({ heading }) => normalizeSignal(heading))
				.filter(Boolean),
		),
	].toSorted();
}

function normalizeSignal(value: string): string {
	return value.trim().toLocaleLowerCase();
}

function readUnknownProperty(value: unknown, key: string): unknown {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	return Object.prototype.hasOwnProperty.call(value, key)
		? Object.getOwnPropertyDescriptor(value, key)?.value
		: undefined;
}

function intersection(left: readonly string[], right: readonly string[]): string[] {
	const rightSet = new Set(right);
	return left.filter((value) => rightSet.has(value));
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw abortError();
}

function abortError(): DOMException {
	return new DOMException("The operation was aborted", "AbortError");
}
