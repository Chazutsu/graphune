import { BacklinkWriter } from "@/services/backlink-writer";
import { CanvasObserver } from "@/services/canvas-observer";
import { CanvasOperator } from "@/services/canvas-operator";
import { EdgeSync } from "@/services/edge-sync";
import { FileCreator } from "@/services/file-creator";
import { PreviewBridge } from "@/services/preview-bridge";
import { QuickCardCreator } from "@/services/quick-card-creator";
import type { GraphuneSettings } from "@/types/settings";
import type { App } from "obsidian";

export interface Services {
	fileCreator: FileCreator;
	canvasOperator: CanvasOperator;
	canvasObserver: CanvasObserver;
	backlinkWriter: BacklinkWriter;
	quickCardCreator: QuickCardCreator;
	edgeSync: EdgeSync;
	previewBridge: PreviewBridge;
}

export function createServices(app: App, settings: GraphuneSettings): Services {
	const fileCreator = new FileCreator(app, settings);
	const canvasOperator = new CanvasOperator(app, settings);
	const canvasObserver = new CanvasObserver(app);
	const backlinkWriter = new BacklinkWriter(app);
	const quickCardCreator = new QuickCardCreator(fileCreator, canvasOperator, settings);
	const edgeSync = new EdgeSync(app);
	const previewBridge = new PreviewBridge();

	return {
		fileCreator,
		canvasOperator,
		canvasObserver,
		backlinkWriter,
		quickCardCreator,
		edgeSync,
		previewBridge,
	};
}
