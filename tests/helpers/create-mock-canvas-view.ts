import type { Canvas, CanvasNode, CanvasView } from "@/types/obsidian-canvas";
import { TFile } from "obsidian";
import { vi } from "vitest";

export function createMockCanvasView(selectedNodes: CanvasNode[] = []): CanvasView {
	const canvas: Canvas = {
		getData: vi.fn().mockReturnValue({ nodes: [], edges: [] }),
		setData: vi.fn(),
		requestSave: vi.fn(),
		createFileNode: vi.fn(),
		selection: new Set(selectedNodes),
		tx: 0,
		ty: 0,
		tZoom: 1,
	};
	return {
		canvas,
		file: new TFile("test.canvas"),
	};
}
