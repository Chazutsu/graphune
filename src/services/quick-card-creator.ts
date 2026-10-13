import { CanvasOperator } from "@/services/canvas-operator";
import { FileCreator } from "@/services/file-creator";
import type { Canvas, CanvasNode, CanvasNodeData } from "@/types/obsidian-canvas";
import type { GraphuneSettings } from "@/types/settings";
import type { TFile } from "obsidian";

export interface QuickCardResult {
	file: TFile;
	node: CanvasNode;
}

const CARD_GAP = 24;
const COLLISION_STEP = 40;
const MAX_POSITION_ATTEMPTS = 100;

export class QuickCardCreator {
	constructor(
		private fileCreator: FileCreator,
		private canvasOperator: CanvasOperator,
		private settings: GraphuneSettings,
	) {}

	async createCardAtPosition(
		canvas: Canvas,
		canvasFile: TFile,
		position: { x: number; y: number },
		defaultTitle: string,
	): Promise<QuickCardResult> {
		const data = canvas.getData();
		if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
			throw new Error("Canvas data is unavailable");
		}
		const availablePosition = this.findAvailablePosition(data.nodes, position);
		const file = await this.fileCreator.createFile(defaultTitle, "", canvasFile);
		try {
			const node = this.canvasOperator.addNodeToCanvas(canvas, file, availablePosition);
			if (!node) throw new Error("Canvas data is unavailable");
			canvas.selectOnly?.(node);
			return { file, node };
		} catch (error) {
			await this.fileCreator.removeFile(file);
			throw error;
		}
	}

	private findAvailablePosition(
		nodes: CanvasNodeData[],
		preferred: { x: number; y: number },
	): { x: number; y: number } {
		for (let attempt = 0; attempt < MAX_POSITION_ATTEMPTS; attempt += 1) {
			const offset = attempt * COLLISION_STEP;
			const candidate = { x: preferred.x + offset, y: preferred.y + offset };
			const overlaps = nodes.some(
				(node) =>
					candidate.x < node.x + node.width + CARD_GAP &&
					candidate.x + this.settings.defaultNodeWidth + CARD_GAP > node.x &&
					candidate.y < node.y + node.height + CARD_GAP &&
					candidate.y + this.settings.defaultNodeHeight + CARD_GAP > node.y,
			);
			if (!overlaps) return candidate;
		}

		return {
			x: Math.max(...nodes.map((node) => node.x + node.width), preferred.x) + CARD_GAP,
			y: preferred.y,
		};
	}
}
