import { ArticleHeader } from "@/ui/components/article-header";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

function renderHeader(overrides: Partial<React.ComponentProps<typeof ArticleHeader>> = {}) {
	const defaultProps: React.ComponentProps<typeof ArticleHeader> = {
		title: "My Note",
		path: "notes/my-note.md",
		frontmatter: {},
		onRename: vi.fn(),
		onPropertyChange: vi.fn(),
		onPropertyDelete: vi.fn(),
		onPropertyAdd: vi.fn(),
	};
	const props = { ...defaultProps, ...overrides };
	return { ...render(<ArticleHeader {...props} />), props };
}

describe("ArticleHeader", () => {
	it("displays title in an editable input", () => {
		const { container } = renderHeader({ title: "Test Title" });
		const input = screen.getByDisplayValue("Test Title");
		expect(input).toBeDefined();
		expect(input.tagName).toBe("INPUT");
		expect(input.getAttribute("aria-label")).toBe("Article title");
		expect(input.classList.contains("article-header-title")).toBe(true);
		expect(container.querySelector(".article-header")).not.toBeNull();
	});

	it("focuses and selects the title when requested", () => {
		const onTitleFocused = vi.fn();
		renderHeader({ title: "Untitled", autoFocusTitle: true, onTitleFocused });

		const input = screen.getByDisplayValue("Untitled") as HTMLInputElement;
		expect(document.activeElement).toBe(input);
		expect(input.selectionStart).toBe(0);
		expect(input.selectionEnd).toBe("Untitled".length);
		expect(onTitleFocused).toHaveBeenCalledOnce();
	});

	it("displays path", () => {
		const { container } = renderHeader({ path: "folder/note.md" });
		const pathEl = container.querySelector(".article-header-path");
		expect(pathEl).not.toBeNull();
		expect(pathEl?.textContent).toBe("folder/note.md");
	});

	it("keeps the title visible while collapsing path and properties by default", () => {
		const { container } = renderHeader({ frontmatter: { status: "draft", owner: "team" } });
		const details = container.querySelector(".article-header-details") as HTMLDetailsElement;

		expect(screen.getByDisplayValue("My Note")).toBeDefined();
		expect(details.open).toBe(false);
		expect(screen.getByText("Properties (2)")).toBeDefined();

		fireEvent.click(screen.getByText("Properties (2)"));
		expect(details.open).toBe(true);
	});

	it("displays frontmatter key-value pairs in metadata-container", () => {
		const { container } = renderHeader({
			frontmatter: {
				status: "draft",
				category: "tech",
			},
		});
		expect(container.querySelector(".metadata-container")).not.toBeNull();
		expect(container.querySelector(".metadata-properties")).not.toBeNull();

		const properties = container.querySelectorAll(".metadata-property");
		expect(properties.length).toBe(2);

		expect(screen.getByText("status")).toBeDefined();
		expect(screen.getByDisplayValue("draft")).toBeDefined();
		expect(screen.getByText("category")).toBeDefined();
		expect(screen.getByDisplayValue("tech")).toBeDefined();
	});

	it("displays tags as multi-select pills", () => {
		const { container } = renderHeader({
			frontmatter: { tags: ["react", "typescript"] },
		});
		const pills = container.querySelectorAll(".multi-select-pill");
		expect(pills.length).toBe(2);
		expect(screen.getByText("react")).toBeDefined();
		expect(screen.getByText("typescript")).toBeDefined();
	});

	it("hides metadata-container when frontmatter is empty", () => {
		const { container } = renderHeader({ frontmatter: {} });
		expect(container.querySelector(".metadata-container")).toBeNull();
	});

	it("calls onRename on blur with changed title", () => {
		const onRename = vi.fn();
		renderHeader({ title: "Original", onRename });

		const input = screen.getByDisplayValue("Original");
		fireEvent.change(input, { target: { value: "New Title" } });
		fireEvent.blur(input);

		expect(onRename).toHaveBeenCalledWith("New Title");
	});

	it("does not call onRename on blur if title unchanged", () => {
		const onRename = vi.fn();
		renderHeader({ title: "Same Title", onRename });

		const input = screen.getByDisplayValue("Same Title");
		fireEvent.blur(input);

		expect(onRename).not.toHaveBeenCalled();
	});

	it("calls onRename on Enter key", () => {
		const onRename = vi.fn();
		renderHeader({ title: "Original", onRename });

		const input = screen.getByDisplayValue("Original");
		fireEvent.change(input, { target: { value: "New Title" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(onRename).toHaveBeenCalledWith("New Title");
	});

	it("does not rename twice when Enter is followed by blur", () => {
		const onRename = vi.fn();
		renderHeader({ title: "Original", onRename });

		const input = screen.getByDisplayValue("Original");
		fireEvent.change(input, { target: { value: "New Title" } });
		fireEvent.keyDown(input, { key: "Enter" });
		fireEvent.blur(input);

		expect(onRename).toHaveBeenCalledTimes(1);
	});

	it("cancels an in-progress rename with Escape", () => {
		const onRename = vi.fn();
		renderHeader({ title: "Original", onRename });

		const input = screen.getByDisplayValue("Original");
		fireEvent.change(input, { target: { value: "Temporary" } });
		fireEvent.keyDown(input, { key: "Escape" });

		expect(onRename).not.toHaveBeenCalled();
		expect(input).toHaveProperty("value", "Original");
	});

	it("sanitizes invalid filename characters before renaming", () => {
		const onRename = vi.fn();
		renderHeader({ title: "Original", onRename });

		const input = screen.getByDisplayValue("Original");
		fireEvent.change(input, { target: { value: "  New: Article?  " } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(onRename).toHaveBeenCalledWith("New Article");
		expect(input).toHaveProperty("value", "New Article");
	});

	it("calls onPropertyChange on property value blur", () => {
		const onPropertyChange = vi.fn();
		renderHeader({
			frontmatter: { status: "draft" },
			onPropertyChange,
		});

		const input = screen.getByDisplayValue("draft");
		fireEvent.change(input, { target: { value: "published" } });
		fireEvent.blur(input);

		expect(onPropertyChange).toHaveBeenCalledWith("status", "published");
	});

	it("calls onPropertyDelete when delete button clicked", () => {
		const onPropertyDelete = vi.fn();
		renderHeader({
			frontmatter: { status: "draft" },
			onPropertyDelete,
		});

		const deleteButton = screen.getByLabelText("Delete status");
		fireEvent.click(deleteButton);

		expect(onPropertyDelete).toHaveBeenCalledWith("status");
	});

	it("calls onPropertyAdd when add form submitted", () => {
		const onPropertyAdd = vi.fn();
		renderHeader({ onPropertyAdd });

		fireEvent.click(screen.getByText("+ Add property"));

		const keyInput = screen.getByPlaceholderText("Key");
		const valueInput = screen.getByPlaceholderText("Value");

		fireEvent.change(keyInput, { target: { value: "author" } });
		fireEvent.change(valueInput, { target: { value: "John" } });
		fireEvent.click(screen.getByText("Add"));

		expect(onPropertyAdd).toHaveBeenCalledWith("author", "John");
	});

	it("hides add form after successful add", () => {
		const onPropertyAdd = vi.fn();
		renderHeader({ onPropertyAdd });

		fireEvent.click(screen.getByText("+ Add property"));

		const keyInput = screen.getByPlaceholderText("Key");
		const valueInput = screen.getByPlaceholderText("Value");

		fireEvent.change(keyInput, { target: { value: "author" } });
		fireEvent.change(valueInput, { target: { value: "John" } });
		fireEvent.click(screen.getByText("Add"));

		expect(screen.queryByPlaceholderText("Key")).toBeNull();
	});

	it("does not call onPropertyAdd when key is empty", () => {
		const onPropertyAdd = vi.fn();
		renderHeader({ onPropertyAdd });

		fireEvent.click(screen.getByText("+ Add property"));

		const valueInput = screen.getByPlaceholderText("Value");
		fireEvent.change(valueInput, { target: { value: "John" } });
		fireEvent.click(screen.getByText("Add"));

		expect(onPropertyAdd).not.toHaveBeenCalled();
	});

	it("displays tag remove buttons and removes tag on click", () => {
		const onPropertyChange = vi.fn();
		renderHeader({
			frontmatter: { tags: ["react", "typescript"] },
			onPropertyChange,
		});

		const deleteButtons = screen.getAllByLabelText(/Remove tag/);
		expect(deleteButtons.length).toBe(2);

		fireEvent.click(deleteButtons[0]);
		expect(onPropertyChange).toHaveBeenCalledWith("tags", ["typescript"]);
	});

	it("sets data-property-key attribute on property rows", () => {
		const { container } = renderHeader({
			frontmatter: { status: "draft" },
		});
		const prop = container.querySelector('[data-property-key="status"]');
		expect(prop).not.toBeNull();
	});

	it("sets data-property-type='tags' on tags property", () => {
		const { container } = renderHeader({
			frontmatter: { tags: ["react"] },
		});
		const prop = container.querySelector('[data-property-type="tags"]');
		expect(prop).not.toBeNull();
	});

	it("updates title when remounted with key", () => {
		const { rerender, props } = renderHeader({ title: "First" });

		expect(screen.getByDisplayValue("First")).toBeDefined();

		rerender(<ArticleHeader key="second" {...props} title="Second" />);

		expect(screen.getByDisplayValue("Second")).toBeDefined();
	});

	it("updates property values when props change", () => {
		const { rerender, props } = renderHeader({
			frontmatter: { status: "draft" },
		});

		expect(screen.getByDisplayValue("draft")).toBeDefined();

		rerender(<ArticleHeader {...props} frontmatter={{ status: "published" }} />);

		expect(screen.getByDisplayValue("published")).toBeDefined();
	});
});
