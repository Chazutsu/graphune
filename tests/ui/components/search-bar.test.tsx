import { SearchBar } from "@/ui/components/search-bar";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

describe("SearchBar", () => {
	it("renders the input field", () => {
		render(<SearchBar query="" onQueryChange={vi.fn()} />);
		expect(screen.getByPlaceholderText("Search cards...")).toBeDefined();
	});

	it("reflects the query property", () => {
		render(<SearchBar query="test query" onQueryChange={vi.fn()} />);
		const input = screen.getByPlaceholderText("Search cards...") as HTMLInputElement;
		expect(input.value).toBe("test query");
	});

	it("calls onQueryChange on input", () => {
		const onQueryChange = vi.fn();
		render(<SearchBar query="" onQueryChange={onQueryChange} />);
		const input = screen.getByPlaceholderText("Search cards...");

		fireEvent.change(input, { target: { value: "new query" } });

		expect(onQueryChange).toHaveBeenCalledWith("new query");
	});

	it("clears an active query from the clear button", () => {
		const onQueryChange = vi.fn();
		render(<SearchBar query="graph" onQueryChange={onQueryChange} />);

		fireEvent.click(screen.getByRole("button", { name: "Clear card search" }));

		expect(onQueryChange).toHaveBeenCalledWith("");
	});

	it("clears an active query with Escape", () => {
		const onQueryChange = vi.fn();
		render(<SearchBar query="graph" onQueryChange={onQueryChange} />);

		fireEvent.keyDown(screen.getByPlaceholderText("Search cards..."), { key: "Escape" });

		expect(onQueryChange).toHaveBeenCalledWith("");
	});

	it("applies width and margin styling", () => {
		const { container } = render(<SearchBar query="" onQueryChange={vi.fn()} />);
		expect(container.querySelector(".w-full.mb-2")).not.toBeNull();
	});
});
