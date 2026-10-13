import { FileSearchDropdown } from "@/ui/components/file-search-dropdown";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { App, TFile } from "obsidian";
import React from "react";
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "../../helpers/create-wrapper";

describe("FileSearchDropdown", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("renders search input", () => {
		render(<FileSearchDropdown onSelect={vi.fn()} />, { wrapper: createWrapper(app) });
		const input = screen.getByPlaceholderText("Search articles...");
		expect(input).toBeDefined();
		expect(input.getAttribute("aria-label")).toBe("Search articles");
		expect(input.getAttribute("aria-autocomplete")).toBe("list");
		expect(input.getAttribute("aria-expanded")).toBe("false");
	});

	it("shows no results when query is empty", () => {
		render(<FileSearchDropdown onSelect={vi.fn()} />, { wrapper: createWrapper(app) });
		expect(screen.queryByRole("option")).toBeNull();
	});

	it("shows a loading status while search is debouncing", () => {
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([]);
		render(<FileSearchDropdown onSelect={vi.fn()} />, { wrapper: createWrapper(app) });

		fireEvent.change(screen.getByPlaceholderText("Search articles..."), {
			target: { value: "pending" },
		});

		expect(screen.getByRole("status").textContent).toBe("Searching...");
	});

	it("shows matching files after debounce", async () => {
		const file1 = new TFile("notes/hello.md");
		const file2 = new TFile("notes/world.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file1, file2]);

		render(<FileSearchDropdown onSelect={vi.fn()} />, { wrapper: createWrapper(app) });

		fireEvent.change(screen.getByPlaceholderText("Search articles..."), {
			target: { value: "hello" },
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});

		expect(screen.getByText("notes/hello.md")).toBeDefined();
		expect(screen.getByRole("option").getAttribute("aria-selected")).toBe("false");
		expect(screen.queryByText("notes/world.md")).toBeNull();
	});

	it("explains when no articles match after debounce", async () => {
		const appFiles: TFile[] = [];
		(app.vault.getMarkdownFiles as Mock).mockReturnValue(appFiles);

		render(<FileSearchDropdown onSelect={vi.fn()} />, { wrapper: createWrapper(app) });
		fireEvent.change(screen.getByPlaceholderText("Search articles..."), {
			target: { value: "missing" },
		});

		expect(screen.getByRole("status").textContent).toBe("Searching...");
		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});
		expect(screen.getByRole("status").textContent).toContain("No matching articles");
	});

	it("calls onSelect when a file is clicked and clears query", async () => {
		const file1 = new TFile("notes/hello.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file1]);
		const onSelect = vi.fn();

		render(<FileSearchDropdown onSelect={onSelect} />, { wrapper: createWrapper(app) });

		fireEvent.change(screen.getByPlaceholderText("Search articles..."), {
			target: { value: "hello" },
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});

		fireEvent.click(screen.getByText("notes/hello.md"));
		expect(onSelect).toHaveBeenCalledWith(file1);

		expect(screen.getByPlaceholderText("Search articles...")).toHaveProperty("value", "");
		expect(screen.queryByRole("option")).toBeNull();
	});

	it("opens a file with Enter from the keyboard", async () => {
		const file1 = new TFile("notes/hello.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file1]);
		const onSelect = vi.fn();

		render(<FileSearchDropdown onSelect={onSelect} />, { wrapper: createWrapper(app) });
		fireEvent.change(screen.getByPlaceholderText("Search articles..."), {
			target: { value: "hello" },
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});

		fireEvent.click(screen.getByRole("option"));
		expect(onSelect).toHaveBeenCalledWith(file1);
		expect(document.activeElement).toBe(screen.getByPlaceholderText("Search articles..."));
	});

	it("supports arrow-key selection", async () => {
		const file1 = new TFile("notes/hello.md");
		const file2 = new TFile("notes/world.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file1, file2]);
		const onSelect = vi.fn();

		render(<FileSearchDropdown onSelect={onSelect} />, { wrapper: createWrapper(app) });
		const input = screen.getByPlaceholderText("Search articles...");
		fireEvent.change(input, { target: { value: "notes" } });
		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});

		fireEvent.keyDown(input, { key: "ArrowDown" });
		fireEvent.keyDown(input, { key: "ArrowDown" });
		expect(screen.getByText("notes/world.md").getAttribute("aria-selected")).toBe("true");
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onSelect).toHaveBeenCalledWith(file2);
	});

	it("keeps listbox and active option ids scoped to each instance", async () => {
		const file = new TFile("notes/hello.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file]);
		render(
			<>
				<FileSearchDropdown onSelect={vi.fn()} />
				<FileSearchDropdown onSelect={vi.fn()} />
			</>,
			{ wrapper: createWrapper(app) },
		);

		const inputs = screen.getAllByPlaceholderText("Search articles...");
		for (const input of inputs) fireEvent.change(input, { target: { value: "hello" } });
		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});
		fireEvent.keyDown(inputs[1]!, { key: "ArrowDown" });

		const controlledIds = inputs.map((input) => input.getAttribute("aria-controls"));
		expect(new Set(controlledIds).size).toBe(2);
		const activeId = inputs[1]!.getAttribute("aria-activedescendant");
		expect(activeId).toBeTruthy();
		expect(document.getElementById(activeId!)).not.toBeNull();
		expect(activeId?.startsWith(controlledIds[1]!)).toBe(true);
		expect(inputs[0]!.getAttribute("aria-activedescendant")).toBeNull();
	});

	it("hides results when clicking outside", async () => {
		const file1 = new TFile("notes/hello.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file1]);

		render(<FileSearchDropdown onSelect={vi.fn()} />, {
			wrapper: createWrapper(app),
		});

		fireEvent.change(screen.getByPlaceholderText("Search articles..."), {
			target: { value: "hello" },
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});

		expect(screen.getByText("notes/hello.md")).toBeDefined();

		act(() => {
			document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		});

		expect(screen.queryByRole("option")).toBeNull();
	});

	it("does not select hidden results with keyboard input", async () => {
		const file1 = new TFile("notes/hello.md");
		(app.vault.getMarkdownFiles as Mock).mockReturnValue([file1]);
		const onSelect = vi.fn();

		render(<FileSearchDropdown onSelect={onSelect} />, { wrapper: createWrapper(app) });
		const input = screen.getByPlaceholderText("Search articles...");
		fireEvent.change(input, { target: { value: "hello" } });
		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});

		act(() => {
			document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		});
		fireEvent.keyDown(input, { key: "ArrowDown" });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(onSelect).not.toHaveBeenCalled();
	});
});
