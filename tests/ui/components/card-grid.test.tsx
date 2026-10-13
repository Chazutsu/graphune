import type { SearchResult } from "@/types/plugin";
import { CardGrid } from "@/ui/components/card-grid";
import { fireEvent, render, screen } from "@testing-library/react";
import { TFile } from "obsidian";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "../../helpers/create-wrapper";

let mockObserve: ReturnType<typeof vi.fn>;
let mockDisconnect: ReturnType<typeof vi.fn>;

beforeEach(() => {
	mockObserve = vi.fn();
	mockDisconnect = vi.fn();

	class MockIntersectionObserver {
		observe = mockObserve;
		disconnect = mockDisconnect;
		unobserve = vi.fn();
	}

	vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("CardGrid", () => {
	const wrapper = createWrapper();

	it("renders a grid of note cards from search results", () => {
		const results: SearchResult[] = [
			{
				file: new TFile("note1.md") as never,
				excerpt: "Content of note 1",
			},
			{
				file: new TFile("note2.md") as never,
				excerpt: "Content of note 2",
			},
		];

		render(<CardGrid results={results} />, { wrapper });

		expect(screen.getByText("note1")).toBeDefined();
		expect(screen.getByText("note2")).toBeDefined();
	});

	it("shows a message when results are empty", () => {
		render(<CardGrid results={[]} />, { wrapper });
		expect(screen.getByText("No cards in this vault yet.")).toBeDefined();
	});

	it("shows loading instead of the empty state while the library is hydrating", () => {
		render(<CardGrid results={[]} isHydrating />, { wrapper });

		expect(screen.getByRole("status").textContent).toBe("Updating card library");
		expect(screen.queryByText("No cards in this vault yet.")).toBeNull();
	});

	it("keeps existing cards visible while the library is hydrating", () => {
		const results: SearchResult[] = [
			{
				file: new TFile("existing.md") as never,
				excerpt: "Existing content",
			},
		];

		render(<CardGrid results={results} isHydrating />, { wrapper });

		expect(screen.getByText("existing")).toBeDefined();
		expect(screen.queryByText("No cards in this vault yet.")).toBeNull();
	});

	it("applies muted text styling when empty", () => {
		const { container } = render(<CardGrid results={[]} />, { wrapper });
		const empty = container.querySelector(".text-hb-muted");
		expect(empty).not.toBeNull();
		expect(empty?.classList.contains("text-center")).toBe(true);
	});

	it("offers to clear filters when an empty result is filtered", () => {
		const onClearFilters = vi.fn();
		render(<CardGrid results={[]} hasActiveFilters onClearFilters={onClearFilters} />, {
			wrapper,
		});

		expect(screen.getByText("No cards match these filters.")).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
		expect(onClearFilters).toHaveBeenCalledOnce();
	});

	it("wraps grid in a container query parent", () => {
		const results: SearchResult[] = [
			{
				file: new TFile("note1.md") as never,
				excerpt: "Content",
			},
		];

		const { container } = render(<CardGrid results={results} />, { wrapper });
		const cqParent = container.querySelector(".\\@container");
		expect(cqParent).not.toBeNull();
		const grid = cqParent!.querySelector(".heptabase-library__grid.grid.grid-cols-1");
		expect(grid).not.toBeNull();
		expect(grid!.classList.toString()).toContain("@[440px]:grid-cols-2");
	});

	it("renders only first page of items for large result sets", () => {
		const results: SearchResult[] = Array.from({ length: 50 }, (_, i) => ({
			file: new TFile(`note-${i}.md`) as never,
			excerpt: `Content ${i}`,
		}));

		const { container } = render(<CardGrid results={results} />, { wrapper });
		const cards = container.querySelectorAll("[draggable]");
		expect(cards.length).toBeLessThan(50);
		expect(cards.length).toBe(20);
	});

	it("renders sentinel element when there are more items", () => {
		const results: SearchResult[] = Array.from({ length: 50 }, (_, i) => ({
			file: new TFile(`note-${i}.md`) as never,
			excerpt: `Content ${i}`,
		}));

		const { container } = render(<CardGrid results={results} />, { wrapper });
		const sentinel = container.querySelector("[data-testid='sentinel']");
		expect(sentinel).not.toBeNull();
	});

	it("does not render sentinel when all items are visible", () => {
		const results: SearchResult[] = [
			{
				file: new TFile("note1.md") as never,
				excerpt: "Content",
			},
		];

		const { container } = render(<CardGrid results={results} />, { wrapper });
		const sentinel = container.querySelector("[data-testid='sentinel']");
		expect(sentinel).toBeNull();
	});
});
