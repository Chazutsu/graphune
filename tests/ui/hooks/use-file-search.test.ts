import { useFileSearch } from "@/ui/hooks/use-file-search";
import { act, renderHook } from "@testing-library/react";
import { App, TFile } from "obsidian";
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "../../helpers/create-wrapper";

describe("useFileSearch", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns empty results when query is empty", () => {
		const app = new App();
		const file = new TFile("notes/hello.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);

		const { result } = renderHook(() => useFileSearch(), {
			wrapper: createWrapper(app),
		});

		expect(result.current.query).toBe("");
		expect(result.current.results).toEqual([]);
	});

	it("treats whitespace-only queries as empty", async () => {
		const app = new App();
		const file = new TFile("notes/hello.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);

		const { result } = renderHook(() => useFileSearch(), {
			wrapper: createWrapper(app),
		});

		act(() => {
			result.current.setQuery("   ");
		});

		await act(async () => {
			vi.advanceTimersByTime(300);
		});

		expect(result.current.results).toEqual([]);
	});

	it("returns files matching the query (case insensitive)", async () => {
		const app = new App();
		const file1 = new TFile("notes/Hello.md");
		const file2 = new TFile("notes/world.md");
		const file3 = new TFile("docs/hello-world.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file1, file2, file3]);

		const { result } = renderHook(() => useFileSearch(), {
			wrapper: createWrapper(app),
		});

		act(() => {
			result.current.setQuery("hello");
		});

		await act(async () => {
			vi.advanceTimersByTime(300);
		});

		expect(result.current.results).toHaveLength(2);
		expect(result.current.results).toContain(file1);
		expect(result.current.results).toContain(file3);
	});

	it("debounces the search by 160ms", async () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);

		const { result } = renderHook(() => useFileSearch(), {
			wrapper: createWrapper(app),
		});

		act(() => {
			result.current.setQuery("test");
		});

		// Before debounce fires, results should still be empty
		expect(result.current.results).toEqual([]);

		await act(async () => {
			vi.advanceTimersByTime(159);
		});

		expect(result.current.results).toEqual([]);

		await act(async () => {
			vi.advanceTimersByTime(1);
		});

		expect(result.current.results).toHaveLength(1);
		expect(result.current.results[0]).toBe(file);
	});

	it("resets the debounce timer when query changes during debounce", async () => {
		const app = new App();
		const fileA = new TFile("notes/alpha.md");
		const fileB = new TFile("notes/beta.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([fileA, fileB]);

		const { result } = renderHook(() => useFileSearch(), {
			wrapper: createWrapper(app),
		});

		act(() => {
			result.current.setQuery("alpha");
		});

		await act(async () => {
			vi.advanceTimersByTime(100);
		});

		act(() => {
			result.current.setQuery("beta");
		});

		// After 160ms from first query (but only 60ms from second), should not have fired
		await act(async () => {
			vi.advanceTimersByTime(60);
		});

		expect(result.current.results).toEqual([]);

		// After 160ms from second query change
		await act(async () => {
			vi.advanceTimersByTime(100);
		});

		expect(result.current.results).toHaveLength(1);
		expect(result.current.results[0]).toBe(fileB);
	});
});
