import { SelectionDragHandle } from "@/ui/components/selection-drag-handle";
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";

describe("SelectionDragHandle", () => {
	it("does not render when selectedText is empty", () => {
		const { container } = render(
			<SelectionDragHandle selectedText="" selectionRect={null} filePath="test.md" />,
		);
		expect(container.querySelector("[draggable]")).toBeNull();
	});

	it("does not render when selectionRect is null", () => {
		const { container } = render(
			<SelectionDragHandle selectedText="some text" selectionRect={null} filePath="test.md" />,
		);
		expect(container.querySelector("[draggable]")).toBeNull();
	});

	it("renders drag handle when selectedText and selectionRect are provided", () => {
		const rect = new DOMRect(100, 200, 50, 20);
		render(
			<SelectionDragHandle selectedText="some text" selectionRect={rect} filePath="test.md" />,
		);
		expect(screen.getByTitle("Drag to Canvas")).toBeDefined();
	});

	it("renders as draggable element", () => {
		const rect = new DOMRect(100, 200, 50, 20);
		const { container } = render(
			<SelectionDragHandle selectedText="some text" selectionRect={rect} filePath="test.md" />,
		);
		const handle = container.querySelector("[draggable]");
		expect(handle).not.toBeNull();
		expect(handle?.getAttribute("draggable")).toBe("true");
	});

	it("positions at the end of selection rect", () => {
		const rect = new DOMRect(100, 200, 50, 20);
		const { container } = render(
			<SelectionDragHandle selectedText="some text" selectionRect={rect} filePath="test.md" />,
		);
		const handle = container.querySelector("[draggable]") as HTMLElement;
		expect(handle.classList.contains("heptabase-selection-handle")).toBe(true);
		expect(handle.style.left).toBe("154px");
		expect(handle.style.top).toBe("200px");
	});
});
