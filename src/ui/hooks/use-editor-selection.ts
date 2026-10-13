import type { EditorView } from "@codemirror/view";
import { useEffect, useReducer } from "react";

interface UseEditorSelectionReturn {
	selectedText: string;
	selectionRect: DOMRect | null;
}

const EMPTY_SELECTION: UseEditorSelectionReturn = { selectedText: "", selectionRect: null };

function readSelection(editorView: EditorView | null): UseEditorSelectionReturn {
	if (!editorView) return EMPTY_SELECTION;
	const { from, to } = editorView.state.selection.main;
	if (from === to) return EMPTY_SELECTION;

	const selectedText = editorView.state.doc.sliceString(from, to);
	const fromCoords = editorView.coordsAtPos(from);
	const toCoords = editorView.coordsAtPos(to);
	if (!fromCoords || !toCoords) return { selectedText, selectionRect: null };

	const left = Math.min(fromCoords.left, toCoords.left);
	const top = Math.min(fromCoords.top, toCoords.top);
	const right = Math.max(fromCoords.right, toCoords.right);
	const bottom = Math.max(fromCoords.bottom, toCoords.bottom);
	return {
		selectedText,
		selectionRect: new DOMRect(left, top, right - left, bottom - top),
	};
}

export function useEditorSelection(editorView: EditorView | null): UseEditorSelectionReturn {
	const [, refresh] = useReducer((revision: number) => revision + 1, 0);

	useEffect(() => {
		if (!editorView) return;
		const handleSelectionChange = () => refresh();
		editorView.contentDOM.addEventListener("mouseup", handleSelectionChange);
		editorView.contentDOM.addEventListener("keyup", handleSelectionChange);
		return () => {
			editorView.contentDOM.removeEventListener("mouseup", handleSelectionChange);
			editorView.contentDOM.removeEventListener("keyup", handleSelectionChange);
		};
	}, [editorView]);

	return readSelection(editorView);
}
