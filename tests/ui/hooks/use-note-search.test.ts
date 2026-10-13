import { useNoteSearch } from "@/ui/hooks/use-note-search";
import { act, renderHook } from "@testing-library/react";
import { App, TFile } from "obsidian";
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "../../helpers/create-wrapper";

describe("useNoteSearch", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("lists all notes on initial mount without reading their bodies", async () => {
		const app = new App();
		const file = new TFile("notes/hello.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
		(app.vault.cachedRead as Mock).mockResolvedValue("Some content");

		const { result } = renderHook(() => useNoteSearch(), { wrapper: createWrapper(app) });
		expect(result.current.isHydrating).toBe(false);

		await act(async () => {});

		expect(result.current.query).toBe("");
		expect(result.current.results).toHaveLength(1);
		expect(result.current.results[0].file).toBe(file);
		expect(result.current.results[0].excerpt).toBe("");
		expect(app.vault.cachedRead).not.toHaveBeenCalled();
		expect(result.current.isHydrating).toBe(false);
	});

	it("updates the search query with setQuery", async () => {
		const { result } = renderHook(() => useNoteSearch(), { wrapper: createWrapper() });

		act(() => {
			result.current.setQuery("test");
		});
		expect(result.current.isSearching).toBe(true);

		await act(async () => {});

		expect(result.current.query).toBe("test");
	});

	it("keeps results stable while restoring the full library", async () => {
		const app = new App();
		const file = new TFile("notes/hello.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
		(app.vault.cachedRead as Mock).mockResolvedValue("content");
		const { result } = renderHook(() => useNoteSearch(), { wrapper: createWrapper(app) });

		await act(async () => {});
		expect(result.current.results).toHaveLength(1);

		act(() => {
			result.current.setQuery("   ");
		});
		expect(result.current.results).toHaveLength(1);
		expect(result.current.isSearching).toBe(false);

		await act(async () => {});
		expect(result.current.results).toHaveLength(1);
		expect(result.current.isSearching).toBe(false);
	});

	it("executes search after debounce", async () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
		(app.vault.cachedRead as Mock).mockResolvedValue("content");
		(app.vault.read as Mock).mockResolvedValue("");

		const { result } = renderHook(() => useNoteSearch(), { wrapper: createWrapper(app) });

		await act(async () => {});

		act(() => {
			result.current.setQuery("test");
		});

		await act(async () => {
			vi.advanceTimersByTime(160);
		});

		await act(async () => {});

		expect(result.current.results).toHaveLength(1);
		expect(result.current.results[0].file).toBe(file);
		expect(result.current.isSearching).toBe(false);
	});

	it("resets the previous timer when a new query is entered during debounce", async () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
		(app.vault.cachedRead as Mock).mockResolvedValue("content");
		(app.vault.read as Mock).mockResolvedValue("");

		const { result } = renderHook(() => useNoteSearch(), { wrapper: createWrapper(app) });

		await act(async () => {});

		act(() => {
			result.current.setQuery("xyz");
		});

		act(() => {
			vi.advanceTimersByTime(100);
		});

		act(() => {
			result.current.setQuery("test");
		});

		expect(result.current.query).toBe("test");

		await act(async () => {
			vi.advanceTimersByTime(160);
		});

		await act(async () => {});

		expect(result.current.results).toHaveLength(1);
		expect(result.current.results[0].file).toBe(file);
	});

	it("refreshes the current results after a Markdown file changes", async () => {
		const app = new App();
		const file = new TFile("notes/live.md");
		let content = "Old excerpt";
		let modifyHandler: ((file: TFile) => void) | undefined;
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
		(app.vault.cachedRead as Mock).mockImplementation(() => Promise.resolve(content));
		(app.vault.on as Mock).mockImplementation((event: string, handler: (file: TFile) => void) => {
			if (event === "modify") modifyHandler = handler;
			return { id: event };
		});
		const { result } = renderHook(() => useNoteSearch(), { wrapper: createWrapper(app) });
		await act(async () => {});
		expect(result.current.results[0]?.excerpt).toBe("");

		content = "New excerpt";
		act(() => {
			modifyHandler?.(file);
			vi.advanceTimersByTime(80);
		});
		await act(async () => {});

		expect(result.current.results[0]?.excerpt).toBe("");
		expect(app.vault.cachedRead).not.toHaveBeenCalled();
	});

	it("keeps previous results and exposes a retry when search fails", async () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
		(app.vault.cachedRead as Mock).mockRejectedValue(new Error("offline"));
		const { result } = renderHook(() => useNoteSearch(), { wrapper: createWrapper(app) });

		act(() => result.current.setQuery("test"));
		await act(async () => vi.advanceTimersByTime(160));
		await act(async () => {});

		expect(result.current.results).toHaveLength(1);
		expect(result.current.results[0]?.file).toBe(file);
		expect(result.current.failedCount).toBe(1);
		expect(typeof result.current.retrySearch).toBe("function");
	});
});
