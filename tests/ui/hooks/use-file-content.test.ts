import { useFileContent } from "@/ui/hooks/use-file-content";
import { act, renderHook, waitFor } from "@testing-library/react";
import { App, TFile } from "obsidian";
import { type Mock, describe, expect, it, vi } from "vitest";
import { createWrapper } from "../../helpers/create-wrapper";

describe("useFileContent", () => {
	it("returns empty content and isLoading=false when file is null", () => {
		const { result } = renderHook(() => useFileContent(null), {
			wrapper: createWrapper(),
		});

		expect(result.current.content).toBe("");
		expect(result.current.isLoading).toBe(false);
	});

	it("loads file content when file is provided", async () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		(app.vault.read as Mock).mockResolvedValue("# Hello World");

		const { result } = renderHook(() => useFileContent(file), {
			wrapper: createWrapper(app),
		});

		expect(result.current.isLoading).toBe(true);

		await waitFor(() => {
			expect(result.current.content).toBe("# Hello World");
		});

		expect(result.current.isLoading).toBe(false);
	});

	it("stops loading when reading a file fails", async () => {
		const app = new App();
		const file = new TFile("notes/missing.md");
		(app.vault.read as Mock).mockRejectedValue(new Error("File not found"));

		const { result } = renderHook(() => useFileContent(file), {
			wrapper: createWrapper(app),
		});

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});
		expect(result.current.content).toBe("");
	});

	it("resets content when file changes", async () => {
		const app = new App();
		const file1 = new TFile("notes/first.md");
		const file2 = new TFile("notes/second.md");
		(app.vault.read as Mock).mockImplementation((f: TFile) => {
			if (f === file1) return Promise.resolve("First content");
			if (f === file2) return Promise.resolve("Second content");
			return Promise.resolve("");
		});

		const { result, rerender } = renderHook(({ file }) => useFileContent(file), {
			wrapper: createWrapper(app),
			initialProps: { file: file1 },
		});

		await waitFor(() => {
			expect(result.current.content).toBe("First content");
		});

		rerender({ file: file2 });

		expect(result.current.isLoading).toBe(true);
		expect(result.current.content).toBe("");

		await waitFor(() => {
			expect(result.current.content).toBe("Second content");
		});

		expect(result.current.isLoading).toBe(false);
	});

	it("resets to empty when file changes to null", async () => {
		const app = new App();
		const initialFile = new TFile("notes/test.md");
		(app.vault.read as Mock).mockResolvedValue("Some content");

		const { result, rerender } = renderHook(({ file }) => useFileContent(file), {
			wrapper: createWrapper(app),
			initialProps: { file: initialFile as TFile | null },
		});

		await waitFor(() => {
			expect(result.current.content).toBe("Some content");
		});

		rerender({ file: null });

		expect(result.current.content).toBe("");
		expect(result.current.isLoading).toBe(false);
	});

	it("save calls vault.modify with new content", async () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		(app.vault.read as Mock).mockResolvedValue("# Hello");

		const { result } = renderHook(() => useFileContent(file), {
			wrapper: createWrapper(app),
		});

		await waitFor(() => {
			expect(result.current.content).toBe("# Hello");
		});

		await act(async () => {
			await result.current.save("# Updated content");
		});

		expect(app.vault.modify).toHaveBeenCalledWith(file, "# Updated content");
	});

	it("applies a save transform to the latest vault content", async () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		(app.vault.read as Mock).mockResolvedValue("old");
		app.vault.process = vi.fn().mockImplementation(async (_file, transform) => {
			expect(transform("externally updated")).toBe("externally updated + local");
		});
		const { result } = renderHook(() => useFileContent(file), {
			wrapper: createWrapper(app),
		});
		await waitFor(() => expect(result.current.content).toBe("old"));

		await act(async () => {
			await result.current.save((current) => `${current} + local`);
		});

		expect(app.vault.modify).not.toHaveBeenCalled();
	});

	it("fails closed when a save transform reports a conflict", async () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		(app.vault.read as Mock).mockResolvedValue("old");
		app.vault.process = vi.fn().mockImplementation(async (_file, transform) => {
			expect(transform("external edit")).toBe("external edit");
		});
		const { result } = renderHook(() => useFileContent(file), {
			wrapper: createWrapper(app),
		});
		await waitFor(() => expect(result.current.content).toBe("old"));

		let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
		await act(async () => {
			saveResult = await result.current.save(() => null);
		});

		expect(saveResult).toEqual({ status: "conflict" });
	});

	it("returns a typed failure and allows a later retry", async () => {
		const app = new App();
		const file = new TFile("notes/retry.md");
		(app.vault.read as Mock).mockResolvedValue("old");
		app.vault.process = vi
			.fn()
			.mockRejectedValueOnce(new Error("disk busy"))
			.mockImplementationOnce(async (_file, transform) => {
				expect(transform("old")).toBe("new");
			});
		const { result } = renderHook(() => useFileContent(file), {
			wrapper: createWrapper(app),
		});
		await waitFor(() => expect(result.current.content).toBe("old"));

		let first: Awaited<ReturnType<typeof result.current.save>> | undefined;
		let second: Awaited<ReturnType<typeof result.current.save>> | undefined;
		await act(async () => {
			first = await result.current.save("new");
			second = await result.current.save("new");
		});

		expect(first?.status).toBe("failed");
		expect(second).toEqual({ status: "saved" });
	});

	it("refresh re-reads file content", async () => {
		const app = new App();
		const file = new TFile("notes/test.md");
		(app.vault.read as Mock).mockResolvedValue("Original content");

		const { result } = renderHook(() => useFileContent(file), {
			wrapper: createWrapper(app),
		});

		await waitFor(() => {
			expect(result.current.content).toBe("Original content");
		});

		(app.vault.read as Mock).mockResolvedValue("Updated content");

		await act(async () => {
			result.current.refresh();
		});

		await waitFor(() => {
			expect(result.current.content).toBe("Updated content");
		});

		expect(app.vault.read).toHaveBeenCalledTimes(2);
	});

	it("refresh is a no-op when file is null", async () => {
		const app = new App();

		const { result } = renderHook(() => useFileContent(null), {
			wrapper: createWrapper(app),
		});

		await act(async () => {
			result.current.refresh();
		});

		expect(app.vault.read).not.toHaveBeenCalled();
	});

	it("save is a no-op when file is null", async () => {
		const app = new App();

		const { result } = renderHook(() => useFileContent(null), {
			wrapper: createWrapper(app),
		});

		await act(async () => {
			await result.current.save("anything");
		});

		expect(app.vault.modify).not.toHaveBeenCalled();
	});
});
