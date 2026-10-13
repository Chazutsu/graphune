import type { NoteDragData, TextSelectionDragData } from "@/types/plugin";
import { describe, expect, it } from "vitest";

describe("GraphunePlugin", () => {
	describe("NoteDragData", () => {
		it("has correct drag data type", () => {
			const dragData: NoteDragData = {
				type: "note-drag",
				filePath: "notes/test.md",
			};

			expect(dragData.type).toBe("note-drag");
		});

		it("can parse NoteDragData from DataTransfer", () => {
			const dragData: NoteDragData = {
				type: "note-drag",
				filePath: "notes/sample.md",
			};
			const parsed: NoteDragData = JSON.parse(JSON.stringify(dragData));
			expect(parsed.type).toBe("note-drag");
			expect(parsed.filePath).toBe("notes/sample.md");
		});

		it("can identify invalid drag data", () => {
			const parsed = JSON.parse(JSON.stringify({ type: "other-drag" }));
			expect(parsed.type).not.toBe("note-drag");
		});
	});

	describe("TextSelectionDragData", () => {
		it("has correct drag data type", () => {
			const dragData: TextSelectionDragData = {
				type: "text-selection-drag",
				filePath: "notes/test.md",
				selectedText: "Some text",
				title: "Title",
			};

			expect(dragData.type).toBe("text-selection-drag");
		});
	});
});
