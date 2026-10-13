import { useFileMetadata } from "@/ui/hooks/use-file-metadata";
import { act, renderHook } from "@testing-library/react";
import { App, type CachedMetadata, TFile } from "obsidian";
import { type Mock, describe, expect, it } from "vitest";
import { createWrapper } from "../../helpers/create-wrapper";

describe("useFileMetadata", () => {
	it("returns null when file is null", () => {
		const { result } = renderHook(() => useFileMetadata(null), {
			wrapper: createWrapper(),
		});

		expect(result.current.metadata).toBeNull();
	});

	it("returns metadata from getFileCache when file is provided", () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		const cache: CachedMetadata = {
			frontmatter: {
				position: {
					start: { line: 0, col: 0, offset: 0 },
					end: { line: 3, col: 3, offset: 30 },
				},
				tags: ["react", "typescript"],
				status: "draft",
			},
		};
		(app.metadataCache.getFileCache as Mock).mockReturnValue(cache);

		const { result } = renderHook(() => useFileMetadata(file), {
			wrapper: createWrapper(app),
		});

		expect(result.current.metadata).toEqual({
			title: "test",
			path: "notes/test.md",
			frontmatter: {
				tags: ["react", "typescript"],
				status: "draft",
			},
		});
	});

	it("excludes position key from frontmatter", () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		const cache: CachedMetadata = {
			frontmatter: {
				position: {
					start: { line: 0, col: 0, offset: 0 },
					end: { line: 2, col: 3, offset: 20 },
				},
				title: "My Note",
			},
		};
		(app.metadataCache.getFileCache as Mock).mockReturnValue(cache);

		const { result } = renderHook(() => useFileMetadata(file), {
			wrapper: createWrapper(app),
		});

		expect(result.current.metadata?.frontmatter).not.toHaveProperty("position");
		expect(result.current.metadata?.frontmatter).toEqual({ title: "My Note" });
	});

	it("returns empty frontmatter when cache has no frontmatter", () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		(app.metadataCache.getFileCache as Mock).mockReturnValue({});

		const { result } = renderHook(() => useFileMetadata(file), {
			wrapper: createWrapper(app),
		});

		expect(result.current.metadata).toEqual({
			title: "test",
			path: "notes/test.md",
			frontmatter: {},
		});
	});

	it("returns empty frontmatter when getFileCache returns null", () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		(app.metadataCache.getFileCache as Mock).mockReturnValue(null);

		const { result } = renderHook(() => useFileMetadata(file), {
			wrapper: createWrapper(app),
		});

		expect(result.current.metadata).toEqual({
			title: "test",
			path: "notes/test.md",
			frontmatter: {},
		});
	});

	it("registers metadataCache changed listener on mount", () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		(app.metadataCache.getFileCache as Mock).mockReturnValue({});

		renderHook(() => useFileMetadata(file), {
			wrapper: createWrapper(app),
		});

		expect(app.metadataCache.on).toHaveBeenCalledWith("changed", expect.any(Function));
	});

	it("updates metadata when same file changes in metadataCache", () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		(app.metadataCache.getFileCache as Mock).mockReturnValue({});

		let changedCallback: (changedFile: TFile, _data: string, cache: CachedMetadata) => void;
		(app.metadataCache.on as Mock).mockImplementation(
			(event: string, cb: (changedFile: TFile, _data: string, cache: CachedMetadata) => void) => {
				if (event === "changed") {
					changedCallback = cb;
				}
				return { id: "metadata-event-ref" };
			},
		);

		const { result } = renderHook(() => useFileMetadata(file), {
			wrapper: createWrapper(app),
		});

		expect(result.current.metadata?.frontmatter).toEqual({});

		const updatedCache: CachedMetadata = {
			frontmatter: {
				position: {
					start: { line: 0, col: 0, offset: 0 },
					end: { line: 2, col: 3, offset: 20 },
				},
				status: "published",
			},
		};
		(app.metadataCache.getFileCache as Mock).mockReturnValue(updatedCache);

		act(() => {
			changedCallback!(file, "", updatedCache);
		});

		expect(result.current.metadata?.frontmatter).toEqual({ status: "published" });
	});

	it("does not update metadata when a different file changes", () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		const otherFile = new TFile("notes/other.md");
		(app.metadataCache.getFileCache as Mock).mockReturnValue({});

		let changedCallback: (changedFile: TFile, _data: string, cache: CachedMetadata) => void;
		(app.metadataCache.on as Mock).mockImplementation(
			(event: string, cb: (changedFile: TFile, _data: string, cache: CachedMetadata) => void) => {
				if (event === "changed") {
					changedCallback = cb;
				}
				return { id: "metadata-event-ref" };
			},
		);

		const { result } = renderHook(() => useFileMetadata(file), {
			wrapper: createWrapper(app),
		});

		expect(result.current.metadata?.frontmatter).toEqual({});

		(app.metadataCache.getFileCache as Mock).mockReturnValue({
			frontmatter: {
				position: {
					start: { line: 0, col: 0, offset: 0 },
					end: { line: 2, col: 3, offset: 20 },
				},
				sneaky: "value",
			},
		});

		act(() => {
			changedCallback!(otherFile, "", {});
		});

		expect(result.current.metadata?.frontmatter).toEqual({});
	});

	it("calls offref on unmount", () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		const eventRef = { id: "test-ref" };
		(app.metadataCache.getFileCache as Mock).mockReturnValue({});
		(app.metadataCache.on as Mock).mockReturnValue(eventRef);

		const { unmount } = renderHook(() => useFileMetadata(file), {
			wrapper: createWrapper(app),
		});

		unmount();

		expect(app.metadataCache.offref).toHaveBeenCalledWith(eventRef);
	});

	it("refresh re-fetches metadata", () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		(app.metadataCache.getFileCache as Mock).mockReturnValue({});

		const { result } = renderHook(() => useFileMetadata(file), {
			wrapper: createWrapper(app),
		});

		expect(result.current.metadata?.frontmatter).toEqual({});

		(app.metadataCache.getFileCache as Mock).mockReturnValue({
			frontmatter: {
				position: {
					start: { line: 0, col: 0, offset: 0 },
					end: { line: 2, col: 3, offset: 20 },
				},
				category: "tech",
			},
		});

		act(() => {
			result.current.refresh();
		});

		expect(result.current.metadata?.frontmatter).toEqual({ category: "tech" });
	});
});
