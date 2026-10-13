import { useEditorSelection } from "@/ui/hooks/use-editor-selection";
import { renderHook } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";

function createMockEditorView(
	overrides: {
		from?: number;
		to?: number;
		docContent?: string;
		coords?: { left: number; right: number; top: number; bottom: number } | null;
	} = {},
): EditorView {
	const { from = 0, to = 0, docContent = "Hello World", coords = null } = overrides;

	const view = {
		state: {
			doc: {
				toString: () => docContent,
				sliceString: (f: number, t: number) => docContent.slice(f, t),
			},
			selection: {
				main: { from, to },
			},
		},
		contentDOM: document.createElement("div"),
		dispatch: vi.fn(),
		coordsAtPos: vi.fn().mockReturnValue(coords),
		_updateListeners: [] as ((update: unknown) => void)[],
	};

	return view as unknown as EditorView;
}

describe("useEditorSelection", () => {
	it("returns empty selectedText and null selectionRect when no editorView", () => {
		const { result } = renderHook(() => useEditorSelection(null));

		expect(result.current.selectedText).toBe("");
		expect(result.current.selectionRect).toBeNull();
	});

	it("returns empty selectedText when selection is collapsed (from === to)", () => {
		const view = createMockEditorView({ from: 5, to: 5 });

		const { result } = renderHook(() => useEditorSelection(view));

		expect(result.current.selectedText).toBe("");
		expect(result.current.selectionRect).toBeNull();
	});

	it("returns selected text when selection range is non-empty", () => {
		const view = createMockEditorView({
			from: 0,
			to: 5,
			docContent: "Hello World",
			coords: { left: 10, right: 60, top: 20, bottom: 40 },
		});

		const { result } = renderHook(() => useEditorSelection(view));

		expect(result.current.selectedText).toBe("Hello");
	});

	it("returns selectionRect based on coordsAtPos", () => {
		const view = createMockEditorView({
			from: 0,
			to: 5,
			docContent: "Hello World",
			coords: { left: 10, right: 60, top: 20, bottom: 40 },
		});

		const { result } = renderHook(() => useEditorSelection(view));

		expect(result.current.selectionRect).not.toBeNull();
		expect(result.current.selectionRect!.left).toBe(10);
		expect(result.current.selectionRect!.top).toBe(20);
	});

	it("resets when editorView changes to null", () => {
		const view = createMockEditorView({
			from: 0,
			to: 5,
			docContent: "Hello World",
			coords: { left: 10, right: 60, top: 20, bottom: 40 },
		});

		const { result, rerender } = renderHook(({ ev }) => useEditorSelection(ev), {
			initialProps: { ev: view as EditorView | null },
		});

		expect(result.current.selectedText).toBe("Hello");

		rerender({ ev: null });

		expect(result.current.selectedText).toBe("");
		expect(result.current.selectionRect).toBeNull();
	});
});
