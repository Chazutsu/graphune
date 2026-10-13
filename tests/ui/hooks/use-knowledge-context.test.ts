import { useKnowledgeContext } from "@/ui/hooks/use-knowledge-context";
import { KnowledgeContextService } from "@/services/knowledge-context";
import { act, renderHook } from "@testing-library/react";
import { App, TFile } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { createWrapper } from "../../helpers/create-wrapper";

describe("useKnowledgeContext", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("ignores vault changes that cannot affect backlinks or Canvas locations", async () => {
		const app = new App();
		const target = new TFile("target.md");
		let modifyHandler: ((file: TFile) => void) | undefined;
		(app.vault.on as Mock).mockImplementation((event: string, handler: (file: TFile) => void) => {
			if (event === "modify") modifyHandler = handler;
			return { id: event };
		});
		const getFiles = vi.mocked(app.vault.getFiles);
		getFiles.mockReturnValue([]);
		renderHook(() => useKnowledgeContext(target), { wrapper: createWrapper(app) });
		await act(async () => {});
		expect(getFiles).toHaveBeenCalledTimes(1);

		act(() => {
			modifyHandler?.(new TFile("image.png"));
			vi.advanceTimersByTime(120);
		});
		await act(async () => {});

		expect(getFiles).toHaveBeenCalledTimes(1);
	});

	it("refreshes after Markdown changes", async () => {
		const app = new App();
		const target = new TFile("target.md");
		let modifyHandler: ((file: TFile) => void) | undefined;
		(app.vault.on as Mock).mockImplementation((event: string, handler: (file: TFile) => void) => {
			if (event === "modify") modifyHandler = handler;
			return { id: event };
		});
		const getFiles = vi.mocked(app.vault.getFiles);
		getFiles.mockReturnValue([]);
		renderHook(() => useKnowledgeContext(target), { wrapper: createWrapper(app) });
		await act(async () => {});

		act(() => {
			modifyHandler?.(new TFile("source.md"));
			vi.advanceTimersByTime(120);
		});
		await act(async () => {});

		expect(getFiles).toHaveBeenCalledTimes(2);
	});

	it("marks modified Canvases stale without explicitly invalidating them", async () => {
		const app = new App();
		const target = new TFile("target.md");
		let modifyHandler: ((file: TFile) => void) | undefined;
		(app.vault.on as Mock).mockImplementation((event: string, handler: (file: TFile) => void) => {
			if (event === "modify") modifyHandler = handler;
			return { id: event };
		});
		(app.vault.getFiles as Mock).mockReturnValue([]);
		const markStale = vi.spyOn(KnowledgeContextService.prototype, "markCanvasStale");
		const invalidate = vi.spyOn(KnowledgeContextService.prototype, "invalidateCanvas");
		renderHook(() => useKnowledgeContext(target), { wrapper: createWrapper(app) });
		await act(async () => {});

		act(() => {
			modifyHandler?.(new TFile("board.canvas"));
		});

		expect(markStale).toHaveBeenCalledWith("board.canvas");
		expect(invalidate).not.toHaveBeenCalled();
	});

	it("explicitly invalidates deleted Canvases", async () => {
		const app = new App();
		const target = new TFile("target.md");
		let deleteHandler: ((file: TFile) => void) | undefined;
		(app.vault.on as Mock).mockImplementation((event: string, handler: (file: TFile) => void) => {
			if (event === "delete") deleteHandler = handler;
			return { id: event };
		});
		(app.vault.getFiles as Mock).mockReturnValue([]);
		const invalidate = vi.spyOn(KnowledgeContextService.prototype, "invalidateCanvas");
		renderHook(() => useKnowledgeContext(target), { wrapper: createWrapper(app) });
		await act(async () => {});

		act(() => {
			deleteHandler?.(new TFile("board.canvas"));
		});

		expect(invalidate).toHaveBeenCalledWith("board.canvas");
	});
});
