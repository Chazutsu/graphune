import { LibraryFilters } from "@/ui/components/library-filters";
import type { SearchResult } from "@/types/plugin";
import { fireEvent, render, screen } from "@testing-library/react";
import { TFile } from "obsidian";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const results: SearchResult[] = [
	{
		file: new TFile("research/Alpha.md"),
		excerpt: "",
		headings: [],
		tags: ["research", "idea"],
		folder: "research",
	},
	{
		file: new TFile("inbox/Beta.md"),
		excerpt: "",
		headings: [],
		tags: ["idea"],
		folder: "inbox",
	},
];

describe("LibraryFilters", () => {
	it("renders deduplicated tag and folder choices", () => {
		render(
			<LibraryFilters
				results={results}
				tag=""
				folder=""
				sort="updated"
				resultCount={2}
				onTagChange={vi.fn()}
				onFolderChange={vi.fn()}
				onSortChange={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Filter and sort cards" }));
		expect(screen.getByRole("option", { name: "#idea" })).toBeDefined();
		expect(screen.getByRole("option", { name: "#research" })).toBeDefined();
		expect(screen.getByRole("option", { name: "inbox" })).toBeDefined();
		expect(screen.getByText("2 cards")).toBeDefined();
	});

	it("reports filter and sort changes", () => {
		const onTagChange = vi.fn();
		const onFolderChange = vi.fn();
		const onSortChange = vi.fn();
		render(
			<LibraryFilters
				results={results}
				tag=""
				folder=""
				sort="updated"
				resultCount={2}
				onTagChange={onTagChange}
				onFolderChange={onFolderChange}
				onSortChange={onSortChange}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Filter and sort cards" }));
		fireEvent.change(screen.getByLabelText("Filter by tag"), { target: { value: "idea" } });
		fireEvent.change(screen.getByLabelText("Filter by folder"), {
			target: { value: "research" },
		});
		fireEvent.change(screen.getByLabelText("Sort cards"), {
			target: { value: "title-asc" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Apply" }));

		expect(onTagChange).toHaveBeenCalledWith("idea");
		expect(onFolderChange).toHaveBeenCalledWith("research");
		expect(onSortChange).toHaveBeenCalledWith("title-asc");
	});

	it("uses a singular result label for one card", () => {
		render(
			<LibraryFilters
				results={results}
				tag=""
				folder=""
				sort="updated"
				resultCount={1}
				onTagChange={vi.fn()}
				onFolderChange={vi.fn()}
				onSortChange={vi.fn()}
			/>,
		);

		expect(screen.getByText("1 card")).toBeDefined();
	});

	it("shows active conditions as individually removable chips", () => {
		const onTagChange = vi.fn();
		const onFolderChange = vi.fn();
		const onSortChange = vi.fn();
		render(
			<LibraryFilters
				results={results}
				tag="idea"
				folder="research"
				sort="title-asc"
				resultCount={1}
				onTagChange={onTagChange}
				onFolderChange={onFolderChange}
				onSortChange={onSortChange}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Remove tag idea" }));
		fireEvent.click(screen.getByRole("button", { name: "Remove folder research" }));
		fireEvent.click(screen.getByRole("button", { name: "Reset sort order" }));
		expect(onTagChange).toHaveBeenCalledWith("");
		expect(onFolderChange).toHaveBeenCalledWith("");
		expect(onSortChange).toHaveBeenCalledWith("updated");
	});

	it("labels the scope as cards placed on the current Canvas", () => {
		const onCanvasOnlyChange = vi.fn();
		render(
			<LibraryFilters
				results={results}
				tag=""
				folder=""
				sort="updated"
				resultCount={2}
				hasCanvas
				onTagChange={vi.fn()}
				onFolderChange={vi.fn()}
				onSortChange={vi.fn()}
				onCanvasOnlyChange={onCanvasOnlyChange}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Filter and sort cards" }));
		fireEvent.click(screen.getByRole("checkbox", { name: "Placed on current Canvas" }));
		fireEvent.click(screen.getByRole("button", { name: "Apply" }));
		expect(onCanvasOnlyChange).toHaveBeenCalledWith(true);
	});

	it("resets all filters and restores trigger focus", () => {
		const onTagChange = vi.fn();
		const onFolderChange = vi.fn();
		const onSortChange = vi.fn();
		render(
			<LibraryFilters
				results={results}
				tag="idea"
				folder="research"
				sort="title-asc"
				resultCount={1}
				onTagChange={onTagChange}
				onFolderChange={onFolderChange}
				onSortChange={onSortChange}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Filter and sort cards" }));
		fireEvent.click(screen.getByRole("button", { name: "Reset" }));

		expect(onTagChange).toHaveBeenCalledWith("");
		expect(onFolderChange).toHaveBeenCalledWith("");
		expect(onSortChange).toHaveBeenCalledWith("updated");
		expect(document.activeElement).toBe(
			screen.getByRole("button", { name: "Filter and sort cards" }),
		);
	});

	it("explains how to enable the Canvas scope when no Canvas is open", () => {
		render(
			<LibraryFilters
				results={results}
				tag=""
				folder=""
				sort="updated"
				resultCount={2}
				onTagChange={vi.fn()}
				onFolderChange={vi.fn()}
				onSortChange={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Filter and sort cards" }));
		expect(screen.getByText("Open a Canvas to enable this filter.")).toBeDefined();
		expect(
			screen.getByRole("checkbox", { name: "Placed on current Canvas" }).hasAttribute("disabled"),
		).toBe(true);
	});

	it("exposes a named non-modal dialog and focuses its first control when opened", () => {
		render(
			<LibraryFilters
				results={results}
				tag=""
				folder=""
				sort="updated"
				resultCount={2}
				onTagChange={vi.fn()}
				onFolderChange={vi.fn()}
				onSortChange={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Filter and sort cards" }));

		const popover = screen.getByRole("dialog", { name: "Filter and sort cards" });
		expect(popover.hasAttribute("aria-modal")).toBe(false);
		expect(document.activeElement).toBe(screen.getByLabelText("Filter by tag"));
	});

	it("keeps the controls in their visual Tab order", () => {
		render(
			<LibraryFilters
				results={results}
				tag=""
				folder=""
				sort="updated"
				resultCount={2}
				hasCanvas
				onTagChange={vi.fn()}
				onFolderChange={vi.fn()}
				onSortChange={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Filter and sort cards" }));
		const controls = screen
			.getByRole("dialog")
			.querySelectorAll<HTMLSelectElement | HTMLInputElement>("select, input");

		expect(
			[...controls].map((control) => control.getAttribute("aria-label") ?? control.id),
		).toEqual([
			"Filter by tag",
			"Filter by folder",
			"Sort cards",
			expect.stringContaining("canvas"),
		]);
	});

	it("closes the popover with Escape and returns focus to the trigger", () => {
		render(
			<LibraryFilters
				results={results}
				tag=""
				folder=""
				sort="updated"
				resultCount={2}
				onTagChange={vi.fn()}
				onFolderChange={vi.fn()}
				onSortChange={vi.fn()}
			/>,
		);
		const trigger = screen.getByRole("button", { name: "Filter and sort cards" });
		fireEvent.click(trigger);
		fireEvent.keyDown(screen.getByLabelText("Filter by tag"), { key: "Escape" });

		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		expect(document.activeElement).toBe(trigger);
	});

	it("traps Tab inside the narrow sheet but not in the desktop popover", () => {
		const { container } = render(
			<div className="heptabase-shell">
				<LibraryFilters
					results={results}
					tag=""
					folder=""
					sort="updated"
					resultCount={2}
					hasCanvas
					onTagChange={vi.fn()}
					onFolderChange={vi.fn()}
					onSortChange={vi.fn()}
				/>
			</div>,
		);
		const shell = container.querySelector<HTMLElement>(".heptabase-shell")!;
		shell.getBoundingClientRect = vi.fn(() => ({ width: 280 }) as DOMRect);
		fireEvent.click(screen.getByRole("button", { name: "Filter and sort cards" }));
		const apply = screen.getByRole("button", { name: "Apply" });
		apply.focus();
		fireEvent.keyDown(apply, { key: "Tab" });
		expect(document.activeElement).toBe(screen.getByLabelText("Filter by tag"));

		fireEvent.keyDown(screen.getByLabelText("Filter by tag"), { key: "Escape" });
		shell.getBoundingClientRect = vi.fn(() => ({ width: 380 }) as DOMRect);
		fireEvent.click(screen.getByRole("button", { name: "Filter and sort cards" }));
		const desktopApply = screen.getByRole("button", { name: "Apply" });
		desktopApply.focus();
		fireEvent.keyDown(desktopApply, { key: "Tab" });
		expect(document.activeElement).toBe(desktopApply);
	});

	it("closes the popover after an outside click", () => {
		render(
			<>
				<LibraryFilters
					results={results}
					tag=""
					folder=""
					sort="updated"
					resultCount={2}
					onTagChange={vi.fn()}
					onFolderChange={vi.fn()}
					onSortChange={vi.fn()}
				/>
				<button type="button">Outside action</button>
			</>,
		);
		const trigger = screen.getByRole("button", { name: "Filter and sort cards" });
		fireEvent.click(trigger);
		const outside = screen.getByRole("button", { name: "Outside action" });
		fireEvent.mouseDown(outside);
		outside.focus();
		fireEvent.click(outside);

		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		expect(document.activeElement).toBe(outside);
	});

	it("returns focus to the trigger when the trigger closes the popover", () => {
		render(
			<LibraryFilters
				results={results}
				tag=""
				folder=""
				sort="updated"
				resultCount={2}
				onTagChange={vi.fn()}
				onFolderChange={vi.fn()}
				onSortChange={vi.fn()}
			/>,
		);
		const trigger = screen.getByRole("button", { name: "Filter and sort cards" });
		fireEvent.click(trigger);
		expect(document.activeElement).toBe(screen.getByLabelText("Filter by tag"));

		fireEvent.click(trigger);

		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		expect(document.activeElement).toBe(trigger);
	});
});
