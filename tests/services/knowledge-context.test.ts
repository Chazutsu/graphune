import { KnowledgeContextService } from "@/services/knowledge-context";
import { App, TFile } from "obsidian";
import { type Mock, describe, expect, it, vi } from "vitest";

describe("KnowledgeContextService", () => {
	it("finds backlinks and every canvas placement", async () => {
		const app = new App();
		const target = new TFile("notes/target.md");
		const source = new TFile("notes/source.md");
		const canvas = new TFile("maps/topic.canvas");
		app.metadataCache.resolvedLinks = {
			[source.path]: { [target.path]: 2 },
		};
		(app.vault.getAbstractFileByPath as Mock).mockImplementation((path: string) =>
			path === source.path ? source : null,
		);
		(app.vault.getFiles as Mock).mockReturnValue([target, source, canvas]);
		(app.vault.cachedRead as Mock).mockResolvedValue(
			JSON.stringify({
				nodes: [
					{ id: "target-node", type: "file", file: target.path },
					{ id: "other-node", type: "file", file: source.path },
				],
				edges: [],
			}),
		);

		const context = await new KnowledgeContextService(app).getForFile(target);

		expect(context.backlinks).toEqual([{ path: source.path, label: "source" }]);
		expect(context.canvases).toEqual([
			{ path: canvas.path, label: "topic", nodeId: "target-node" },
		]);
		expect(context.canvasStatus).toBe("fresh");
	});

	it("ignores malformed canvas files", async () => {
		const app = new App();
		const target = new TFile("target.md");
		const canvas = new TFile("broken.canvas");
		(app.vault.getFiles as Mock).mockReturnValue([canvas]);
		(app.vault.cachedRead as Mock).mockResolvedValue("not json");

		await expect(new KnowledgeContextService(app).getForFile(target)).resolves.toEqual({
			backlinks: [],
			canvases: [],
			canvasStatus: "error",
			relatedCandidates: [],
			status: "ready",
		});
	});

	it("reuses parsed Canvas data until the file mtime changes", async () => {
		const app = new App();
		const target = new TFile("target.md");
		const canvas = new TFile("board.canvas");
		canvas.stat.mtime = 1;
		(app.vault.getFiles as Mock).mockReturnValue([canvas]);
		(app.vault.cachedRead as Mock).mockResolvedValue(
			JSON.stringify({ nodes: [{ id: "node", type: "file", file: target.path }], edges: [] }),
		);
		const service = new KnowledgeContextService(app);

		await service.getForFile(target);
		await service.getForFile(target);
		expect(app.vault.cachedRead).toHaveBeenCalledTimes(1);

		canvas.stat.mtime = 2;
		await service.getForFile(target);
		expect(app.vault.cachedRead).toHaveBeenCalledTimes(2);
	});

	it("uses a reverse index when switching between notes", async () => {
		const app = new App();
		const first = new TFile("first.md");
		const second = new TFile("second.md");
		const canvas = new TFile("board.canvas");
		(app.vault.getFiles as Mock).mockReturnValue([canvas]);
		(app.vault.cachedRead as Mock).mockResolvedValue(
			JSON.stringify({
				nodes: [
					{ id: "first-node", type: "file", file: first.path },
					{ id: "second-node", type: "file", file: second.path },
				],
				edges: [],
			}),
		);
		const service = new KnowledgeContextService(app);

		await expect(service.getForFile(first)).resolves.toMatchObject({
			canvases: [{ nodeId: "first-node" }],
		});
		await expect(service.getForFile(second)).resolves.toMatchObject({
			canvases: [{ nodeId: "second-node" }],
		});

		expect(app.vault.cachedRead).toHaveBeenCalledTimes(1);
	});

	it("retains stale reverse-index entries when a changed Canvas is temporarily malformed", async () => {
		const app = new App();
		const target = new TFile("target.md");
		const canvas = new TFile("board.canvas");
		canvas.stat.mtime = 1;
		(app.vault.getFiles as Mock).mockReturnValue([canvas]);
		vi.mocked(app.vault.cachedRead)
			.mockResolvedValueOnce(
				JSON.stringify({ nodes: [{ id: "node", type: "file", file: target.path }], edges: [] }),
			)
			.mockResolvedValueOnce("not json");
		const service = new KnowledgeContextService(app);

		await expect(service.getForFile(target)).resolves.toMatchObject({
			canvases: [{ nodeId: "node" }],
		});
		canvas.stat.mtime = 2;
		await expect(service.getForFile(target)).resolves.toEqual({
			backlinks: [],
			canvases: [{ path: canvas.path, label: "board", nodeId: "node" }],
			canvasStatus: "stale",
			relatedCandidates: [],
			status: "ready",
		});
	});

	it("invalidates a renamed Canvas without allowing its pending read to restore the old path", async () => {
		const app = new App();
		const target = new TFile("target.md");
		const canvas = new TFile("old.canvas");
		(app.vault.getFiles as Mock).mockReturnValue([canvas]);
		let resolveRead!: (value: string) => void;
		(app.vault.cachedRead as Mock).mockReturnValue(
			new Promise<string>((resolve) => {
				resolveRead = resolve;
			}),
		);
		const service = new KnowledgeContextService(app);

		const pending = service.getForFile(target);
		await vi.waitFor(() => expect(app.vault.cachedRead).toHaveBeenCalledOnce());
		const oldPath = canvas.path;
		const renamed = new TFile("new.canvas");
		service.renameCanvas(oldPath, renamed);
		(app.vault.getFiles as Mock).mockReturnValue([]);
		resolveRead(
			JSON.stringify({ nodes: [{ id: "stale", type: "file", file: target.path }], edges: [] }),
		);

		await expect(pending).resolves.toEqual({
			backlinks: [],
			canvases: [],
			canvasStatus: "error",
			relatedCandidates: [],
			status: "ready",
		});
		await expect(service.getForFile(target)).resolves.toEqual({
			backlinks: [],
			canvases: [],
			canvasStatus: "fresh",
			relatedCandidates: [],
			status: "ready",
		});
	});

	it("keeps the last successful cache after an mtime update read fails", async () => {
		const app = new App();
		const target = new TFile("target.md");
		const canvas = new TFile("board.canvas");
		canvas.stat.mtime = 1;
		(app.vault.getFiles as Mock).mockReturnValue([canvas]);
		vi.mocked(app.vault.cachedRead)
			.mockResolvedValueOnce(
				JSON.stringify({ nodes: [{ id: "cached", type: "file", file: target.path }], edges: [] }),
			)
			.mockRejectedValueOnce(new Error("not downloaded"));
		const service = new KnowledgeContextService(app);

		await service.getForFile(target);
		canvas.stat.mtime = 2;
		service.markCanvasStale(canvas.path);

		await expect(service.getForFile(target)).resolves.toEqual({
			backlinks: [],
			canvases: [{ path: canvas.path, label: "board", nodeId: "cached" }],
			canvasStatus: "stale",
			relatedCandidates: [],
			status: "ready",
		});
	});

	it("explicit invalidation removes cached placements", async () => {
		const app = new App();
		const target = new TFile("target.md");
		const canvas = new TFile("board.canvas");
		(app.vault.getFiles as Mock).mockReturnValue([canvas]);
		(app.vault.cachedRead as Mock).mockResolvedValue(
			JSON.stringify({ nodes: [{ id: "cached", type: "file", file: target.path }], edges: [] }),
		);
		const service = new KnowledgeContextService(app);

		await service.getForFile(target);
		service.invalidateCanvas(canvas.path);
		(app.vault.getFiles as Mock).mockReturnValue([]);

		await expect(service.getForFile(target)).resolves.toEqual({
			backlinks: [],
			canvases: [],
			canvasStatus: "fresh",
			relatedCandidates: [],
			status: "ready",
		});
	});

	it("ranks explainable local signals and excludes cards already on the Canvas", async () => {
		const app = new App();
		const selected = new TFile("selected.md");
		const direct = new TFile("z-direct.md");
		const backlink = new TFile("backlink.md");
		const shared = new TFile("shared.md");
		const placed = new TFile("placed.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([
			shared,
			placed,
			backlink,
			direct,
			selected,
		]);
		app.metadataCache.resolvedLinks = {
			[selected.path]: { [direct.path]: 1 },
			[backlink.path]: { [selected.path]: 1 },
		};
		(app.metadataCache.getFileCache as Mock).mockImplementation((file: TFile) => ({
			tags: file === selected || file === shared ? [{ tag: "#design" }] : [],
			headings: file === selected || file === shared ? [{ heading: "Evidence", level: 2 }] : [],
		}));
		(app.vault.getFiles as Mock).mockReturnValue([]);

		const context = await new KnowledgeContextService(app).getForFile(
			selected,
			undefined,
			new Set([placed.path]),
		);

		expect(context.relatedCandidates).toEqual([
			{
				path: direct.path,
				label: "z-direct",
				score: 100,
				reasons: [{ type: "outlink" }],
			},
			{
				path: backlink.path,
				label: "backlink",
				score: 90,
				reasons: [{ type: "backlink" }],
			},
			{
				path: shared.path,
				label: "shared",
				score: 20,
				reasons: [
					{ type: "tag", value: "design" },
					{ type: "heading", value: "evidence" },
				],
			},
		]);
	});

	it("uses the path as a stable tie-breaker", async () => {
		const app = new App();
		const selected = new TFile("selected.md");
		const beta = new TFile("beta.md");
		const alpha = new TFile("alpha.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([beta, alpha, selected]);
		app.metadataCache.resolvedLinks = {
			[selected.path]: { [beta.path]: 1, [alpha.path]: 1 },
		};
		(app.vault.getFiles as Mock).mockReturnValue([]);

		const context = await new KnowledgeContextService(app).getForFile(selected);

		expect(context.relatedCandidates.map(({ path }) => path)).toEqual(["alpha.md", "beta.md"]);
	});

	it("does not let an older Canvas read replace a newer cache entry", async () => {
		const app = new App();
		const target = new TFile("target.md");
		const canvas = new TFile("board.canvas");
		canvas.stat.mtime = 1;
		(app.vault.getFiles as Mock).mockReturnValue([canvas]);
		let resolveFirst!: (value: string) => void;
		const firstRead = new Promise<string>((resolve) => {
			resolveFirst = resolve;
		});
		vi.mocked(app.vault.cachedRead)
			.mockReturnValueOnce(firstRead)
			.mockResolvedValueOnce(
				JSON.stringify({ nodes: [{ id: "new", type: "file", file: target.path }], edges: [] }),
			);
		const service = new KnowledgeContextService(app);

		const staleRequest = service.getForFile(target);
		canvas.stat.mtime = 2;
		await expect(service.getForFile(target)).resolves.toMatchObject({
			canvases: [{ nodeId: "new" }],
		});
		resolveFirst(
			JSON.stringify({ nodes: [{ id: "old", type: "file", file: target.path }], edges: [] }),
		);
		await staleRequest;
		await service.getForFile(target);

		expect(app.vault.cachedRead).toHaveBeenCalledTimes(2);
	});

	it("shares an in-flight Canvas read between concurrent requests", async () => {
		const app = new App();
		const firstTarget = new TFile("first.md");
		const secondTarget = new TFile("second.md");
		const canvas = new TFile("board.canvas");
		(app.vault.getFiles as Mock).mockReturnValue([canvas]);
		(app.vault.cachedRead as Mock).mockResolvedValue(
			JSON.stringify({
				nodes: [
					{ id: "first", type: "file", file: firstTarget.path },
					{ id: "second", type: "file", file: secondTarget.path },
				],
				edges: [],
			}),
		);
		const service = new KnowledgeContextService(app);

		await Promise.all([service.getForFile(firstTarget), service.getForFile(secondTarget)]);

		expect(app.vault.cachedRead).toHaveBeenCalledTimes(1);
	});

	it("reads at most four Canvas files concurrently", async () => {
		const app = new App();
		const target = new TFile("target.md");
		const canvases = Array.from({ length: 8 }, (_, index) => new TFile(`${index}.canvas`));
		(app.vault.getFiles as Mock).mockReturnValue(canvases);
		const releases: Array<() => void> = [];
		let active = 0;
		let peak = 0;
		(app.vault.cachedRead as Mock).mockImplementation(async () => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise<void>((resolve) => releases.push(resolve));
			active -= 1;
			return JSON.stringify({ nodes: [], edges: [] });
		});

		const request = new KnowledgeContextService(app).getForFile(target);
		await vi.waitFor(() => expect(app.vault.cachedRead).toHaveBeenCalledTimes(4));
		expect(peak).toBe(4);
		releases.splice(0).forEach((release) => release());
		await vi.waitFor(() => expect(app.vault.cachedRead).toHaveBeenCalledTimes(8));
		releases.splice(0).forEach((release) => release());
		await request;

		expect(app.vault.cachedRead).toHaveBeenCalledTimes(8);
		expect(peak).toBe(4);
	});

	it("aborts queued reads while retaining cache entries from completed reads", async () => {
		const app = new App();
		const target = new TFile("target.md");
		const canvases = Array.from({ length: 8 }, (_, index) => new TFile(`${index}.canvas`));
		(app.vault.getFiles as Mock).mockReturnValue(canvases);
		const releases: Array<() => void> = [];
		(app.vault.cachedRead as Mock).mockImplementation(
			() =>
				new Promise<string>((resolve) =>
					releases.push(() => resolve(JSON.stringify({ nodes: [], edges: [] }))),
				),
		);
		const service = new KnowledgeContextService(app);
		const controller = new AbortController();

		const staleRequest = service.getForFile(target, controller.signal);
		await vi.waitFor(() => expect(app.vault.cachedRead).toHaveBeenCalledTimes(4));
		controller.abort();
		releases.splice(0).forEach((release) => release());
		await expect(staleRequest).rejects.toMatchObject({ name: "AbortError" });
		expect(app.vault.cachedRead).toHaveBeenCalledTimes(4);

		(app.vault.cachedRead as Mock).mockResolvedValue(JSON.stringify({ nodes: [], edges: [] }));
		await service.getForFile(target);
		expect(app.vault.cachedRead).toHaveBeenCalledTimes(8);
	});

	it("shares the four-read limit across overlapping requests with newer mtimes", async () => {
		const app = new App();
		const target = new TFile("target.md");
		const canvases = Array.from({ length: 8 }, (_, index) => new TFile(`${index}.canvas`));
		canvases.forEach((canvas) => {
			canvas.stat.mtime = 1;
		});
		(app.vault.getFiles as Mock).mockReturnValue(canvases);
		const releases: Array<() => void> = [];
		let active = 0;
		let peak = 0;
		(app.vault.cachedRead as Mock).mockImplementation(
			() =>
				new Promise<string>((resolve) => {
					active += 1;
					peak = Math.max(peak, active);
					releases.push(() => {
						active -= 1;
						resolve(JSON.stringify({ nodes: [], edges: [] }));
					});
				}),
		);
		const service = new KnowledgeContextService(app);
		const staleController = new AbortController();

		const staleRequest = service.getForFile(target, staleController.signal);
		await vi.waitFor(() => expect(app.vault.cachedRead).toHaveBeenCalledTimes(4));
		staleController.abort();
		await expect(staleRequest).rejects.toMatchObject({ name: "AbortError" });
		canvases.forEach((canvas) => {
			canvas.stat.mtime = 2;
		});

		const currentRequest = service.getForFile(target);
		await Promise.resolve();
		expect(app.vault.cachedRead).toHaveBeenCalledTimes(4);
		releases.splice(0).forEach((release) => release());
		await vi.waitFor(() => expect(app.vault.cachedRead).toHaveBeenCalledTimes(8));
		releases.splice(0).forEach((release) => release());
		await vi.waitFor(() => expect(app.vault.cachedRead).toHaveBeenCalledTimes(12));
		releases.splice(0).forEach((release) => release());
		await currentRequest;

		expect(peak).toBe(4);
	});
});
