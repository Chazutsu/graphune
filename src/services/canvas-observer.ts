import type { CanvasNode, CanvasView } from "@/types/obsidian-canvas";
import type { App } from "obsidian";

export class CanvasObserver {
	private lastActiveCanvasView: CanvasView | null = null;

	constructor(private app: App) {}

	getActiveCanvasView(): CanvasView | null {
		const canvasLeaves = this.app.workspace.getLeavesOfType("canvas");
		if (canvasLeaves.length === 0) {
			this.lastActiveCanvasView = null;
			return null;
		}

		const mostRecentLeaf = this.app.workspace.getMostRecentLeaf?.();
		const mostRecentCanvas = canvasLeaves.find((leaf) => leaf === mostRecentLeaf)?.view as
			| CanvasView
			| undefined;
		if (mostRecentCanvas?.canvas) {
			this.lastActiveCanvasView = mostRecentCanvas;
			return mostRecentCanvas;
		}

		if (
			this.lastActiveCanvasView &&
			canvasLeaves.some((leaf) => (leaf.view as unknown) === this.lastActiveCanvasView)
		) {
			return this.lastActiveCanvasView;
		}

		const onlyCanvas =
			canvasLeaves.length === 1 ? (canvasLeaves[0]?.view as unknown as CanvasView) : null;
		if (onlyCanvas?.canvas) {
			this.lastActiveCanvasView = onlyCanvas;
			return onlyCanvas;
		}

		return null;
	}

	getSelectedNodes(): CanvasNode[] {
		const canvasView = this.getActiveCanvasView();
		if (!canvasView) {
			return [];
		}

		const selection = canvasView.canvas.selection;
		if (!selection) {
			return [];
		}

		return Array.from(selection);
	}
}
